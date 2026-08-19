'use strict';
// Guards `purpclaw update`: registry resolution + a runnable --json that must
// emit valid JSON carrying the live version and commit. This is the operator's
// live-reload command; if it breaks, the driver loses their update loop.
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(ROOT, 'bin', 'purpclaw.js');

test('registry resolves update + aliases', () => {
  const reg = require(path.join(ROOT, 'lib', 'cli', 'registry.js'));
  assert.ok(reg.find('update'), 'update must resolve');
  assert.ok(reg.find('up'), 'up alias must resolve');
  assert.ok(reg.find('upgrade'), 'upgrade alias must resolve');
});

test('purpclaw update --json emits valid live status', () => {
  const out = execFileSync(process.execPath, [BIN, 'update', '--json'], { cwd: ROOT, encoding: 'utf8' });
  // Boot noise may precede the JSON; grab the object.
  const jsonStart = out.indexOf('{');
  const parsed = JSON.parse(out.slice(jsonStart));
  assert.ok(parsed.version, 'reports a version');
  assert.ok('branch' in parsed && 'sha' in parsed, 'reports git branch and sha');
});
