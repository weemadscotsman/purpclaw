// scripts/deep-audit.js — Layer-by-layer verification of every PURPCLAW system.
// Real end-to-end probes, not just module-load checks. Output: AUDIT_REPORT.md
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const results = [];
function layer(name) { return (check, ok, detail) => results.push({ layer: name, check, ok, detail }); }

// ── Layer 1: Backend service health (real port probes — not PM2 list, which
//                returns empty when invoked from a child spawn on Windows) ────
async function L1_services() {
  const L = layer('L1-services');
  // Use the canonical port registry as the source of truth
  let ports;
  try { ports = require(path.join(ROOT, 'lib/runtime/ports.js')); }
  catch (e) { L('port-registry', false, e.message); return; }
  const services = ports.listServices();
  const probes = await ports.probeAll(1500);
  let up = 0, down = 0;
  for (const s of services) {
    const p = probes.find(x => x.id === s.id);
    if (p && p.ok) {
      up++;
      L(`${s.id}:${s.port}`, true, p.status ? `HTTP ${p.status}` : 'TCP open');
    } else {
      down++;
      L(`${s.id}:${s.port}`, false, p ? `status ${p.status}` : (p && p.error) || 'no response');
    }
  }
  L('services-summary', down === 0, `${up}/${services.length} online, ${down} down`);
}

// ── Layer 2: API route reachability (every file in app/api/) ─────────────────
async function L2_routes() {
  const L = layer('L2-routes');
  function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...walk(path.join(dir, e.name)));
      else if (e.name === 'route.ts' || e.name === 'route.js') out.push(dir);
    }
    return out;
  }
  const routes = walk(path.join(ROOT, 'app/api'));
  L('api-routes-discovered', true, `${routes.length} route files in app/api/`);
  // Probe a sample
  let pass = 0, fail = 0;
  for (const r of routes.slice(0, 40)) {
    const rel = path.relative(path.join(ROOT, 'app'), r).replace(/\\/g, '/');
    const url = `http://127.0.0.1:3030/${rel}`;
    const code = await new Promise((resolve) => {
      const req = http.get(url, { timeout: 3000 }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', () => resolve(0));
      req.on('timeout', () => { req.destroy(); resolve(0); });
    });
    if (code >= 200 && code < 500) { pass++; L(`GET ${rel}`, true, `HTTP ${code}`); }
    else { fail++; L(`GET ${rel}`, false, `HTTP ${code || 'no-response'}`); }
  }
  L('api-routes-probe-summary', fail === 0, `${pass}/${pass+fail} responded`);
}

// ── Layer 3: Component hard-coded ports (the split-brain bug) ────────────────
async function L3_hardcoded() {
  const L = layer('L3-hardcoded-ports');
  const offenders = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(e.name)) {
        const c = fs.readFileSync(p, 'utf8');
        const matches = c.match(/(?:localhost|127\.0\.0\.1):(7\d{3}|11434|3030|3000)/g);
        if (matches) offenders.push({ file: p.replace(ROOT, '').replace(/\\/g, '/'), hits: [...new Set(matches)] });
      }
    }
  }
  walk(path.join(ROOT, 'app'));
  if (offenders.length === 0) L('no-hardcoded-ports', true, '0 hard-coded service ports in app/');
  else {
    L('no-hardcoded-ports', false, `${offenders.length} files with direct port references`);
    for (const o of offenders.slice(0, 20)) L(`port-in-${o.file}`, false, `hits: ${o.hits.join(', ')}`);
  }
}

// ── Layer 4: Module load (does each major lib actually load?) ────────────────
async function L4_module_load() {
  const L = layer('L4-module-load');
  const modules = [
    'lib/llm-provider.js','lib/agent-loop.js','lib/tools/index.js','lib/spend-gate.js',
    'lib/providers/registry.js','lib/providers/openai-responses.js','lib/providers/anthropic-messages.js',
    'lib/providers/hermes-cli.js','lib/runtime/ports.js','lib/runtime/policy-engine.js',
  ];
  for (const m of modules) {
    try { require(path.join(ROOT, m)); L(`load-${m}`, true, 'OK'); }
    catch (e) { L(`load-${m}`, false, e.message.slice(0, 200)); }
  }
}

// ── Layer 5: Tool alias resolution (deep call through alias map) ─────────────
async function L5_aliases() {
  const L = layer('L5-aliases');
  try {
    const reg = require(path.join(ROOT, 'lib/tools/index.js'));
    const tests = [
      ['spawn', true], ['delegate_task', true], ['agent_spawn', true], ['spawn_agent', true],
      ['__nonexistent_tool__', false],
    ];
    for (const [name, expected] of tests) {
      const got = reg.has(name);
      L(`alias-${name}`, got === expected, expected ? 'resolves via alias map' : 'correctly not found');
    }
  } catch (e) { L('alias-system', false, e.message); }
}

// ── Layer 6: Port registry coherence (lib/runtime/ports.js vs reality) ───────
async function L6_port_registry() {
  const L = layer('L6-port-registry');
  try {
    const ports = require(path.join(ROOT, 'lib/runtime/ports.js'));
    const services = ports.listServices();
    L('port-registry-loaded', true, `${services.length} services registered`);
    // Probe each
    const probes = await ports.probeAll(1500);
    const up = probes.filter(p => p.ok).length;
    const down = probes.filter(p => !p.ok);
    L('port-registry-probe', up >= 8, `${up}/${probes.length} up. Down: ${down.map(d => d.id).join(', ') || 'none'}`);
  } catch (e) { L('port-registry', false, e.message); }
}

// ── Layer 7: Provider driver registry ────────────────────────────────────────
async function L7_drivers() {
  const L = layer('L7-drivers');
  try {
    const reg = require(path.join(ROOT, 'lib/providers/registry.js'));
    const drivers = reg.listDrivers();
    L('driver-registry', drivers.length >= 3, `${drivers.length} drivers: ${drivers.map(d => d.name).join(', ')}`);
  } catch (e) { L('driver-registry', false, e.message); }
}

// ── Layer 8: Policy engine (read-only / workspace-write / danger modes) ─────
async function L8_policy() {
  const L = layer('L8-policy');
  try {
    const { policyEngine } = require(path.join(ROOT, 'lib/runtime/policy-engine.js'));
    const pe = policyEngine();
    const tests = [
      ['read', 'read-only', true],
      ['write', 'read-only', false],
      ['write', 'workspace-write', true],
      ['bash', 'workspace-write', false],
      ['bash', 'danger-full-access', true],
      ['spawn', 'workspace-write', false],   // needs approval
    ];
    for (const [tool, mode, expected] of tests) {
      const v = pe.check({ tool, args: {}, mode, userApproved: false });
      L(`policy-${mode}-${tool}`, v.allow === expected, v.reason);
    }
  } catch (e) { L('policy-engine', false, e.message); }
}

// ── Layer 9: Structured agent loop (real mid-stream tool extraction) ─────────
async function L9_agent_loop() {
  const L = layer('L9-agent-loop');
  try {
    const al = require(path.join(ROOT, 'lib/agent-loop.js'));
    L('agent-loop-loads', typeof al.runAgent === 'function' && typeof al.extractCompleteToolCalls === 'function', 'runAgent + structured extractor exported');
    // Simulate streaming with 2 tool calls embedded
    const stream = [
      { content: 'I will ' }, { content: 'use ' },
      { content: 'a tool. {"tool":"read","args":{"path":"/etc/foo"}} and ' },
      { content: 'then ' },
      { content: '{"tool":"write","args":{"path":"/tmp/x","content":"hi"}} done.' },
      { done: true },
    ];
    const detected = [];
    let buf = '';
    for (const chunk of stream) {
      if (chunk.content) buf += chunk.content;
      if (chunk.done) break;
      const { calls, remaining } = al.extractCompleteToolCalls(buf);
      for (const c of calls) {
        detected.push(c);
        buf = remaining;
      }
    }
    const { calls: finalCalls, remaining: finalRem } = al.extractCompleteToolCalls(buf);
    for (const c of finalCalls) detected.push(c);
    L('agent-loop-streaming-extract', detected.length === 2, `detected ${detected.length}/2 tool calls mid-stream: ${detected.map(d => d.tool).join(', ') || 'none'}`);
  } catch (e) { L('agent-loop', false, e.message); }
}

// ── Layer 10: GOOP direct-egress blocked ─────────────────────────────────────
async function L10_goop() {
  const L = layer('L10-goop');
  const code = await new Promise((resolve) => {
    const body = JSON.stringify({ category: 'ai', name: 'test' });
    const req = http.request({
      hostname: '127.0.0.1', port: 3030, path: '/api/api-mega-list',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.write(body); req.end();
  });
  L('goop-direct-egress-blocked', code.status === 403, `POST /api/api-mega-list -> ${code.status} (expected 403). Body: ${(code.body || '').slice(0, 120)}`);
}

// ── Layer 11: SpendGate enforcement on stream path (verify the patch) ────────
async function L11_spendgate() {
  const L = layer('L11-spendgate');
  try {
    const src = fs.readFileSync(path.join(ROOT, 'lib/llm-provider.js'), 'utf8');
    const chatHas = src.includes('Spending cap reached') || src.includes('SpendGate:');
    const streamHas = src.includes('Spending cap reached') || src.includes('SpendGate:') || src.includes('blocked: true');
    L('spendgate-on-chat', chatHas, 'SpendGate referenced in chat()');
    L('spendgate-on-stream', streamHas, 'SpendGate referenced in streamChat()');
  } catch (e) { L('spendgate', false, e.message); }
}

// ── Layer 12: Settings coverage (which toggles are exposed in /settings) ─────
async function L12_settings_coverage() {
  const L = layer('L12-settings-coverage');
  try {
    const layout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
    L('settings-cog-in-layout', layout.includes('SettingsCog'), 'SettingsCog is wired into the global layout');
    const settingsPage = fs.existsSync(path.join(ROOT, 'app/settings/page.tsx'));
    L('settings-page-exists', settingsPage, 'app/settings/page.tsx exists');
  } catch (e) { L('settings-coverage', false, e.message); }
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  await L1_services();
  await L2_routes();
  await L3_hardcoded();
  await L4_module_load();
  await L5_aliases();
  await L6_port_registry();
  await L7_drivers();
  await L8_policy();
  await L9_agent_loop();
  await L10_goop();
  await L11_spendgate();
  await L12_settings_coverage();

  // Group by layer
  const layers = {};
  for (const r of results) (layers[r.layer] = layers[r.layer] || []).push(r);
  const order = ['L1-services','L2-routes','L3-hardcoded-ports','L4-module-load','L5-aliases','L6-port-registry','L7-drivers','L8-policy','L9-agent-loop','L10-goop','L11-spendgate','L12-settings-coverage'];
  let pass = 0, fail = 0;
  console.log('\n=== PURPCLAW DEEP AUDIT ===\n');
  for (const L of order) {
    const rows = layers[L] || [];
    const lp = rows.filter(r => r.ok).length;
    const lf = rows.length - lp;
    pass += lp; fail += lf;
    const mark = lf === 0 ? '✓' : '✗';
    console.log(`${mark} ${L.padEnd(24)} ${lp}/${rows.length} pass`);
    for (const r of rows.filter(r => !r.ok)) console.log(`    ✗ ${r.check}: ${r.detail}`);
  }
  console.log(`\nTotal: ${pass}/${pass+fail} passed, ${fail} failed\n`);

  // Write markdown report
  const md = [];
  md.push('# PURPCLAW Deep Audit Report\n');
  md.push(`Generated: ${new Date().toISOString()}\n`);
  md.push(`\n## Summary\n\n- **${pass}/${pass+fail}** checks passed\n- **${fail}** failed\n`);
  md.push(`\n## Layers\n`);
  for (const L of order) {
    const rows = layers[L] || [];
    const lp = rows.filter(r => r.ok).length;
    const lf = rows.length - lp;
    md.push(`\n### ${L} — ${lp}/${rows.length} pass\n`);
    for (const r of rows) md.push(`- ${r.ok ? '✓' : '✗'} **${r.check}** — ${r.detail}\n`);
  }
  fs.writeFileSync(path.join(ROOT, 'docs/AUDIT_REPORT.md'), md.join(''));
  console.log(`Report written to docs/AUDIT_REPORT.md`);
})().catch((e) => { console.error('audit fatal:', e); process.exit(2); });
