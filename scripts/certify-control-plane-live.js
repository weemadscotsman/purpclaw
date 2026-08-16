'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const checks = [];

function check(name, passed, detail = '') {
  checks.push({ name, passed: Boolean(passed), detail });
}

function run(name, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  check(name, r.status === 0, `${r.stdout || ''}\n${r.stderr || ''}`.trim().slice(-6000));
  return r.status === 0;
}

function text(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

check('CONTROL_ROUTER_PRESENT', fs.existsSync(path.join(ROOT, 'lib/control/control-router.js')));
check('AGENT_LOOP_PRESENT', fs.existsSync(path.join(ROOT, 'lib/agent-loop.js')));
check('MCP_CLIENT_PRESERVED', fs.existsSync(path.join(ROOT, 'lib/mcp.js')));

if (fs.existsSync(path.join(ROOT, 'lib/agent-loop.js'))) {
  const src = text('lib/agent-loop.js');
  check('AGENT_LOOP_ROUTED', /CONTROL\.invokeTool\(call\.tool, call\.args, TOOLS/.test(src));
  check('MCP_PROMPT_DEMOTED', /MCP is fallback only when no healthy native equivalent exists/.test(src));
  check('DIRECT_TOOL_BYPASS_REMOVED', !/const result = await TOOLS\.invoke\(call\.tool, call\.args\);/.test(src));
}

run('CONTROL_ROUTER_TESTS', process.execPath, ['--test', 'tests/control-router-native-priority.test.js']);
run('AGENT_INTEGRATION_TESTS', process.execPath, ['--test', 'tests/control-router-agent-integration.test.js']);
run('AGENT_LOOP_SYNTAX', process.execPath, ['--check', 'lib/agent-loop.js']);
run('CONTROL_ROUTER_SYNTAX', process.execPath, ['--check', 'lib/control/control-router.js']);
run('WORKFLOW_REGISTRY_SYNTAX', process.execPath, ['--check', 'lib/workflow-registry.js']);
run('NEXT_COMMAND_SYNTAX', process.execPath, ['--check', 'lib/commands/next.js']);
run('MCP_SYNTAX', process.execPath, ['--check', 'lib/mcp.js']);

const failed = checks.filter(c => !c.passed);
const verdict = {
  schema: 'purpclaw.control-certification.live.v1',
  generatedAt: new Date().toISOString(),
  passed: failed.length === 0,
  checks,
  certification: failed.length === 0 ? 'PURPCLAW_CONTROL_PLANE: CERTIFIED' : 'PURPCLAW_CONTROL_PLANE: NOT_CERTIFIED',
};

const out = path.join(ROOT, 'artifacts', 'control-certification-live.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(verdict, null, 2) + '\n');

for (const c of checks) console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${c.name}`);
console.log(`\n${verdict.certification}`);
console.log(`Evidence: ${path.relative(ROOT, out)}`);

process.exit(failed.length ? 1 : 0);
