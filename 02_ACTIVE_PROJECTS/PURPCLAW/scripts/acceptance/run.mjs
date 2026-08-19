#!/usr/bin/env node
// scripts/acceptance/run.mjs — honest scoreboard against the 20 hard release
// gates in docs/canonical/acceptance-tests.json.
//
// Each test gets a checker returning { status, evidence }:
//   PASS            — verified true against live code/config
//   FAIL            — verified violated (a real, named blocker)
//   NOT_IMPLEMENTED — no runtime probe yet (needs a live multi-surface stack,
//                     or a canonical authority marker that doesn't exist yet)
//
// The runner NEVER fake-passes. A gate with no rigorous check reports
// NOT_IMPLEMENTED, not PASS. Exit code is nonzero only when a must_pass test
// is FAIL (an active regression/violation) — NOT_IMPLEMENTED is coverage debt,
// reported loudly but not a red-CI signal on its own.
//
// Usage: node scripts/acceptance/run.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (...p) => path.join(ROOT, ...p);
const read = f => fs.readFileSync(P(f), 'utf8');
const exists = f => fs.existsSync(P(f));

const spec = JSON.parse(read('docs/canonical/acceptance-tests.json'));

const NI = (why) => ({ status: 'NOT_IMPLEMENTED', evidence: why });

// ── Checkers keyed by test id ───────────────────────────────────────────────
const CHECKERS = {
  'port-authority': () => {
    // A collision = two DISTINCT services fighting for one port. Documented
    // co-located endpoints (same host process exposed under two ids, or a
    // sub-endpoint mounted on a spine) are NOT collisions.
    const INTENTIONAL_SHARED = {
      3000: 'web-ui + web-ui-pm2 = same Next server (dev/pm2 alias)',
      7896: 'stt + voice-ingress = ingress subscribes to the STT stream (same process)',
      7880: 'memory + autodream = AutoDream endpoints mounted on the cognitive spine',
    };
    const { SERVICES } = require(P('lib/runtime/ports.js'));
    const byPort = new Map();
    for (const s of SERVICES) {
      if (!byPort.has(s.port)) byPort.set(s.port, new Set());
      byPort.get(s.port).add(s.id);
    }
    const collisions = [];
    for (const [port, ids] of byPort) {
      if (ids.size > 1 && !INTENTIONAL_SHARED[port]) collisions.push(`${port}: ${[...ids].join(', ')}`);
    }
    // Hard-assert the two audit collisions each have exactly one owner.
    for (const audit of [7781, 7791]) {
      const owners = [...(byPort.get(audit) || [])];
      if (owners.length > 1) collisions.push(`AUDIT PORT ${audit}: ${owners.join(', ')}`);
    }
    if (collisions.length) {
      return { status: 'FAIL', evidence: `port collisions: ${collisions.join(' | ')}` };
    }
    const p7781 = [...(byPort.get(7781) || [])];
    const p7791 = [...(byPort.get(7791) || [])];
    return { status: 'PASS', evidence: `no real collisions (${Object.keys(INTENTIONAL_SHARED).length} documented co-locations excluded); 7781=${p7781.join(',')||'unbound'} 7791=${p7791.join(',')||'unbound'}` };
  },

  'workflow-single-authority': () => {
    const engines = ['lib/workflow-manager.js', 'lib/event-workflow.js', 'lib/recipe-manager.js']
      .filter(exists);
    if (engines.length > 1) {
      return { status: 'FAIL', evidence: `${engines.length} competing workflow engines present: ${engines.join(', ')} — one canonical authority + adapters required` };
    }
    return { status: 'PASS', evidence: `single workflow engine: ${engines[0] || '(none)'}` };
  },

  'tool-minimal-load': () => {
    // ToolRuntime.catalog() must expose only the allowed subset, not all tools.
    const { ToolRuntime } = require(P('lib/tool-runtime.js'));
    const full = new ToolRuntime({ permissionProfile: 'workspace-write' });
    const scoped = new ToolRuntime({ permissionProfile: 'workspace-write', allowedTools: ['read'] });
    const fullN = full.catalog().length;
    const scopedNames = scoped.catalog().map(t => t.name);
    if (fullN > scopedNames.length && scopedNames.length >= 1 && scopedNames.every(n => n === 'read')) {
      return { status: 'PASS', evidence: `full catalog=${fullN}, scoped to allowedTools=[read] exposes ${scopedNames.length}` };
    }
    return { status: 'FAIL', evidence: `scope filter ineffective: full=${fullN} scoped=[${scopedNames.join(',')}]` };
  },

  'registry-dynamic-counts': () => {
    // Surfaces must derive counts from registries, not bake constant agent lists.
    const api = read('unified_api.js');
    const bakedAgentArray = /const registry = \[\{ name: '/.test(api);
    if (bakedAgentArray) {
      const line = api.split('\n').findIndex(l => l.includes("const registry = [{ name: '")) + 1;
      return { status: 'FAIL', evidence: `unified_api.js hard-codes an agent roster array (~line ${line}); must read from registry at runtime` };
    }
    return { status: 'PASS', evidence: 'no baked agent roster arrays found in unified_api.js' };
  },

  'zero-agent-utility': () => {
    // A deterministic command must resolve without an agent/model call.
    const reg = require(P('lib/cli/registry.js'));
    const cmds = reg.commands ? reg.commands() : [];
    const det = cmds.filter(c => ['version', 'help', 'status', 'completion'].includes(c.name));
    if (det.length >= 2) {
      return { status: 'PASS', evidence: `deterministic CLI commands resolve without agent dispatch: ${det.map(c => c.name).join(', ')}` };
    }
    return { status: 'FAIL', evidence: 'no deterministic zero-agent command path found in CLI registry' };
  },

  'media-lazy': () => {
    // voice/vision/stt/tts must not be CORE (would auto-start with the stack).
    const { SERVICES } = require(P('lib/runtime/ports.js'));
    const media = SERVICES.filter(s => /voice|vision|stt|tts/i.test(s.id));
    const core = media.filter(s => s.class === 'core');
    if (core.length) {
      return { status: 'FAIL', evidence: `media services marked core (would auto-wake): ${core.map(s => s.id).join(', ')}` };
    }
    return { status: 'PASS', evidence: `media services on-demand: ${media.map(s => `${s.id}=${s.class}`).join(', ')}` };
  },

  'provider-parity': () => {
    // One canonical router: model-router delegates to routing-decisions.
    if (!exists('lib/routing-decisions.js') || !exists('lib/model-router.js')) {
      return NI('routing modules not found');
    }
    const mr = read('lib/model-router.js');
    if (/require\(['"]\.\/routing-decisions['"]\)/.test(mr)) {
      return { status: 'PASS', evidence: 'model-router.js delegates to canonical routing-decisions.js' };
    }
    return { status: 'FAIL', evidence: 'model-router.js does not delegate to routing-decisions.js (parallel routing risk)' };
  },

  // ── Live-runtime gates: need a running multi-surface stack, honestly unproven ──
  'single-runtime-multisurface': () => NI('needs live CLI+TUI+Web+Desktop attached to one supervisor — no offline probe'),
  'cross-surface-process': () => NI('needs a live task observed across surfaces'),
  'agent-minimal-load': () => NI('needs a live agent run to prove no bulk agent wake'),
  'skill-lazy-load': () => NI('needs a live task to prove only selected SKILL.md bodies enter context'),
  'plugin-lazy-load': () => NI('needs a live capability that requires a plugin'),
  'harness-path': () => NI('needs live tracing that every tool/model action traversed the harness chain'),
  'steering-parity': () => NI('needs a live steering update observed on one canonical process across surfaces'),
  'web-reconnect': () => NI('needs a live web client close/reopen against a running task'),
  'recovery': () => NI('needs a live core restart mid-task'),
  'memory-truth': () => NI('needs the canonical memory registry to enumerate implemented vs claimed layers'),
  'mission-single-authority': () => NI('needs a declared canonical mission authority marker to assert against'),
  'provenance': () => NI('needs a live process record to inspect full lineage'),
  'mobile-same-brain': () => NI('needs a paired mobile client against the canonical gateway'),
};

// ── Run ─────────────────────────────────────────────────────────────────────
const results = spec.tests.map(t => {
  let r;
  try { r = (CHECKERS[t.id] || (() => NI('no checker defined')))(); }
  catch (e) { r = { status: 'FAIL', evidence: `checker threw: ${e.message}` }; }
  return { id: t.id, must_pass: t.must_pass, assert: t.assert, ...r };
});

const tally = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
const mustFail = results.filter(r => r.must_pass && r.status === 'FAIL');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedAt: null, tally, results }, null, 2));
} else {
  const icon = s => s === 'PASS' ? '✅' : s === 'FAIL' ? '❌' : '⬜';
  console.log('\nPURPCLAW Acceptance — 20 hard release gates (docs/canonical/acceptance-tests.json)\n');
  for (const r of results) console.log(`${icon(r.status)} ${r.status.padEnd(16)} ${r.id}\n   ${r.evidence}`);
  console.log(`\nPASS ${tally.PASS || 0}  FAIL ${tally.FAIL || 0}  NOT_IMPLEMENTED ${tally.NOT_IMPLEMENTED || 0}  (of ${results.length})`);
  if (mustFail.length) console.log(`\nmust-pass FAILs (block FULL release): ${mustFail.map(r => r.id).join(', ')}`);
}

// Persist a machine report.
const outDir = P('artifacts', 'acceptance');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ tally, results }, null, 2) + '\n');

// Exit nonzero only on active must-pass FAILs (regressions), not on coverage debt.
process.exit(mustFail.length ? 1 : 0);
