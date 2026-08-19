'use strict';

/**
 * SPEC-015: Steering Registry
 *
 * Single source of truth for all S0-S15 steering items.
 * Run probes, collect results, update registry.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Relative root — no donor-machine absolute paths. The showcase lives under
// the web app's public tree (the only showcase/ that exists).
const ROOT = path.resolve(__dirname, '..');
const REGISTRY_FILE = path.join(ROOT, 'apps', 'web', 'public', 'showcase', 'steering-registry.json');

// ── Spec name map ─────────────────────────────────────────────────────────────

const SPEC_NAMES = {
  S0:  'Trusted Execution Envelope',
  S1:  'Lifecycle Event Bus',
  S2:  'Scoped Memory Model',
  S3:  'Verified Learning',
  S4:  'Priority Steer',
  S5:  'Structured Rejection Feedback',
  S6:  'Approval Triage',
  S7:  'Continuity and Recovery',
  S8:  'Model-Per-Phase Routing',
  S9:  'Swarm Verification',
  S10: 'Team Coordination',
  S11: 'Vision Lane',
  S12: 'Persistent Sessions',
  S13: 'Remote Approvals',
  S14: 'Device Control',
  S15: 'Steering Registry',
};

// ── Registry schema ───────────────────────────────────────────────────────────

function makeEntry(key, overrides = {}) {
  return {
    name: SPEC_NAMES[key] || key,
    implemented: false,
    spec_path: `docs/parity/specifications/SPEC-${key.slice(1).padStart(3,'0')}_${SPEC_NAMES[key]?.replace(/[^A-Z0-9]/gi,'_').toUpperCase()}.md`,
    probe_path: null,
    probe_status: null,
    probe_date: null,
    probe_output: null,
    verdict: 'UNIMPLEMENTED',
    surfaces: [],
    providers: [],
    blockers: [],
    honesty_label: null,
    ...overrides,
  };
}

// ── Probe paths ──────────────────────────────────────────────────────────────
// Probes must actually exist on disk. A path listed here whose file is
// missing is treated as NOT implemented — never as a pass.

const PROBE_PATHS = {
  S2:  'tests/steering/test-live-turn.js',     // steering capsule + boundary enforcement
  S4:  'tests/steering/test-s-modules.js',     // priority-steer interrupts
  S6:  'tests/steering/test-s-modules.js',     // approval triage
  S9:  'tests/steering/test-s-modules.js',     // swarm verification
  S10: 'tests/steering/test-s-modules.js',     // team coordination
  S12: 'tests/steering/test-s-modules.js',     // persistent sessions
  S13: 'tests/steering/test-s-modules.js',     // remote approvals
  S14: 'tests/steering/test-s-modules.js',     // device control
};

// ── Build registry ────────────────────────────────────────────────────────────

function build() {
  const items = {};
  for (let i = 0; i <= 15; i++) {
    const key = 'S' + i;
    const probePath = PROBE_PATHS[key] || null;
    // Implemented = the probe file actually exists on disk. A declared path
    // with no file is not an implementation.
    const implemented = !!(probePath && fs.existsSync(path.join(ROOT, probePath)));
    const specFile = path.join(ROOT, 'docs', 'parity', 'specifications', `SPEC-${String(i).padStart(3,'0')}_${(SPEC_NAMES[key] || key).replace(/[^A-Z0-9]/gi,'_').toUpperCase()}.md`);
    const specExists = fs.existsSync(specFile);

    items[key] = makeEntry(key, {
      implemented,
      spec_path: specExists ? `docs/parity/specifications/${path.basename(specFile)}` : null,
      probe_path: implemented ? probePath : null,
      surfaces: implemented ? ['CLI', 'TUI', 'Web'] : [],
      providers: implemented ? ['minimax', 'openai', 'anthropic'] : [],
      verdict: implemented ? 'IMPLEMENTED' : 'UNIMPLEMENTED',
      blockers: [],
    });
  }

  return {
    items,
    last_updated: new Date().toISOString(),
    total: 16,
    implemented: Object.values(items).filter(i => i.implemented).length,
  };
}

// ── Run probes ───────────────────────────────────────────────────────────────

function runProbe(probePath) {
  const fullPath = path.join(ROOT, probePath);
  if (!fs.existsSync(fullPath)) {
    return { status: 'NOT_FOUND', output: 'Probe file not found: ' + probePath };
  }
  try {
    // Probe files are node:test suites — run and require exit 0.
    const out = execSync(`node --test "${fullPath}"`, {
      cwd: ROOT,
      timeout: 120_000,
      encoding: 'utf8',
      maxBuffer: 512 * 1024,
    });
    const failed = /# fail [1-9]|ℹ fail [1-9]/.test(out);
    return { status: failed ? 'FAIL' : 'PASS', output: out.slice(-2000) };
  } catch (e) {
    return { status: 'FAIL', output: ((e.stdout || '') + (e.stderr || '')).slice(-2000), exitCode: e.status };
  }
}

// ── Run all probes ───────────────────────────────────────────────────────────

function runAll() {
  const results = {};
  const registry = load();
  const keys = Object.keys(PROBE_PATHS);

  for (const key of keys) {
    const probePath = PROBE_PATHS[key];
    console.log('Running ' + key + ' probe: ' + probePath + '...');
    const result = runProbe(probePath);
    results[key] = result;

    const now = new Date().toISOString().split('T')[0];
    if (registry.items[key]) {
      registry.items[key].probe_date = now;
      registry.items[key].probe_status = result.status;
      registry.items[key].probe_output = result.output?.substring(0, 500) || null;
      registry.items[key].verdict = result.status === 'PASS' ? 'NATIVE' : 'BROKEN';
      registry.items[key].honesty_label = result.status === 'PASS' ? 'NATIVE' : 'BROKEN';
    }
  }

  registry.last_updated = new Date().toISOString();
  save(registry);

  return results;
}

// ── Load / Save ──────────────────────────────────────────────────────────────

function load() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    return { items: build(), last_updated: null };
  }
}

function save(registry) {
  fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// ── Update single item ───────────────────────────────────────────────────────

function updateItem(key, updates) {
  const registry = load();
  if (!registry.items[key]) registry.items[key] = makeEntry(key);
  registry.items[key] = { ...registry.items[key], ...updates };
  registry.last_updated = new Date().toISOString();
  save(registry);
  return registry.items[key];
}

// ── Human-readable status ────────────────────────────────────────────────────

function status() {
  const registry = load();
  const lines = [];
  lines.push('');
  lines.push('  PURPCLAW STEERING REGISTRY');
  lines.push('  ' + '='.repeat(50));
  lines.push('');

  let passCount = 0;
  let failCount = 0;

  for (const [key, item] of Object.entries(registry.items)) {
    const mark = item.probe_status === 'PASS' ? '✓' : item.probe_status === 'FAIL' ? '✗' : item.verdict === 'IMPLEMENTED' ? '◐' : '○';
    const line = `  [${key}] ${mark} ${item.name}`;
    lines.push(line);
    if (item.probe_status === 'PASS') passCount++;
    else if (item.probe_status === 'FAIL') failCount++;
  }

  lines.push('');
  lines.push(`  Probes: ${passCount} PASS / ${failCount} FAIL / ${16 - passCount - failCount} untested`);
  lines.push(`  Implemented: ${registry.items ? Object.values(registry.items).filter(i=>i.implemented).length : 0}/16`);
  lines.push(`  Registry: ${REGISTRY_FILE}`);
  lines.push('');
  return lines.join('\n');
}

// ── Module API ───────────────────────────────────────────────────────────────

module.exports = {
  build,
  load,
  save,
  runAll,
  runProbe,
  updateItem,
  status,
  REGISTRY_FILE,
};
