'use strict';

const path = require('path');

function printWorkflow(w, ctx = {}) {
  const C = ctx.C || {};
  const col = ctx.col || ((_, value) => value);
  console.log('');
  console.log(col((C.bold || '') + (C.cyan || ''), `${w.id} - ${w.name}`));
  console.log(`  Phase: ${w.phase}`);
  console.log(`  Command: ${w.command}`);
  console.log(`  Inputs: ${(w.requiredInputs || []).join(', ')}`);
  console.log(`  Outputs: ${(w.outputs || []).join(', ')}`);
  console.log(`  Agents: ${(w.agents || []).join(', ')}`);
  console.log(`  Next: ${(w.next || []).join(', ')}`);
}

async function run(args = [], ctx = {}) {
  const PURP_DIR = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const reg = require(path.join(PURP_DIR, 'lib', 'workflow-registry.js'));
  const json = args.includes('--json');
  const id = args.find(a => !a.startsWith('--') && a !== 'list');
  const workflows = id ? [reg.findWorkflow(id)].filter(Boolean) : reg.listWorkflows();
  const report = {
    schema: 'purpclaw.workflow-registry.report.v1',
    count: workflows.length,
    workflows,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }
  if (!workflows.length) {
    console.log(`Workflow not found: ${id}`);
    return report;
  }
  for (const w of workflows) printWorkflow(w, ctx);
  console.log('');
  return report;
}

module.exports = { run };
