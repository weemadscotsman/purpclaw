'use strict';
const { resolve } = require('../routing-decisions');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Use a temp config dir so we don't touch real ~/.purpclaw
const TMP = path.join(os.tmpdir(), 'p0c-test-' + process.pid);
const TMP_CONFIG = path.join(TMP, 'provider-config.json');

function cleanup() {
  try { fs.rmSync(TMP, { recursive: true }); } catch (_) {}
}
function setup(cfg) {
  cleanup();
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(TMP_CONFIG, JSON.stringify({ lanes: cfg }), 'utf8');
}
process.env.PROVIDER_CONFIG_PATH = TMP_CONFIG;

// ── TEST 1: user-config overrides lane default ────────────────────────────────
setup({ reason: { provider: 'deepseek', model: 'deepseek-ai/deepseek-v4-pro' } });
const r1 = resolve({ lane: 'reason' });
console.assert(r1.provider === 'deepseek', `T1: expected deepseek, got ${r1.provider}`);
console.assert(r1.model === 'deepseek-ai/deepseek-v4-pro', `T1: expected deepseek-ai/deepseek-v4-pro, got ${r1.model}`);
console.assert(r1.reason === "user settings for 'reason'", `T1: reason=${r1.reason}`);
console.log('✔ T1: user-config overrides lane default');

// ── TEST 2: explicit model wins over user-config ─────────────────────────────
setup({ reason: { provider: 'deepseek', model: 'deepseek-ai/deepseek-v4-pro' } });
const r2 = resolve({ lane: 'reason', model: 'glm-5' });
console.assert(r2.model === 'z-ai/glm-5.1', `T2: expected z-ai/glm-5.1, got ${r2.model}`);
console.assert(r2.reason.includes('model override'), `T2: reason=${r2.reason}`);
console.log('✔ T2: explicit model wins over user-config');

// ── TEST 3: missing config → lane default ────────────────────────────────────
setup({});
const r3 = resolve({ lane: 'code' });
console.assert(r3.provider === 'minimax', `T3: expected minimax, got ${r3.provider}`);
console.assert(r3.reason === 'explicit lane', `T3: reason=${r3.reason}`);
console.log('✔ T3: missing config falls through to lane default');

// ── TEST 4: no provider-config.json → lane default ─────────────────────────
cleanup();
const r4 = resolve({ lane: 'review' });
console.assert(r4.provider === 'nvidia', `T4: expected nvidia, got ${r4.provider}`);
console.assert(r4.reason === 'explicit lane', `T4: reason=${r4.reason}`);
console.log('✔ T4: absent config → lane default (no crash)');

// ── TEST 5: user-config model alias resolved correctly ───────────────────────
setup({ code: { model: 'ds' } }); // ds alias → deepseek-ai/deepseek-v4-pro
const r5 = resolve({ lane: 'code' });
console.assert(r5.model === 'deepseek-ai/deepseek-v4-pro', `T5: expected deepseek-ai/deepseek-v4-pro, got ${r5.model}`);
console.assert(r5.reason === "user settings for 'code'", `T5: reason=${r5.reason}`);
console.log('✔ T5: user-config model alias resolved correctly');

cleanup();
console.log('\n✅ ALL INTEGRATION TESTS PASS — provider-config.json → routing-decisions bridge verified');
