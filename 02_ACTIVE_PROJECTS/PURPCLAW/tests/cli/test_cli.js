'use strict';
/**
 * tests/cli/test_cli.js — CLI registry + dispatch contract tests.
 *
 * Real subprocess spawning against bin/purpclaw.js — no mocks. Certifies:
 *   1. registry↔switch consistency (no dispatch drift, mechanically)
 *   2. unknown command → stderr + did-you-mean + exit 2
 *   3. help <command> detail + unknown topic exit 2
 *   4. completion scripts derive from the registry
 *   5. registry-only orphan commands respond (council et al.)
 *   6. known command exits 0
 *
 * Run: node --test tests/cli/test_cli.js
 */
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BIN = path.join(ROOT, 'bin', 'purpclaw.js');
const REGISTRY = require(path.join(ROOT, 'lib', 'cli', 'registry'));

function runCli(args, opts = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    windowsHide: true,
  });
}

test('registry and switch agree — no dispatch drift', () => {
  const src = fs.readFileSync(BIN, 'utf8');
  const switchStart = src.indexOf('switch (command.toLowerCase())');
  const switchEnd = src.indexOf('process.exit(2);', switchStart);
  const block = src.slice(switchStart, switchEnd);
  const caseLabels = new Set();
  for (const m of block.matchAll(/case '([^']+)':/g)) caseLabels.add(m[1]);

  // every switch case must be known to the registry
  const unknownToRegistry = [...caseLabels].filter(c => !REGISTRY.find(c));
  assert.deepStrictEqual(unknownToRegistry, [], `switch cases missing from registry: ${unknownToRegistry.join(', ')}`);

  // every registry entry marked inSwitch must have a case
  const missingCase = REGISTRY.commands().filter(e => e.inSwitch && !caseLabels.has(e.name));
  assert.deepStrictEqual(missingCase.map(e => e.name), [], `registry inSwitch entries without a case: ${missingCase.map(e => e.name).join(', ')}`);

  // no duplicate case labels (the 2026-08-16 bug class)
  const all = [...block.matchAll(/case '([^']+)':/g)].map(m => m[1]);
  const dups = all.filter((c, i) => all.indexOf(c) !== i);
  assert.deepStrictEqual(dups, [], `duplicate case labels: ${dups.join(', ')}`);
});

test('registry entries are complete — name, category, description', () => {
  const bad = REGISTRY.commands().filter(e => !e.name || !e.category || typeof e.description !== 'string');
  assert.deepStrictEqual(bad.map(e => e.name), [], `incomplete registry entries: ${bad.map(e => e.name).join(', ')}`);
  for (const cat of REGISTRY.commands().map(e => e.category)) {
    assert.ok(REGISTRY.CATEGORY_TITLES[cat], `category "${cat}" has no title`);
  }
});

test('unknown command: stderr + did-you-mean + exit 2', () => {
  const r = runCli(['statsu']);
  assert.strictEqual(r.status, 2, `exit code should be 2, got ${r.status}`);
  assert.ok(r.stderr.includes('Unknown command: statsu'), 'error on stderr');
  assert.ok(r.stderr.includes('Did you mean'), 'did-you-mean present');
  assert.ok(!r.stdout.includes('Treating as task'), 'no silent task fallthrough');
});

test('unknown command far from any real one: still exit 2', () => {
  const r = runCli(['zzzqqqxxx']);
  assert.strictEqual(r.status, 2);
  assert.ok(r.stderr.includes('Unknown command'));
});

test('help <command> prints registry detail', () => {
  const r = runCli(['help', 'status']);
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes('purpclaw status'), 'command name shown');
  assert.ok(r.stdout.includes('category:'), 'category shown');
});

test('help <unknown> exits 2', () => {
  const r = runCli(['help', 'notacommand']);
  assert.strictEqual(r.status, 2);
});

test('help lists every registry command (generated index)', () => {
  const r = runCli(['help'], { timeout: 45000 });
  assert.strictEqual(r.status, 0);
  const missing = REGISTRY.commands().filter(e => !r.stdout.includes(`purpclaw ${e.name}`)).map(e => e.name);
  assert.deepStrictEqual(missing, [], `help output missing commands: ${missing.join(', ')}`);
});

test('completion scripts derive from the registry', () => {
  for (const shell of ['bash', 'zsh', 'powershell']) {
    const r = runCli(['completion', shell]);
    assert.strictEqual(r.status, 0, `${shell} completion exit`);
    const sample = REGISTRY.commands()[0].name;
    assert.ok(r.stdout.includes(sample), `${shell} completion includes registry sample`);
  }
  const usage = runCli(['completion']);
  assert.strictEqual(usage.status, 2, 'completion without shell is a usage error');
});

test('registry-only orphan commands respond (mcp)', () => {
  const r = runCli(['mcp'], { timeout: 45000 });
  assert.strictEqual(r.status, 0, `mcp exit code ${r.status}: ${r.stderr}`);
  assert.ok(r.stdout.length > 0, 'mcp produced output');
});

test('version exits 0 and prints package version', () => {
  const r = runCli(['--version']);
  assert.strictEqual(r.status, 0);
  const pkg = require(path.join(ROOT, 'package.json'));
  assert.ok(r.stdout.includes(pkg.version), 'version matches package.json');
});
