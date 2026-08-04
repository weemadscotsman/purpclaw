'use strict';

/**
 * packages/harness-core — Unified 8-Stage Harness Engine
 * =================================================
 * The single entry point for all harness modes.
 * Routes to the correct harness, runs all 8 stages, returns a
 * canonical PURPCLAW_RESULT every time.
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §0 + §2
 *
 * 8-stage lifecycle:
 *   1. Intake       — normalise raw input to PurpClawTask
 *   2. Router       — select harness mode (codex|claude|hermes|minimax)
 *   3. Context      — load context spine (files, truth docs, memory, git)
 *   4. Planning     — decompose into subtask plan
 *   5. Execution    — run the selected harness's work loop
 *   6. Verification — run verification-core gates
 *   7. Packaging    — build PURPCLAW_RESULT
 *   8. Audit        — write memory-audit record
 *
 * Usage:
 *   const { run } = require('./packages/harness-core');
 *   const result = await run(task, opts);
 */

const { validateTask, normaliseTask } = require('../../packages/task-schema');
const {
  createResult, pass, partial, block, fail,
  addFileRead, addFileChanged, addCommand,
  addArtifact, addVerification, addError, validateResult,
} = require('../../packages/result-schema');
const { assembleContext, renderForLLM } = require('../../packages/context-spine');
const { runGates } = require('../../packages/verification-core');
const {
  startTask, logStep, logFileRead, logFileChanged,
  logCommand, logVerification, logError, finishTask,
} = require('../../packages/memory-audit');

// Lazy-load specific harness implementations
function getHarness(harnessName) {
  const map = {
    ['codex']:   '../../packages/harness-codex',
    ['claude']:  '../../packages/harness-claude',
    ['hermes']:  '../../packages/harness-hermes',
    ['minimax']: '../../packages/harness-minimax',
  };
  const req = map[harnessName];
  if (!req) return null;
  try { return require(req); } catch { return null; }
}

// ── Stage 1: Intake ──────────────────────────────────────────────────────────

/**
 * Validate + normalise a raw task input.
 * @param {string|Object} raw
 * @returns {{ ok: boolean, task: PurpClawTask|null, errors: string[] }}
 */
function intake(raw) {
  try {
    const task = normaliseTask(raw);
    return { ok: true, errors: [], task };
  } catch (err) {
    return { ok: false, errors: [err.message], task: null };
  }
}

// ── Stage 2: Route ───────────────────────────────────────────────────────────

/**
 * Select harness mode. Auto-detects from task if set to 'auto'.
 * Falls back to 'codex' if preferred harness unavailable.
 * @param {Object} task
 * @returns {string} harness name
 */
function route(task) {
  const preferred = task.preferredHarness || 'auto';
  if (preferred !== 'auto') {
    const h = getHarness(preferred);
    return h ? preferred : 'codex';
  }

  // Auto-detect from goal keywords
  const mode = selectHarnessMode(task.goal, task.routeIntent);
  const h = getHarness(mode);
  return h ? mode : 'codex';
}

function selectHarnessMode(goal, routeIntent) {
  const intentMap = {
    build: 'codex',
    fix:   'codex',
    patch: 'codex',
    test:  'codex',
    design:    'claude',
    architecture: 'claude',
    plan:  'claude',
    research:  'claude',
    audit: 'claude',
    orchestrate: 'hermes',
    deploy: 'hermes',
    automate: 'hermes',
    workflow:  'hermes',
    generate:  'minimax',
    'build UI': 'minimax',
    component: 'minimax',
    transform: 'minimax',
  };
  if (routeIntent && intentMap[routeIntent]) return intentMap[routeIntent];

  const goalLower = (goal || '').toLowerCase();
  if (/(fix|patch|diff|test|build|wire|component)/.test(goalLower)) return 'codex';
  if (/(analyse|analyze|architecture|design|plan|research|audit)/.test(goalLower)) return 'claude';
  if (/(deploy|orchestrate|automate|workflow|batch)/.test(goalLower)) return 'hermes';
  if (/(generate|create UI|build page|component|style|transform)/.test(goalLower)) return 'minimax';
  return 'codex'; // default: codex is the baseline
}

// ── Stage 3: Context ─────────────────────────────────────────────────────────

/**
 * Load context spine for a task.
 * @param {Object} task
 * @returns {{ items: Object[], totalChars: number, llmString: string }}
 */
function loadContext(task) {
  const { items, totalChars } = assembleContext(task);
  const llmString = renderForLLM(items);
  return { items, totalChars, llmString };
}

// ── Planning stub ─────────────────────────────────────────────────────────────
// TODO: wire to LLM planner (decomposeGoal in engine.js)
// For now, one step per known file + one final verification step.

/**
 * Build a simple linear plan from task + context.
 * @param {Object} task
 * @param {Object} ctx
 * @returns {Object[]}  steps
 */
function plan(task, ctx) {
  const steps = [];

  // One step per known file (first-pass read)
  const knownFiles = task.knownFiles || [];
  for (const f of knownFiles) {
    steps.push({
      stepId: `read_${steps.length + 1}`,
      type: 'read',
      target: f,
      description: `Read file: ${f}`,
      acceptanceCriterion: `File ${f} loaded into context`,
    });
  }

  // Execution step
  steps.push({
    stepId: `execute_${steps.length + 1}`,
    type: 'execute',
    target: task.repoPath || process.cwd(),
    description: `Execute: ${task.goal}`,
    acceptanceCriterion: task.requiredOutputs
      ? `Outputs exist: ${(task.requiredOutputs || []).join(', ')}`
      : 'Task goal achieved',
  });

  return steps;
}

// ── Main run function ────────────────────────────────────────────────────────

/**
 * Run the full 8-stage harness.
 *
 * @param {string|Object} rawTask  — raw goal string or task object
 * @param {Object} [opts]
 * @param {boolean} [opts.skipVerification=false]
 * @param {string[]} [opts.verificationGates]  — override gates
 * @returns {Promise<Object>}  PURPCLAW_RESULT
 */
async function run(rawTask, opts = {}) {
  const startedAt = Date.now();
  const skipVerification = opts.skipVerification || false;
  const verificationGates = opts.verificationGates || ['lint', 'build'];

  // ── Stage 1: Intake ───────────────────────────────────────────────────────
  const intakeResult = intake(rawTask);
  if (!intakeResult.ok) {
    const r = createResult({ taskId: 'unknown', goal: String(rawTask) }, 'codex');
    fail(r, `Intake failed: ${(intakeResult.errors || []).join('; ')}`);
    addError(r, { phase: 'intake', message: (intakeResult.errors || []).join('; ') });
    return r;
  }
  const task = intakeResult.task;

  // ── Stage 2: Route ────────────────────────────────────────────────────────
  const harnessName = route(task);

  // Start audit record
  let auditRecord = null;
  try {
    auditRecord = startTask(task, harnessName);
  } catch (err) {
  }

  // Create result shell
  const result = createResult(task, harnessName);

  // ── Stage 3: Context ─────────────────────────────────────────────────────
  let contextBundle = { items: [], totalChars: 0, llmString: '' };
  try {
    contextBundle = loadContext(task);
    for (const item of contextBundle.items) {
      if (item.path) logFileRead(auditRecord?.id, item.path);
    }
  } catch (err) {
    logError(auditRecord?.id, 'context', err.message, err.stack);
    addError(result, { phase: 'context', message: err.message });
  }

  // ── Stage 4: Planning ────────────────────────────────────────────────────
  const steps = plan(task, contextBundle);

  // ── Stage 5: Execution ────────────────────────────────────────────────────
  const harness = getHarness(harnessName);
  let executionOutput = '';

  try {
    if (harness && harness.run) {
      // Delegate to specific harness implementation
      const execResult = await harness.run(task, contextBundle, steps, { auditRecord, skipVerification });
      executionOutput = execResult.output || execResult.summary || String(execResult);

      // Merge files read/changed from harness
      if (execResult.filesRead) {
        for (const f of execResult.filesRead) {
          addFileRead(result, f);
          if (auditRecord) logFileRead(auditRecord.id, f);
        }
      }
      if (execResult.filesChanged) {
        for (const f of execResult.filesChanged) {
          addFileChanged(result, f);
          if (auditRecord) logFileChanged(auditRecord.id, f);
        }
      }
      if (execResult.commandsRun) {
        for (const c of execResult.commandsRun) {
          addCommand(result, c);
          if (auditRecord) logCommand(auditRecord.id, c);
        }
      }
      if (execResult.errors) {
        for (const e of execResult.errors) {
          addError(result, e);
          logError(auditRecord?.id, e.phase || 'execution', e.message, e.stack);
        }
      }

      logStep(auditRecord?.id, { stepId: 'execute', name: 'execution', status: 'ok', output: executionOutput });
    } else {
      // No specific harness found — run codex fallback inline
      executionOutput = await runCodexFallback(task, contextBundle, steps, result, auditRecord);
    }
  } catch (err) {
    logError(auditRecord?.id, 'execution', err.message, err.stack);
    addError(result, { phase: 'execution', message: err.message, stack: err.stack });
    logStep(auditRecord?.id, { stepId: 'execute', name: 'execution', status: 'error', error: err.message });
  }

  result.summary = executionOutput || result.summary || 'Execution completed.';

  // ── Stage 6: Verification ────────────────────────────────────────────────
  if (!skipVerification) {
    try {
      const gates = task.acceptanceCriteria?.length > 0
        ? [...verificationGates, 'acceptance-criteria']
        : verificationGates;
      const gateResult = runGates(task.repoPath || process.cwd(), gates, {
        acceptanceCriteria: task.acceptanceCriteria || [],
        artifacts: task.requiredOutputs || [],
      });

      for (const gr of gateResult.results || []) {
        addVerification(result, {
          criterion: gr.gate,
          passed: gr.ok,
          evidence: gr.output || null,
        });
        if (auditRecord) logVerification(auditRecord.id, { criterion: gr.gate, passed: gr.ok, evidence: gr.output });
      }

      if (!gateResult.ok) {
        partial(result, `Verification gates partially failed. ${gateResult.results.filter(g => !g.ok).map(g => g.gate).join(', ')}`);
      }
    } catch (err) {
      addError(result, { phase: 'verification', message: err.message });
    }
  }

  // ── Stage 7: Packaging ──────────────────────────────────────────────────
  result.durationMs = Date.now() - startedAt;

  // Determine final status
  if (result.errors.length === 0 && (result.verification.every(v => v.passed))) {
    pass(result, result.summary || 'Task completed. All verification gates passed.');
  } else if (result.verification.some(v => v.passed)) {
    partial(result, result.summary || 'Task partially completed.');
  } else {
    // Keep blocked/failed status set by stage 5
    if (result.status === 'blocked') {
      result.nextAction = result.nextAction || 'Resolve blocker and retry.';
    }
  }

  if (!result.nextAction) {
    result.nextAction = suggestNextAction(task, result);
  }

  try {
    validateResult(result);
  } catch (err) {
    addError(result, { phase: 'packaging', message: `Result validation failed: ${err.message}` });
  }

  // ── Stage 8: Audit ──────────────────────────────────────────────────────
  if (auditRecord) {
    try {
      finishTask(auditRecord.id, result.status, result.summary);
    } catch (err) {
      // non-fatal
    }
  }

  return result;
}

// ── Codex fallback (when specific harness unavailable) ────────────────────────

async function runCodexFallback(task, ctx, steps, result, auditRecord) {
  // Read all known files
  for (const f of (task.knownFiles || [])) {
    try {
      const fullPath = path.join(task.repoPath || process.cwd(), f);
      const content = fs.readFileSync(fullPath, 'utf8');
      addFileRead(result, fullPath);
      logFileRead(auditRecord?.id, fullPath);
    } catch {}
  }

  // Run verification commands
  const projectRoot = task.repoPath || process.cwd();
  const pkgPath = path.join(projectRoot, 'package.json');
  let hasPkg = false;
  try { hasPkg = fs.existsSync(pkgPath); } catch {}

  if (hasPkg) {
    for (const [name, script] of Object.entries({
      lint:  'lint',
      build: 'build',
      test:  'test',
    })) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts?.[script]) {
          addCommand(result, `npm run ${script}`);
          logCommand(auditRecord?.id, `npm run ${script}`);
          const out = require('child_process').execSync(`npm run ${script}`, {
            cwd: projectRoot, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
          });
          addVerification(result, { criterion: name, passed: true, evidence: 'Command succeeded' });
        }
      } catch (err) {
        addVerification(result, { criterion: name, passed: false, evidence: (err.stdout || err.message).slice(-500) });
      }
    }
  }

  return `Codex fallback executed. Files read: ${result.filesRead.length}, commands: ${result.commandsRun.length}.`;
}

function suggestNextAction(task, result) {
  if (result.status === 'passed') return 'Task complete. No next action required.';
  if (result.status === 'partial') return 'Review partial results and retry with adjusted scope.';
  if (result.errors.length > 0) return `Errors encountered. Fix: ${result.errors[0].message}`;
  return 'Review verification failures and address them before retry.';
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  run,
  intake,
  route,
  loadContext,
  plan,
  // Expose sub-packages for direct use
  taskSchema:  require('../../packages/task-schema'),
  resultSchema: require('../../packages/result-schema'),
  contextSpine: require('../../packages/context-spine'),
  verificationCore: require('../../packages/verification-core'),
  memoryAudit:  require('../../packages/memory-audit'),
};
