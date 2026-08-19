'use strict';
// Proves the unified_api tool bridge target: registry tools NOT hand-coded in
// the runTool switch dispatch through ToolRuntime's permission ladder instead of
// returning the dead "Unknown tool" string. Regression guard for the
// build-replacement that dropped the bridge (restored 453895a-era sweep).
const { test } = require('node:test');
const assert = require('node:assert');
const { ToolRuntime } = require('../../lib/tool-runtime');

test('registry exposes a non-trivial tool surface', () => {
  const TR = new ToolRuntime({ permissionProfile: 'workspace-write' });
  assert.ok(TR.registry.list().length > 50, 'registry should hold the full builtin tool set');
  assert.ok(TR.registry.has('read'), 'read must be registered');
});

test('a registered tool dispatches through the permission ladder', async () => {
  const TR = new ToolRuntime({ permissionProfile: 'workspace-write' });
  const r = await TR.invoke('read', { path: 'package.json' }, { source: 'test' });
  assert.notStrictEqual(r.ok, false, 'read should not be denied under workspace-write');
  assert.ok(r.content || r.text, 'read should return file content');
});

test('an unregistered tool is rejected, not silently accepted', async () => {
  const TR = new ToolRuntime({ permissionProfile: 'workspace-write' });
  const r = await TR.invoke('definitely_not_a_tool_xyz', {}, {});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'TOOL_UNAVAILABLE');
});
