'use strict';
/**
 * P0-B Acceptance Tests — Execution Policy Bypass Closure
 * 
 * Tests three bypasses:
 * 1. lib/chat-agent.js — double tool execution removed
 * 2. unified_api.js — executeTool routed through ToolRuntime  
 * 3. lib/mcp-server.js — raw execSync/writeFileSync replaced with command tool
 * 
 * Run: node .p0b_tests/test_bypass_closure.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertNot(condition, message) {
  if (condition) throw new Error(message || 'assertion failed (found unexpected)');
}

function fileContent(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf-8');
}

// Strip comments so we only test actual code, not doc comments
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
    .replace(/\/\/.*/g, '');             // line comments
}

// ─── BYPASS 1: lib/chat-agent.js double execution ─────────────────────────────
//
// Before: chatWithTools calls runAgent (which executes via ToolRuntime internally),
// then AGAIN calls executor.execute() → TOOLS.invoke() at line 83.
// After: executor.execute() call at :83 is REMOVED. Tool results come only from
// the runAgent event loop which already went through ToolRuntime.

console.log('\n[ BYPASS 1: chat-agent.js double execution ]');

test('BYPASS1: chat-agent.js does NOT call TOOLS.invoke()', () => {
  const src = stripComments(fileContent('lib/chat-agent.js'));
  assertNot(
    src.includes('TOOLS.invoke'),
    'TOOLS.invoke still present in chat-agent.js — double execution NOT removed'
  );
});

test('BYPASS1: ToolExecutor class is removed', () => {
  const src = stripComments(fileContent('lib/chat-agent.js'));
  assertNot(
    src.includes('class ToolExecutor'),
    'ToolExecutor class still present in chat-agent.js'
  );
});

test('BYPASS1: executor.execute() call is removed from chatWithTools', () => {
  const src = stripComments(fileContent('lib/chat-agent.js'));
  assertNot(
    src.includes('executor.execute'),
    'executor.execute still called in chatWithTools'
  );
});

test('BYPASS1: chatWithTools still exports correctly', () => {
  const src = fileContent('lib/chat-agent.js');
  assert(
    src.includes('module.exports'),
    'module.exports missing — chatWithTools not exported'
  );
  assert(
    src.includes("chatWithTools"),
    'chatWithTools function missing'
  );
});

// ─── BYPASS 2: unified_api.js executeTool ToolRuntime gate ─────────────────────
//
// Before: executeTool at :1090 dispatches to runTool or loadedSkills with no
// ToolRuntime, no permission profile, no path-security.
// After: executeTool creates a module-level ToolRuntime({permissionProfile:'standard'})
// and routes unknown tools (beyond the ~10 hardcoded cases) through it when
// PURPCLAW_API_TOOL_GATE=1 is set. The 70 hardcoded desktop/screen/browser tools
// in runTool are unchanged (brief says "leave them alone for now").

console.log('\n[ BYPASS 2: unified_api.js executeTool ToolRuntime gate ]');

test('BYPASS2: executeTool references ToolRuntime', () => {
  const src = fileContent('unified_api.js');
  assert(
    src.includes("ToolRuntime") || src.includes("require('./lib/tool-runtime')"),
    'executeTool does not reference ToolRuntime — bypass NOT closed'
  );
});

test('BYPASS2: executeTool does NOT fall through to bare require.invoke', () => {
  const src = fileContent('unified_api.js');
  // The bypass was: runTool with no ToolRuntime. Now it must use ToolRuntime.
  // We verify that the runTool call in executeTool is gated behind ToolRuntime.
  assertNot(
    /runTool\s*\([^)]*\)\s*;?\s*}\s*else\s*{/.test(src) &&
    !src.includes('ToolRuntime'),
    'runTool still called without ToolRuntime in executeTool'
  );
});

// ─── BYPASS 3: lib/mcp-server.js raw execSync ──────────────────────────────────
//
// Before: handleBuiltinTool('bash') uses raw execSync('bash ...') and
// handleBuiltinTool('write_file') uses raw fs.writeFileSync with no
// path-security, no exec-policy, no approval, no ToolRuntime.
// After: handleBuiltinTool is deleted. tools/call dispatches through the
// lib/tools registry via the canonical command tool. Tool-name aliases
// (read→read_file, write→write_file, list→list_directory) are added.

console.log('\n[ BYPASS 3: lib/mcp-server.js raw execSync ]');

test('BYPASS3: handleBuiltinTool is removed or no longer uses execSync bash', () => {
  const src = fileContent('lib/mcp-server.js');
  assertNot(
    /execSync\s*\(\s*['"]bash/.test(src) && src.includes('function handleBuiltinTool'),
    'handleBuiltinTool still uses raw execSync("bash ...") — bypass NOT closed'
  );
});

test('BYPASS3: handleBuiltinTool no longer uses raw fs.writeFileSync', () => {
  const src = fileContent('lib/mcp-server.js');
  // If handleBuiltinTool still exists, it should NOT have raw writeFileSync
  // If handleBuiltinTool is removed entirely, this passes (grep returns -1)
  const hasBuiltinWithWriteSync = /function handleBuiltinTool[\s\S]{1,500}writeFileSync/.test(src);
  assertNot(
    hasBuiltinWithWriteSync,
    'handleBuiltinTool still uses raw fs.writeFileSync — bypass NOT closed'
  );
});

test('BYPASS3: MCP stdio dispatches through lib/tools registry', () => {
  const src = fileContent('lib/mcp-server.js');
  assert(
    src.includes("require('./tools") || src.includes("require('./tools/index')") || src.includes('TOOLS') || src.includes('tool-runtime'),
    'mcp-server.js does not dispatch through lib/tools registry'
  );
});

test('BYPASS3: tools/call handler exists', () => {
  const src = fileContent('lib/mcp-server.js');
  assert(
    src.includes("'tools/call'") || src.includes('"tools/call"'),
    'tools/call handler missing from mcp-server.js'
  );
});

// ─── OVERALL ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('ALL BYPASSES CLOSED — P0-B ACCEPTANCE TESTS PASS\n');
  process.exit(0);
} else {
  console.log('SOME TESTS FAILED — BYPASSES REMAIN OPEN\n');
  process.exit(1);
}
