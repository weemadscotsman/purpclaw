'use strict';

/**
 * purpclaw gc — garbage-collect agent_work/, bg-sessions/, test-* dirs
 * ═════════════════════════════════════════════════════════════════════
 * Default policy:
 *   - Keep state files (.json, .jsonl, .pool_*, .reasoning_state, etc.)
 *   - Sweep rtest-*, test-* scratch directories (always — they're proof-test detritus)
 *   - Sweep bg-sessions/ entries older than 7 days
 *   - Sweep agent workspaces (subdirs named after agents) older than 14 days
 *   - Compact worker-tasks.json: drop completed/failed entries > 24h old
 *
 * Usage:
 *   purpclaw gc                — dry run, show what would be cleaned
 *   purpclaw gc --apply        — actually delete
 *   purpclaw gc --aggressive   — shorter TTLs (1 day for bg-sessions, 3 days for workspaces)
 *   purpclaw gc --stats        — just print sizes per category
 */

const fs   = require('fs');
const path = require('path');

const KNOWN_STATE_FILES = new Set([
  '.pool_index.json', '.pool_queries.jsonl', '.proactive_maintenance.json',
  '.reasoning_state.json', '.screen_context.json', '.snapshots',
  'approval_requests.jsonl', 'mochi.json', 'proactive_maintenance_state.json',
  'workers.json', 'worker-tasks.json', 'pool-jobs.json',
  'workflow_history.jsonl', 'agent_score.json',
]);

// Top-level agent workspace dirs (sweepable on age)
const AGENT_NAMES = new Set([
  'bee', 'cactus', 'chart', 'dragon', 'duck', 'hawk', 'mushroom',
  'octopus', 'owl', 'penguin', 'phoenix', 'panda', 'parrot', 'robot',
  'wolf', 'fox', 'crow', 'spider', 'turtle', 'rabbit',
]);

function dirSize(p) {
  let total = 0;
  try {
    const items = fs.readdirSync(p, { withFileTypes: true });
    for (const it of items) {
      const fp = path.join(p, it.name);
      try {
        const s = fs.statSync(fp);
        if (s.isDirectory()) total += dirSize(fp);
        else total += s.size;
      } catch {}
    }
  } catch {}
  return total;
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function ageDays(p) {
  try {
    const s = fs.statSync(p);
    return (Date.now() - s.mtimeMs) / (1000 * 60 * 60 * 24);
  } catch { return 0; }
}

function rmrf(p, applied) {
  if (!applied) return;
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch (e) {
    // best-effort
  }
}

async function run(args, ctx) {
  const { C, col, PURP_DIR } = ctx;

  const apply       = args.includes('--apply') || args.includes('-a');
  const aggressive  = args.includes('--aggressive');
  const statsOnly   = args.includes('--stats');

  const TTL_BG_DAYS = aggressive ? 1 : 7;
  const TTL_WS_DAYS = aggressive ? 3 : 14;
  const TTL_TASK_H  = aggressive ? 6 : 24;

  const root = path.join(PURP_DIR, 'agent_work');
  if (!fs.existsSync(root)) {
    console.log(col(C.gray, '\n  agent_work/ does not exist — nothing to clean.\n'));
    return;
  }

  // ── Stats mode: just measure ───────────────────────────────────────────────
  if (statsOnly) {
    console.log(`\n  ${col(C.bold || C.white, '📊 AGENT_WORK STATS')}\n`);
    const items = fs.readdirSync(root, { withFileTypes: true });
    const buckets = { state: 0, sessions: 0, workspaces: 0, scratch: 0, other: 0 };
    let stateCount = 0, sessionCount = 0, wsCount = 0, scratchCount = 0;
    for (const it of items) {
      const fp = path.join(root, it.name);
      const sz = it.isDirectory() ? dirSize(fp) : fs.statSync(fp).size;
      if (KNOWN_STATE_FILES.has(it.name)) { buckets.state += sz; stateCount++; }
      else if (it.name === 'bg-sessions') { buckets.sessions += sz; sessionCount++; }
      else if (AGENT_NAMES.has(it.name)) { buckets.workspaces += sz; wsCount++; }
      else if (/^(rtest|test)-/.test(it.name)) { buckets.scratch += sz; scratchCount++; }
      else { buckets.other += sz; }
    }
    console.log(`  State files       : ${col(C.cyan, fmt(buckets.state).padStart(8))}  (${stateCount} entries — kept)`);
    console.log(`  bg-sessions/      : ${col(C.cyan, fmt(buckets.sessions).padStart(8))}  (${sessionCount} entries)`);
    console.log(`  Agent workspaces  : ${col(C.cyan, fmt(buckets.workspaces).padStart(8))}  (${wsCount} dirs)`);
    console.log(`  rtest/test scratch: ${col(C.yellow, fmt(buckets.scratch).padStart(8))}  (${scratchCount} dirs — sweepable)`);
    console.log(`  Other             : ${col(C.gray, fmt(buckets.other).padStart(8))}`);
    console.log(`  ${col(C.gray, '─'.repeat(48))}`);
    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    console.log(`  Total             : ${col(C.bold || C.white, fmt(total).padStart(8))}\n`);
    return;
  }

  // ── Plan deletions ─────────────────────────────────────────────────────────
  const plan = []; // { path, reason, size }
  const items = fs.readdirSync(root, { withFileTypes: true });

  for (const it of items) {
    const fp = path.join(root, it.name);

    // Always preserve known state
    if (KNOWN_STATE_FILES.has(it.name)) continue;

    // rtest-* / test-* scratch — always sweep
    if (/^(rtest|test)-/.test(it.name)) {
      const sz = it.isDirectory() ? dirSize(fp) : fs.statSync(fp).size;
      plan.push({ path: fp, name: it.name, reason: 'proof-test scratch', size: sz });
      continue;
    }

    // bg-sessions/ — sweep entries older than TTL
    if (it.name === 'bg-sessions' && it.isDirectory()) {
      try {
        for (const entry of fs.readdirSync(fp)) {
          const efp = path.join(fp, entry);
          if (ageDays(efp) > TTL_BG_DAYS) {
            const sz = fs.statSync(efp).isDirectory() ? dirSize(efp) : fs.statSync(efp).size;
            plan.push({ path: efp, name: 'bg-sessions/' + entry, reason: `>${TTL_BG_DAYS} days old`, size: sz });
          }
        }
      } catch {}
      continue;
    }

    // Agent workspace dirs — sweep on age
    if (AGENT_NAMES.has(it.name) && it.isDirectory()) {
      if (ageDays(fp) > TTL_WS_DAYS) {
        plan.push({ path: fp, name: it.name + '/', reason: `agent workspace >${TTL_WS_DAYS}d`, size: dirSize(fp) });
      }
      continue;
    }

    // Loose files like "me mochisk.zip" typos / unknown JSONs — flag but don't sweep
  }

  // ── Compact worker-tasks.json ──────────────────────────────────────────────
  const tasksPath = path.join(root, 'worker-tasks.json');
  let taskCompact = null;
  if (fs.existsSync(tasksPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
      const cutoff = Date.now() - TTL_TASK_H * 60 * 60 * 1000;
      const before = Object.keys(j).length;
      const kept = {};
      for (const [id, t] of Object.entries(j)) {
        const ts = new Date(t.completedAt || t.startedAt || t.queuedAt || 0).getTime();
        const terminal = t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
        if (terminal && ts < cutoff) continue;
        kept[id] = t;
      }
      const dropped = before - Object.keys(kept).length;
      if (dropped > 0) {
        taskCompact = { before, after: Object.keys(kept).length, dropped };
        if (apply) fs.writeFileSync(tasksPath, JSON.stringify(kept, null, 2));
      }
    } catch {}
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log(`\n  ${col(C.bold || C.white, '🧹 AGENT_WORK GARBAGE COLLECTOR')}  ${col(C.gray, apply ? '· APPLY' : '· DRY-RUN')}\n`);

  if (!plan.length && !taskCompact) {
    console.log(col(C.green, '  ✔ Nothing to clean. agent_work/ is already tidy.\n'));
    return;
  }

  let total = 0;
  for (const item of plan) {
    total += item.size;
    console.log(`  ${col(C.yellow, apply ? '🗑' : '·')}  ${col(C.white, item.name.padEnd(36))}  ${col(C.gray, fmt(item.size).padStart(8) + '  · ' + item.reason)}`);
    rmrf(item.path, apply);
  }

  if (taskCompact) {
    console.log(`  ${col(C.yellow, apply ? '✂' : '·')}  ${col(C.white, 'worker-tasks.json'.padEnd(36))}  ${col(C.gray, 'compact: ' + taskCompact.before + ' → ' + taskCompact.after + ' (-' + taskCompact.dropped + ' terminal records >' + TTL_TASK_H + 'h old)')}`);
  }

  console.log(`\n  ${col(C.gray, '─'.repeat(60))}`);
  console.log(`  ${col(C.bold || C.white, 'Total reclaimable')}: ${col(C.cyan, fmt(total))}`);
  if (!apply) {
    console.log(`  ${col(C.gray, 'Re-run with --apply to actually delete:')}`);
    console.log(`  ${col(C.cyan, '    purpclaw gc --apply' + (aggressive ? ' --aggressive' : ''))}\n`);
  } else {
    console.log(`  ${col(C.green, '✔ Swept.')}\n`);
  }
}

module.exports = { run };
