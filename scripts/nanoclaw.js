#!/usr/bin/env node
/**
 * NanoClaw v2 — Barebones Agent REPL for Everything Claude Code
 *
 * Zero external dependencies. Session-aware REPL around `claude -p`.
 * Swarm-aware: routes to PURPCLAW orchestrator when online.
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const http    = require('http');
const { spawnSync } = require('child_process');
const readline = require('readline');

// ── Swarm connection (injected by `purpclaw chat`) ────────────────────────────
const ORCH_PORT    = parseInt(process.env.PURPCLAW_ORCHESTRATOR_PORT || '7784', 10);
const MEM_PORT     = parseInt(process.env.PURPCLAW_MEMORY_PORT       || '7880', 10);
const SWARM_ONLINE = process.env.PURPCLAW_SWARM_ONLINE === '1';

const SESSION_NAME_RE = /^[a-zA-Z0-9][-a-zA-Z0-9]*$/;
const DEFAULT_MODEL = process.env.CLAW_MODEL || 'sonnet';
const DEFAULT_COMPACT_KEEP_TURNS = 20;

function isValidSessionName(name) {
  return typeof name === 'string' && name.length > 0 && SESSION_NAME_RE.test(name);
}

function getClawDir() {
  return path.join(os.homedir(), '.claude', 'claw');
}

function getSessionPath(name) {
  return path.join(getClawDir(), `${name}.md`);
}

function listSessions(dir) {
  const clawDir = dir || getClawDir();
  if (!fs.existsSync(clawDir)) return [];
  return fs.readdirSync(clawDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

function loadHistory(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function appendTurn(filePath, role, content, timestamp) {
  const ts = timestamp || new Date().toISOString();
  const entry = `### [${ts}] ${role}\n${content}\n---\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, entry, 'utf8');
}

function normalizeSkillList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean);
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

function loadECCContext(skillList) {
  const requested = normalizeSkillList(skillList !== undefined ? skillList : process.env.CLAW_SKILLS || '');
  if (requested.length === 0) return '';

  const chunks = [];
  for (const name of requested) {
    const skillPath = path.join(process.cwd(), 'skills', name, 'SKILL.md');
    try {
      chunks.push(fs.readFileSync(skillPath, 'utf8'));
    } catch {
      // Skip missing skills silently to keep REPL usable.
    }
  }

  return chunks.join('\n\n');
}

function buildPrompt(systemPrompt, history, userMessage) {
  const parts = [];
  if (systemPrompt) parts.push(`=== SYSTEM CONTEXT ===\n${systemPrompt}\n`);
  if (history) parts.push(`=== CONVERSATION HISTORY ===\n${history}\n`);
  parts.push(`=== USER MESSAGE ===\n${userMessage}`);
  return parts.join('\n');
}

function askClaude(systemPrompt, history, userMessage, model) {
  const fullPrompt = buildPrompt(systemPrompt, history, userMessage);
  const args = [];
  if (model) {
    args.push('--model', model);
  }
  args.push('-p', fullPrompt);

  const result = spawnSync('claude', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDECODE: '' },
    timeout: 300000,
  });

  if (result.error) {
    return `[Error: ${result.error.message}]`;
  }

  if (result.status !== 0 && result.stderr) {
    return `[Error: claude exited with code ${result.status}: ${result.stderr.trim()}]`;
  }

  return (result.stdout || '').trim();
}

// ── Orchestrator dispatch ─────────────────────────────────────────────────────

/**
 * POST a task to the PURPCLAW orchestrator and stream SSE events back.
 * Calls onLine(text) for each printable event, onDone() when complete.
 */
function dispatchToOrchestrator(task, onLine, onDone, onError) {
  const payload  = JSON.stringify({ command: task, source: 'nanoclaw' });
  const postReq  = http.request(
    {
      hostname: '127.0.0.1', port: ORCH_PORT, path: '/api/orchestrate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    },
    res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          if (body.workflowId) onLine(`[workflow: ${body.workflowId}]`);
          if (body.workflow?.result) {
            const r = typeof body.workflow.result === 'string'
              ? body.workflow.result
              : JSON.stringify(body.workflow.result, null, 2);
            onLine(r);
          } else if (body.status) {
            onLine(`[status: ${body.status}]`);
          }
        } catch {
          if (data) onLine(data);
        }
        onDone();
      });
    }
  );
  postReq.setTimeout(300000, () => { postReq.destroy(); onError(new Error('orchestrator timeout')); });
  postReq.on('error', onError);
  postReq.write(payload);
  postReq.end();
}

/**
 * Quick check if orchestrator is reachable (async, no throw).
 */
function checkOrchHealth(cb) {
  const req = http.request(
    { hostname: '127.0.0.1', port: ORCH_PORT, path: '/health', method: 'GET' },
    res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { cb(null, JSON.parse(d)); } catch { cb(null, {}); } });
    }
  );
  req.setTimeout(2000, () => { req.destroy(); cb(new Error('timeout')); });
  req.on('error', cb);
  req.end();
}

function parseTurns(history) {
  const turns = [];
  const regex = /### \[([^\]]+)\] ([^\n]+)\n([\s\S]*?)\n---\n/g;
  let match = null;
  while ((match = regex.exec(history)) !== null) {
    turns.push({ timestamp: match[1], role: match[2], content: match[3] });
  }
  return turns;
}

function estimateTokenCount(text) {
  return Math.ceil((text || '').length / 4);
}

function getSessionMetrics(filePath) {
  const history = loadHistory(filePath);
  const turns = parseTurns(history);
  const charCount = history.length;
  const tokenEstimate = estimateTokenCount(history);
  const userTurns = turns.filter(t => t.role === 'User').length;
  const assistantTurns = turns.filter(t => t.role === 'Assistant').length;

  return {
    turns: turns.length,
    userTurns,
    assistantTurns,
    charCount,
    tokenEstimate,
  };
}

function searchSessions(query, dir) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];

  const sessionDir = dir || getClawDir();
  const sessions = listSessions(sessionDir);
  const results = [];
  for (const name of sessions) {
    const p = path.join(sessionDir, `${name}.md`);
    const content = loadHistory(p);
    if (!content) continue;

    const idx = content.toLowerCase().indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + q.length + 40);
      const snippet = content.slice(start, end).replace(/\n/g, ' ');
      results.push({ session: name, snippet });
    }
  }
  return results;
}

function compactSession(filePath, keepTurns = DEFAULT_COMPACT_KEEP_TURNS) {
  const history = loadHistory(filePath);
  if (!history) return false;

  const turns = parseTurns(history);
  if (turns.length <= keepTurns) return false;

  const retained = turns.slice(-keepTurns);
  const compactedHeader = `# NanoClaw Compaction\nCompacted at: ${new Date().toISOString()}\nRetained turns: ${keepTurns}/${turns.length}\n\n---\n`;
  const compactedTurns = retained.map(t => `### [${t.timestamp}] ${t.role}\n${t.content}\n---\n`).join('');
  fs.writeFileSync(filePath, compactedHeader + compactedTurns, 'utf8');
  return true;
}

function exportSession(filePath, format, outputPath) {
  const history = loadHistory(filePath);
  const sessionName = path.basename(filePath, '.md');
  const fmt = String(format || 'md').toLowerCase();

  if (!history) {
    return { ok: false, message: 'No session history to export.' };
  }

  const dir = path.dirname(filePath);
  let out = outputPath;
  if (!out) {
    out = path.join(dir, `${sessionName}.export.${fmt === 'markdown' ? 'md' : fmt}`);
  }

  if (fmt === 'md' || fmt === 'markdown') {
    fs.writeFileSync(out, history, 'utf8');
    return { ok: true, path: out };
  }

  if (fmt === 'json') {
    const turns = parseTurns(history);
    fs.writeFileSync(out, JSON.stringify({ session: sessionName, turns }, null, 2), 'utf8');
    return { ok: true, path: out };
  }

  if (fmt === 'txt' || fmt === 'text') {
    const turns = parseTurns(history);
    const txt = turns.map(t => `[${t.timestamp}] ${t.role}:\n${t.content}\n`).join('\n');
    fs.writeFileSync(out, txt, 'utf8');
    return { ok: true, path: out };
  }

  return { ok: false, message: `Unsupported export format: ${format}` };
}

function branchSession(currentSessionPath, newSessionName, targetDir = getClawDir()) {
  if (!isValidSessionName(newSessionName)) {
    return { ok: false, message: `Invalid branch session name: ${newSessionName}` };
  }

  const target = path.join(targetDir, `${newSessionName}.md`);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const content = loadHistory(currentSessionPath);
  fs.writeFileSync(target, content, 'utf8');
  return { ok: true, path: target, session: newSessionName };
}

function skillExists(skillName) {
  const p = path.join(process.cwd(), 'skills', skillName, 'SKILL.md');
  return fs.existsSync(p);
}

function handleClear(sessionPath) {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, '', 'utf8');
  console.log('Session cleared.');
}

function handleHistory(sessionPath) {
  const history = loadHistory(sessionPath);
  if (!history) {
    console.log('(no history)');
    return;
  }
  console.log(history);
}

function handleSessions(dir) {
  const sessions = listSessions(dir);
  if (sessions.length === 0) {
    console.log('(no sessions)');
    return;
  }

  console.log('Sessions:');
  for (const s of sessions) {
    console.log(`  - ${s}`);
  }
}

function handleHelp() {
  console.log('NanoClaw v2 — Commands:\n');
  console.log('  \x1b[36mSWARM COMMANDS\x1b[0m (requires purpclaw start)');
  console.log('  /swarm <task>                  Route task through the PURPCLAW agent swarm');
  console.log('  /agent <name> <task>           Route to a specific agent (e.g. /agent robot fix auth.js)');
  console.log('  /status                        Show swarm service health\n');
  console.log('  \x1b[36mSESSION COMMANDS\x1b[0m');
  console.log('  /help                          Show this help');
  console.log('  /clear                         Clear current session history');
  console.log('  /history                       Print full conversation history');
  console.log('  /sessions                      List saved sessions');
  console.log('  /model [name]                  Show/set model');
  console.log('  /load <skill-name>             Load a skill into active context');
  console.log('  /branch <session-name>         Branch current session into a new session');
  console.log('  /search <query>                Search query across sessions');
  console.log('  /compact                       Keep recent turns, compact older context');
  console.log('  /export <md|json|txt> [path]   Export current session');
  console.log('  /metrics                       Show session metrics');
  console.log('  exit                           Quit\n');
  console.log('  \x1b[90mAnything else → direct Claude call (no swarm routing)\x1b[0m');
}

function main() {
  const initialSessionName = process.env.CLAW_SESSION || 'default';
  if (!isValidSessionName(initialSessionName)) {
    console.error(`Error: Invalid session name "${initialSessionName}". Use alphanumeric characters and hyphens only.`);
    process.exit(1);
  }

  fs.mkdirSync(getClawDir(), { recursive: true });

  const state = {
    sessionName: initialSessionName,
    sessionPath: getSessionPath(initialSessionName),
    model: DEFAULT_MODEL,
    skills: normalizeSkillList(process.env.CLAW_SKILLS || ''),
  };

  let eccContext = loadECCContext(state.skills);

  const loadedCount = state.skills.filter(skillExists).length;

  const swarmTag = SWARM_ONLINE ? ' \x1b[32m[swarm online]\x1b[0m' : ' \x1b[90m[swarm offline]\x1b[0m';
  console.log(`NanoClaw v2 — Session: ${state.sessionName}${swarmTag}`);
  console.log(`Model: ${state.model}`);
  if (loadedCount > 0) {
    console.log(`Loaded ${loadedCount} skill(s) as context.`);
  }
  if (SWARM_ONLINE) {
    console.log('\x1b[90mOrchestrator reachable. Use /swarm <task> to route through the agent swarm.\x1b[0m');
  } else {
    console.log('\x1b[90mRun `purpclaw start` in another terminal to enable swarm routing.\x1b[0m');
  }
  console.log('Type /help for commands, exit to quit.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => {
    rl.question('claw> ', (input) => {
      const line = input.trim();
      if (!line) return prompt();

      if (line === 'exit') {
        console.log('Goodbye.');
        rl.close();
        return;
      }

      if (line === '/help') {
        handleHelp();
        return prompt();
      }

      if (line === '/clear') {
        handleClear(state.sessionPath);
        return prompt();
      }

      if (line === '/history') {
        handleHistory(state.sessionPath);
        return prompt();
      }

      if (line === '/sessions') {
        handleSessions();
        return prompt();
      }

      if (line.startsWith('/model')) {
        const model = line.replace('/model', '').trim();
        if (!model) {
          console.log(`Current model: ${state.model}`);
        } else {
          state.model = model;
          console.log(`Model set to: ${state.model}`);
        }
        return prompt();
      }

      if (line.startsWith('/load ')) {
        const skill = line.replace('/load', '').trim();
        if (!skill) {
          console.log('Usage: /load <skill-name>');
          return prompt();
        }
        if (!skillExists(skill)) {
          console.log(`Skill not found: ${skill}`);
          return prompt();
        }

        if (!state.skills.includes(skill)) {
          state.skills.push(skill);
        }
        eccContext = loadECCContext(state.skills);
        console.log(`Loaded skill: ${skill}`);
        return prompt();
      }

      if (line.startsWith('/branch ')) {
        const target = line.replace('/branch', '').trim();
        const result = branchSession(state.sessionPath, target);
        if (!result.ok) {
          console.log(result.message);
          return prompt();
        }

        state.sessionName = result.session;
        state.sessionPath = result.path;
        console.log(`Branched to session: ${state.sessionName}`);
        return prompt();
      }

      if (line.startsWith('/search ')) {
        const query = line.replace('/search', '').trim();
        const matches = searchSessions(query);
        if (matches.length === 0) {
          console.log('(no matches)');
          return prompt();
        }
        console.log(`Found ${matches.length} match(es):`);
        for (const match of matches) {
          console.log(`- ${match.session}: ${match.snippet}`);
        }
        return prompt();
      }

      if (line === '/compact') {
        const changed = compactSession(state.sessionPath);
        console.log(changed ? 'Session compacted.' : 'No compaction needed.');
        return prompt();
      }

      if (line.startsWith('/export ')) {
        const parts = line.split(/\s+/).filter(Boolean);
        const format = parts[1];
        const outputPath = parts[2];
        if (!format) {
          console.log('Usage: /export <md|json|txt> [path]');
          return prompt();
        }
        const result = exportSession(state.sessionPath, format, outputPath);
        if (!result.ok) {
          console.log(result.message);
        } else {
          console.log(`Exported: ${result.path}`);
        }
        return prompt();
      }

      if (line === '/metrics') {
        const m = getSessionMetrics(state.sessionPath);
        console.log(`Session: ${state.sessionName}`);
        console.log(`Model: ${state.model}`);
        console.log(`Turns: ${m.turns} (user ${m.userTurns}, assistant ${m.assistantTurns})`);
        console.log(`Chars: ${m.charCount}`);
        console.log(`Estimated tokens: ${m.tokenEstimate}`);
        return prompt();
      }

      // ── /status — swarm health check ────────────────────────────────────────
      if (line === '/status') {
        checkOrchHealth((err, data) => {
          if (err) {
            console.log('\x1b[31m✗ Orchestrator offline\x1b[0m  :' + ORCH_PORT);
            console.log('\x1b[90m  Run `purpclaw start` to boot the stack.\x1b[0m');
          } else {
            console.log('\x1b[32m● Orchestrator online\x1b[0m  :' + ORCH_PORT + '  uptime ' + Math.round(data.uptime || 0) + 's');
          }
          prompt();
        });
        return;
      }

      // ── /swarm <task> — route through agent swarm ────────────────────────────
      if (line.startsWith('/swarm ')) {
        const task = line.slice(7).trim();
        if (!task) { console.log('Usage: /swarm <task>'); return prompt(); }
        console.log('\x1b[90m[→ orchestrator]\x1b[0m ' + task + '\n');
        appendTurn(state.sessionPath, 'User', '/swarm ' + task);
        dispatchToOrchestrator(
          task,
          (msg) => process.stdout.write(msg + '\n'),
          () => {
            appendTurn(state.sessionPath, 'Assistant', '[swarm task dispatched: ' + task + ']');
            console.log('');
            prompt();
          },
          (err) => {
            console.log('\x1b[31m✗ Swarm error: ' + err.message + '\x1b[0m');
            console.log('\x1b[90m  Is the stack running? Try `purpclaw start` in another terminal.\x1b[0m');
            prompt();
          }
        );
        return;
      }

      // ── /agent <name> <task> — route to specific agent ───────────────────────
      if (line.startsWith('/agent ')) {
        const parts  = line.slice(7).trim().split(/\s+/);
        const agent  = parts.shift();
        const agTask = parts.join(' ');
        if (!agent || !agTask) { console.log('Usage: /agent <name> <task>'); return prompt(); }
        const prefixedTask = `@${agent}: ${agTask}`;
        console.log('\x1b[90m[→ ' + agent + ']\x1b[0m ' + agTask + '\n');
        appendTurn(state.sessionPath, 'User', `/agent ${agent} ${agTask}`);
        dispatchToOrchestrator(
          prefixedTask,
          (msg) => process.stdout.write(msg + '\n'),
          () => {
            appendTurn(state.sessionPath, 'Assistant', '[dispatched to ' + agent + ': ' + agTask + ']');
            console.log('');
            prompt();
          },
          (err) => {
            console.log('\x1b[31m✗ Agent dispatch error: ' + err.message + '\x1b[0m');
            prompt();
          }
        );
        return;
      }

      // ── Regular message — direct Claude call ──────────────────────────────────
      const history = loadHistory(state.sessionPath);
      appendTurn(state.sessionPath, 'User', line);
      const response = askClaude(eccContext, history, line, state.model);
      console.log(`\n${response}\n`);
      appendTurn(state.sessionPath, 'Assistant', response);
      prompt();
    });
  };

  prompt();
}

module.exports = {
  getClawDir,
  getSessionPath,
  listSessions,
  loadHistory,
  appendTurn,
  loadECCContext,
  buildPrompt,
  askClaude,
  isValidSessionName,
  handleClear,
  handleHistory,
  handleSessions,
  handleHelp,
  parseTurns,
  estimateTokenCount,
  getSessionMetrics,
  searchSessions,
  compactSession,
  exportSession,
  branchSession,
  main,
};

if (require.main === module) {
  main();
}
