'use strict';

/**
 * PURPCLAW Space Governor
 * =======================
 * Gives the agent room to grow — but with a hard ceiling and self-cleanup, so
 * it never tears the arse out of the disk again. Two jobs:
 *
 *   1. DISK: keep the agent's own data dirs under a budget (default 5 GB).
 *      - sweepMess()      → delete ephemeral build/scratch junk past an age.
 *      - enforceBudget()  → if still over budget, prune OLDEST mess first.
 *        Memory/knowledge is preserved; only "mess" (results, manifests,
 *        scratch, rotated logs, tool-output) is prunable. If pruning all mess
 *        still can't get under budget, it WARNS rather than nuking knowledge.
 *
 *   2. PORTS: report PURPCLAW ports that have a listener but no PM2 owner
 *      (orphans) so they can be reaped — don't leave ports blocked.
 *
 * Config (.env):
 *   SPACE_BUDGET_GB        total disk budget for managed dirs   (default 5)
 *   SPACE_MESS_MAX_AGE_H   age past which mess is always swept   (default 48)
 *   SPACE_MANAGED_DIRS     comma list of dirs (relative to root) (default agent_work,scratch,logs)
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const BUDGET_BYTES   = Math.round(parseFloat(process.env.SPACE_BUDGET_GB || '5') * 1024 * 1024 * 1024);
const MESS_MAX_AGE_H = parseInt(process.env.SPACE_MESS_MAX_AGE_H || '48', 10);
const MANAGED_DIRS   = (process.env.SPACE_MANAGED_DIRS || 'agent_work,scratch,logs')
  .split(',').map(s => s.trim()).filter(Boolean)
  .map(d => path.join(ROOT, d));

// What counts as disposable "mess" (safe to prune oldest-first under pressure).
// Knowledge files (memory matrix, the LLM ledger, evolution log) are NOT here.
const MESS_PATTERNS = [
  /_result\.json$/i,
  /_manifest\.json$/i,
  /^apih_.*\.json$/i,     // transient API-handoff temp files
  /\.tmp$/i,
  /\.log$/i,              // plain logs (not .jsonl knowledge streams)
  /[\\/]tool-output[\\/]/i,
  /[\\/]scratch[\\/]/i,
];
// Never delete these even when over budget — they ARE the memory/knowledge.
const PROTECTED_PATTERNS = [
  /llm-ledger\.jsonl$/i,
  /evolution-log\.jsonl$/i,
  /harness_lessons\.jsonl$/i,
  /memory.*\.(json|jsonl|db|sqlite)$/i,
  /colony\.json$/i,
];

function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else { try { const st = fs.statSync(full); out.push({ path: full, size: st.size, mtime: st.mtimeMs }); } catch {} }
  }
  return out;
}

const isProtected = p => PROTECTED_PATTERNS.some(re => re.test(p));
const isMess      = p => !isProtected(p) && MESS_PATTERNS.some(re => re.test(p));

function getUsage() {
  let total = 0;
  const perDir = {};
  for (const d of MANAGED_DIRS) {
    const files = walk(d);
    const sz = files.reduce((s, f) => s + f.size, 0);
    perDir[path.basename(d)] = sz;
    total += sz;
  }
  return { totalBytes: total, budgetBytes: BUDGET_BYTES, perDir, overBudget: total > BUDGET_BYTES };
}

// Delete mess older than maxAgeHours regardless of budget — routine tidy-up.
function sweepMess({ maxAgeHours = MESS_MAX_AGE_H, apply = false } = {}) {
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  const victims = MANAGED_DIRS.flatMap(walk).filter(f => isMess(f.path) && f.mtime < cutoff);
  let freed = 0;
  for (const f of victims) {
    freed += f.size;
    if (apply) { try { fs.unlinkSync(f.path); } catch {} }
  }
  return { sweptFiles: victims.length, freedBytes: freed, applied: apply };
}

// Enforce the budget: prune oldest mess first until under budget.
function enforceBudget({ apply = false } = {}) {
  const before = getUsage();
  if (!before.overBudget) return { ...before, action: 'none', prunedFiles: 0, freedBytes: 0 };

  const mess = MANAGED_DIRS.flatMap(walk).filter(f => isMess(f.path)).sort((a, b) => a.mtime - b.mtime);
  let need = before.totalBytes - BUDGET_BYTES;
  let freed = 0, pruned = 0;
  for (const f of mess) {
    if (freed >= need) break;
    if (apply) { try { fs.unlinkSync(f.path); freed += f.size; pruned++; } catch {} }
    else { freed += f.size; pruned++; }
  }
  const stillOver = (before.totalBytes - freed) > BUDGET_BYTES;
  return {
    ...before, action: 'pruned', prunedFiles: pruned, freedBytes: freed,
    stillOver,
    warning: stillOver ? 'Budget exceeded even after pruning all mess — knowledge files were preserved. Raise SPACE_BUDGET_GB or archive memory.' : null,
  };
}

// PORT HYGIENE — list PURPCLAW ports with a listener but no PM2 owner (orphans).
function orphanPorts() {
  const PORTS = [3000,7777,7779,7780,7781,7782,7783,7784,7785,7786,7787,7790,7791,7792,7880,7881,7884,7885,7889,7890,7892,7895,7896,7897];
  let pm2Pids = new Set();
  try {
    const raw = execSync('cmd.exe /c npx pm2 jlist', { cwd: ROOT, encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','ignore'], timeout: 8000 });
    const j = JSON.parse(raw.slice(raw.indexOf('[')));
    for (const p of j) if (p.pid) pm2Pids.add(String(p.pid));
  } catch {}

  const orphans = [];
  for (const port of PORTS) {
    let pid = null;
    try {
      const out = execSync(`cmd.exe /c netstat -ano -p tcp | findstr LISTENING | findstr :${port} `, { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','ignore'] });
      const m = out.match(/\s(\d+)\s*$/m);
      if (m) pid = m[1];
    } catch {}
    if (pid && !pm2Pids.has(pid)) orphans.push({ port, pid, pm2Owned: false });
  }
  return orphans;
}

module.exports = { getUsage, sweepMess, enforceBudget, orphanPorts, BUDGET_BYTES };

// CLI: node lib/space-governor.js [--apply] [--ports]
if (require.main === module) {
  const apply = process.argv.includes('--apply');
  const fmt = b => (b / (1024*1024)).toFixed(1) + ' MB';
  const u = getUsage();
  console.log(`Budget: ${(BUDGET_BYTES/1073741824).toFixed(1)} GB | Used: ${fmt(u.totalBytes)} | ${u.overBudget ? 'OVER' : 'OK'}`);
  for (const [d, sz] of Object.entries(u.perDir)) console.log(`  ${d}: ${fmt(sz)}`);
  const swept = sweepMess({ apply });
  console.log(`Sweep (>${MESS_MAX_AGE_H}h mess): ${swept.sweptFiles} files, ${fmt(swept.freedBytes)} ${apply ? 'freed' : '(dry-run)'}`);
  const enf = enforceBudget({ apply });
  console.log(`Budget enforce: ${enf.action}, ${enf.prunedFiles} files, ${fmt(enf.freedBytes)} ${apply ? 'freed' : '(dry-run)'}`);
  if (enf.warning) console.log(`  ⚠ ${enf.warning}`);
  if (process.argv.includes('--ports')) {
    const o = orphanPorts();
    console.log(o.length ? `Orphan ports (listener, no PM2 owner):` : 'No orphan ports.');
    for (const x of o) console.log(`  :${x.port} → PID ${x.pid} (kill: taskkill /F /PID ${x.pid})`);
  }
  if (!apply) console.log('\n(DRY RUN — add --apply to delete)');
}
