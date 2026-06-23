'use strict';

/**
 * SSH Worker
 * ══════════
 * Executes agent tasks on a remote host via SSH. The remote host must have:
 *   - Node.js 18+
 *   - PURPCLAW checked out at worker.purpclawDir
 *   - A running purpclaw-tower (or purpclaw-orchestrator) on the remote host
 *
 * Dispatch strategy: SSH into host, POST to the remote tower via curl,
 * then return the job ID. Avoids needing Node's ssh2 dependency — uses
 * the system `ssh` binary (available on Windows 10+ via OpenSSH).
 *
 * SSH worker record:
 *   {
 *     id, name, type:'ssh',
 *     host: '10.0.0.5',
 *     port: 22,
 *     user: 'ubuntu',
 *     keyPath: 'C:/Users/Admin/.ssh/id_rsa',  // or null for password/agent
 *     purpclawDir: '/home/ubuntu/purpclaw',
 *     towerPort: 7790,    // remote tower port (default 7790)
 *     maxConcurrent: 4,
 *   }
 */

const { spawnSync } = require('child_process');

function buildSshArgs(worker, remoteCommand) {
  const args = ['-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes'];
  if (worker.keyPath) args.push('-i', worker.keyPath);
  if (worker.port && worker.port !== 22) args.push('-p', String(worker.port));
  args.push(`${worker.user || 'ubuntu'}@${worker.host}`);
  args.push(remoteCommand);
  return args;
}

function runSsh(worker, remoteCommand, timeoutMs = 8000) {
  const sshBin = process.platform === 'win32' ? 'ssh' : 'ssh';
  const args = buildSshArgs(worker, remoteCommand);
  const result = spawnSync(sshBin, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    shell: false,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error ? result.error.message : null,
  };
}

/**
 * Check if remote worker SSH + tower are accessible.
 */
async function checkHealth(worker) {
  const towerPort = worker.towerPort || 7790;
  // Try: ssh host 'curl -s http://127.0.0.1:7790/health'
  const r = runSsh(worker, `curl -s --max-time 3 http://127.0.0.1:${towerPort}/health`, 8000);
  if (!r.ok) {
    return { online: false, reason: r.error || r.stderr.slice(0, 120) || `SSH exit ${r.status}` };
  }
  try {
    const body = JSON.parse(r.stdout);
    return {
      online: true,
      active: body.activeAgents || 0,
      capacity: body.maxAgents || 8,
      version: body.version,
    };
  } catch {
    return { online: false, reason: `Bad health response: ${r.stdout.slice(0, 80)}` };
  }
}

/**
 * Dispatch a task to a remote tower via SSH + curl.
 */
async function dispatch(worker, agentName, task, options = {}) {
  const towerPort = worker.towerPort || 7790;
  const payload = JSON.stringify({
    agentName,
    task,
    options: {
      source: 'purpclaw-ssh-worker',
      workflowId: options.workflowId || null,
      intent: options.intent || 'run',
    }
  });
  // Escape single quotes in payload for shell
  const escapedPayload = payload.replace(/'/g, "'\\''");
  const remoteCmd = `curl -s -X POST http://127.0.0.1:${towerPort}/api/spawn -H 'Content-Type: application/json' -d '${escapedPayload}'`;

  const r = runSsh(worker, remoteCmd, 12000);
  if (!r.ok) {
    return { success: false, error: r.error || r.stderr.slice(0, 200) || `SSH exit ${r.status}` };
  }

  try {
    const body = JSON.parse(r.stdout);
    if (body.success || body.agentId) {
      const jobId = body.agentId || body.jobId || `ssh-${Date.now()}`;
      return {
        success: true,
        jobId,
        workerId: worker.id,
        workerName: worker.name,
        workerType: 'ssh',
        response: `🔐 ${worker.name}@${worker.host}: dispatched ${agentName} → job ${jobId}`,
      };
    }
    return { success: false, error: body.error || `Remote spawn failed: ${r.stdout.slice(0, 200)}` };
  } catch {
    return { success: false, error: `Bad spawn response from SSH worker: ${r.stdout.slice(0, 200)}` };
  }
}

module.exports = { checkHealth, dispatch, runSsh, buildSshArgs };
