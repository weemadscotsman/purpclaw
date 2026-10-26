'use strict';

/**
 * Idempotent Phase-3 patcher for the live PurpClaw checkout.
 *
 * It deliberately edits only the integration seams required to put the
 * deterministic native-first router into the existing agent loop:
 *   - lib/agent-loop.js
 *   - package.json scripts
 *
 * It does NOT replace the existing agent loop, MCP client, tool registry,
 * orchestrator, state service, event bus, provider router, or memory stack.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AGENT_LOOP = path.join(ROOT, 'lib', 'agent-loop.js');
const PACKAGE = path.join(ROOT, 'package.json');

function fail(msg) {
  throw new Error(`[native-control phase3] ${msg}`);
}

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text; // already patched
  const count = text.split(from).length - 1;
  if (count !== 1) fail(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

function patchAgentLoop() {
  let s = fs.readFileSync(AGENT_LOOP, 'utf8');

  s = replaceOnce(
    s,
    "const TOOLS = require('./tools');\nconst announce = require('./events');",
    "const TOOLS = require('./tools');\nconst CONTROL = require('./control/control-router');\nconst announce = require('./events');",
    'control-router import'
  );

  s = replaceOnce(
    s,
    '- Use MCP tools (especially omnicode) for code search to save tokens.',
    '- Prefer native PurpClaw tools and deterministic control drivers. MCP is fallback only when no healthy native equivalent exists.',
    'system-prompt MCP priority'
  );

  s = replaceOnce(
    s,
    "    '  Search symbols: {\"tool\": \"mcp__omnicode__search_symbols\", \"args\": {\"path\": \".\", \"query\": \"User\"}}',",
    "    '  Search code: {\"tool\": \"code-search\", \"args\": {\"query\": \"User\"}}',",
    'system-prompt native search example'
  );

  const routedBlock = [
    '      const routed = await CONTROL.invokeTool(call.tool, call.args, TOOLS, {',
    "        operationId: 'agent-' + (opts.sessionId || 'session') + '-turn-' + turn + '-' + call.tool,",
    '        goalId: opts.goalId,',
    '        workflowId: opts.workflowId,',
    '        nodeId: opts.nodeId,',
    "        soulId: opts.soulId || 'quill',",
    "        providerId: provider || model || 'default',",
    '      });',
    '      const result = routed.result;',
    '      if (routed.executedTool !== call.tool) {',
    "        yield { type: 'control-route', requestedTool: call.tool, executedTool: routed.executedTool, surface: routed.surface, fallbackUsed: routed.fallbackUsed, operationId: routed.operationId };",
    '      }',
  ].join('\n');

  s = replaceOnce(
    s,
    '      const result = await TOOLS.invoke(call.tool, call.args);',
    routedBlock,
    'tool invocation seam'
  );

  fs.writeFileSync(AGENT_LOOP, s, 'utf8');
  return AGENT_LOOP;
}

function patchPackage() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));
  pkg.scripts ||= {};
  pkg.scripts['test:control'] = 'node --test tests/control-router-native-priority.test.js tests/control-router-agent-integration.test.js';
  pkg.scripts['certify:control-live'] = 'node scripts/certify-control-plane-live.js';
  pkg.scripts['ci:control-live'] = 'npm run test:control && npm run certify:control-live';
  fs.writeFileSync(PACKAGE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return PACKAGE;
}

const touched = [patchAgentLoop(), patchPackage()];
console.log('[native-control phase3] integrated:');
for (const f of touched) console.log(`  - ${path.relative(ROOT, f)}`);
console.log('[native-control phase3] next: npm run ci:control-live');
