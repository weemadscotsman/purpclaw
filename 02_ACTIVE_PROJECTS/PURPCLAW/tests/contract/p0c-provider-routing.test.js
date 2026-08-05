'use strict';
/**
 * P0-C — provider routing truth.
 *
 *   node tests/contract/p0c-provider-routing.test.js
 *
 * Gate: one canonical config controls real calls; status reports the route
 * execution actually uses; fallback deterministic and secret-safe.
 *
 * Every assertion runs in a child process against a scratch config directory,
 * because the thing under test is env-var precedence and a module that caches
 * config at require time would make in-process mutation meaningless.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'var', 'tmp', 'p0c-' + process.pid);
fs.mkdirSync(SCRATCH, { recursive: true });

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); }
};

const LLM = JSON.stringify(path.join(ROOT, 'lib', 'llm-provider.js'));

// dotenv prints a banner to stdout on require, and llm-provider warns about
// absent API keys. Neither is an error, but both corrupt a bare
// JSON.parse(stdout). Everything the child reports is fenced between markers
// and extracted, so unrelated console noise cannot fail an assertion.
const MARK = '<<<P0C>>>';
function run(script, env = {}) {
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const start = out.indexOf(MARK);
  const end = out.lastIndexOf(MARK);
  if (start === -1 || end === start) throw new Error(`child produced no marked output:\n${out.slice(0, 300)}`);
  return out.slice(start + MARK.length, end).trim();
}
// Wrap whatever the child writes in the markers.
const emit = expr => `process.stdout.write(${JSON.stringify(MARK)}+String(${expr})+${JSON.stringify(MARK)});`;

console.log('P0-C provider routing truth\n');

// A config written where provider-config says it lives.
function writeConfig(dir, lanes) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'provider-config.json'), JSON.stringify({ lanes }, null, 2));
}

// ── 1. The config path is resolved in ONE place ─────────────────────────────
check('llm-provider does not re-derive the config path', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'llm-provider.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/\.purpclaw['"]\s*,\s*['"]provider-config\.json/.test(src),
    'llm-provider builds its own path to provider-config.json instead of calling '
    + 'provider-config.configPath() — that is how OPENCLAUDE_CONFIG_DIR got dropped');
});

// ── 2. OPENCLAUDE_CONFIG_DIR steers REAL calls, not just status ─────────────
const altDir = path.join(SCRATCH, 'alt-config');
writeConfig(altDir, { PRIMARY_CHAT: { provider: 'minimax', model: 'lane-model-from-alt-dir' } });

check('OPENCLAUDE_CONFIG_DIR is honoured by the real resolve path', () => {
  const out = run(
    `const L=require(${LLM});` + emit("JSON.stringify(L.explainConfig('LLM'))"),
    { OPENCLAUDE_CONFIG_DIR: altDir, LLM_PROVIDER: '', LLM_MODEL: '' },
  );
  const info = JSON.parse(out);
  assert.strictEqual(info.provider, 'minimax',
    `real resolve used "${info.provider}"; the config in OPENCLAUDE_CONFIG_DIR says minimax`);
  assert.strictEqual(info.model, 'lane-model-from-alt-dir', `model was "${info.model}"`);
  assert.strictEqual(info.source.provider, 'provider-config');
});

check('status reports the same config path the resolver reads', () => {
  const out = run(
    `const L=require(${LLM});` + emit("L.explainConfig('LLM').configPath||''"),
    { OPENCLAUDE_CONFIG_DIR: altDir },
  );
  assert.strictEqual(path.resolve(out), path.resolve(path.join(altDir, 'provider-config.json')));
});

// ── 3. Precedence: env beats config beats default ───────────────────────────
check('env var overrides provider-config', () => {
  const out = run(
    `const L=require(${LLM});const i=L.explainConfig('LLM');` + emit("i.provider+'|'+i.source.provider"),
    { OPENCLAUDE_CONFIG_DIR: altDir, LLM_PROVIDER: 'ollama' },
  );
  const [provider, source] = out.split('|');
  assert.strictEqual(provider, 'ollama', 'env var did not win');
  assert.strictEqual(source, 'env', 'status does not attribute the value to env');
});

check('with no env and no config, the default is reported as default', () => {
  const emptyDir = path.join(SCRATCH, 'empty-config');
  fs.mkdirSync(emptyDir, { recursive: true });
  const out = run(
    `const L=require(${LLM});const i=L.explainConfig('LLM');` + emit('i.source.provider'),
    { OPENCLAUDE_CONFIG_DIR: emptyDir, LLM_PROVIDER: '', LLM_MODEL: '' },
  );
  assert.strictEqual(out, 'default');
});

// ── 4. Every declared lane resolves ─────────────────────────────────────────
check('all declared lanes resolve without throwing', () => {
  const out = run(
    `const L=require(${LLM});const r={};for(const p of Object.keys(L.LANE_BY_PREFIX)){r[p]=L.explainConfig(p).lane;}` + emit('JSON.stringify(r)'),
    { OPENCLAUDE_CONFIG_DIR: altDir },
  );
  const lanes = JSON.parse(out);
  assert.ok(Object.keys(lanes).length >= 6, `only ${Object.keys(lanes).length} lanes resolved`);
  assert.strictEqual(lanes.LLM, 'PRIMARY_CHAT');
  assert.strictEqual(lanes.CODE, 'CODE');
});

// ── 5. Secret-safe: status must never leak the key ──────────────────────────
check('status reports key presence, never the key itself', () => {
  const secret = 'sk-p0c-canary-' + 'x'.repeat(24);
  const out = run(
    `const L=require(${LLM});` + emit("JSON.stringify(L.explainConfig('LLM'))"),
    { OPENCLAUDE_CONFIG_DIR: altDir, LLM_API_KEY: secret, MINIMAX_API_KEY: secret },
  );
  assert.ok(!out.includes(secret), 'explainConfig leaked the API key into its output');
  const info = JSON.parse(out);
  assert.strictEqual(typeof info.hasKey, 'boolean', 'no boolean key-presence signal');
});

try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch { /* windows lock */ }

console.log(`\n${failures ? `P0-C FAILED (${failures})` : 'P0-C PASSED'}`);
process.exit(failures ? 1 : 0);
