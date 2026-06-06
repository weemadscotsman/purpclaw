#!/usr/bin/env node
'use strict';
// Tiny metric probe for the Sampler engine. Prints ONE value to stdout.
// Usage: node scripts/sample-metric.js <metric>
const http = require('http');
function get(port, p) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, res => {
      let s = ''; res.on('data', d => s += d); res.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
function find(j, key) { return j && Array.isArray(j.services) ? j.services.find(x => x.key === key) : null; }

(async () => {
  const m = process.argv[2];
  let out = '0';
  try {
    if (m === 'cognitive_online') { const j = await get(7780, '/api/cognitive/status'); out = String((j && j.online) || 0); }
    else if (m === 'agents_active') { const j = await get(7790, '/tower/status'); out = String((j && j.activeAgents && j.activeAgents.length) || 0); }
    else if (m === 'agents_registered') { const j = await get(7790, '/tower/status'); out = String((j && j.registeredAgents && j.registeredAgents.length) || 0); }
    else if (m === 'events_total') { const j = await get(7782, '/health'); out = String((j && (j.eventCount ?? j.events)) || 0); }
    else if (m === 'memory_atoms') { const s = find(await get(7780, '/api/cognitive/status'), 'memory'); out = String((s && s.data && s.data.total_atoms) || 0); }
    else if (m === 'rules_count') { const s = find(await get(7780, '/api/cognitive/status'), 'rules'); out = String((s && s.data && s.data.rules) || 0); }
    else if (m === 'rules_facts') { const s = find(await get(7780, '/api/cognitive/status'), 'rules'); out = String((s && s.data && s.data.facts) || 0); }
    else if (m === 'diag_findings') { const s = find(await get(7780, '/api/cognitive/status'), 'diagnostics'); out = String((s && s.data && s.data.total_findings) || 0); }
  } catch {}
  process.stdout.write(out);
})();
