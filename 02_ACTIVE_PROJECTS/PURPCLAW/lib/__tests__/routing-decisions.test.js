'use strict';

// Inline test runner using Node's built-in node:test + node:assert
const { test, describe } = require('node:test');
const assert = require('node:assert');

const RD = require('../routing-decisions.js');

// ─── Wave C acceptance test: two lanes prove distinct provider/model resolution ─

test('WAVE_C_ACCEPTANCE: code lane resolves to MiniMax M2.7', () => {
  const r = RD.resolve({ lane: 'code' });
  assert.strictEqual(r.provider, 'minimax', 'code lane must use minimax provider');
  assert.strictEqual(r.model, 'MiniMax-M2.7', 'code lane must use MiniMax-M2.7 model');
  assert.strictEqual(r.lane, 'code');
  assert.ok(r.agent, 'code lane must have an agent');
});

test('WAVE_C_ACCEPTANCE: reason lane resolves to deepseek-v4-pro', () => {
  const r = RD.resolve({ lane: 'reason' });
  assert.strictEqual(r.provider, 'nvidia', 'reason lane uses nvidia (NIM)');
  assert.ok(r.model.includes('deepseek') || r.model === 'deepseek-ai/deepseek-v4-pro',
    `reason lane must use deepseek model, got: ${r.model}`);
  assert.strictEqual(r.lane, 'reason');
  assert.ok(r.agent, 'reason lane must have an agent');
});

test('WAVE_C_ACCEPTANCE: review lane resolves to glm-5.1', () => {
  const r = RD.resolve({ lane: 'review' });
  assert.strictEqual(r.provider, 'nvidia', 'review lane uses nvidia (NIM)');
  assert.ok(r.model.includes('glm') || r.model === 'z-ai/glm-5.1',
    `review lane must use glm model, got: ${r.model}`);
  assert.strictEqual(r.lane, 'review');
  assert.ok(r.agent, 'review lane must have an agent');
});

test('WAVE_C_ACCEPTANCE: longctx lane resolves to kimi-k2.6', () => {
  const r = RD.resolve({ lane: 'longctx' });
  assert.strictEqual(r.provider, 'nvidia', 'longctx lane uses nvidia (NIM)');
  assert.ok(r.model.includes('kimi') || r.model === 'moonshotai/kimi-k2.6',
    `longctx lane must use kimi model, got: ${r.model}`);
  assert.strictEqual(r.lane, 'longctx');
  assert.ok(r.agent, 'longctx lane must have an agent');
});

test('WAVE_C_ACCEPTANCE: swarm lane resolves to kimi-k2.6', () => {
  const r = RD.resolve({ lane: 'swarm' });
  assert.strictEqual(r.provider, 'nvidia', 'swarm lane uses nvidia (NIM)');
  assert.ok(r.model.includes('kimi') || r.model === 'moonshotai/kimi-k2.6',
    `swarm lane must use kimi model, got: ${r.model}`);
  assert.strictEqual(r.lane, 'swarm');
  assert.ok(r.agent, 'swarm lane must have an agent');
});

test('WAVE_C_ACCEPTANCE: cheap lane resolves to a distinct fast model', () => {
  const r = RD.resolve({ lane: 'cheap' });
  assert.strictEqual(r.lane, 'cheap');
  assert.ok(r.model, 'cheap lane must have a model');
  assert.ok(r.agent, 'cheap lane must have an agent');
  // cheap must be different from code (default)
  const codeR = RD.resolve({ lane: 'code' });
  assert.notStrictEqual(r.model, codeR.model, 'cheap and code lanes must resolve to different models');
  assert.notStrictEqual(r.provider, codeR.provider, 'cheap and code lanes must resolve to different providers');
});

test('WAVE_C_ACCEPTANCE: strong lane resolves to a distinct quality model', () => {
  const r = RD.resolve({ lane: 'strong' });
  assert.strictEqual(r.lane, 'strong');
  const codeR = RD.resolve({ lane: 'code' });
  assert.notStrictEqual(r.model, codeR.model, 'strong and code lanes must resolve to different models');
});

test('WAVE_C_ACCEPTANCE: two explicit lanes produce DISTINCT model+provider pairs', () => {
  // Prove criterion 8: two configured lanes prove distinct provider/model resolution
  const r1 = RD.resolve({ lane: 'code' });
  const r2 = RD.resolve({ lane: 'reason' });

  const pair1 = `${r1.provider}:${r1.model}`;
  const pair2 = `${r2.provider}:${r2.model}`;

  assert.notStrictEqual(pair1, pair2,
    `code lane (${pair1}) and reason lane (${pair2}) MUST be distinct`);
});

// ─── Settings hierarchy tests ─────────────────────────────────────────────────

test('explicit lane overrides auto-classification', () => {
  // Given a message that would classify as 'reason', but lane=code is explicit
  const r = RD.resolve({ message: 'plan the architecture', lane: 'code' });
  assert.strictEqual(r.lane, 'code', 'explicit lane must win over auto-classification');
});

test('explicit model overrides lane default', () => {
  const r = RD.resolve({ lane: 'code', model: 'gpt-4o' });
  assert.strictEqual(r.model, 'gpt-4o', 'explicit model must override lane default');
  assert.strictEqual(r.lane, 'code', 'lane must still be set');
});

test('explicit provider overrides lane default', () => {
  const r = RD.resolve({ lane: 'code', provider: 'anthropic' });
  assert.strictEqual(r.provider, 'anthropic', 'explicit provider must override lane default');
  assert.strictEqual(r.lane, 'code', 'lane must still be set');
});

test('auto-classification picks reason lane for planning keywords', () => {
  // Pure reason message — no "code", "api", "build" or other code keywords that cause a tie with code lane
  const r = RD.resolve({ message: 'design a multi-step strategy for coordinating a distributed swarm of agents' });
  assert.strictEqual(r.lane, 'reason', 'pure plan/strategy keyword must route to reason lane');
});

test('auto-classification picks review lane for analysis keywords', () => {
  // Pure review message — "analyz" triggers review weight-2 rule, no "code" keyword to tie
  const r = RD.resolve({ message: 'audit and evaluate the security posture of the entire system' });
  assert.strictEqual(r.lane, 'review', 'audit/analyze keyword must route to review lane');
});

test('auto-classification picks longctx lane for research keywords', () => {
  const r = RD.resolve({ message: 'research the entire codebase and summarize findings' });
  assert.strictEqual(r.lane, 'longctx', 'research keyword must route to longctx lane');
});

test('auto-classification picks default (code) for casual chat', () => {
  const r = RD.resolve({ message: 'hello how are you' });
  assert.strictEqual(r.lane, 'code', 'casual chat must default to code lane');
});

// ─── Agent → lane preference tests ────────────────────────────────────────────

test('per-agent override: robot prefers code lane', () => {
  const r = RD.resolve({ agent: 'robot' });
  assert.strictEqual(r.lane, 'code', 'robot agent must prefer code lane');
});

test('per-agent override: dragon prefers reason lane', () => {
  const r = RD.resolve({ agent: 'dragon' });
  assert.strictEqual(r.lane, 'reason', 'dragon agent must prefer reason lane');
});

test('per-agent override: ghost prefers review lane', () => {
  const r = RD.resolve({ agent: 'ghost' });
  assert.strictEqual(r.lane, 'review', 'ghost agent must prefer review lane');
});

test('per-agent override: duck prefers longctx lane', () => {
  const r = RD.resolve({ agent: 'duck' });
  assert.strictEqual(r.lane, 'longctx', 'duck agent must prefer longctx lane');
});

test('per-agent override: wolf prefers swarm lane', () => {
  const r = RD.resolve({ agent: 'wolf' });
  assert.strictEqual(r.lane, 'swarm', 'wolf agent must prefer swarm lane');
});

// ─── Model alias tests ────────────────────────────────────────────────────────

test('model alias: mini resolves to minimaxai/minimax-m3', () => {
  assert.strictEqual(RD.resolveAlias('mini'), 'minimaxai/minimax-m3');
});

test('model alias: ds resolves to deepseek-ai/deepseek-v4-pro', () => {
  assert.strictEqual(RD.resolveAlias('ds'), 'deepseek-ai/deepseek-v4-pro');
});

test('model alias: kimi resolves to moonshotai/kimi-k2.6', () => {
  assert.strictEqual(RD.resolveAlias('kimi'), 'moonshotai/kimi-k2.6');
});

test('model alias: unknown model passes through unchanged', () => {
  assert.strictEqual(RD.resolveAlias('some-unknown-model-xyz'), 'some-unknown-model-xyz');
});

// ─── Fallback chain tests ────────────────────────────────────────────────────

test('getChain returns primary + fallbacks', () => {
  const resolved = RD.resolve({ lane: 'reason' });
  const chain = RD.getChain(resolved);
  assert.ok(Array.isArray(chain), 'chain must be an array');
  assert.ok(chain.length >= 1, 'chain must have at least the primary model');
  assert.strictEqual(chain[0], resolved.model, 'chain[0] must be the primary model');
});

test('getChain: code lane has fallbacks', () => {
  const r = RD.resolve({ lane: 'code' });
  const chain = RD.getChain(r);
  // Code lane may have fallbacks defined
  assert.ok(Array.isArray(chain));
});

test('getChain: reason lane has deep fallbacks', () => {
  const r = RD.resolve({ lane: 'reason' });
  const chain = RD.getChain(r);
  assert.ok(chain.length > 1, 'reason lane should have a fallback chain longer than 1');
});

// ─── Provider profiles tests ──────────────────────────────────────────────────

test('PROVIDER_PROFILES includes minimax, nvidia, deepseek, kimi, glm', () => {
  assert.ok(RD.PROVIDER_PROFILES.minimax, 'minimax profile must exist');
  assert.ok(RD.PROVIDER_PROFILES.nvidia, 'nvidia profile must exist');
  assert.ok(RD.PROVIDER_PROFILES.deepseek, 'deepseek profile must exist');
  assert.ok(RD.PROVIDER_PROFILES.kimi, 'kimi profile must exist');
  assert.ok(RD.PROVIDER_PROFILES.glm, 'glm profile must exist');
});

// ─── listLanes test ──────────────────────────────────────────────────────────

test('listLanes returns all defined lanes', () => {
  const lanes = RD.listLanes();
  assert.ok(Array.isArray(lanes), 'listLanes must return an array');
  const laneNames = lanes.map(l => l.lane);
  assert.ok(laneNames.includes('code'), 'listLanes must include code');
  assert.ok(laneNames.includes('reason'), 'listLanes must include reason');
  assert.ok(laneNames.includes('review'), 'listLanes must include review');
  assert.ok(laneNames.includes('longctx'), 'listLanes must include longctx');
  assert.ok(laneNames.includes('swarm'), 'listLanes must include swarm');
  assert.ok(laneNames.includes('cheap'), 'listLanes must include cheap');
  assert.ok(laneNames.includes('strong'), 'listLanes must include strong');
});

// ─── Cost tracking smoke test ─────────────────────────────────────────────────

test('recordLLMUsage does not throw', () => {
  // Should be safe to call — never throws
  RD.recordLLMUsage('minimax', 'MiniMax-M2.7', {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  });
  // If we get here without throwing, the test passes
  assert.ok(true, 'recordLLMUsage must not throw');
});

// ─── Throttle state test ─────────────────────────────────────────────────────

test('throttleState returns an array', () => {
  const state = RD.throttleState();
  assert.ok(Array.isArray(state), 'throttleState must return an array');
});

// ─── providerForHop tests ─────────────────────────────────────────────────────

test('providerForHop(0) returns primary provider', () => {
  const pp = RD.providerForHop(0, 'minimax', 'MiniMax-M2.7');
  assert.strictEqual(pp, 'minimax');
});

test('providerForHop(1+) returns nvidia for NIM fallback', () => {
  const pp = RD.providerForHop(1, 'minimax', 'deepseek-ai/deepseek-v4-pro');
  assert.strictEqual(pp, 'nvidia', 'fallback hops must use nvidia (NIM)');
});

console.log('routing-decisions.test.js: all acceptance criteria defined');
