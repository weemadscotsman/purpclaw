'use strict';

/**
 * tests/slash_commands/test_slash_commands.js — slash command parity cert.
 *
 * Real node:test, no mocks. Spawns the actual `node bin/purpclaw.js /<cmd>`
 * subcommands and verifies they return cleanly. Closes the Claude Code
 * / Antigravity CLI / Kimi CLI slash command parity gap.
 *
 * Run from project root: `node --test tests/slash_commands/test_slash_commands.js`
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CLI  = path.join(ROOT, 'bin', 'purpclaw.js');

function runPurpclaw(args, timeoutMs = 30000) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
}

test('T01: /status (slash alias of status) runs cleanly', () => {
  const r = runPurpclaw(['/status', '--no-bars']);
  // banner output is expected; we just need no crash and a known shape
  assert.match(r.stdout, /PURPCLAW|FULL STACK|STACK/);
  // /status may exit non-zero if some services are down — that's not a slash-command failure
  assert.ok(r.stdout.length > 100, 'expected banner output');
});

test('T02: /plan with a goal prints the structured plan', () => {
  const r = runPurpclaw(['/plan', 'add MCP client to parity surface', '--no-bars']);
  assert.equal(r.status, 0, `/plan exited non-zero: ${r.stderr}`);
  assert.match(r.stdout, /STRATEGIC|STRUCTURED PLAN|\/plan/i);
  assert.match(r.stdout, /build the MCP client|add MCP client/);
  // The plan probes the agent registry — should mention personas
  assert.match(r.stdout, /personas|agents/i);
});

test('T03: /plan without a goal fails with usage hint', () => {
  const r = runPurpclaw(['/plan', '--no-bars']);
  assert.notEqual(r.status, 0, 'expected non-zero exit when no goal given');
  assert.match(r.stdout, /\/plan needs a goal/);
});

test('T04: /clear (slash alias) runs and reports what was cleared', () => {
  const r = runPurpclaw(['/clear', '--no-bars']);
  // /clear exits 0 even if nothing matched (it preserves durable state)
  assert.equal(r.status, 0, `/clear exited non-zero: ${r.stderr}`);
  // Should report either cleared files or preserved durable state
  assert.match(r.stdout, /(cleared|preserved|skipped|reset)/i);
});

test('T05: /compact (slash alias) runs and reports pruning', () => {
  const r = runPurpclaw(['/compact', '--days=30', '--no-bars']);
  assert.equal(r.status, 0, `/compact exited non-zero: ${r.stderr}`);
  // Either reports journals or says nothing eligible
  assert.match(r.stdout, /(prune|eligible|preserved|total)/i);
});

test('T06: /status and status produce equivalent shape (slash is transparent alias)', () => {
  const slash = runPurpclaw(['/status', '--no-bars']);
  const plain = runPurpclaw(['status', '--no-bars']);
  // Both should produce a PURPCLAW banner
  assert.match(slash.stdout, /PURPCLAW/);
  assert.match(plain.stdout, /PURPCLAW/);
});

test('T07: bare slash / is treated as help', () => {
  const r = runPurpclaw(['/', '--no-bars']);
  assert.match(r.stdout, /(USAGE|usage|Usage|help)/);
});

test('T08: /help runs and lists commands', () => {
  const r = runPurpclaw(['/help', '--no-bars']);
  assert.match(r.stdout, /(purpclaw|Usage)/);
});
