'use strict';
/**
 * Smoke test: workflow approval node
 * Tests the 'approval' node type in lib/workflow-manager.js
 */
const WF = require('../lib/workflow-manager');

const spec = {
  name: 'approval-smoke-test',
  entry: 'start',
  nodes: [
    { id: 'start', type: 'set', value: { marker: 'test-run' }, output: 'ctx', next: 'approval-check' },
    {
      id: 'approval-check',
      type: 'approval',
      tool: 'test-tool',
      reason: 'Smoke test approval node — should interrupt and wait for resume',
      output: 'approval_result',
      on_approved: 'approved-step',
      on_denied: 'denied-step',
    },
    { id: 'approved-step', type: 'set', value: { result: 'approved' }, output: 'ctx', next: null },
    { id: 'denied-step', type: 'set', value: { result: 'denied' }, output: 'ctx', next: null },
  ],
};

// Minimal adapter — no-op prompt/tool
const adapter = {
  async prompt(input, node, run) { return { prompt: input }; },
  async tool(tool, args, node, run) { return { tool, args }; },
};

async function main() {
  console.log('=== Workflow Approval Node Smoke Test ===\n');

  // Test 1: approval node fires and interrupts
  console.log('Test 1: approval node interrupts (no approval system)');
  try {
    const run = await WF.run(spec, adapter, { input: { marker: 'smoke-test' } });
    if (run.status === 'interrupted') {
      console.log('  ✅ PASS — workflow interrupted as expected');
      console.log('  Context at interrupt:', JSON.stringify(run.context));
    } else {
      console.log('  ❌ FAIL — expected interrupted, got:', run.status);
      process.exit(1);
    }
  } catch (err) {
    console.log('  ❌ FAIL — threw:', err.message);
    process.exit(1);
  }

  // Test 2: approval node with approved resume
  console.log('\nTest 2: resume with approved=true');
  try {
    const runs = WF.list(5);
    const lastRun = runs[0];
    if (!lastRun) { console.log('  ⚠ no runs found'); process.exit(1); }
    console.log('  Resuming run:', lastRun.run_id);
    const resumed = await WF.resume(lastRun.run_id, adapter, { resumeValue: true });
    if (resumed.status === 'complete') {
      const result = resumed.context?.ctx?.result || resumed.context?.result;
      if (result === 'approved') {
        console.log('  ✅ PASS — approved branch taken, result:', result);
      } else {
        console.log('  ❌ FAIL — status:', resumed.status, 'ctx:', JSON.stringify(resumed.context?.ctx));
        process.exit(1);
      }
    } else {
      console.log('  ❌ FAIL — status:', resumed.status);
      process.exit(1);
    }
  } catch (err) {
    console.log('  ❌ FAIL — threw:', err.message);
    process.exit(1);
  }

  // Test 3: condition branching — use flat keys to avoid reducer collisions
  console.log('\nTest 3: condition branching');
  const condSpec = {
    name: 'condition-test',
    entry: 'start',
    nodes: [
      { id: 'start', type: 'set', value: { flag: true }, next: 'check' },
      { id: 'check', type: 'condition', condition: { path: 'start.flag', op: 'truthy' }, on_true: 'yes', on_false: 'no', next: null },
      { id: 'yes', type: 'set', value: { branch: 'yes' }, output: 'result', next: null },
      { id: 'no', type: 'set', value: { branch: 'no' }, output: 'result', next: null },
    ],
  };
  try {
    const run = await WF.run(condSpec, adapter, {});
    if (run.status === 'complete' && run.context?.result?.branch === 'yes') {
      console.log('  ✅ PASS — condition true → yes branch');
    } else {
      console.log('  ❌ FAIL —', run.status, 'result:', run.context?.result);
      process.exit(1);
    }
  } catch (err) {
    console.log('  ❌ FAIL —', err.message);
    process.exit(1);
  }

  console.log('\n=== All tests passed ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
