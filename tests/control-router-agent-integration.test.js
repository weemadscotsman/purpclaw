'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AGENT_LOOP = path.join(ROOT, 'lib', 'agent-loop.js');

test('agent loop imports deterministic control router', () => {
  const src = fs.readFileSync(AGENT_LOOP, 'utf8');
  assert.match(src, /const CONTROL = require\('\.\/control\/control-router'\);/);
});

test('agent loop routes tool execution through CONTROL instead of direct TOOLS.invoke', () => {
  const src = fs.readFileSync(AGENT_LOOP, 'utf8');
  assert.match(src, /CONTROL\.invokeTool\(call\.tool, call\.args, TOOLS/);
  assert.doesNotMatch(src, /const result = await TOOLS\.invoke\(call\.tool, call\.args\);/);
});

test('system prompt states MCP is fallback rather than default', () => {
  const src = fs.readFileSync(AGENT_LOOP, 'utf8');
  assert.match(src, /MCP is fallback only when no healthy native equivalent exists/);
  assert.doesNotMatch(src, /Use MCP tools \(especially omnicode\) for code search to save tokens/);
});

test('native code-search is the prompt example', () => {
  const src = fs.readFileSync(AGENT_LOOP, 'utf8');
  assert.match(src, /Search code:.*code-search/);
});
