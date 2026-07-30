'use strict';
/**
 * lib/commands/ctx-viz.js
 * ─────────────────────────────────────────────────────────────────────────────
 * purpclaw ctx-viz [--json] [--html]
 *
 * Shows the LIVING NERVOUS SYSTEM of the stack:
 *
 *   EventBus (7782)       → subscriber count, topics
 *   Orchestrator (7784)   → active workflows, queue depth, health
 *   Agent Tower (7790)    → active agents, circuit breakers, divisions
 *   Context Bus (7881)    → active agents, total workflows, active locks
 *   Knowledge Pool (7885) → skills, agents, last indexed
 *   State Store (7783)    → key count / uptime
 *   Metrics (7890)        → service health snapshot
 *
 * Output modes:
 *   (default)  terminal tree with ANSI colour
 *   --json     machine-readable JSON
 *   --html     minimal HTML report written to agent_work/ctx-viz.html
 */

const path = require('path');
const fs   = require('fs');
const http = require('http');

async function run(args, ctx) {
  const { PURP_DIR, C, col, spinner, httpGet, ping, PORTS, isTTY, sectionHead, banner } = ctx;
  const wantJson = args.includes('--json');
  const wantHtml = args.includes('--html');

  // ── Fetch helpers ─────────────────────────────────────────────────────────
  async function safe(label, fn) {
    try { return { label, ok: true,  data: await fn() }; }
    catch { return { label, ok: false, data: null }; }
  }

  const spin = wantJson ? null : spinner('scanning nervous system').start();

  const [eb, orch, tower, ctx_, pool, state, metrics] = await Promise.all([
    safe('eventbus',     () => httpGet(7782, '/health',        1500)),
    safe('orchestrator', () => httpGet(7784, '/api/status',    1500)),
    safe('tower',        () => httpGet(7790, '/tower/status',  1500)),
    safe('context-bus',  () => httpGet(7881, '/context/stats', 1500)),
    safe('pool',         () => httpGet(7885, '/pool/stats',    1500)),
    safe('state',        () => httpGet(7783, '/health',        1500)),
    safe('metrics',      () => httpGet(7890, '/health',        1500)),
  ]);

  if (spin) spin.succeed('scan complete');

  // ── Normalise data ─────────────────────────────────────────────────────────
  const nodes = {
    eventbus: {
      online:      eb.ok,
      port:        7782,
      subscribers: eb.data?.subscribers ?? eb.data?.clients ?? '?',
      topics:      eb.data?.topics       ?? eb.data?.channels ?? '?',
      uptime:      eb.data?.uptime       ?? null,
    },
    orchestrator: {
      online:       orch.ok,
      port:         7784,
      active:       orch.data?.active ?? orch.data?.activeWorkflows ?? '?',
      queue:        orch.data?.queue  ?? orch.data?.queueDepth      ?? '?',
      totalTasks:   orch.data?.session?.totalTasks     ?? orch.data?.totalTasks     ?? '?',
      completed:    orch.data?.session?.completedTasks ?? orch.data?.completedTasks ?? '?',
      failed:       orch.data?.session?.failedTasks    ?? orch.data?.failedTasks    ?? '?',
      avgRespMs:    orch.data?.metrics?.avgResponseTime ?? '?',
    },
    tower: {
      online:         tower.ok,
      port:           7790,
      activeAgents:   Array.isArray(tower.data?.activeAgents)
        ? tower.data.activeAgents.length
        : (tower.data?.activeAgents ?? '?'),
      throttled:      tower.data?.throttled     ?? false,
      divisions:      tower.data?.divisions     ?? [],
      circuitBreakers: tower.data?.circuitBreakers ?? {},
    },
    contextBus: {
      online:           ctx_.ok,
      port:             7881,
      activeAgents:     ctx_.data?.activeAgents   ?? '?',
      totalWorkflows:   ctx_.data?.totalWorkflows ?? '?',
      activeLocks:      ctx_.data?.activeLocks    ?? '?',
      totalSpawned:     ctx_.data?.stats?.totalAgentsSpawned ?? '?',
    },
    pool: {
      online:       pool.ok,
      port:         7885,
      skills:       pool.data?.skillsCount  ?? '?',
      agents:       pool.data?.agentsCount  ?? '?',
      queries:      pool.data?.queries      ?? '?',
      lastIndexed:  pool.data?.indexedAt    ?? null,
    },
    state: {
      online: state.ok,
      port:   7783,
      keys:   state.data?.keys   ?? state.data?.count ?? '?',
      uptime: state.data?.uptime ?? null,
    },
    metrics: {
      online:   metrics.ok,
      port:     7890,
      services: metrics.data?.services ?? metrics.data?.total ?? '?',
    },
  };

  // ── JSON output ───────────────────────────────────────────────────────────
  if (wantJson) {
    console.log(JSON.stringify(nodes, null, 2));
    return;
  }

  // ── HTML output ───────────────────────────────────────────────────────────
  if (wantHtml) {
    const outDir  = path.join(PURP_DIR, 'agent_work');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'ctx-viz.html');
    const ts = new Date().toISOString();
    const rows = Object.entries(nodes).map(([key, n]) => `
      <tr class="${n.online ? 'ok' : 'down'}">
        <td><strong>${key}</strong></td>
        <td>:${n.port}</td>
        <td>${n.online ? '✔ online' : '✖ offline'}</td>
        <td><pre>${JSON.stringify(n, null, 2)}</pre></td>
      </tr>`).join('');
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PURPCLAW ctx-viz ${ts}</title>
<style>
  body { font-family: monospace; background:#111; color:#ddd; padding:20px; }
  h1   { color:#b57bee; }
  table { border-collapse:collapse; width:100%; }
  th,td { border:1px solid #333; padding:6px 10px; vertical-align:top; }
  .ok   { color:#5af; }
  .down { color:#f66; }
  pre   { margin:0; font-size:0.8em; max-height:120px; overflow:auto; }
</style></head><body>
<h1>🦞 PURPCLAW ctx-viz — ${ts}</h1>
<table><tr><th>node</th><th>port</th><th>status</th><th>data</th></tr>${rows}</table>
</body></html>`;
    fs.writeFileSync(outFile, html);
    console.log(col(C.green, `  ✔  HTML written to: ${outFile}`));
    return;
  }

  // ── Terminal tree ─────────────────────────────────────────────────────────
  banner();
  sectionHead('  PURPCLAW NERVOUS SYSTEM');

  function nodeRow(label, port, online, details) {
    const status = online
      ? col(C.green,  '● online')
      : col(C.red,    '○ offline');
    const portStr = col(C.gray, `:${port}`);
    console.log(`\n  ${col(C.magenta + C.bold, label)}  ${portStr}  ${status}`);
    for (const [k, v] of Object.entries(details)) {
      if (v === '?' || v === null || v === undefined) continue;
      console.log(`    ${col(C.gray, k.padEnd(18))} ${col(C.cyan, String(v))}`);
    }
  }

  nodeRow('EventBus', 7782, nodes.eventbus.online, {
    subscribers: nodes.eventbus.subscribers,
    topics:      nodes.eventbus.topics,
    uptime:      nodes.eventbus.uptime ? `${Math.round(nodes.eventbus.uptime)}s` : null,
  });

  nodeRow('Orchestrator', 7784, nodes.orchestrator.online, {
    'active workflows': nodes.orchestrator.active,
    'queue depth':      nodes.orchestrator.queue,
    'total tasks':      nodes.orchestrator.totalTasks,
    'completed':        nodes.orchestrator.completed,
    'failed':           nodes.orchestrator.failed,
    'avg resp (ms)':    nodes.orchestrator.avgRespMs,
  });

  nodeRow('Agent Tower', 7790, nodes.tower.online, {
    'active agents': nodes.tower.activeAgents,
    throttled:       String(nodes.tower.throttled),
  });

  // Circuit breaker sub-tree
  const cbs = nodes.tower.circuitBreakers;
  const openCbs = Object.entries(cbs).filter(([, s]) => s === 'open');
  if (openCbs.length > 0) {
    console.log(`    ${col(C.yellow, '⚡ open circuit breakers:')}`);
    openCbs.forEach(([name]) => console.log(`      ${col(C.red, '✖')} ${name}`));
  } else if (Object.keys(cbs).length > 0) {
    console.log(`    ${col(C.gray, 'circuit breakers: ')}${col(C.green, 'all closed')}`);
  }

  nodeRow('Context Bus', 7881, nodes.contextBus.online, {
    'active agents':   nodes.contextBus.activeAgents,
    'total workflows': nodes.contextBus.totalWorkflows,
    'active locks':    nodes.contextBus.activeLocks,
    'total spawned':   nodes.contextBus.totalSpawned,
  });

  nodeRow('Knowledge Pool', 7885, nodes.pool.online, {
    'skills indexed': nodes.pool.skills,
    'agents indexed': nodes.pool.agents,
    'queries served': nodes.pool.queries,
    'last indexed':   nodes.pool.lastIndexed
      ? nodes.pool.lastIndexed.replace('T', ' ').slice(0, 19)
      : null,
  });

  nodeRow('State Store', 7783, nodes.state.online, {
    keys:   nodes.state.keys,
    uptime: nodes.state.uptime ? `${Math.round(nodes.state.uptime)}s` : null,
  });

  nodeRow('Metrics', 7890, nodes.metrics.online, {
    services: nodes.metrics.services,
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const total  = Object.values(nodes).length;
  const online = Object.values(nodes).filter(n => n.online).length;
  console.log('');
  console.log(
    `  ${col(C.green, online + '/' + total + ' nodes online')}  ` +
    (online < total ? col(C.yellow, `${total - online} offline`) : col(C.green, 'full mesh'))
  );
  console.log('');
  console.log(col(C.gray, '  --json   machine-readable output'));
  console.log(col(C.gray, '  --html   write to agent_work/ctx-viz.html'));
  console.log('');
}

module.exports = { run };
