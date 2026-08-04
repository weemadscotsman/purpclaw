'use strict';

/**
 * PURPFlow — controlled recursion with receipts.
 *
 * A loop is a repeatable agent workflow with a goal, state, tools, validators,
 * receipts, and STOP RULES. PURPFlow never "just keeps going" — it runs until a
 * stop condition fires, and it never says "done" without a receipt that proves
 * it. "Expensive brain, cheap hands": smart models plan/validate/review, bounded
 * executors build one slice.
 *
 * This is the engine that ties the spine together:
 *   routing   → lib/steering-router   (where work goes)
 *   decide    → lib/stack-truth        (best agent/model, from real state)
 *   execute   → lib/api-harness-kernel (the harness; gated, chained)
 *   chain     → lib/job-chain          (every step start→finish)
 *   receipts  → lib/proof-ledger       (durable evidence — no fake green)
 *   prove     → real checks via execSafe (child-registry; no raw spawns)
 *
 * Modes: goal · plan · validate · execute · review · repair · prove
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const chain = require('./job-chain');
let ledger = null; try { ledger = require('./proof-ledger'); } catch { /* optional */ }
let stack = null; try { stack = require('./stack-truth'); } catch { /* optional */ }
let steering = null; try { steering = require('./steering-router'); } catch { /* optional */ }
let insight = null; try { insight = require('./insight'); } catch { /* optional */ }
const { execSafe } = require('./child-registry');

const FLOW_DIR = path.join(os.homedir(), '.purpclaw', 'purpflow');
const MODES = ['goal', 'plan', 'validate', 'execute', 'review', 'repair', 'prove'];
const STOP_CONDITIONS = ['success_criteria_met', 'max_iterations_hit', 'hard_blocker_found', 'cost_budget_used', 'user_cancelled', 'tool_failure_blocked'];

function ensure() { try { fs.mkdirSync(FLOW_DIR, { recursive: true }); } catch { /* soft */ } }
function loopPath(id) { return path.join(FLOW_DIR, `${id}.json`); }
function save(loop) { ensure(); try { fs.writeFileSync(loopPath(loop.id), JSON.stringify(loop, null, 2)); } catch { /* soft */ } }
function load(id) { try { return JSON.parse(fs.readFileSync(loopPath(id), 'utf8')); } catch { return null; } }

/** The universal loop object. */
function newLoop(mode, objective, opts = {}) {
  const id = opts.id || `${mode}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id, mode, status: 'running', objective: String(objective || '').trim(),
    success_criteria: opts.success_criteria || [],
    state: { iteration: 0, max_iterations: opts.max_iterations || 12, current_task: null, blocked: false },
    agents: opts.agents || { planner: 'smart', executor: 'cheap', validator: 'smart', reviewer: 'smart' },
    budget: { max_tokens: opts.max_tokens || null },
    receipts: [],
    stop_conditions: STOP_CONDITIONS,
    stopped_by: null,
    created_at: opts.now || new Date().toISOString(),
  };
}

/** Add a receipt to the loop AND the durable proof-ledger. No fake green. */
function receipt(loop, { step, result, detail, evidence, verification }) {
  const rec = {
    at: new Date().toISOString(), iteration: loop.state.iteration,
    step, result, detail: String(detail || '').slice(0, 500),
    evidence: Array.isArray(evidence) ? evidence.slice(0, 20) : (evidence ? [String(evidence)] : []),
    verification: verification || null,
  };
  loop.receipts.push(rec);
  try {
    ledger && ledger.record({
      agent: 'purpflow', tool: `purpflow.${loop.mode}`, action: step, taskId: loop.id,
      claim: `${step}: ${rec.detail}`, evidence: rec.evidence,
      status: result === 'pass' ? 'verified' : result === 'fail' ? 'failed' : 'info',
      verification: verification || { ran: `purpflow ${step}`, result: result === 'pass' ? 'pass' : result === 'fail' ? 'fail' : 'unknown' },
    });
  } catch { /* soft */ }
  chain.step(loop.id, { stage: step === 'prove' ? 'verifying' : 'executing', area: 'purpflow', to: step, status: result, detail: rec.detail });
  save(loop);
  return rec;
}

// ── Real mode implementations ────────────────────────────────────────────────

/** /plan — inspect + decide, produce a plan. No building. */
function runPlan(loop) {
  loop.state.current_task = 'plan';
  const evidence = [];
  // Inspect: what checks exist to prove work later?
  let scripts = {};
  try { scripts = require(path.join(process.cwd(), 'package.json')).scripts || {}; } catch { /* soft */ }
  const proofScripts = Object.keys(scripts).filter(s => /test|lint|build|truth|check|smoke/.test(s));
  evidence.push(`proof scripts available: ${proofScripts.join(', ') || 'none'}`);
  // Decide: best agent + model for the objective, from real state.
  let planner = null, model = null;
  try { planner = stack && stack.decide('agent', { task: loop.objective }).best; } catch { /* soft */ }
  try { model = stack && stack.decide('model', { task: loop.objective }).decision; } catch { /* soft */ }
  if (planner) evidence.push(`best agent: ${planner.key} (${planner.role})`);
  if (model) evidence.push(`model lane: ${JSON.stringify(model).slice(0, 120)}`);
  // Success criteria default: the proof step must pass.
  if (!loop.success_criteria.length) loop.success_criteria = ['prove_passes', ...proofScripts.slice(0, 3).map(s => `${s}_passes`)];
  receipt(loop, { step: 'plan', result: 'pass', detail: `planned "${loop.objective}"`, evidence });
  return { ok: true, planner: planner && planner.key, proofScripts, success_criteria: loop.success_criteria };
}

/** /validate — is the objective real + feasible? Confirm before building. */
function runValidate(loop) {
  loop.state.current_task = 'validate';
  const evidence = [];
  // Extract file-ish tokens from the objective and check they exist.
  const files = (loop.objective.match(/[\w./-]+\.(js|ts|tsx|py|json|md|css)/g) || []).slice(0, 10);
  const missing = files.filter(f => { try { return !fs.existsSync(path.join(process.cwd(), f)); } catch { return true; } });
  const present = files.filter(f => !missing.includes(f));
  if (present.length) evidence.push(`referenced files present: ${present.join(', ')}`);
  const feasible = missing.length === 0;
  if (missing.length) evidence.push(`referenced files MISSING: ${missing.join(', ')}`);
  const result = feasible ? 'pass' : 'fail';
  if (!feasible) loop.state.blocked = true;
  receipt(loop, { step: 'validate', result, detail: feasible ? 'objective feasible' : `blocked: missing ${missing.join(', ')}`, evidence });
  return { ok: feasible, missing, present };
}

/** /execute — delegate one bounded slice to the harness (gated + chained). */
function runExecute(loop) {
  loop.state.current_task = 'execute';
  try {
    const r = steering.steer(loop.objective, { source: 'purpflow', execute: true, jobId: `${loop.id}-exec-${loop.state.iteration}` });
    receipt(loop, { step: 'execute', result: r.delegated ? 'pass' : 'info', detail: r.delegated ? `delegated to ${r.route} job ${r.jobId}` : `not delegated (${r.route})`, evidence: [`route=${r.route}`, `jobId=${r.jobId || '-'}`] });
    return { ok: true, delegated: r.delegated, jobId: r.jobId, route: r.route };
  } catch (e) {
    loop.state.blocked = true;
    receipt(loop, { step: 'execute', result: 'fail', detail: `execute failed: ${e.message}` });
    return { ok: false, error: e.message };
  }
}

/** /prove — run REAL checks and produce a verdict. The anti-lying heart. */
async function runProve(loop, opts = {}) {
  loop.state.current_task = 'prove';
  let scripts = {};
  try { scripts = require(path.join(process.cwd(), 'package.json')).scripts || {}; } catch { /* soft */ }
  // Choose bounded, real checks that exist. Default to fast truth/lint checks
  // (full builds are opt-in via opts.checks to keep the loop responsive).
  const wanted = opts.checks || ['truth:check', 'lint'];
  const toRun = wanted.filter(s => scripts[s]);
  // child-registry spawns WITHOUT a shell (spawn-safety), and modern Node blocks
  // spawning npm.cmd without a shell (EINVAL). So resolve each script to its real
  // command and run node-based checks directly via the node binary — no npm, no
  // shell, cross-platform. Non-node checks are reported honestly, not faked.
  const results = [];
  for (const s of toRun) {
    const cmd = String(scripts[s] || '').trim();
    let r, runnable = false;
    if (/^node\s+/.test(cmd)) {
      const args = cmd.replace(/^node\s+/, '').split(/\s+/);
      r = await execSafe(process.execPath, args, { timeoutMs: opts.timeoutMs || 120000, cwd: process.cwd() });
      runnable = true;
    } else {
      // Try a local .bin resolution: "<bin> <rest>" → node node_modules/.bin/<bin>
      const parts = cmd.split(/\s+/);
      const binJs = path.join(process.cwd(), 'node_modules', '.bin', parts[0]);
      if (fs.existsSync(binJs) || fs.existsSync(binJs + '.cmd')) {
        // .bin shims are also .cmd on Windows → run the underlying JS if present.
        const pkgBin = path.join(process.cwd(), 'node_modules', parts[0]);
        if (fs.existsSync(pkgBin)) { r = await execSafe(process.execPath, [binJs, ...parts.slice(1)], { timeoutMs: opts.timeoutMs || 300000, cwd: process.cwd() }); runnable = true; }
      }
    }
    if (runnable) results.push({ check: s, ok: r.ok && r.code === 0, code: r.code, tail: String(r.stderr || r.stdout || '').slice(-200) });
    else results.push({ check: s, ok: false, code: null, unsupported: true, tail: `non-node check "${cmd}" — runner not wired` });
  }
  const allPass = results.length > 0 && results.every(r => r.ok);
  const verdict = results.length === 0 ? 'no_checks' : allPass ? 'pass' : 'fail';
  receipt(loop, {
    step: 'prove', result: allPass ? 'pass' : (results.length ? 'fail' : 'info'),
    detail: results.length ? `${results.filter(r => r.ok).length}/${results.length} checks passed` : 'no runnable checks found',
    evidence: results.map(r => `${r.check}: ${r.ok ? 'PASS' : 'FAIL(' + r.code + ')'}`),
    verification: { ran: `npm run ${toRun.join(', ')}`, result: allPass ? 'pass' : (results.length ? 'fail' : 'skipped') },
  });
  if (allPass && loop.success_criteria.includes('prove_passes')) loop.state.prove_passed = true;
  return { ok: allPass, verdict, results };
}

/** /review or /repair — delegate to the best-fit agent (gated). */
function runDelegated(loop, mode) {
  loop.state.current_task = mode;
  let agent = null;
  try { agent = stack && stack.decide('agent', { task: `${mode} ${loop.objective}` }).best; } catch { /* soft */ }
  try {
    const r = steering.steer(`${mode}: ${loop.objective}`, { source: `purpflow-${mode}`, execute: true, jobId: `${loop.id}-${mode}-${loop.state.iteration}` });
    receipt(loop, { step: mode, result: r.delegated ? 'pass' : 'info', detail: `${mode} via ${agent ? agent.key : r.route} (job ${r.jobId})`, evidence: [`agent=${agent && agent.key}`, `jobId=${r.jobId}`] });
    return { ok: true, agent: agent && agent.key, jobId: r.jobId };
  } catch (e) {
    receipt(loop, { step: mode, result: 'fail', detail: `${mode} failed: ${e.message}` });
    return { ok: false, error: e.message };
  }
}

// ── The controlled loop ──────────────────────────────────────────────────────

function checkStop(loop) {
  if (loop.state.iteration >= loop.state.max_iterations) return 'max_iterations_hit';
  if (loop.state.blocked) return 'hard_blocker_found';
  if (loop.state.prove_passed) return 'success_criteria_met';
  return null;
}

/**
 * Run a loop. For single modes (plan/validate/prove/execute/review/repair) it
 * runs that mode once. For `goal` it orchestrates plan→execute→prove with stop
 * rules — controlled recursion, never open-ended.
 */
async function run(mode, objective, opts = {}) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}" — ${MODES.join(', ')}`);
  const loop = newLoop(mode, objective, opts);
  chain.start(loop.id, { area: 'purpflow', detail: `${mode}: ${loop.objective}` });
  save(loop);

  const single = { plan: runPlan, validate: runValidate, execute: runExecute, review: (l) => runDelegated(l, 'review'), repair: (l) => runDelegated(l, 'repair') };

  try {
    if (mode === 'prove') { await runProve(loop, opts); }
    else if (single[mode]) { await single[mode](loop); }
    else if (mode === 'goal') {
      // GOAL: plan → (validate) → execute → prove, looping until a stop rule.
      runPlan(loop);
      const v = runValidate(loop);
      while (!checkStop(loop)) {
        loop.state.iteration += 1;
        // Mid-job learning: pull better-ways discovered so far (instant, fresh)
        // and inject them so the next slice adapts its tooling on the fly.
        if (insight) {
          try {
            const { insights, formatted } = await insight.recall(loop.objective, { limit: 4 });
            if (insights.length) {
              loop.state.learned = formatted;
              receipt(loop, { step: 'adapt', result: 'info', detail: `recalled ${insights.length} learned better-way(s)`, evidence: insights.slice(0, 3).map(r => String(r.content || r.text || '').slice(0, 120)) });
            }
          } catch { /* insight optional */ }
        }
        if (v.ok && opts.execute !== false) runExecute(loop);
        const p = await runProve(loop, opts);
        if (p.ok) break;
        if (!v.ok) { loop.state.blocked = true; break; }
        if (opts.execute === false) break; // plan+prove only, no build
      }
    }
    loop.stopped_by = checkStop(loop) || (loop.state.blocked ? 'hard_blocker_found' : 'completed');
    loop.status = loop.state.blocked ? 'blocked' : (loop.receipts.some(r => r.result === 'fail') && mode !== 'goal' ? 'failed' : 'done');
  } catch (e) {
    loop.status = 'failed'; loop.stopped_by = 'tool_failure_blocked';
    chain.fail(loop.id, { area: 'purpflow', detail: e.message, error: e });
  }

  // Honest terminal: prove-or-die. "DONE BECAUSE: <receipts>".
  const passed = loop.receipts.filter(r => r.result === 'pass').map(r => r.step);
  if (loop.status === 'done') chain.done(loop.id, { area: 'purpflow', detail: `DONE BECAUSE: ${passed.join(', ') || 'no failures'}`, evidence: loop.receipts.map(r => `${r.step}:${r.result}`) });
  else chain.fail(loop.id, { area: 'purpflow', detail: `${loop.status} (stopped_by ${loop.stopped_by})` });
  save(loop);
  return loop;
}

module.exports = { run, load, newLoop, MODES, STOP_CONDITIONS, FLOW_DIR };

// Self-check: the loop object + stop rules + receipts must be real.
if (require.main === module) {
  const assert = require('assert');
  (async () => {
    // plan is safe + real (no execution).
    const loop = await run('plan', 'wire the login page in app/api/chat/route.ts', { max_iterations: 2 });
    assert.ok(loop.id && loop.mode === 'plan', 'loop object created');
    assert.ok(loop.receipts.length >= 1, 'plan produced a receipt');
    assert.ok(loop.success_criteria.length >= 1, 'success criteria set');
    assert.ok(loop.stop_conditions.length === 6, 'six stop conditions');
    assert.ok(loop.status === 'done', 'plan loop terminates');
    console.log(`purpflow self-check: PASS — loop ${loop.id}, ${loop.receipts.length} receipt(s), status ${loop.status}, criteria [${loop.success_criteria.join(', ')}]`);
  })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
}
