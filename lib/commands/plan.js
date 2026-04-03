'use strict';

/**
 * purpclaw plan — plan-then-act execution mode
 * ═════════════════════════════════════════════
 * Decomposes a goal into discrete steps via LLM, presents for operator
 * approval, then executes sequentially with checkpointing.
 *
 * Usage:
 *   purpclaw plan "<goal>"                ← generate plan + execute
 *   purpclaw plan --dry-run "<goal>"      ← generate plan, don't execute
 *   purpclaw plan --resume                ← resume last checkpoint
 *   purpclaw plan --list                  ← list past plans
 *   purpclaw plan help                    ← show usage
 */

const fs       = require('fs');
const path     = require('path');
const http     = require('http');
const readline = require('readline');

// ── Load .env manually (in case CLI caller didn't pre-load) ──────────────────

function loadEnv(PURP_DIR) {
  try {
    const envPath = path.join(PURP_DIR, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.substring(0, eq).trim();
      const v = line.substring(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch {}
}

// ── Checkpoint directory ─────────────────────────────────────────────────────

function checkpointDir(PURP_DIR) {
  const dir = path.join(PURP_DIR, 'agent_work', 'plan_checkpoints');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveCheckpoint(PURP_DIR, checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  const dir  = checkpointDir(PURP_DIR);
  const file = path.join(dir, `${checkpoint.id}.json`);
  fs.writeFileSync(file, JSON.stringify(checkpoint, null, 2));
  return file;
}

function loadCheckpoint(PURP_DIR, id) {
  const file = path.join(checkpointDir(PURP_DIR), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function listCheckpoints(PURP_DIR) {
  const dir = checkpointDir(PURP_DIR);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  } catch { return []; }
}

function latestCheckpoint(PURP_DIR) {
  const all = listCheckpoints(PURP_DIR);
  return all.length ? all[0] : null;
}

// ── System prompt for plan generation ────────────────────────────────────────

function buildPlanSystemPrompt() {
  return [
    'You are the PURPCLAW planning engine. Your job is to decompose a user goal into a concrete, ordered list of execution steps.',
    '',
    'The PURPCLAW system can:',
    '  - Create files (action: "create")',
    '  - Edit existing files (action: "edit")',
    '  - Run shell commands or CLI commands (action: "run")',
    '  - Run tests or smoke checks (action: "test")',
    '',
    'Respond with ONLY a JSON array of step objects. No prose before or after.',
    'Each step object must have these fields:',
    '  { "id": <number>, "action": "edit"|"create"|"run"|"test", "target": "<file or resource>", "description": "<what this step does>", "command": "<shell command if action is run or test>" }',
    '',
    'The "command" field is required for "run" and "test" actions. For "edit" and "create" actions, omit "command" and describe the change in "description".',
    '',
    'Rules:',
    '  - Keep steps atomic — one logical change per step',
    '  - Order steps by dependency (create before edit, edit before test)',
    '  - Include a verification/test step at the end when possible',
    '  - Use realistic file paths relative to the project root',
    '  - Keep descriptions concise (one sentence)',
    '  - Maximum 20 steps for any plan',
    '  - Output valid JSON only — no markdown fences, no commentary',
  ].join('\n');
}

// ── Parse LLM response into steps array ──────────────────────────────────────

function parseSteps(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Strip markdown fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Strip <think>...</think> blocks
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();

  // Try to extract JSON array from response
  const arrStart = cleaned.indexOf('[');
  const arrEnd   = cleaned.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    cleaned = cleaned.substring(arrStart, arrEnd + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;

    // Validate and normalize each step
    return parsed.map((step, i) => ({
      id:          step.id || (i + 1),
      action:      ['edit', 'create', 'run', 'test'].includes(step.action) ? step.action : 'run',
      target:      String(step.target || ''),
      description: String(step.description || step.desc || 'No description'),
      command:     step.command ? String(step.command) : undefined,
    }));
  } catch {
    return null;
  }
}

// ── Action icons and colors ──────────────────────────────────────────────────

const ACTION_STYLE = {
  create: { icon: '📄', label: 'CREATE' },
  edit:   { icon: '✏️',  label: 'EDIT  ' },
  run:    { icon: '⚡', label: 'RUN   ' },
  test:   { icon: '🧪', label: 'TEST  ' },
};

// ── Pretty-print a plan ──────────────────────────────────────────────────────

function renderPlan(steps, C, col) {
  const total = steps.length;
  const W     = 64;
  const hr    = '─'.repeat(W);

  console.log('');
  console.log(col(C.cyan, `  ┌${hr}┐`));
  console.log(col(C.cyan, `  │`) + col(C.bold || C.white, `  📋 EXECUTION PLAN (${total} step${total !== 1 ? 's' : ''})`.padEnd(W)) + col(C.cyan, `│`));
  console.log(col(C.cyan, `  ├${hr}┤`));

  for (const step of steps) {
    const style = ACTION_STYLE[step.action] || ACTION_STYLE.run;
    const prefix = `  ${style.icon} [${String(step.id).padStart(2)}] ${style.label}`;
    const desc   = step.description.length > 46
      ? step.description.substring(0, 43) + '...'
      : step.description;

    console.log(col(C.cyan, `  │`) + `${prefix} ${desc}`.padEnd(W) + col(C.cyan, `│`));

    if (step.target) {
      const tgt = `       → ${step.target}`;
      console.log(col(C.cyan, `  │`) + col(C.gray, tgt.padEnd(W)) + col(C.cyan, `│`));
    }
    if (step.command) {
      const cmd = `       $ ${step.command.length > 50 ? step.command.substring(0, 47) + '...' : step.command}`;
      console.log(col(C.cyan, `  │`) + col(C.gray, cmd.padEnd(W)) + col(C.cyan, `│`));
    }
  }

  console.log(col(C.cyan, `  └${hr}┘`));
  console.log('');
}

// ── Operator gate — ask for approval ─────────────────────────────────────────

function askApproval(isTTY) {
  return new Promise(resolve => {
    if (!isTTY) {
      // Non-interactive: default to no
      resolve(false);
      return;
    }

    const rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.question('  Execute this plan? [y/N] ', answer => {
      rl.close();
      const a = (answer || '').trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
}

// ── Execute a single step via the orchestrator ───────────────────────────────

function executeStep(step, PORTS) {
  return new Promise((resolve, reject) => {
    const orchPort = (PORTS && PORTS.orchestrator) || 7784;

    // Build the payload depending on action type
    let payload;
    if (step.action === 'run' || step.action === 'test') {
      payload = {
        command:     step.command || `echo "Step ${step.id}: ${step.description}"`,
        description: step.description,
        source:      'purpclaw-plan',
      };
    } else {
      // edit / create — describe the task for the orchestrator agent
      payload = {
        command:     `${step.action} file: ${step.target} — ${step.description}`,
        description: step.description,
        source:      'purpclaw-plan',
      };
    }

    const body = JSON.stringify(payload);

    const req = http.request({
      hostname: '127.0.0.1',
      port:     orchPort,
      path:     '/api/orchestrate',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length':  Buffer.byteLength(body),
      },
      timeout: 120000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ ok: true, raw: data }); }
        } else {
          reject(new Error(`Orchestrator returned HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', err => reject(new Error(`Orchestrator unreachable: ${err.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Orchestrator request timed out (120s)')); });
    req.write(body);
    req.end();
  });
}

// ── Generate a plan via the LLM ──────────────────────────────────────────────

async function generatePlan(goal, PURP_DIR, C, col, spinner) {
  const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider.js'));

  const messages = [
    { role: 'system',  content: buildPlanSystemPrompt() },
    { role: 'user',    content: `Goal: ${goal}` },
  ];

  if (spinner) spinner.start('Generating plan...');

  try {
    const resp = await llm.chat(messages, { stream: false, temperature: 0.4, maxTokens: 4096 });
    if (spinner) spinner.stop();

    const content = typeof resp === 'string' ? resp : (resp.content || '');
    const steps   = parseSteps(content);

    if (!steps || steps.length === 0) {
      console.log(col(C.red, '  ✗ Failed to parse a valid plan from LLM response.'));
      if (content) {
        console.log(col(C.gray, `  Raw response (first 300 chars):`));
        console.log(col(C.gray, `  ${content.substring(0, 300)}`));
      }
      return null;
    }

    return steps;
  } catch (err) {
    if (spinner) spinner.stop();
    console.log(col(C.red, `  ✗ LLM error: ${err.message}`));
    return null;
  }
}

// ── Execute a full plan with checkpointing ───────────────────────────────────

async function executePlan(checkpoint, PURP_DIR, ctx) {
  const { C, col, PORTS, spinner } = ctx;
  const steps = checkpoint.steps;
  const total = steps.length;
  let   current = checkpoint.currentStep || 0;

  console.log('');
  console.log(col(C.bold || C.white, `  ▶ Executing plan: ${checkpoint.goal}`));
  console.log(col(C.gray, `  ${total} steps · checkpoint ${checkpoint.id}`));
  console.log('');

  for (let i = current; i < total; i++) {
    const step = steps[i];
    const style = ACTION_STYLE[step.action] || ACTION_STYLE.run;
    const prefix = `  [${i + 1}/${total}] ${style.icon}`;

    process.stdout.write(`${prefix} ${step.description}...`);

    // Update checkpoint before execution (pre-snapshot)
    checkpoint.currentStep = i;
    checkpoint.status = 'in-progress';
    saveCheckpoint(PURP_DIR, checkpoint);

    try {
      const result = await executeStep(step, PORTS);

      // Mark step success
      step.status  = 'completed';
      step.result  = typeof result === 'string' ? result : (result?.message || result?.status || 'ok');
      step.completedAt = new Date().toISOString();

      console.log(col(C.green, ' ✓'));

      // Show brief result if available
      if (result?.workflowId) {
        console.log(col(C.gray, `       workflow: ${result.workflowId}`));
      }
    } catch (err) {
      step.status = 'failed';
      step.error  = err.message;

      console.log(col(C.red, ' ✗'));
      console.log(col(C.red, `       ${err.message}`));

      // Save checkpoint at failure point for resumption
      checkpoint.status      = 'failed';
      checkpoint.failedStep  = i;
      checkpoint.currentStep = i;
      saveCheckpoint(PURP_DIR, checkpoint);

      console.log('');
      console.log(col(C.yellow, `  ⚠ Plan halted at step ${i + 1}/${total}`));
      console.log(col(C.gray,   `  Resume with: purpclaw plan --resume`));
      console.log('');
      return false;
    }

    // Save progress after each successful step
    checkpoint.currentStep = i + 1;
    saveCheckpoint(PURP_DIR, checkpoint);
  }

  // All steps completed
  checkpoint.status      = 'completed';
  checkpoint.completedAt = new Date().toISOString();
  saveCheckpoint(PURP_DIR, checkpoint);

  console.log('');
  console.log(col(C.green, `  ✓ Plan completed successfully (${total} steps)`));
  console.log(col(C.gray,  `  Checkpoint: ${checkpoint.id}`));
  console.log('');
  return true;
}

// ── Subcommand: --list ───────────────────────────────────────────────────────

function showList(PURP_DIR, C, col) {
  const plans = listCheckpoints(PURP_DIR);

  if (plans.length === 0) {
    console.log(col(C.gray, '\n  No plan checkpoints found.\n'));
    return;
  }

  const STATUS_ICON = {
    'completed':   '✓',
    'failed':      '✗',
    'in-progress': '●',
  };

  console.log('');
  console.log(col(C.bold || C.white, '  📋 PLAN HISTORY'));
  console.log(col(C.gray, '  ' + '─'.repeat(60)));

  for (const p of plans.slice(0, 20)) {
    const icon   = STATUS_ICON[p.status] || '?';
    const sColor = p.status === 'completed' ? C.green : p.status === 'failed' ? C.red : C.yellow;
    const date   = (p.startedAt || '').substring(0, 19).replace('T', ' ');
    const goal   = (p.goal || '').length > 40 ? p.goal.substring(0, 37) + '...' : (p.goal || '');
    const steps  = p.steps ? `${p.currentStep || 0}/${p.steps.length}` : '?';

    console.log(`  ${col(sColor, icon)} ${col(C.gray, date)}  ${goal}  ${col(C.gray, `[${steps}]`)}`);
  }

  console.log('');
}

// ── Subcommand: help ─────────────────────────────────────────────────────────

function showHelp(C, col) {
  console.log(`
${col(C.bold || C.white, '  📋 PURPCLAW PLAN')} ${col(C.gray, '— plan-then-act execution')}

${col(C.cyan, '  USAGE')}
    purpclaw plan "<goal>"               Generate + execute a plan
    purpclaw plan --dry-run "<goal>"     Generate plan only (no execution)
    purpclaw plan --resume               Resume the last failed/in-progress plan
    purpclaw plan --resume <id>          Resume a specific checkpoint
    purpclaw plan --list                 List past plan checkpoints
    purpclaw plan help                   Show this help

${col(C.cyan, '  EXAMPLES')}
    purpclaw plan "add JWT auth to the API"
    purpclaw plan --dry-run "refactor the agent tower"
    purpclaw plan "create unit tests for llm-provider"

${col(C.cyan, '  HOW IT WORKS')}
    1. Your goal is sent to the LLM to decompose into steps
    2. The plan is displayed for operator approval (y/N)
    3. Steps execute sequentially via the orchestrator
    4. Progress is checkpointed after each step
    5. Failed plans can be resumed from the failure point

${col(C.cyan, '  STEP TYPES')}
    📄 create   Create a new file
    ✏️  edit     Modify an existing file
    ⚡ run      Execute a shell command
    🧪 test     Run a test or verification
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run(args, ctx) {
  const { C, col, PURP_DIR, isTTY, spinner, PORTS } = ctx;

  // Ensure .env is loaded
  loadEnv(PURP_DIR);

  // ── Parse arguments ─────────────────────────────────────────────────────────
  const flags      = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--resume' || a === '-r') {
      flags.resume = true;
      // Check if next arg is a checkpoint ID (not a flag)
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        flags.resumeId = args[++i];
      }
      continue;
    }
    if (a === '--list' || a === '-l')    { flags.list = true; continue; }
    if (a === '--dry-run' || a === '-d') { flags.dryRun = true; continue; }
    if (a === 'help' || a === '--help' || a === '-h') { flags.help = true; continue; }
    positional.push(a);
  }

  // ── help ────────────────────────────────────────────────────────────────────
  if (flags.help) {
    showHelp(C, col);
    return;
  }

  // ── --list ──────────────────────────────────────────────────────────────────
  if (flags.list) {
    showList(PURP_DIR, C, col);
    return;
  }

  // ── --resume ────────────────────────────────────────────────────────────────
  if (flags.resume) {
    let checkpoint;
    if (flags.resumeId) {
      checkpoint = loadCheckpoint(PURP_DIR, flags.resumeId);
      if (!checkpoint) {
        console.log(col(C.red, `\n  ✗ Checkpoint "${flags.resumeId}" not found.\n`));
        return;
      }
    } else {
      checkpoint = latestCheckpoint(PURP_DIR);
      if (!checkpoint) {
        console.log(col(C.red, '\n  ✗ No checkpoints found. Run a plan first.\n'));
        return;
      }
    }

    if (checkpoint.status === 'completed') {
      console.log(col(C.green, `\n  ✓ Plan "${checkpoint.goal}" is already completed.\n`));
      return;
    }

    const resumeStep = checkpoint.currentStep || 0;
    const total      = checkpoint.steps.length;

    console.log('');
    console.log(col(C.bold || C.white, '  ↻ RESUMING PLAN'));
    console.log(col(C.gray, `  Goal: ${checkpoint.goal}`));
    console.log(col(C.gray, `  Resuming from step ${resumeStep + 1}/${total}`));

    // Show remaining steps
    const remaining = checkpoint.steps.slice(resumeStep);
    renderPlan(remaining, C, col);

    const approved = await askApproval(isTTY);
    if (!approved) {
      console.log(col(C.yellow, '\n  ○ Resume cancelled.\n'));
      return;
    }

    await executePlan(checkpoint, PURP_DIR, ctx);
    return;
  }

  // ── Generate new plan ───────────────────────────────────────────────────────
  const goal = positional.join(' ').trim();

  if (!goal) {
    showHelp(C, col);
    return;
  }

  console.log('');
  console.log(col(C.bold || C.white, '  📋 PURPCLAW PLAN'));
  console.log(col(C.gray, `  Goal: ${goal}`));

  // Generate plan via LLM
  const steps = await generatePlan(goal, PURP_DIR, C, col, spinner);
  if (!steps) return;

  // Display the plan
  renderPlan(steps, C, col);

  // Dry-run mode: stop here
  if (flags.dryRun) {
    console.log(col(C.cyan, '  ℹ Dry-run mode — plan generated but not executed.'));
    console.log('');
    return;
  }

  // Operator gate
  const approved = await askApproval(isTTY);
  if (!approved) {
    console.log(col(C.yellow, '\n  ○ Plan rejected. No changes made.\n'));
    return;
  }

  // Create checkpoint
  const checkpointId = Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  const checkpoint = {
    id:          checkpointId,
    goal,
    steps,
    currentStep: 0,
    status:      'in-progress',
    startedAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  saveCheckpoint(PURP_DIR, checkpoint);

  // Execute
  await executePlan(checkpoint, PURP_DIR, ctx);
}

module.exports = { run };
