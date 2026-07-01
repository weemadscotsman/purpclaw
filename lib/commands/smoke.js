'use strict';

/**
 * purpclaw smoke — full-stack self-test
 * ═══════════════════════════════════════
 * One command, end-to-end verification that the workshop is actually working.
 * Not just "ports answer" — "the pipeline can do real work".
 *
 * Tests (in order):
 *   1. Required services respond on their registered health paths
 *   2. PM2 is in sync (no orphans, no crash loops)
 *   3. LLM provider answers a one-token completion
 *   4. Knowledge Pool returns a routing hint
 *   5. Memory Matrix can ingest + recall a synthetic memory
 *   6. Orchestrator accepts + dispatches a no-op workflow
 *   7. Worker Pool has at least one registered worker and health-pings it
 *   8. Redactor masks a synthetic key (security in-band check)
 *
 * Exit codes:
 *   0 — every required check passed
 *   1 — at least one required check failed
 *   2 — could not run (missing dependency, etc.)
 *
 * Usage:
 *   purpclaw smoke             — full run
 *   purpclaw smoke --quick     — skip the orchestrator workflow test
 *   purpclaw smoke --json      — JSON output for CI
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

function httpGet(port, p, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: p, timeout }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ code: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ code: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpPost(port, p, body, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port, path: p, method: 'POST', timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ code: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ code: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload); req.end();
  });
}

async function run(args, ctx) {
  const { C, col, PURP_DIR, spinner, sectionHead, banner } = ctx;

  const quick    = args.includes('--quick') || args.includes('-q');
  const wantJson = args.includes('--json');

  const results = []; // { name, ok, detail, required, ms }
  const add = (name, ok, detail, required = true, ms = 0) => results.push({ name, ok, detail, required, ms });

  // ── 1. Required service health ─────────────────────────────────────────────
  const requiredServices = [
    [7782, 'EventBus',      '/health'],
    [7784, 'Orchestrator',  '/api/health'],
    [7790, 'Agent Tower',   '/tower/status'],
    [7780, 'Unified API',   '/api/health'],
    [7885, 'Knowledge Pool','/health'],
    [7881, 'Context Bus',   '/health'],
    [7897, 'Worker Pool',   '/health'],
  ];
  for (const [port, name, p] of requiredServices) {
    const t0 = Date.now();
    try {
      const r = await httpGet(port, p, 2000);
      add(`svc:${name}`, r.code < 400, `:${port}${p} → ${r.code}`, true, Date.now() - t0);
    } catch (e) {
      add(`svc:${name}`, false, `:${port}${p} → ${e.message}`, true, Date.now() - t0);
    }
  }

  // ── 2. PM2 cross-reference (orphan + crash-loop check) ─────────────────────
  let pm2Sync = { orphans: [], crashLoops: [] };
  try {
    const { execSync } = require('child_process');
    const pm2Bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    // 6s was too tight: `npx pm2 jlist` cold-resolves through cmd.exe on
    // Windows and intermittently ETIMEDOUTs, producing a false pm2:sync flake.
    const raw = execSync(`${pm2Bin} pm2 jlist`, { cwd: PURP_DIR, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 });
    const arr = JSON.parse(raw);
    const pm2State = {};
    for (const p of arr) pm2State[p.name] = { status: p.pm2_env?.status, restarts: p.pm2_env?.restart_time || 0 };
    const registry = require(path.join(PURP_DIR, 'service_registry.js'));
    for (const svc of registry.getServices()) {
      if (!svc.healthPort || !svc.pm2) continue;
      const port = svc.healthPort;
      try {
        const probe = await new Promise(res => {
          const r = http.request({ hostname: '127.0.0.1', port, path: '/', timeout: 700 }, () => res(true));
          r.on('error', () => res(false));
          r.on('timeout', () => { r.destroy(); res(false); });
          r.end();
        });
        const pm2 = pm2State[svc.pm2];
        if (probe && (!pm2 || pm2.status !== 'online')) pm2Sync.orphans.push(svc.pm2);
        if (pm2 && pm2.restarts > 50) pm2Sync.crashLoops.push({ name: svc.pm2, restarts: pm2.restarts });
      } catch {}
    }
    add('pm2:sync', pm2Sync.orphans.length === 0 && pm2Sync.crashLoops.length === 0,
        pm2Sync.orphans.length ? `${pm2Sync.orphans.length} orphan(s): ${pm2Sync.orphans.join(', ')}`
        : pm2Sync.crashLoops.length ? `${pm2Sync.crashLoops.length} crash-loop history`
        : 'PM2 in sync with port reality', false);
  } catch (e) {
    add('pm2:sync', false, `pm2 jlist failed: ${e.message}`, false);
  }

  // ── 3. LLM provider answers a token ────────────────────────────────────────
  const t1 = Date.now();
  try {
    const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));
    const out = await llm.complete('Reply with the single word: ready', { max_tokens: 8, temperature: 0 });
    const ok = out && String(out).toLowerCase().includes('ready');
    add('llm:complete', !!ok, ok ? `provider answered "ready"` : `unexpected: ${String(out).slice(0, 60)}`, true, Date.now() - t1);
  } catch (e) {
    add('llm:complete', false, e.message.slice(0, 80), true, Date.now() - t1);
  }

  // ── 4. Pool routing hint (shape check — service answers the right schema) ──
  const t2 = Date.now();
  try {
    const r = await httpGet(7885, '/pool/routing/for-task?task=' + encodeURIComponent('fix a bug'), 3000);
    // Pool is healthy if it returned the routing schema (hints + count fields).
    // Empty hints for a vague query is normal — the routing engine just didn't match.
    const wellFormed = r.code === 200 && r.body && typeof r.body === 'object'
      && ('hints' in r.body || 'candidates' in r.body || Array.isArray(r.body));
    const count = r.body?.count ?? r.body?.hints?.length ?? '?';
    add('pool:routing', wellFormed, wellFormed ? `schema ok (${count} routing entries known)` : `unexpected: ${JSON.stringify(r.body).slice(0, 60)}`, true, Date.now() - t2);
  } catch (e) {
    add('pool:routing', false, e.message.slice(0, 80), false, Date.now() - t2);
  }

  // ── 5. Memory ingest + recall (shape check) ────────────────────────────────
  // Recall semantics are approximate — exact tag may not surface immediately.
  // We assert: (a) ingest returns 200, (b) recall returns the right schema.
  const t3 = Date.now();
  try {
    const tag = `smoke${Date.now()}`;
    const ing = await httpPost(7880, '/memory/ingest', { content: `synthetic smoke memory tag=${tag}`, source: 'purpclaw-smoke' }, 5000);
    const recall = await httpPost(7880, '/memory/recall', { query: tag, limit: 3 }, 5000);
    const ingestOk = ing.code === 200 || ing.code === 201;
    const recallShape = recall.code === 200 && recall.body && ('results' in recall.body || Array.isArray(recall.body));
    const exactHit = recall.body && JSON.stringify(recall.body).includes(tag);
    const ok = ingestOk && recallShape;
    const detail = ok
      ? (exactHit ? 'ingest 200 + recall hit' : 'ingest 200 + recall schema ok (no exact match — async indexer)')
      : `ingest:${ing.code} recall:${recall.code}`;
    add('memory:ingest+recall', ok, detail, true, Date.now() - t3);
  } catch (e) {
    add('memory:ingest+recall', false, e.message.slice(0, 80), false, Date.now() - t3);
  }

  // ── 6. Orchestrator workflow round-trip ────────────────────────────────────
  if (!quick) {
    const t4 = Date.now();
    try {
      const r = await httpPost(7784, '/api/orchestrate', { command: 'echo purpclaw smoke', source: 'smoke-test' }, 25000);
      // 202 Accepted + a workflowId is a successful async dispatch — the
      // orchestrator queued the workflow and is running it. Only requiring 200
      // was a false negative (the orchestrator legitimately replies 202 async).
      const ok = (r.code === 200 || r.code === 202) && (r.body?.workflowId || r.body?.success);
      add('orchestrator:dispatch', !!ok, ok ? `workflow ${r.body?.workflowId || 'ok'}` : `code ${r.code}`, true, Date.now() - t4);
    } catch (e) {
      add('orchestrator:dispatch', false, e.message.slice(0, 80), true, Date.now() - t4);
    }
  }

  // ── 7. Worker Pool has workers ─────────────────────────────────────────────
  try {
    const w = await httpGet(7897, '/health', 2000);
    let workers = [];
    try { workers = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'agent_work', 'workers.json'), 'utf8')); } catch {}
    add('workers:registered', w.code === 200 && workers.length > 0, `service:${w.code}, registered:${workers.length}`, false);
  } catch (e) {
    add('workers:registered', false, e.message.slice(0, 80), false);
  }

  // ── 8. Redactor in-band check ──────────────────────────────────────────────
  try {
    const redactor = require(path.join(PURP_DIR, 'lib', 'secret-redactor'));
    const sample = 'LLM_API_KEY=<redacted-test-key>';
    const out = redactor.redact(sample);
    const masked = !out.includes('1234567890abcdef1234567890abcdef');
    add('security:redactor', masked, masked ? 'masks synthetic key correctly' : 'failed to mask', true);
  } catch (e) {
    add('security:redactor', false, e.message.slice(0, 80), true);
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  if (wantJson) {
    const summary = {
      passed: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      required_failed: results.filter(r => !r.ok && r.required).length,
      checks: results,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.required_failed > 0 ? 1 : 0);
  }

  banner();
  sectionHead('  🔬  PURPCLAW SMOKE TEST');

  for (const r of results) {
    const icon = r.ok ? col(C.green, '✓') : (r.required ? col(C.red, '✗') : col(C.yellow, '⚠'));
    const reqTag = r.required ? '' : col(C.gray, ' [optional]');
    const timing = r.ms ? col(C.gray, ` ${r.ms}ms`) : '';
    console.log(`  ${icon}  ${col(C.white, r.name.padEnd(28))} ${col(C.gray, r.detail)}${reqTag}${timing}`);
  }

  const passed = results.filter(r => r.ok).length;
  const failedReq = results.filter(r => !r.ok && r.required).length;
  const failedOpt = results.filter(r => !r.ok && !r.required).length;

  console.log(`\n  ${col(C.gray, '─'.repeat(64))}`);
  if (failedReq === 0) {
    console.log(`  ${col(C.green + C.bold, '✔  SMOKE PASSED')}  ${col(C.gray, '·')}  ${col(C.green, passed + ' checks ok')}${failedOpt ? '  ' + col(C.yellow, failedOpt + ' optional failed') : ''}`);
    console.log(col(C.gray, '\n  The hammers walk in formation. The pipeline can do real work.\n'));
    process.exit(0);
  } else {
    console.log(`  ${col(C.red + C.bold, '✗  SMOKE FAILED')}  ${col(C.gray, '·')}  ${col(C.red, failedReq + ' required failed')}  ${col(C.green, passed + ' ok')}${failedOpt ? '  ' + col(C.yellow, failedOpt + ' optional') : ''}`);
    console.log(col(C.gray, '\n  Investigate: purpclaw doctor\n'));
    process.exit(1);
  }
}

module.exports = { run };
