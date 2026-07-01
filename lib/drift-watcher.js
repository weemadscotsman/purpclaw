#!/usr/bin/env node
'use strict';

/**
 * drift-watcher.js — PURPCLAW's autonomous drift monitor.
 *
 * Watches the moving parts of the live codebase and reports (and optionally
 * auto-fixes) drift between sources of truth. It NEVER edits service
 * definitions, prose, or running processes on its own — it auto-fixes only the
 * mechanically-regenerable surfaces (registry metadata, build stamps) and
 * flags everything else for human review.
 *
 *   node lib/drift-watcher.js              # one scan, report
 *   node lib/drift-watcher.js --fix        # scan + apply safe auto-fixes
 *   node lib/drift-watcher.js --watch      # loop forever (default 60s)
 *   node lib/drift-watcher.js --watch --fix --interval=120
 *   node lib/drift-watcher.js --json       # machine-readable
 *
 * Drift sources monitored:
 *   1. registry      registry/index.json skills/agents vs live scanner   [AUTO-FIX]
 *   2. version       unstamped file changes since last build             [AUTO-FIX]
 *   3. capability    service_registry vs capability-registry vs surface  [REVIEW]
 *   4. docs          hardcoded counts in docs that no longer match live  [REVIEW]
 *   5. liveweb       /api/capabilities count vs catalog (needs rebuild)  [REVIEW]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const DRIFT_REPORT = path.join(ROOT, '.versioning', 'drift-report.json');

function reqFresh(p) { try { delete require.cache[require.resolve(p)]; return require(p); } catch (e) { return { __error: e.message }; } }
function nowISO() { return new Date().toISOString(); }
function runNode(script, args = []) {
  try { return { ok: true, out: execFileSync(NODE, [path.join(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8' }) }; }
  catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || ''), code: e.status }; }
}

// ── Individual drift checks ─────────────────────────────────────────────────

function checkRegistry() {
  let live = 0, liveAgents = 0;
  try { live = reqFresh(path.join(ROOT, 'lib', 'tools', 'skills-registry.js')).scanSkills().length; } catch {}
  // Canonical agent count = personas + swarm, from the agent registry generator.
  try { liveAgents = reqFresh(path.join(ROOT, 'scripts', 'sync-agents.js')).build().total; } catch {}
  let reg = {}; try { reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'index.json'), 'utf8')); } catch {}
  const skillDrift = live - (reg.total_skills || 0);
  const agentDrift = liveAgents - (reg.total_agents || 0);
  const drift = skillDrift !== 0 || agentDrift !== 0;
  return {
    id: 'registry', severity: drift ? 'medium' : 'ok', autofixable: true, drift,
    detail: `registry/index.json: ${reg.total_skills}/${reg.total_agents} skills/agents; live: ${live}/${liveAgents} (drift ${skillDrift >= 0 ? '+' : ''}${skillDrift}/${agentDrift >= 0 ? '+' : ''}${agentDrift})`,
    fix: 'npm run sync:registry',
  };
}

function checkVersion() {
  let mani = {}, ver = {};
  try { mani = JSON.parse(fs.readFileSync(path.join(ROOT, '.versioning', 'manifest.json'), 'utf8')); } catch {}
  try { ver = JSON.parse(fs.readFileSync(path.join(ROOT, '.versioning', 'version.json'), 'utf8')); } catch {}
  let changed = 0;
  try {
    const { scan, diffMani } = loadManifestLib();
    const next = scan();
    const d = diffMani(mani, next);
    changed = d.added.length + d.changed.length + d.removed.length;
  } catch {}
  return {
    id: 'version', severity: changed > 0 ? 'low' : 'ok', autofixable: true, drift: changed > 0,
    detail: changed > 0
      ? `${changed} file(s) changed since build #${ver.build || 0} (${ver.last_stamp || 'never'}) — unstamped`
      : `build #${ver.build || 0} current — no unstamped changes`,
    fix: 'npm run stamp',
  };
}

function loadManifestLib() {
  const m = reqFresh(path.join(ROOT, 'scripts', 'manifest.js'));
  return { scan: m.scan, diffMani: m.diffManifests };
}

function checkCapability() {
  let audit = null;
  try { audit = reqFresh(path.join(ROOT, 'lib', 'commands', 'registry-audit.js')).buildReport(ROOT); } catch (e) { audit = { __error: e.message }; }
  const conflicts = audit && audit.summary ? audit.summary.conflicts : 0;
  const findings = (audit && audit.findings || []).filter(f => f.conflict).map(f => f.title);
  return {
    id: 'capability', severity: conflicts > 0 ? 'medium' : 'ok', autofixable: false, drift: conflicts > 0,
    detail: conflicts > 0 ? `${conflicts} registry conflict(s): ${findings.slice(0, 4).join('; ')}` : 'service/capability registries agree',
    fix: 'review service_registry.js vs lib/capability-registry.js (needs human)',
  };
}

function checkDocs() {
  // Flag docs that hardcode a skill/tool/agent count that no longer matches live.
  let liveSkills = 0; try { liveSkills = reqFresh(path.join(ROOT, 'lib', 'tools', 'skills-registry.js')).scanSkills().length; } catch {}
  const docs = ['README.md', 'ARCHITECTURE.md', 'CLAUDE.md', 'QUICKSTART.md', 'docs/SYSTEM_TRUTH.md'];
  const stale = [];
  for (const rel of docs) {
    let txt; try { txt = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    const m = txt.match(/(\d{2,4})\s*(?:\+\s*)?skills?/i);
    if (m) {
      const claimed = parseInt(m[1], 10);
      if (Math.abs(claimed - liveSkills) > Math.max(10, liveSkills * 0.1)) {
        stale.push(`${rel} claims ~${claimed} skills (live ${liveSkills})`);
      }
    }
  }
  return {
    id: 'docs', severity: stale.length ? 'low' : 'ok', autofixable: false, drift: stale.length > 0,
    detail: stale.length ? stale.join('; ') : `docs skill-counts within tolerance of live (${liveSkills})`,
    fix: 'update the doc prose (needs human — prose is not auto-edited)',
  };
}

function checkLiveWeb() {
  // Compare the live /api/capabilities count to the catalog. Best-effort; if the
  // server is down this is simply "unknown", not a drift failure.
  let catalog = 0;
  try { const c = reqFresh(path.join(ROOT, 'lib', 'surface-capabilities.js')); const l = c.CAPABILITIES || (c.listCapabilities && c.listCapabilities()) || []; catalog = Array.isArray(l) ? l.length : Object.keys(l).length; } catch {}
  let liveCount = null;
  try {
    const out = execFileSync('node', ['-e', `fetch('http://127.0.0.1:3030/api/capabilities').then(r=>r.json()).then(j=>console.log(j.count||(j.capabilities||[]).length)).catch(()=>console.log(''))`], { cwd: ROOT, encoding: 'utf8', timeout: 6000 }).trim();
    if (out) liveCount = parseInt(out, 10);
  } catch {}
  if (liveCount == null) return { id: 'liveweb', severity: 'ok', autofixable: false, drift: false, detail: `live web not reachable — catalog has ${catalog} (skip)`, fix: '' };
  const drift = liveCount !== catalog;
  return {
    id: 'liveweb', severity: drift ? 'medium' : 'ok', autofixable: false, drift,
    detail: `live /api/capabilities=${liveCount}, catalog=${catalog}` + (drift ? ' — running build is stale' : ' — in sync'),
    fix: 'npm run build && pm2 restart purpclaw-nextjs',
  };
}

// ── Orchestration ───────────────────────────────────────────────────────────

function scanAll() {
  const checks = [checkRegistry(), checkVersion(), checkCapability(), checkDocs(), checkLiveWeb()];
  const drifted = checks.filter(c => c.drift);
  return {
    schema: 'purpclaw.drift-watcher.v1',
    scanned_at: nowISO(),
    summary: {
      checks: checks.length,
      drifted: drifted.length,
      autofixable: drifted.filter(c => c.autofixable).length,
      needs_review: drifted.filter(c => !c.autofixable).length,
    },
    checks,
  };
}

function applyFixes(report) {
  const applied = [];
  for (const c of report.checks) {
    if (!c.drift || !c.autofixable) continue;
    if (c.id === 'registry') { runNode('scripts/sync-agents.js'); const r = runNode('scripts/sync-registry.js'); applied.push({ id: 'registry', ok: r.ok, note: r.out.trim().split('\n').pop() }); }
    if (c.id === 'version') { const r = runNode('scripts/manifest.js', ['stamp']); applied.push({ id: 'version', ok: r.ok, note: r.out.trim().split('\n').pop() }); }
  }
  return applied;
}

function printReport(report, applied) {
  const C = { red: '\x1b[31m', yel: '\x1b[33m', grn: '\x1b[32m', gray: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };
  const icon = (c) => c.severity === 'ok' ? `${C.grn}OK${C.x}` : c.severity === 'medium' ? `${C.yel}DRIFT${C.x}` : `${C.yel}drift${C.x}`;
  console.log(`\n${C.b}PURPCLAW DRIFT WATCHER${C.x} ${C.gray}${report.scanned_at}${C.x}`);
  for (const c of report.checks) {
    console.log(`  [${icon(c)}] ${C.b}${c.id}${C.x} ${c.autofixable && c.drift ? C.gray + '(auto-fixable)' + C.x : ''}`);
    console.log(`        ${c.detail}`);
    if (c.drift && c.fix) console.log(`        ${C.gray}→ ${c.fix}${C.x}`);
  }
  if (applied && applied.length) {
    console.log(`\n${C.b}AUTO-FIXED:${C.x}`);
    for (const a of applied) console.log(`  ${a.ok ? C.grn + '✓' + C.x : C.red + '✗' + C.x} ${a.id}: ${a.note || ''}`);
  }
  const s = report.summary;
  console.log(`\n${C.gray}${s.drifted} drifted of ${s.checks} · ${s.autofixable} auto-fixable · ${s.needs_review} need review${C.x}\n`);
}

function once({ fix, json }) {
  let report = scanAll();
  let applied = [];
  if (fix) { applied = applyFixes(report); report = scanAll(); report.autofixes = applied; }
  try { fs.mkdirSync(path.dirname(DRIFT_REPORT), { recursive: true }); fs.writeFileSync(DRIFT_REPORT, JSON.stringify(report, null, 2)); } catch {}
  if (json) console.log(JSON.stringify(report, null, 2));
  else printReport(report, applied);
  return report;
}

async function main() {
  const argv = process.argv.slice(2);
  const fix = argv.includes('--fix');
  const json = argv.includes('--json');
  const watch = argv.includes('--watch');
  const intervalArg = argv.find(a => a.startsWith('--interval='));
  const interval = Math.max(15, parseInt((intervalArg || '').split('=')[1] || '60', 10)) * 1000;

  if (!watch) { const r = once({ fix, json }); process.exit(r.summary.needs_review > 0 ? 2 : 0); }

  console.log(`drift-watcher: watching every ${interval / 1000}s (fix=${fix}). Ctrl-C to stop.`);
  const tick = () => { try { once({ fix, json: false }); } catch (e) { console.error('drift-watcher tick error:', e.message); } };
  tick();
  const timer = setInterval(tick, interval);
  process.on('SIGINT', () => { clearInterval(timer); console.log('\ndrift-watcher stopped.'); process.exit(0); });
  process.on('SIGTERM', () => { clearInterval(timer); process.exit(0); });
}

if (require.main === module) main();
module.exports = { scanAll, applyFixes, once };
