#!/usr/bin/env node
'use strict';

/**
 * healthcheck — the onboarding "Health Check" screen, as a script.
 *
 *   node healthcheck.js          → human table + exit 0 (ready) / 1 (core down)
 *   node healthcheck.js --json   → machine JSON (for the wizard / first-run UI)
 *
 * Keyless-aware: with no provider key, Provider shows "demo" (⚠️) — that is a
 * READY state, not a failure. A new user must never be blocked by a missing key.
 */

const http = require('http');

let demo = null; try { demo = require('./demo-provider'); } catch (_) {}

// Canonical ports (fall back to defaults if the registry isn't loadable).
let PORTS = { api: 7780, nextjs: 3030, cognitive: 7880, tower: 7790 };
try {
  const reg = require('./service_registry');
  const get = (k) => (reg.getService && reg.getService(k)) || {};
  PORTS = {
    api: get('api').port || 7780,
    nextjs: get('nextjs').port || 3030,
    cognitive: get('cognitive').port || 7880,
    tower: get('tower').port || 7790,
  };
} catch (_) {}

function probe(port, path = '/', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: timeoutMs }, (r) => {
      r.resume(); resolve(r.statusCode > 0 && r.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function run() {
  const [server, ui, agent, mem] = await Promise.all([
    probe(PORTS.api, '/api/health'),
    probe(PORTS.nextjs, '/'),
    probe(PORTS.tower, '/tower/status'),
    probe(PORTS.cognitive, '/health'),
  ]);
  const demoMode = demo ? demo.isDemoMode() : false;
  const hasKey = demo ? demo.hasRealKey() : false;

  const rows = [
    { system: 'Server', ok: server, note: server ? 'ready' : `down (:${PORTS.api})` },
    { system: 'Chat Core', ok: server, note: server ? 'ready' : 'needs Server' },
    { system: 'Agent Engine', ok: agent, note: agent ? 'ready' : `optional (:${PORTS.tower})`, optional: true },
    { system: 'Provider', ok: hasKey || demoMode, warn: demoMode, note: hasKey ? 'ready' : (demoMode ? 'demo (no key — add one to go live)' : 'no provider'), optional: true },
    { system: 'Memory', ok: mem, warn: !mem, note: mem ? 'ready' : 'disabled (optional)', optional: true },
    { system: 'UI', ok: ui, note: ui ? 'ready' : `down (:${PORTS.nextjs})` },
  ];

  // Core = Server + UI. Memory/Agent/Provider are optional for a first chat.
  const coreReady = server && ui;
  return { ready: coreReady, demoMode, rows, ports: PORTS };
}

function icon(r) { return r.ok ? (r.warn ? '⚠️ ' : '✅') : (r.optional ? '⚠️ ' : '❌'); }

(async () => {
  const res = await run();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ready ? 0 : 1);
  }
  console.log('\n  🐾 PurpClaw — Health Check\n  ──────────────────────────');
  for (const r of res.rows) {
    console.log(`  ${r.system.padEnd(13)} ${icon(r)}  ${r.note}`);
  }
  console.log('  ──────────────────────────');
  if (res.ready) console.log(`  ✅ All systems ready${res.demoMode ? ' (demo mode — add a key to go live)' : ''}. Open http://localhost:${res.ports.nextjs}/mission\n`);
  else console.log(`  ❌ Core not up. Start it:  node bin/purpclaw.js safe-start --core\n`);
  process.exit(res.ready ? 0 : 1);
})();
