#!/usr/bin/env node
'use strict';

/**
 * apps/cli/harness.js — CLI harness runner
 * ========================================
 * Usage: node apps/cli/harness.js --goal "fix the bug in lib/api.js" [--harness codex]
 *
 * Reads task-schema, routes to the correct harness, runs it, prints result.
 */

const path = require('path');
const { route, loadHarness, renderResultLine, availableHarnesses } = require('../../services/router');
const { validateTask } = require('../../packages/task-schema');
const { createResult, pass, partial, block, fail } = require('../../packages/result-schema');

const PURP_DIR = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--goal')    args.goal    = argv[++i];
    if (argv[i] === '--harness') args.harness = argv[++i];
    if (argv[i] === '--repo')   args.repo    = argv[++i];
    if (argv[i] === '--task-id') args.taskId  = argv[++i];
    if (argv[i] === '--help')   args.help    = true;
    if (argv[i] === '--skip-verification') args.skipVerification = true;
    if (argv[i] === '--files') args.files = (args.files || []).concat(argv[++i].split(',').map(f=>f.trim()));
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(`
PURPCLAW Harness CLI
====================
Usage:
  node apps/cli/harness.js --goal "your goal" [--harness codex|claude|hermes|minimax] [--repo /path/to/repo] [--task-id ts_xxx] [--files file1,file2] [--skip-verification] [--files lib/foo.js,bin/bar.js]

Examples:
  node apps/cli/harness.js --goal "fix the null pointer in lib/api.js" --harness codex
  node apps/cli/harness.js --goal "audit the architecture of this project" --harness claude
  node apps/cli/harness.js --goal "generate a Button component for the dashboard" --harness minimax

Auto-detection:
  Omitting --harness auto-detects the best harness from goal keywords.

Available harnesses: ${availableHarnesses().map(h => `${h.name}:${h.available?'✓':'✗'}`).join(' ')}
`);
    process.exit(0);
  }

  if (!args.goal) {
    console.error('ERROR: --goal is required. Run with --help for usage.');
    process.exit(1);
  }

  // Build task object
  const task = {
    taskId:    args.taskId || `ts_${Date.now()}`,
    projectId: null,
    goal:      args.goal,
    repoPath:  args.repo   || process.cwd(),
    preferredHarness: args.harness || 'auto',
    fallbackHarness:  null,
    priority:  3,
    knownFiles:    args.files || [],
    constraints:   [],
    requiredOutputs: [],
    acceptanceCriteria: [],
  };

  // Validate
  try {
    validateTask(task);
  } catch (err) {
    console.error('Task validation failed:', err.message);
    process.exit(1);
  }

  // Route
  const { harness, method, reason } = route(task);
  console.log(`[ROUTER] ${method}: ${reason} -> ${harness}`);

  // Load harness
  const Harness = loadHarness(harness);
  if (!Harness) {
    console.error(`ERROR: Harness '${harness}' not available. Install packages/harness-${harness} or run: pnpm install`);
    process.exit(1);
  }

  // Run
  console.log(`[${harness.toUpperCase()}] Starting...`);
  const start = Date.now();
  let result;
  try {
    // All harness adapters export { run: async(task, opts) }
    // Pass repoRoot as opts.repoRoot for context assembly
    const runOpts = { purpRoot: PURP_DIR, repoRoot: task.repoPath,
                    skipVerification: args.skipVerification || false };
    result = await Harness.run(task, runOpts, [], { skipVerification: args.skipVerification || false });
  } catch (err) {
    const r = createResult(task, harness);
    fail(r, `Harness crashed: ${err.message}`, 'Check harness installation.');
    result = r;
  }
  result.durationMs = Date.now() - start;

  // Print result
  console.log('\n' + renderResultLine(result));
  if (result.errors && result.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of result.errors) {
      console.log(`  [${e.phase}] ${e.message}`);
    }
  }
  if (result.verification && result.verification.length > 0) {
    console.log('\nVerification:');
    for (const v of result.verification) {
      const icon = v.passed ? '✅' : '❌';
      console.log(`  ${icon} ${v.criterion}`);
    }
  }
  console.log(`\nFiles read:    ${result.filesRead.length}`);
  console.log(`Files changed: ${result.filesChanged.length}`);
  console.log(`Commands run:  ${result.commandsRun.length}`);
  console.log(`Duration:       ${result.durationMs}ms`);
  process.exit(result.status === 'passed' ? 0 : 1);
}

main().catch(err => {
  console.error('Unhandled error:', err.message);
  process.exit(1);
});
