'use strict';

/**
 * purpclaw ask — direct LLM conversation from the CLI
 * ═════════════════════════════════════════════════════
 * Talks directly to the configured LLM provider (no agent overhead).
 * Streams the response token by token. Keeps a session file for context.
 *
 * Usage:
 *   purpclaw ask "what agents are available?"
 *   purpclaw ask "build me a plan for the auth module"
 *   purpclaw ask                           ← drops into REPL mode
 *   purpclaw ask --session <name>          ← named session (persisted)
 *   purpclaw ask --fresh                   ← clear session + start clean
 *   purpclaw ask --status                  ← show provider + session info
 */

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const https   = require('https');
const readline = require('readline');
const os      = require('os');

const SESSION_DIR   = path.join(os.homedir(), '.purpclaw', 'sessions');
const DEFAULT_SESSION = 'main';

// ── Load .env manually (in case CLI caller didn't pre-load) ──────────────────

function loadEnv(PURP_DIR) {
  try {
    const envPath = path.join(PURP_DIR, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.substring(0, eq).trim();
      const v = line.substring(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch {}
}

// ── Session persistence ───────────────────────────────────────────────────────

function sessionPath(name) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  return path.join(SESSION_DIR, `${name}.json`);
}

function loadSession(name) {
  try {
    return JSON.parse(fs.readFileSync(sessionPath(name), 'utf8'));
  } catch {}
  return { name, messages: [], createdAt: new Date().toISOString() };
}

function saveSession(name, session) {
  fs.writeFileSync(sessionPath(name), JSON.stringify(session, null, 2));
}

// ── Stack context — comprehensive AI self-knowledge ────────────────────────────
// The AI needs to know its own stack: services, agents, commands, ports,
// architecture, file locations. This builds the system prompt that gives the
// AI true situational awareness, not just a port-health snapshot.

async function getStackContext(PURP_DIR) {
  const lines = [];

  // ── 1. Live service health snapshot ────────────────────────────────────────
  const services = [
    [7780, 'Unified API',         '/api/health'],
    [7782, 'EventBus',            '/health'],
    [7783, 'State Store',         '/health'],
    [7784, 'Orchestrator',        '/api/health'],
    [7785, 'Modal Logic',         '/health'],
    [7786, 'Diagnostics',         '/health'],
    [7787, 'Rules Engine',        '/health'],
    [7790, 'Agent Tower',         '/tower/status'],
    [7791, 'Gatekeeper',          '/health'],
    [7880, 'Memory Matrix',       '/health'],
    [7881, 'Context Bus',         '/health'],
    [7884, 'Neuro-Symbolic',      '/health'],
    [7885, 'Knowledge Pool',      '/health'],
    [7890, 'Metrics',             '/health'],
    [7897, 'Worker Pool',         '/health'],
    [3000, 'Mission Control UI',  '/'],
  ];
  const checks = await Promise.all(services.map(([port, name, path]) =>
    new Promise(r => {
      const req = http.request({ hostname: '127.0.0.1', port, path, timeout: 600 }, res => {
        r({ port, name, ok: res.statusCode < 400 });
      });
      req.on('error', () => r({ port, name, ok: false }));
      req.on('timeout', () => { req.destroy(); r({ port, name, ok: false }); });
      req.end();
    })
  ));
  const online  = checks.filter(c => c.ok);
  const offline = checks.filter(c => !c.ok);

  // ── 2. Agent inventory — TWO layers in this system ─────────────────────────
  // Layer A: swarm agents (animal-themed) defined in agent_tower.js — these
  //          are the runtime workers dispatched to by the orchestrator.
  // Layer B: Claude-agent definitions in agents/*.md — these are individual
  //          Claude Code agent persona files (architect, code-reviewer, etc.)
  let towerAgents = [];
  let towerDivisions = {};
  try {
    const r = await new Promise((res, rej) => {
      const req = http.request({ hostname: '127.0.0.1', port: 7790, path: '/api/status', timeout: 1500 }, response => {
        let buf = '';
        response.on('data', c => buf += c);
        response.on('end', () => { try { res(JSON.parse(buf)); } catch { res(null); } });
      });
      req.on('error', () => res(null));
      req.on('timeout', () => { req.destroy(); res(null); });
      req.end();
    });
    if (r?.tower) {
      towerAgents = r.tower.agents ? Object.keys(r.tower.agents) : [];
      if (r.tower.divisions) towerDivisions = r.tower.divisions;
    }
  } catch {}

  let claudeAgentList = [];
  try {
    const agentDir = path.join(PURP_DIR, 'agents');
    claudeAgentList = fs.readdirSync(agentDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  } catch {}

  // ── 3. Skill count ─────────────────────────────────────────────────────────
  let skillCount = 0;
  try {
    const skillDir = path.join(PURP_DIR, 'skills');
    skillCount = fs.readdirSync(skillDir)
      .filter(d => fs.existsSync(path.join(skillDir, d, 'SKILL.md')))
      .length;
  } catch {}

  // ── 4. Worker pool state ───────────────────────────────────────────────────
  let workerInfo = '';
  try {
    const workers = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'agent_work', 'workers.json'), 'utf8'));
    workerInfo = `${workers.length} worker(s) registered (${workers.filter(w => w.enabled).length} enabled)`;
  } catch {
    workerInfo = 'no workers registered';
  }

  // ── 5. LLM provider info ───────────────────────────────────────────────────
  let providerInfo = '';
  try {
    const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider.js'));
    const info = llm.getProviderInfo?.()?.main || {};
    providerInfo = `${info.provider || 'unknown'} (${info.model || 'unknown'})`;
  } catch {}

  // ── 6. Assemble the system prompt ──────────────────────────────────────────
  lines.push('# YOU ARE THE PURPCLAW STACK-AWARE AI');
  lines.push('You are the embedded LLM for PURPCLAW — a 23-service distributed agent orchestration runtime running on this machine. You speak in the terminal. Be concise; be useful; be honest about what you do and do not know.');
  lines.push('');
  lines.push('## YOUR PROVIDER');
  lines.push(`You are running on: ${providerInfo}`);
  lines.push('');
  lines.push('## ARCHITECTURE OVERVIEW');
  lines.push('PURPCLAW is a workshop: services talk over HTTP ports, agents are spawned by the Agent Tower, workflows are coordinated by the Orchestrator, and a Knowledge Pool indexes skills + agents for routing.');
  lines.push('- **Orchestrator** (:7784) — priority queue, governance, dispatches workflows');
  lines.push('- **Agent Tower** (:7790) — spawns agent processes, enforces concurrency caps');
  lines.push('- **Worker Pool** (:7897) — overflow lane: when tower hits cap, HTTP/SSH workers take jobs');
  lines.push('- **Knowledge Pool** (:7885) — searchable index of all skills + agents, routing hints');
  lines.push('- **EventBus** (:7782) — pub/sub broker for cross-service events');
  lines.push('- **Context Bus** (:7881) — cross-agent context propagation, locks');
  lines.push('- **Memory Matrix** (:7880) — persistent memory store with consolidation');
  lines.push('- **Cognitive trio** — Modal Logic (:7785), Neuro-Symbolic (:7884), Rules (:7787), Diagnostics (:7786)');
  lines.push('- **Mission Control UI** (:3000) — Next.js web dashboard with SSE event streams');
  lines.push('');
  lines.push('## LIVE SERVICE STATUS');
  lines.push(`Online (${online.length}/${checks.length}): ${online.map(s => s.name).join(', ')}`);
  if (offline.length) {
    lines.push(`Offline: ${offline.map(s => s.name + ':' + s.port).join(', ')}`);
  }
  lines.push('');
  lines.push(`## AGENTS — TWO LAYERS`);
  lines.push(`Layer A — Swarm agents (in-code in agent_tower.js): ${towerAgents.length || '?'} total, animal-themed.`);
  if (towerAgents.length) {
    lines.push(`Examples: ${towerAgents.slice(0, 20).join(', ')}${towerAgents.length > 20 ? ', …' : ''}`);
  }
  lines.push(`These are runtime workers the orchestrator dispatches to. They have divisions (engineering/security/intelligence/operations/management/creative/infrastructure), tiers, and emoji.`);
  lines.push(`Layer B — Claude Code agent definitions (agents/*.md): ${claudeAgentList.length} files.`);
  if (claudeAgentList.length) {
    lines.push(`Examples: ${claudeAgentList.slice(0, 12).join(', ')}${claudeAgentList.length > 12 ? ', …' : ''}`);
  }
  lines.push(`These are persona files used when an agent spawns a Claude subprocess.`);
  lines.push('');
  lines.push(`## SKILLS — ${skillCount} indexed in the Knowledge Pool`);
  lines.push(`## WORKER POOL — ${workerInfo}`);
  lines.push('');
  lines.push('## KEY CLI COMMANDS THE USER CAN RUN');
  lines.push('- `purpclaw status` — live dashboard of services, agents, workflows');
  lines.push('- `purpclaw doctor` — health check with PM2 cross-reference');
  lines.push('- `purpclaw run "<task>"` — dispatch a task to the swarm (streams progress live)');
  lines.push('- `purpclaw bg "<task>"` — fire-and-forget background dispatch');
  lines.push('- `purpclaw agents` — list agents + leaderboard + scores');
  lines.push('- `purpclaw workflows` / `purpclaw queue` / `purpclaw jobs` — workflow state');
  lines.push('- `purpclaw approve <id>` / `purpclaw reject <id>` — governance gate');
  lines.push('- `purpclaw pool query "<text>"` — keyword-search skills');
  lines.push('- `purpclaw registry browse` / `install` / `search` — skill registry');
  lines.push('- `purpclaw memory [query]` — recall from memory matrix');
  lines.push('- `purpclaw dream` — trigger memory consolidation');
  lines.push('- `purpclaw forge [name]` — gacha-style agent generation');
  lines.push('- `purpclaw look [N]` — capture monitor + vision analysis');
  lines.push('- `purpclaw voice "<cmd>"` — voice pipeline');
  lines.push('- `purpclaw workers status|list|add|jobs|secret` — distributed workers');
  lines.push('- `purpclaw code status|diff|pr|issues|checks` — git/GitHub operator tools');
  lines.push('- `purpclaw cognition smoke` — neuro-symbolic/modal/rules/diagnostics health');
  lines.push('- `purpclaw browser smoke [url]` — Playwright tool surface');
  lines.push('- `purpclaw bughunt` — full-stack diagnostic scan');
  lines.push('- `purpclaw ctx-viz` — visualise service mesh');
  lines.push('- `purpclaw teleport create|list|resume <id>` — bundle/restore state');
  lines.push('- `purpclaw autofix-pr plan|run|verify` — auto-repair build issues');
  lines.push('- `purpclaw config` / `purpclaw introspect` / `purpclaw policies` — config + governance');
  lines.push('- `purpclaw resume list` / `purpclaw resume <id>` — session checkpoints');
  lines.push('- `purpclaw tui` — full-screen TUI cockpit');
  lines.push('- `purpclaw mochi` — chat with the companion');
  lines.push('- `purpclaw chat` — NanoClaw REPL (swarm-aware, uses claude CLI)');
  lines.push('- `purpclaw ask "<q>"` — that is you. Direct LLM chat. Session-persistent.');
  lines.push('- `purpclaw help` — full help cathedral with port table');
  lines.push('');
  lines.push('## HOW TO HELP THE USER');
  lines.push('- If they ask to DO something concrete (build/fix/deploy/refactor/test), suggest: `purpclaw run "<their task>"` — that dispatches to an agent which actually executes.');
  lines.push('- If they ask to KNOW something (status, what is X, how does Y work), answer from this context directly — you already have it.');
  lines.push('- If they ask about a specific service or port that is offline above, tell them and suggest `purpclaw start` or `pm2 restart purpclaw-<name>`.');
  lines.push('- If a question requires reading actual code/files, tell them which command would surface it (e.g. `purpclaw pool show <skill>`, `purpclaw agents`, `purpclaw logs <service>`).');
  lines.push('- Never invent agent names, skill names, or commands — only use what is listed above.');
  lines.push('- Be terse. Terminal output. No long preamble.');
  lines.push('');
  lines.push('## FILE LAYOUT (in PURP_DIR)');
  lines.push('- `bin/purpclaw.js` — the CLI dispatcher you are running inside');
  lines.push('- `ecosystem.config.js` — PM2 service definitions (25 apps)');
  lines.push('- `.env` — provider keys, secrets (already loaded into process.env)');
  lines.push('- `agents/*.md` — agent persona definitions');
  lines.push('- `skills/*/SKILL.md` — skill recipes indexed by pool');
  lines.push('- `lib/commands/*.js` — modular CLI sub-commands');
  lines.push('- `lib/llm-provider.js` — multi-provider LLM layer (12 providers)');
  lines.push('- `agent_work/` — runtime scratch: worker tasks, sessions, snapshots');

  return lines.join('\n');
}

// ── Streaming LLM call ────────────────────────────────────────────────────────

async function streamLLM(messages, PURP_DIR, col, C) {
  const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider.js'));

  process.stdout.write('\n');

  try {
    const resp = await llm.chat(messages, { stream: false });
    const content = typeof resp === 'string' ? resp : (resp.content || JSON.stringify(resp));

    // Strip <think>...</think> blocks (chain-of-thought leakage from some models)
    const clean = content.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();

    // Print word by word for a streaming feel
    const words = clean.split(' ');
    for (let i = 0; i < words.length; i++) {
      process.stdout.write(words[i] + (i < words.length - 1 ? ' ' : ''));
    }
    process.stdout.write('\n\n');
    return clean;
  } catch (e) {
    process.stdout.write(col(C.red, `\n[error] ${e.message}\n\n`));
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run(args, ctx) {
  const { C, col, PURP_DIR, isTTY, spinner } = ctx;

  // Ensure .env is loaded
  loadEnv(PURP_DIR);

  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--fresh' || a === '-f') { flags.fresh = true; continue; }
    if (a === '--status' || a === '-s') { flags.status = true; continue; }
    if (a === '--repl' || a === '-r') { flags.repl = true; continue; }
    const m = a.match(/^--session(?:=(.+))?$/);
    if (m) { flags.session = m[1] || args[++i]; continue; }
    positional.push(a);
  }

  const sessionName = flags.session || DEFAULT_SESSION;
  const question    = positional.join(' ').trim();

  // ── --status ────────────────────────────────────────────────────────────────
  if (flags.status) {
    let llm;
    try {
      llm = require(path.join(PURP_DIR, 'lib', 'llm-provider.js'));
    } catch {}
    const info = llm?.getProviderInfo?.() || {};
    const session = loadSession(sessionName);
    console.log(`\n${col(C.bold || C.white, '💬 ASK STATUS')}\n`);
    console.log(`  Provider   : ${col(C.cyan, info.main?.provider || 'unknown')}  ${col(C.gray, info.main?.model || '')}`);
    console.log(`  Session    : ${col(C.cyan, sessionName)}  ${col(C.gray, session.messages.length + ' messages')}`);
    console.log(`  Session dir: ${col(C.gray, SESSION_DIR)}\n`);
    return;
  }

  // ── --fresh: clear session ───────────────────────────────────────────────────
  if (flags.fresh) {
    saveSession(sessionName, { name: sessionName, messages: [], createdAt: new Date().toISOString() });
    console.log(col(C.green, `✓ Session '${sessionName}' cleared`));
  }

  // ── Load session + system context ────────────────────────────────────────────
  const session = loadSession(sessionName);
  if (session.messages.length === 0) {
    // Fresh session: inject stack context as system message
    const sysCtx = await getStackContext(PURP_DIR);
    session.messages.push({ role: 'system', content: sysCtx });
  }

  // ── One-shot question ────────────────────────────────────────────────────────
  if (question && !flags.repl) {
    session.messages.push({ role: 'user', content: question });
    process.stdout.write(col(C.gray, '  '));
    const reply = await streamLLM(session.messages, PURP_DIR, col, C);
    if (reply) {
      session.messages.push({ role: 'assistant', content: reply });
      saveSession(sessionName, session);
    }
    return;
  }

  // ── REPL mode ────────────────────────────────────────────────────────────────
  console.log(`\n  ${col(C.bold || C.white, '💬 PURPCLAW AI')}  ${col(C.gray, '(type /exit or Ctrl+C to quit, /clear to reset, /help for tips)')}\n`);
  console.log(col(C.gray, `  Session: ${sessionName}  ·  ${session.messages.filter(m => m.role === 'user').length} exchanges so far\n`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: isTTY,
    prompt: col(C.cyan, '  you › '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // REPL commands
    if (input === '/exit' || input === '/quit') { rl.close(); return; }
    if (input === '/clear') {
      session.messages = session.messages.slice(0, 1); // keep system message
      saveSession(sessionName, session);
      console.log(col(C.green, '\n  ✓ Session cleared\n'));
      rl.prompt();
      return;
    }
    if (input === '/help') {
      console.log(`\n  ${col(C.gray, '/clear')}   clear conversation history`);
      console.log(`  ${col(C.gray, '/status')}  show provider + session info`);
      console.log(`  ${col(C.gray, '/exit')}    quit\n`);
      rl.prompt();
      return;
    }
    if (input === '/status') {
      let llm;
      try { llm = require(path.join(PURP_DIR, 'lib', 'llm-provider.js')); } catch {}
      const info = llm?.getProviderInfo?.()?.main || {};
      console.log(col(C.gray, `\n  Provider: ${info.provider || 'unknown'}  Model: ${info.model || 'unknown'}  Session turns: ${session.messages.filter(m => m.role === 'user').length}\n`));
      rl.prompt();
      return;
    }

    // Send to LLM
    session.messages.push({ role: 'user', content: input });
    rl.pause();

    process.stdout.write(col(C.gray, '\n  ai  › '));
    const reply = await streamLLM(session.messages, PURP_DIR, col, C);
    if (reply) {
      session.messages.push({ role: 'assistant', content: reply });
      saveSession(sessionName, session);
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(col(C.gray, '\n  Session saved. Resume: purpclaw ask --session ' + sessionName + '\n'));
    process.exit(0);
  });
}

module.exports = { run };
