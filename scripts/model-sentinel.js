#!/usr/bin/env node
'use strict';

/**
 * Model Sentinel CLI.
 *
 *   node scripts/model-sentinel.js status            — show registry summary
 *   node scripts/model-sentinel.js discover [prov..]  — live-query model lists
 *   node scripts/model-sentinel.js validate           — lane endpoint-drift check
 *   node scripts/model-sentinel.js run [--force]       — full daily cycle + report
 *   node scripts/model-sentinel.js test <prov> <model> — smoke-test one model
 *
 * Loads .env the same way the main CLI does so provider keys resolve.
 */

const fs = require('fs');
const path = require('path');

// Lightweight .env loader (mirrors bin/purpclaw.js).
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch { /* best effort */ }
})();

const sentinel = require('../lib/model-sentinel');

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'discover': {
      const results = await sentinel.discoverAll(rest.length ? rest : null);
      for (const r of results) {
        if (r.ok) console.log(`  ✓ ${pad(r.provider, 18)} ${r.count} models`);
        else console.log(`  ${r.skipped ? '○' : '✗'} ${pad(r.provider, 18)} ${r.error}`);
      }
      break;
    }
    case 'validate': {
      const results = await sentinel.discoverAll();
      const drift = sentinel.detectDrift(results);
      for (const d of drift) {
        const icon = d.status === 'ok' ? '✓' : (d.status === 'DRIFT' ? '⚠' : '?');
        const extra = d.status === 'DRIFT' ? `  → suggest: ${d.suggestion || '(none)'}` : '';
        console.log(`  ${icon} ${pad(d.lane, 20)} ${pad(d.provider, 12)} ${d.model}${extra}`);
      }
      const driftCount = drift.filter((x) => x.status === 'DRIFT').length;
      console.log(`\n  ${driftCount === 0 ? '✅ no drift' : `⚠️  ${driftCount} lane(s) drifting`}`);
      process.exitCode = driftCount ? 1 : 0;
      break;
    }
    case 'test': {
      const [prov, model] = rest;
      if (!prov || !model) { console.error('usage: test <provider> <model>'); process.exit(2); }
      const r = await sentinel.smokeTest(prov, model);
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case 'run': {
      const force = rest.includes('--force');
      const summary = await sentinel.runDaily({ force });
      if (summary.skipped) { console.log(`  ○ ${summary.reason} (last: ${summary.lastChecked})`); break; }
      console.log(sentinel.buildReport(summary));
      console.log(`\n  report → ${summary.reportPath}`);
      console.log(`  registry → ${summary.registryPath}`);
      break;
    }
    case 'status':
    default: {
      const reg = sentinel.loadRegistry();
      console.log(`Model Sentinel — registry @ ${sentinel.registryPath()}`);
      console.log(`  last checked: ${reg.lastChecked || 'never'}`);
      const provs = Object.entries(reg.providers || {});
      if (!provs.length) { console.log('  (empty — run "node scripts/model-sentinel.js run --force")'); break; }
      for (const [name, p] of provs) console.log(`  ${pad(name, 18)} ${pad(p.count + ' models', 12)} checked ${p.lastChecked}`);
      const drift = reg.lastDrift || [];
      if (drift.length) {
        console.log(`\n  ⚠️  ${drift.length} drifting lane(s):`);
        for (const d of drift) console.log(`     ${d.lane} (${d.provider}/${d.model}) → ${d.suggestion || '?'}`);
      }
      break;
    }
  }
}

main().catch((e) => { console.error('model-sentinel error:', e.message); process.exit(1); });
