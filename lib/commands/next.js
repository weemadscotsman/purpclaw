'use strict';

const path = require('path');

function printNext(report, ctx = {}) {
  const C = ctx.C || {};
  const col = ctx.col || ((_, value) => value);
  const c = (color, value) => col(color, value);
  console.log('');
  console.log(c((C.bold || '') + (C.cyan || ''), 'PURPCLAW NEXT STEP'));
  console.log(`  Phase: ${c(C.green || '', report.phase)}`);
  console.log(`  Complexity: L${report.complexity.level} ${report.complexity.id} (${report.complexity.reason})`);
  console.log('');
  console.log(c(C.gray || '', 'Done:'));
  for (const item of report.done.length ? report.done : ['nothing proven yet']) console.log(`  - ${item}`);
  console.log(c(C.gray || '', 'Missing:'));
  for (const item of report.missing) console.log(`  - ${item}`);
  console.log('');
  if (report.next_workflow) {
    console.log(`Next best action: ${c(C.bold || '', report.next_workflow.name)}`);
    console.log(`Run: ${c(C.cyan || '', report.next_command)}`);
    console.log(`Workflow: ${report.next_workflow.id}`);
    console.log(`Agents: ${(report.next_workflow.agents || []).join(', ')}`);
    console.log(`Outputs: ${(report.next_workflow.outputs || []).join(', ')}`);
  } else {
    console.log(`Next best action: ${c(C.cyan || '', report.next_command)}`);
  }
  console.log('');
}

async function run(args = [], ctx = {}) {
  const PURP_DIR = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const registry = require(path.join(PURP_DIR, 'lib', 'workflow-registry.js'));
  const json = args.includes('--json');
  const text = args.filter(a => !a.startsWith('--')).join(' ');
  const report = registry.nextStep(text);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }
  printNext(report, ctx);
  return report;
}

module.exports = { run };
