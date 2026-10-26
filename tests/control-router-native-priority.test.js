'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { invokeTool } = require('../lib/control/control-router');

function fakeRegistry(impl = {}) {
  const calls = [];
  const available = new Set(Object.keys(impl));
  return {
    calls,
    has(name) { return available.has(name); },
    async invoke(name, args) {
      calls.push({ name, args });
      if (!available.has(name)) return { ok: false, error: `unknown tool: ${name}` };
      const handler = impl[name];
      return typeof handler === 'function' ? handler(args) : handler;
    },
  };
}

test('native duplicate wins and MCP receives zero calls', async () => {
  const tools = fakeRegistry({
    read: { ok: true, content: 'native' },
    mcp__filesystem__read_file: { ok: true, content: 'mcp' },
  });

  const routed = await invokeTool(
    'mcp__filesystem__read_file',
    { path: 'README.md' },
    tools,
    { operationId: 'op-native-wins', goalId: 'goal-1' }
  );

  assert.equal(routed.surface, 'PURPCLAW_DRIVER');
  assert.equal(routed.executedTool, 'read');
  assert.equal(routed.fallbackUsed, false);
  assert.deepEqual(tools.calls.map(c => c.name), ['read']);
  assert.equal(routed.result.content, 'native');
});

test('fallback-eligible native failure uses MCP with same operation id', async () => {
  const tools = fakeRegistry({
    read: { ok: false, error: 'transport connection closed' },
    mcp__filesystem__read_file: { ok: true, content: 'mcp recovered' },
  });

  const routed = await invokeTool(
    'mcp__filesystem__read_file',
    { path: 'README.md' },
    tools,
    { operationId: 'op-stable-id', workflowId: 'wf-1' }
  );

  assert.equal(routed.operationId, 'op-stable-id');
  assert.equal(routed.surface, 'MCP');
  assert.equal(routed.fallbackUsed, true);
  assert.deepEqual(tools.calls.map(c => c.name), ['read', 'mcp__filesystem__read_file']);
  assert.equal(routed.result.content, 'mcp recovered');
});

test('invalid native request does not blindly retry through MCP', async () => {
  const tools = fakeRegistry({
    read: { ok: false, error: 'invalid argument: path required' },
    mcp__filesystem__read_file: { ok: true, content: 'mcp should not run' },
  });

  const routed = await invokeTool('mcp__filesystem__read_file', {}, tools, { operationId: 'op-bad-input' });

  assert.equal(routed.surface, 'PURPCLAW_DRIVER');
  assert.equal(routed.fallbackUsed, false);
  assert.deepEqual(tools.calls.map(c => c.name), ['read']);
});

test('MCP-only capability remains available', async () => {
  const tools = fakeRegistry({
    mcp__special__only_here: { ok: true, content: 'special' },
  });

  const routed = await invokeTool('mcp__special__only_here', { x: 1 }, tools, { operationId: 'op-mcp-only' });
  assert.equal(routed.surface, 'MCP');
  assert.deepEqual(tools.calls.map(c => c.name), ['mcp__special__only_here']);
});

test('non-MCP built-in requests remain native and untouched', async () => {
  const tools = fakeRegistry({ shell: { ok: true, stdout: 'done' } });
  const routed = await invokeTool('shell', { command: 'echo done' }, tools, { operationId: 'op-shell' });
  assert.equal(routed.surface, 'PURPCLAW_DRIVER');
  assert.equal(routed.executedTool, 'shell');
  assert.deepEqual(tools.calls.map(c => c.name), ['shell']);
});
