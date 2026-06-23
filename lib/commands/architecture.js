'use strict';

/**
 * purpclaw architecture — single-shot stack overview
 * ═══════════════════════════════════════════════════
 * One screen that explains what PURPCLAW is, what services exist, how data
 * flows, where files live, and what commands do what. Use it to onboard a
 * new contributor (or refresh your own memory at 3am).
 *
 * Usage:
 *   purpclaw architecture          — full overview (default)
 *   purpclaw architecture --json   — machine-readable structure
 *   purpclaw architecture services — just the service map
 *   purpclaw architecture flow     — just the data-flow diagram
 *   purpclaw architecture files    — just the file/dir layout
 */

const fs   = require('fs');
const path = require('path');

async function run(args, ctx) {
  const { C, col, PURP_DIR, sectionHead, banner } = ctx;

  const sub = (args[0] || '').toLowerCase();
  const wantJson = args.includes('--json');

  // ── Build the full structural model ────────────────────────────────────────
  let agentCount = 0, skillCount = 0;
  try { agentCount = fs.readdirSync(path.join(PURP_DIR, 'agents')).filter(f => f.endsWith('.md')).length; } catch {}
  try { skillCount = fs.readdirSync(path.join(PURP_DIR, 'skills')).filter(d => {
    try { return fs.existsSync(path.join(PURP_DIR, 'skills', d, 'SKILL.md')); } catch { return false; }
  }).length; } catch {}

  let workers = [];
  try { workers = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'agent_work', 'workers.json'), 'utf8')); } catch {}

  const services = {
    'CORE': [
      ['7780', 'unified-api',     'HTTP gateway + MCP tools + REST endpoints'],
      ['7782', 'eventbus',        'Pub/sub broker — all cross-service events flow here'],
      ['7783', 'state-store',     'Shared k/v state across namespaces'],
      ['7784', 'orchestrator',    'Priority queue + governance + workflow dispatch'],
      ['7790', 'agent-tower',     'Spawns agent processes, enforces concurrency caps'],
      ['7791', 'gatekeeper',      'Pre-merge validation, skill amendments'],
      ['7881', 'context-bus',     'Cross-agent context propagation, distributed locks'],
      ['7885', 'knowledge-pool',  'Searchable skill+agent index, routing hints'],
      ['7890', 'metrics',         'Health polling + SSE heartbeat aggregator'],
      ['7897', 'worker-pool',     'Overflow lane — HTTP/SSH workers run agents remotely'],
      ['3030', 'mission-control', 'Next.js web UI (App Router)'],
    ],
    'COGNITIVE (Python)': [
      ['7880', 'memory-matrix',   'Persistent memory store with consolidation'],
      ['7884', 'neuro-symbolic',  'Bridge between LLM + symbolic logic'],
      ['7785', 'modal-logic',     'Modal logic engine for "what if" reasoning'],
      ['7786', 'diagnostics',     'Autonomous diagnostic reasoning'],
      ['7787', 'rules-engine',    'Symbolic rules engine'],
      ['7892', 'reasoning-loop',  'Proactive reasoning tick (opt-in via PURPCLAW_PROACTIVE)'],
      ['7880', 'autodream',       'Cognitive spine endpoint: /autodream/*'],
    ],
    'MEDIA + I/O (Python)': [
      ['7779', 'yolo',            'YOLO object detection'],
      ['7777', 'avatar',          'Simple companion avatar bridge'],
      ['7889', 'vision-monitor',  'Webcam + screen vision pipeline'],
      ['7781', 'voice-coord',     'Voice intent parsing + TTS coordination'],
      ['7792', 'voice-bridge',    'WebSocket voice bridge'],
      ['7896', 'stt',             'Whisper speech-to-text'],
    ],
  };

  // ── v2.1 — Live snapshot via /api/pulse + /api/whoami (no hardcoded numbers) ──
    // Must run BEFORE the JSON-mode `return` so JSON mode can include it.
    let liveSnapshot = null;
    try {
      const http = require('http');
      liveSnapshot = await new Promise((resolve) => {
        const out = { pulse: null, whoami: null };
        let done = 0;
        function maybeFinish() { if (++done >= 2) resolve(out); }
        http.get('http://127.0.0.1:7780/api/pulse', (res) => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => { try { out.pulse = JSON.parse(d); } catch {} maybeFinish(); });
        }).on('error', maybeFinish);
        http.get('http://127.0.0.1:7780/api/whoami', (res) => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => { try { out.whoami = JSON.parse(d); } catch {} maybeFinish(); });
        }).on('error', maybeFinish);
      });
    } catch { /* live snapshot is best-effort */ }

    // ── JSON mode ──────────────────────────────────────────────────────────────
    if (wantJson) {
      const out = { services, agents: agentCount, skills: skillCount, workers };
      // v2.1 — Include the live snapshot in JSON mode too
      if (liveSnapshot) {
        out.live = {
          pulse: liveSnapshot.pulse && {
            tickCount: liveSnapshot.pulse.tickCount,
            lastPulseAt: liveSnapshot.pulse.lastPulseAt,
            servicesDown: liveSnapshot.pulse.servicesDown,
          },
          whoami: liveSnapshot.whoami && {
            tools: liveSnapshot.whoami.systems && liveSnapshot.whoami.systems.tools,
            agents: liveSnapshot.whoami.systems && liveSnapshot.whoami.systems.agents,
            providers: liveSnapshot.whoami.systems && liveSnapshot.whoami.systems.providers,
          },
        };
      }
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (!sub || sub === 'all') {
      // v2.1 — Live snapshot banner — reads /api/whoami + /api/pulse so the
      // operator sees real numbers (not stale marketing copies).
      let pkgV = '0.2.0';
      try { pkgV = require(path.join(PURP_DIR, 'package.json')).version; } catch {}
      const w = liveSnapshot && liveSnapshot.whoami;
      const p = liveSnapshot && liveSnapshot.pulse;
      console.log(`  ${col(C.bold, 'PURPCLAW')} ${col(C.gray, 'v' + pkgV + ' — live snapshot')}`);
      if (w) {
        const t = (w.systems && w.systems.tools) || {};
        const a = (w.systems && w.systems.agents) || {};
        const pv = (w.systems && w.systems.providers) || {};
        console.log(`    ${col(C.gray, 'Tools:')}     ${col(C.white, t.total || 0)}  ${col(C.gray, '(' + (t.breakdown && t.breakdown.core || 0) + ' core, ' + (t.breakdown && t.breakdown.skills || 0) + ' skills, ' + (t.breakdown && t.breakdown.bodyBridge || 0) + ' body, ' + (t.breakdown && t.breakdown.nim || 0) + ' nim)')}`);
        console.log(`    ${col(C.gray, 'Agents:')}    ${col(C.white, a.count || 0)}  ${col(C.gray, '(' + (w.surfaces && w.surfaces.agentTower && w.surfaces.agentTower.divisions || 0) + ' divisions)')}`);
        console.log(`    ${col(C.gray, 'Providers:')} ${col(C.white, pv.count || 0)}  ${col(C.gray, '(' + (pv.present || []).join(', ') + ')')}`);
      } else {
        console.log(`    ${col(C.gray, '(unified_api :7780 unreachable — run \`purpclaw start --core\` to bring it up)')}`);
      }
      if (p) {
        const down = p.servicesDown && p.servicesDown.length;
        const state = down ? col(C.red, down + ' DOWN: ' + p.servicesDown.join(', ')) : col(C.green, 'ALL GREEN');
        console.log(`    ${col(C.gray, 'Pulse:')}     ${col(C.white, 'tick ' + p.tickCount + ', last ' + p.lastPulseAt)}  ${state}`);
        if (p.latestNotifications && p.latestNotifications.length) {
          const latest = p.latestNotifications[0];
          const sev = latest.severity === 'error' ? C.red : latest.severity === 'warn' ? C.yellow : C.green;
          console.log(`    ${col(C.gray, 'Latest:')}    ${col(sev, latest.title)} ${col(C.gray, '— ' + (latest.body || '').substring(0, 80))}`);
        }
      }
      console.log('');
    }

  // ── Service map section ────────────────────────────────────────────────────
  if (!sub || sub === 'all' || sub === 'services') {
    sectionHead('  🏗  SERVICE TOPOLOGY');
    for (const [group, list] of Object.entries(services)) {
      console.log(`\n  ${col(C.cyan + C.bold, group)}`);
      for (const [port, name, desc] of list) {
        console.log(`    ${col(C.cyan, port.padEnd(5))} ${col(C.white, name.padEnd(20))} ${col(C.gray, desc)}`);
      }
    }
    console.log('');
  }

  // ── Data-flow / lifecycle section ──────────────────────────────────────────
  if (!sub || sub === 'all' || sub === 'flow') {
    sectionHead('  🔁  HOW A TASK FLOWS THROUGH THE STACK');
    console.log(`
  ${col(C.cyan, '1.')} User types ${col(C.white, 'purpclaw run "<task>"')}
       └─→ bin/purpclaw.js parses, posts to ${col(C.cyan, ':7784/api/orchestrate')}

  ${col(C.cyan, '2.')} Orchestrator (:7784) creates a workflow
       ├─→ ${col(C.gray, 'Job-contract: risk classification, governance check')}
       ├─→ ${col(C.gray, 'Queue: priority-ordered, throttled by MAX_ACTIVE_WORKFLOWS')}
       └─→ Asks ${col(C.cyan, 'Knowledge Pool :7885')} for routing hints

  ${col(C.cyan, '3.')} Agent Tower (:7790) spawns the chosen agent
       ├─→ ${col(C.gray, 'Concurrency caps: MAX_ACTIVE_AGENTS / per-division')}
       ├─→ If cap reached → routes to ${col(C.cyan, 'Worker Pool :7897')} (overflow lane)
       └─→ Worker Pool can dispatch to HTTP or SSH workers

  ${col(C.cyan, '4.')} Agent executes (uses Claude Code CLI under the hood)
       ├─→ Reads from ${col(C.cyan, 'Memory Matrix :7880')} for context
       ├─→ Locks via ${col(C.cyan, 'Context Bus :7881')} when modifying shared state
       └─→ Publishes progress to ${col(C.cyan, 'EventBus :7782')} as SSE events

  ${col(C.cyan, '5.')} CLI streams events back to the user terminal
       └─→ Mission Control UI (:3030) also subscribes for live dashboard

  ${col(C.cyan, '6.')} On completion
       ├─→ Score updated in agent_score.json
       ├─→ AutoDream (:7880/autodream/*) may trigger memory consolidation
       └─→ Session checkpoint written to agent_work/sessions/
`);
  }

  // ── File layout section ────────────────────────────────────────────────────
  if (!sub || sub === 'all' || sub === 'files') {
    sectionHead('  📁  FILE LAYOUT');
    console.log(`
  ${col(C.cyan, 'bin/purpclaw.js')}        ${col(C.gray, '— The CLI dispatcher (3900+ lines).')}
  ${col(C.cyan, 'ecosystem.config.js')}    ${col(C.gray, '— PM2 service definitions (25 apps).')}
  ${col(C.cyan, '.env')}                   ${col(C.gray, '— Provider keys, secrets. Auto-loaded on every CLI run.')}
  ${col(C.cyan, 'service_registry.js')}    ${col(C.gray, '— Single source of truth: service → port → health path.')}

  ${col(C.cyan, 'agents/*.md')}            ${col(C.gray, '— ' + agentCount + ' agent persona definitions.')}
  ${col(C.cyan, 'skills/*/SKILL.md')}      ${col(C.gray, '— ' + skillCount + ' skill recipes (pool-indexed).')}

  ${col(C.cyan, 'lib/')}                   ${col(C.gray, '— Modular runtime libraries:')}
    ${col(C.gray, 'commands/*.js')}        ${col(C.gray, 'CLI sub-commands (delegated from bin/purpclaw.js)')}
    ${col(C.gray, 'llm-provider.js')}      ${col(C.gray, '12-provider LLM abstraction layer')}
    ${col(C.gray, 'secret-redactor.js')}   ${col(C.gray, 'Masks API keys in output — wraps stdout at CLI startup')}
    ${col(C.gray, 'worker-pool.js')}       ${col(C.gray, 'Worker registry + dispatch + reconciliation loop')}
    ${col(C.gray, 'context-bus.js')}       ${col(C.gray, 'Distributed locks + cross-agent context')}
    ${col(C.gray, 'governance.js')}        ${col(C.gray, 'Risk classification + approval gating')}
    ${col(C.gray, 'memory-client.js')}     ${col(C.gray, 'Client for memory matrix')}
    ${col(C.gray, 'mochi.js')}             ${col(C.gray, 'Companion state + procedural generation (46k faces)')}

  ${col(C.cyan, 'app/')}                   ${col(C.gray, '— Next.js App Router web UI.')}
    ${col(C.gray, 'components/')}          ${col(C.gray, '20 React components for the dashboard')}
    ${col(C.gray, 'hooks/')}               ${col(C.gray, '8 SSE/event hooks for real-time data')}
    ${col(C.gray, 'api/')}                 ${col(C.gray, '8 server routes (proxies, mission-data, mochi)')}

  ${col(C.cyan, 'scripts/')}               ${col(C.gray, '— Standalone scripts:')}
    ${col(C.gray, 'tui.js')}               ${col(C.gray, '34KB full-screen TUI cockpit (purpclaw tui)')}
    ${col(C.gray, 'nanoclaw.js')}          ${col(C.gray, 'Swarm-aware chat REPL (purpclaw chat)')}
    ${col(C.gray, 'panic-stop.js')}        ${col(C.gray, 'Emergency shutdown')}
    ${col(C.gray, 'test-worker-lane.js')}  ${col(C.gray, '14-test proof suite for the worker overflow lane')}

  ${col(C.cyan, 'agent_work/')}            ${col(C.gray, '— Runtime scratch (cleaned by purpclaw gc):')}
    ${col(C.gray, 'workers.json')}         ${col(C.gray, 'Worker registry')}
    ${col(C.gray, 'worker-tasks.json')}    ${col(C.gray, 'Persisted worker job records (24h TTL)')}
    ${col(C.gray, 'sessions/')}            ${col(C.gray, 'Session checkpoints')}
    ${col(C.gray, 'bg-sessions/')}         ${col(C.gray, 'Background dispatch logs')}
    ${col(C.gray, '.pool_index.json')}     ${col(C.gray, 'Cached pool index')}

  ${col(C.cyan, '~/.purpclaw/sessions/')}  ${col(C.gray, '— Chat REPL session history (per user).')}
`);
  }

  // ── Concepts section ───────────────────────────────────────────────────────
  if (!sub || sub === 'all' || sub === 'concepts') {
    sectionHead('  💡  KEY CONCEPTS');
    console.log(`
  ${col(C.cyan + C.bold, 'Agents')}          ${col(C.gray, agentCount + ' personas in agents/. Each has a division (engineering/security/')}
                  ${col(C.gray, 'intelligence/...) and a score. Tower spawns them; orchestrator routes to them.')}

  ${col(C.cyan + C.bold, 'Skills')}          ${col(C.gray, skillCount + ' skills in skills/. Indexed by the Knowledge Pool for keyword routing.')}
                  ${col(C.gray, 'A skill is a SKILL.md file with triggers + how-to text.')}

  ${col(C.cyan + C.bold, 'Workflows')}       ${col(C.gray, 'A workflow is an orchestrator-managed pipeline of agent steps.')}
                  ${col(C.gray, 'Created by `purpclaw run`. Tracked at :7784/api/workflows.')}

  ${col(C.cyan + C.bold, 'Worker Pool')}     ${col(C.gray, 'Overflow lane: when Agent Tower hits capacity, jobs route to HTTP/SSH')}
                  ${col(C.gray, 'workers. HMAC-signed. Auto-reconciles every 15s. ' + workers.length + ' worker(s) registered.')}

  ${col(C.cyan + C.bold, 'Governance')}      ${col(C.gray, 'Risk classification per job-contract. High-risk jobs require approval')}
                  ${col(C.gray, '(purpclaw approve <id>). Policies live in lib/governance.js.')}

  ${col(C.cyan + C.bold, 'Memory + Dream')}  ${col(C.gray, 'Memory Matrix stores everything an agent ingests. AutoDream consolidates')}
                  ${col(C.gray, 'after each workflow — lifts patterns into symbolic memory.')}

  ${col(C.cyan + C.bold, 'Companion')}       ${col(C.gray, 'Mochi — a procedurally-generated pet (46k face combos). Gives the')}
                  ${col(C.gray, 'CLI a heartbeat. Hatched from a seed. State at agent_work/mochi.json.')}

  ${col(C.cyan + C.bold, 'Front door')}      ${col(C.gray, '`purpclaw` with no args → drops into the chat REPL (ask command).')}
                  ${col(C.gray, 'REPL is stack-aware: knows all services, agents, commands. Session-persistent.')}

  ${col(C.cyan + C.bold, 'TAINT mode')}      ${col(C.gray, 'Append --taint to any command (or PURPCLAW_TAINT=1) for emotionally')}
                  ${col(C.gray, 'resonant error messages. The interface embodies state. Slightly damp.')}
`);
  }

  // ── Quick-start hint at the bottom of full overview ────────────────────────
  if (!sub || sub === 'all') {
    console.log(`  ${col(C.gray, '─'.repeat(76))}`);
    console.log(`  ${col(C.gray, 'Read more:')}`);
    console.log(`    ${col(C.cyan, 'purpclaw help')}                       full command reference (the cathedral)`);
    console.log(`    ${col(C.cyan, 'purpclaw doctor')}                     live health audit with PM2 cross-ref`);
    console.log(`    ${col(C.cyan, 'purpclaw status')}                     live service + workflow snapshot`);
    console.log(`    ${col(C.cyan, 'purpclaw ask "<question>"')}           ask the stack directly (it knows itself)`);
    console.log(`    ${col(C.cyan, 'purpclaw architecture services')}      service map only`);
    console.log(`    ${col(C.cyan, 'purpclaw architecture flow')}          task-flow diagram only`);
    console.log(`    ${col(C.cyan, 'purpclaw architecture files')}         file/dir layout only`);
    console.log(`    ${col(C.cyan, 'purpclaw architecture concepts')}      key concepts only\n`);
  }
}

module.exports = { run };
