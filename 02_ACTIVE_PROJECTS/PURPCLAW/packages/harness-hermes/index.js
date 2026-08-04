'use strict';

/**
 * packages/harness-hermes — Hermes Parity Harness
 * ==========================================
 * Best at: tool orchestration, multi-step execution, UI wiring,
 * asset wrangling, retries, artifact production.
 *
 * Hermes output contract:
 *   { tools used, sequence run, outputs generated,
 *     what succeeded, what failed, final artifact path }
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §5
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  createResult, addFileRead, addFileChanged,
  addCommand, addArtifact, addVerification, addError,
} = require('../../packages/result-schema');

// ── Tool registry ─────────────────────────────────────────────────────────────

/**
 * Map of available tools with their exec patterns.
 * Extensible: add more tools here as they become available.
 */
const TOOL_REGISTRY = {
  shell: {
    description: 'Run shell command',
    execute(cmd, cwd) {
      try {
        const out = execSync(cmd, { cwd: cwd || process.cwd(), encoding: 'utf8', timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
        return { ok: true, output: out };
      } catch (err) {
        return { ok: false, output: (err.stdout || '') + '\n' + (err.stderr || ''), error: err.message };
      }
    },
  },
  file_read: {
    description: 'Read a file',
    execute(absPath) {
      try {
        return { ok: true, output: fs.readFileSync(absPath, 'utf8') };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },
  file_write: {
    description: 'Write a file',
    execute({ path: absPath, content }) {
      try {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
        return { ok: true, output: `Written ${absPath}` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },
  file_copy: {
    description: 'Copy a file',
    execute({ src, dst }) {
      try {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        return { ok: true, output: `Copied ${src} → ${dst}` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },
  file_delete: {
    description: 'Delete a file',
    execute(absPath) {
      try {
        fs.unlinkSync(absPath);
        return { ok: true, output: `Deleted ${absPath}` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },
  npm_install: {
    description: 'Run npm install',
    execute(cwd) {
      try {
        const out = execSync('npm install', { cwd, encoding: 'utf8', timeout: 180_000, maxBuffer: 20 * 1024 * 1024 });
        return { ok: true, output: out };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },
  git: {
    description: 'Run git command',
    execute(args, cwd) {
      try {
        const out = execSync(`git ${args}`, { cwd: cwd || process.cwd(), encoding: 'utf8', timeout: 30_000 });
        return { ok: true, output: out };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },
  node: {
    description: 'Run node script',
    execute(scriptPath, cwd) {
      try {
        const out = execSync(`node ${scriptPath}`, { cwd: cwd || process.cwd(), encoding: 'utf8', timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
        return { ok: true, output: out };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },
};

// ── Tool sequence planner ─────────────────────────────────────────────────────

/**
 * Build an ordered tool plan from a task goal.
 * @param {string} goal
 * @returns {{ tool: string, args: any, description: string }[]}
 */
function planToolSequence(goal) {
  const goalLower = goal.toLowerCase();
  const plan = [];

  if (/(install|npm|yarn|pnpm)/.test(goalLower)) {
    plan.push({ tool: 'shell', args: ['npm install'], description: 'Install dependencies' });
  }
  if (/(build|compile|bundle)/.test(goalLower)) {
    plan.push({ tool: 'shell', args: ['npm run build'], description: 'Run build' });
  }
  if (/(test|jest|vitest)/.test(goalLower)) {
    plan.push({ tool: 'shell', args: ['npm test'], description: 'Run tests' });
  }
  if (/(lint|eslint|prettier)/.test(goalLower)) {
    plan.push({ tool: 'shell', args: ['npm run lint'], description: 'Run linter' });
  }
  if (/(commit|git push)/.test(goalLower)) {
    plan.push({ tool: 'git', args: ['status'], description: 'Git status' });
    plan.push({ tool: 'git', args: ['add -A'], description: 'Stage all changes' });
  }
  if (/(deploy|start|serve)/.test(goalLower)) {
    plan.push({ tool: 'shell', args: ['npm start'], description: 'Start server' });
  }

  // Default: read package.json and run build
  if (plan.length === 0) {
    plan.push({ tool: 'shell', args: ['npm run build'], description: 'Run build (default)' });
  }

  return plan;
}

// ── Step state machine ────────────────────────────────────────────────────────

const STEP_STATUS = { PENDING: 'pending', RUNNING: 'running', OK: 'ok', ERROR: 'error', SKIPPED: 'skipped' };

function runStep(step, state, result) {
  const { tool, args, description, maxRetries = 2 } = step;
  const toolDef = TOOL_REGISTRY[tool];

  if (!toolDef) {
    state.steps.push({
      stepId: state.steps.length + 1,
      tool, args, description,
      status: STEP_STATUS.ERROR,
      error: `Unknown tool: ${tool}`,
      attempts: 0,
    });
    return false;
  }

  let attempt = 0;
  let lastResult = null;

  while (attempt <= maxRetries) {
    attempt++;
    state.steps.push({
      stepId: state.steps.length + 1,
      tool, args, description,
      status: STEP_STATUS.RUNNING,
      attempt,
    });

    try {
      const execArgs = Array.isArray(args) ? args : [args];
      lastResult = toolDef.execute(...execArgs, state.cwd);

      if (lastResult.ok) {
        state.steps[state.steps.length - 1].status = STEP_STATUS.OK;
        state.steps[state.steps.length - 1].output = (lastResult.output || '').slice(0, 2000);
        addCommand(result, `${tool} ${execArgs.join(' ')}`);
        addVerification(result, {
          criterion: description,
          passed: true,
          evidence: (lastResult.output || 'ok').slice(0, 300),
        });
        return true;
      } else {
        state.steps[state.steps.length - 1].output = (lastResult.output || '').slice(0, 2000);
        state.steps[state.steps.length - 1].error = lastResult.error;
        addVerification(result, {
          criterion: description,
          passed: false,
          evidence: lastResult.error || lastResult.output?.slice(-300) || 'failed',
        });
        if (attempt > maxRetries) {
          state.steps[state.steps.length - 1].status = STEP_STATUS.ERROR;
          return false;
        }
        // retry
      }
    } catch (err) {
      state.steps[state.steps.length - 1].status = STEP_STATUS.ERROR;
      state.steps[state.steps.length - 1].error = err.message;
      if (attempt > maxRetries) return false;
    }
  }
  return false;
}

// ── Artifact builder ─────────────────────────────────────────────────────────

function buildArtifactManifest(state, result) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    cwd: state.cwd,
    steps: state.steps.map(s => ({
      tool:    s.tool,
      args:    s.args,
      status:  s.status,
      output:  s.output?.slice(0, 500) || null,
      error:   s.error || null,
      attempt: s.attempt,
    })),
    summary: {
      total:    state.steps.length,
      ok:       state.steps.filter(s => s.status === STEP_STATUS.OK).length,
      errors:   state.steps.filter(s => s.status === STEP_STATUS.ERROR).length,
      skipped:  state.steps.filter(s => s.status === STEP_STATUS.SKIPPED).length,
    },
  };

  const artifactPath = path.join(state.cwd, '.harness-audit', 'hermes-run.json');
  try {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify(manifest, null, 2), 'utf8');
    addArtifact(result, { path: artifactPath, checksum: null, verified: true });
  } catch (err) {
    addError(result, { phase: 'artifact', message: `Could not write manifest: ${err.message}` });
  }

  return manifest;
}

// ── Main run ─────────────────────────────────────────────────────────────────

/**
 * Execute a Hermes orchestration task.
 * @param {Object} task    — PurpClawTask
 * @param {Object} ctx     — context bundle
 * @param {Object[]} steps — plan steps
 * @param {Object} [meta]  — { auditRecord }
 * @returns {Promise<Object>} PURPCLAW_RESULT
 */
async function run(task, ctx, steps, meta) {
  const result = createResult(task, 'hermes');
  const projectRoot = task.repoPath || process.cwd();
  const startedAt = Date.now();

  const state = {
    cwd: projectRoot,
    steps: [],
    toolsUsed: new Set(),
  };

  try {
    // Build tool sequence from goal
    const toolPlan = planToolSequence(task.goal);

    // Run each step in sequence
    let allOk = true;
    for (const step of toolPlan) {
      state.toolsUsed.add(step.tool);
      const ok = runStep(step, state, result);
      if (!ok) {
        allOk = false;
        // Hermes does NOT skip failed steps — halt on first error
        break;
      }
    }

    // Build artifact manifest
    const manifest = buildArtifactManifest(state, result);

    result.summary = [
      `Hermes completed: ${state.steps.length} steps,`,
      `${manifest.summary.ok} ok, ${manifest.summary.errors} errors,`,
      `tools used: ${[...state.toolsUsed].join(', ')}.`,
      allOk ? 'All steps succeeded.' : 'Pipeline halted on first error.',
    ].join(' ');

  } catch (err) {
    addError(result, { phase: 'hermes', message: err.message, stack: err.stack });
    result.summary = `Hermes failed: ${err.message}`;
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

module.exports = { run, TOOL_REGISTRY, planToolSequence };
