/**
 * PURPCLAW SWARM COORDINATOR v1.0
 * ================================
 * Replaces the orphan tmux-worktree-orchestrator.js (deleted 2026-04-18)
 *
 * This coordinator:
 * 1. Parses a swarm task and divides it into worker jobs
 * 2. Spawns workers as detached child processes (tmux panes or fallback Node)
 * 3. Polls worker handoffs for completion
 * 4. Synthesizes findings from all workers
 * 5. Streams results back via EventBus + SSE
 *
 * Wired to: orchestrator.js swarm handler (line 992)
 * Uses: agent_tower.js sendToAgent() for mid-execution continuations
 * Uses: EventBus publish for worker lifecycle events
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn: rawSpawn } = require('child_process');
const { trackedSpawn } = require('./lib/child-registry');

const PURP_DIR = path.join(__dirname);

// === CONFIG ===
const EVENTBUS_PORT = 7782;
const STATE_PORT = 7783;
const TOWER_PORT = 7790;

// === EVENTBUS HELPERS ===

function publishEvent(topic, payload) {
  const data = JSON.stringify({ topic, ...payload, timestamp: new Date().toISOString() });
  const req = http.request({
    hostname: 'localhost',
    port: EVENTBUS_PORT,
    path: '/publish',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, () => {});
  req.on('error', () => {});
  req.write(data);
  req.end();
}

function publishState(namespace, key, value) {
  const body = JSON.stringify(value);
  const req = http.request({
    hostname: 'localhost',
    port: STATE_PORT,
    path: `/state/${namespace}/${key}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, () => {});
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// === SPAWN PATTERN (prevents spawn bomb on PM2 restart) ===
// Per CLAUDE.md: detached + stdio ignore + unref

function spawnWorker(workerId, agentName, task, workDir) {
  const nodeBin = process.execPath;
  const openclaudeScript = path.join(
    process.env.APPDATA || 'C:\\Users\\Admin\\AppData\\Roaming',
    'npm', 'node_modules', '@gitlawb', 'openclaude', 'bin', 'openclaude'
  );
  const godFolder = 'E:\\god folder';

  const minimaxSettings = JSON.stringify({
    provider: 'openai',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.minimax.io/v1',
    apiKey: process.env.OPENAI_API_KEY || process.env.MINIMAX_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'MiniMax-M2.7-highspeed'
  });

  const args = [
    openclaudeScript,
    '-p',
    task,
    '--name', `purpclaw-${workerId}`,
    '--add-dir', godFolder,
    '--add-dir', workDir,
    '--system-prompt', `You are ${agentName}, a PURPCLAW swarm worker agent. Execute your task, write findings to handoff.md in your work directory, then exit. Report concisely.`,
    '--output-format', 'json',
    '--no-session-persistence',
    '--settings', minimaxSettings
  ];

  const stdoutFile = path.join(workDir, `worker_${workerId}_stdout.log`);
  const stderrFile = path.join(workDir, `worker_${workerId}_stderr.log`);
  fs.writeFileSync(stdoutFile, '', 'utf8');
  fs.writeFileSync(stderrFile, '', 'utf8');
  const stdoutFd = fs.openSync(stdoutFile, 'a');
  const stderrFd = fs.openSync(stderrFile, 'a');

  const child = trackedSpawn(nodeBin, args, {
    tag: `worker-${workerId}`,
    timeoutMs: 60 * 60_000,  // 1 hour hard budget per worker
    cwd: workDir,
    stdio: ['ignore', stdoutFd, stderrFd],
    env: { ...process.env, PURPCLAW_WORKER: workerId, PYTHONIOENCODING: 'utf-8' }
  });
  child.unref();

  return { pid: child.pid, stdoutFile, stderrFile };
}

// === SENDTOAGENT WIRING ===
// Enables coordinator to send mid-execution continuations to running workers

function sendToWorker(workerId, continuationMessage) {
  const workerStateFile = path.join(PURP_DIR, 'swarm_workers', `worker_${workerId}_state.json`);
  if (!fs.existsSync(workerStateFile)) return { success: false, error: 'Worker state not found' };

  let workerState;
  try {
    workerState = JSON.parse(fs.readFileSync(workerStateFile, 'utf8'));
  } catch {
    return { success: false, error: 'Could not read worker state' };
  }

  const { workDir } = workerState;
  if (!workDir) return { success: false, error: 'No work directory for worker' };

  const continuationFile = path.join(workDir, `continuation_${Date.now()}.txt`);
  try {
    fs.writeFileSync(continuationFile, continuationMessage, 'utf8');

    publishEvent('agent.continuation', {
      agentId: workerId,
      name: workerState.agentName,
      division: workerState.division || 'swarm',
      continuationFile
    });

    return { success: true, workerId, continuationFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// === WORKER HANDOVER POLLING ===

function pollHandoff(workDir, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const handoffFile = path.join(workDir, 'handoff.md');
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      if (fs.existsSync(handoffFile)) {
        try {
          const content = fs.readFileSync(handoffFile, 'utf8');
          resolve(content);
        } catch {
          resolve(''); // empty or unreadable
        }
        return;
      }
      if (Date.now() > deadline) {
        resolve(''); // timeout — worker may have silently failed
        return;
      }
      setTimeout(check, 2000); // poll every 2s
    };

    check();
  });
}

// === SWARM WORKER REGISTRY ===

const workers = new Map(); // workerId -> { status, handoff, findings, startTime }

// === DIVIDE TASK INTO WORKER JOBS ===

function divideTask(task, workerCount = 3) {
  // Simple strategy: split task description into 3 phases for 3 workers
  // Phase 1: analyze/investigate
  // Phase 2: implement/build
  // Phase 3: verify/test
  const phases = [
    `Investigate and analyze: ${task}. Report findings in handoff.md with sections: ANALYSIS, CURRENT_STATE, RECOMMENDATIONS.`,
    `Based on findings from phase 1, implement: ${task}. Document changes made in handoff.md with sections: CHANGES, FILES_MODIFIED, IMPLEMENTATION_NOTES.`,
    `Verify and test: ${task}. Review phase 2 work, validate correctness, report in handoff.md with sections: VERIFICATION, ISSUES_FOUND, VALIDATION_STATUS.`
  ];
  return phases.slice(0, workerCount);
}

// === MAIN COORDINATOR ===

async function runSwarm(task, context = {}) {
  const swarmId = `swarm-${Date.now()}`;
  const coordinatorWorkDir = path.join(PURP_DIR, 'swarm_jobs', swarmId);
  fs.mkdirSync(coordinatorWorkDir, { recursive: true });

  publishEvent('swarm.started', { swarmId, task, context });
  publishState('swarm', swarmId, { status: 'running', task, startTime: new Date().toISOString() });

  console.log(`[SWARM COORD] ${swarmId} starting — task: "${task.substring(0, 60)}..."`);

  const workerAgents = ['wolf', 'spider', 'snake']; // coordinator + workers
  const jobs = divideTask(task, workerAgents.length);

  const pendingWorkers = [];
  const completedWorkers = [];

  // Spawn workers
  for (let i = 0; i < jobs.length; i++) {
    const workerId = `${swarmId}-worker-${i}`;
    const agentName = workerAgents[i] || 'robot';
    const workDir = path.join(coordinatorWorkDir, `worker_${i}`);
    fs.mkdirSync(workDir, { recursive: true });

    const workerState = {
      workerId,
      agentName,
      task: jobs[i],
      workDir,
      status: 'spawned',
      phase: i + 1,
      startTime: new Date().toISOString()
    };

    // Save worker state for sendToWorker() lookups
    fs.writeFileSync(
      path.join(PURP_DIR, 'swarm_workers', `worker_${workerId}_state.json`),
      JSON.stringify(workerState, null, 2)
    );

    workers.set(workerId, workerState);

    publishEvent('agent.spawning', { agentId: workerId, name: agentName, task: jobs[i], swarmId });
    console.log(`[SWARM COORD] Spawning ${agentName} (${workerId}) — phase ${i + 1}`);

    const { pid, stdoutFile, stderrFile } = spawnWorker(workerId, agentName, jobs[i], workDir);

    workerState.pid = pid;
    workerState.stdoutFile = stdoutFile;
    workerState.status = 'running';
    workers.set(workerId, workerState);

    publishEvent('agent.spawned', { agentId: workerId, name: agentName, pid, swarmId });
    publishState('agents', workerId, { name: agentName, status: 'running', task: jobs[i], swarmId, phase: i + 1 });

    pendingWorkers.push(workerId);

    // Start polling this worker's handoff in background
    pollHandoff(workDir, 120000).then(handoff => {
      const w = workers.get(workerId);
      w.status = 'completed';
      w.handoff = handoff;
      w.completedAt = new Date().toISOString();
      workers.set(workerId, w);

      publishEvent('agent.completed', { agentId: workerId, name: agentName, swarmId });
      publishState('agents', workerId, { name: agentName, status: 'completed', swarmId });

      // Remove from pending
      const idx = pendingWorkers.indexOf(workerId);
      if (idx > -1) pendingWorkers.splice(idx, 1);

      console.log(`[SWARM COORD] ${agentName} (${workerId}) completed phase ${i + 1}`);
      checkSwarmDone(swarmId, pendingWorkers, workers, completedWorkers);
    }).catch(() => {
      const w = workers.get(workerId);
      w.status = 'failed';
      w.completedAt = new Date().toISOString();
      workers.set(workerId, w);

      publishEvent('agent.failed', { agentId: workerId, name: agentName, swarmId });
      publishState('agents', workerId, { name: agentName, status: 'failed', swarmId });

      const idx = pendingWorkers.indexOf(workerId);
      if (idx > -1) pendingWorkers.splice(idx, 1);

      console.log(`[SWARM COORD] ${agentName} (${workerId}) failed phase ${i + 1}`);
      checkSwarmDone(swarmId, pendingWorkers, workers, completedWorkers);
    });
  }

  // Wait for all workers
  return new Promise((resolve) => {
    function checkSwarmDone(swarmId, pendingWorkers, workers, completedWorkers) {
      if (pendingWorkers.length > 0) return;

      // All workers done — synthesize findings
      const findings = [];
      for (const [wid, w] of workers) {
        findings.push({
          workerId: wid,
          agentName: w.agentName,
          phase: w.phase,
          status: w.status,
          findings: w.handoff || '',
          completedAt: w.completedAt
        });
        completedWorkers.push(wid);
      }

      const synthesis = synthesizeFindings(findings);

      console.log(`[SWARM COORD] ${swarmId} complete — ${completedWorkers.length} workers finished`);
      publishEvent('swarm.complete', { swarmId, workerCount: completedWorkers.length, synthesis });
      publishState('swarm', swarmId, { status: 'complete', completedAt: new Date().toISOString(), workerCount: completedWorkers.length });

      // Cleanup worker state files
      for (const wid of completedWorkers) {
        try {
          const stateFile = path.join(PURP_DIR, 'swarm_workers', `worker_${wid}_state.json`);
          if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
        } catch {}
      }

      resolve({
        success: true,
        swarmId,
        workerCount: completedWorkers.length,
        findings,
        synthesis,
        completedAt: new Date().toISOString()
      });
    }

    // Store checkSwarmDone in closure for background polls
    global[`__swarm_check_${swarmId}`] = checkSwarmDone;
  });
}

// === SYNTHESIZE FINDINGS FROM WORKER HANDOFFS ===

function synthesizeFindings(findings) {
  // Phase-ordered synthesis: analysis → implementation → verification
  const ordered = findings.sort((a, b) => (a.phase || 0) - (b.phase || 0));

  let summary = '';
  let filesModified = [];
  let issuesFound = [];
  let validationStatus = 'PENDING';

  for (const f of ordered) {
    if (!f.findings) continue;

    // Extract key sections from handoff.md
    const lines = f.findings.split('\n');
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.includes('FILES_MODIFIED') || upper.includes('CHANGES') || upper.includes('MODIFIED')) {
        // Collect next N lines as file list
        const idx = lines.indexOf(line);
        for (let i = idx + 1; i < Math.min(idx + 20, lines.length); i++) {
          if (lines[i].trim() && !lines[i].includes('##') && !lines[i].includes('```')) {
            filesModified.push(lines[i].trim());
          }
        }
      }
      if (upper.includes('ISSUES_FOUND') || upper.includes('PROBLEMS') || upper.includes('ERRORS')) {
        const idx = lines.indexOf(line);
        for (let i = idx + 1; i < Math.min(idx + 10, lines.length); i++) {
          if (lines[i].trim() && !lines[i].includes('##')) {
            issuesFound.push(lines[i].trim());
          }
        }
      }
      if (upper.includes('VALIDATION_STATUS') || upper.includes('VERIFICATION')) {
        const match = f.findings.match(/VALIDATION_STATUS[^\n]*\n([^\n]+)/i);
        if (match) validationStatus = match[1].trim();
      }
    }

    // Phase 1 findings become summary
    if (f.phase === 1) {
      const sumMatch = f.findings.match(/SUMMARY[^\n]*\n([^\n]+)/i) ||
                       f.findings.match(/ANALYSIS[^\n]*\n([^\n]+)/i);
      if (sumMatch) summary = sumMatch[1].trim();
    }
  }

  // Dedupe files modified
  filesModified = [...new Set(filesModified.filter(f => f.length > 3 && !f.includes('...')))];

  return {
    summary: summary || 'Task completed by swarm workers.',
    filesModified,
    issuesFound: [...new Set(issuesFound)],
    validationStatus,
    workerCount: findings.length,
    phaseSummary: ordered.map(f => ({
      phase: f.phase,
      agentName: f.agentName,
      status: f.status,
      hasFindings: !!f.findings
    }))
  };
}

// === HTTP SERVER FOR COORDINATOR STATUS ===

function startCoordinatorServer() {
  const http = require('http');
  const url = require('url');

  const server = http.createServer((req, res) => {
    const pathname = url.parse(req.url).pathname;

    if (pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ status: 'operational', activeSwarms: workers.size }));
      return;
    }

    if (pathname === '/swarm/status' && req.method === 'GET') {
      const active = [];
      for (const [id, w] of workers) {
        active.push({ workerId: id, agentName: w.agentName, status: w.status, phase: w.phase });
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ activeSwarms: workers.size, workers: active }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(7793, () => {
    console.log('[SWARM COORD] Coordinator server running on port 7793');
  });
}

// === CLI ===

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--server')) {
    startCoordinatorServer();
  } else {
    // Run swarm from CLI: node tmux-worktree-orchestrator.js "build feature X"
    const task = args[0] || 'default swarm task';
    console.log(`[SWARM COORD] Running swarm task: "${task}"`);
    runSwarm(task).then(result => {
      console.log('\n=== SWARM RESULT ===');
      console.log(`Workers: ${result.workerCount}`);
      console.log(`Summary: ${result.synthesis.summary}`);
      if (result.synthesis.filesModified.length) {
        console.log(`Files: ${result.synthesis.filesModified.join(', ')}`);
      }
      if (result.synthesis.issuesFound.length) {
        console.log(`Issues: ${result.synthesis.issuesFound.join('; ')}`);
      }
    }).catch(e => {
      console.error('[SWARM COORD] Error:', e.message);
      process.exit(1);
    });
  }
}

module.exports = { runSwarm, sendToWorker, pollHandoff };