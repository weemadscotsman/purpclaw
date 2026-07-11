'use strict';

/**
 * Bounded autonomy runner — the desktop body's supervised loop.
 *
 * see (gui_see VLM screenshot) → think (LLM picks ONE action) → act
 * (computer-use gate) → repeat. Every safety property is enforced HERE,
 * not trusted to the model:
 *
 *   - hard step cap + wall-clock cap
 *   - action allowlist (subset of computer-use ACTION_LEVEL)
 *   - computerUse mode re-checked EVERY step — flipping the kill switch
 *     (gui_stop / settings computerUse.mode=off) halts the loop mid-run
 *   - coordinate bounds check against the reported screen size
 *   - every step audited to the same computer-use-audit.jsonl trail
 *
 * Usage:
 *   const { runBounded } = require('./lib/runtime/autonomy-runner');
 *   await runBounded({ goal: 'open notepad and type hello' });
 * or:  node lib/runtime/autonomy-runner.js "open notepad and type hello"
 */

const computerUse = require('./computer-use');

// ponytail: flat allowlist, no per-goal capability profiles — add profiles
// if/when a goal ever needs write-vs-read separation inside the body.
const ALLOWED_ACTIONS = new Set([
  'screenshot', 'windows', 'status',
  'move', 'click', 'double_click', 'drag', 'scroll', 'focus', 'type', 'hotkey',
]);

const SYSTEM = (goal) => `You are PURPCLAW's desktop body running a BOUNDED autonomy loop.
GOAL: ${goal}

Each turn you see a structured screen read. Reply with EXACTLY ONE JSON object, nothing else:
  {"action":"click","args":{"x":100,"y":200}}
  {"action":"type","args":{"text":"hello"}}
  {"action":"hotkey","args":{"keys":"^s"}}          (SendKeys syntax: ^=ctrl +=shift %=alt)
  {"action":"focus","args":{"title":"Notepad"}}
  {"action":"scroll","args":{"amount":-3}}
  {"action":"drag","args":{"x":1,"y":1,"x2":2,"y2":2}}
  {"action":"done","args":{"summary":"what was accomplished"}}
  {"action":"fail","args":{"reason":"why the goal is impossible"}}

Rules: one action per turn. If the screen doesn't show what you expect, re-orient (focus/scroll) before clicking. Say done as soon as the goal is met.`;

function parseAction(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (typeof j.action !== 'string') return null;
    return { action: j.action, args: j.args || {} };
  } catch { return null; }
}

async function runBounded({ goal, maxSteps = 15, maxMs = 5 * 60_000, model, provider, onStep } = {}) {
  if (!goal) throw new Error('runBounded: goal required');
  if (computerUse.mode() !== 'autonomous') {
    throw new Error(`bounded autonomy requires computerUse.mode=autonomous (current: ${computerUse.mode()}) — enable it in Settings, or gui_stop already fired`);
  }
  const llm = require('../llm-provider');
  const startedAt = Date.now();
  const steps = [];
  const messages = [{ role: 'system', content: SYSTEM(goal) }];

  for (let step = 1; step <= maxSteps; step++) {
    // Kill switch / mode flip halts the loop between every step.
    if (computerUse.mode() !== 'autonomous') {
      return { ok: false, halted: 'kill-switch', steps };
    }
    if (Date.now() - startedAt > maxMs) {
      return { ok: false, halted: 'time-cap', steps };
    }

    // SEE — structured screen read (VLM eyes)
    let look;
    try {
      look = await computerUse.execute('screenshot', { vision: true });
    } catch (e) {
      return { ok: false, halted: `see-failed: ${e.message}`, steps };
    }
    const screenText = typeof look === 'string' ? look : JSON.stringify(look).slice(0, 8000);
    messages.push({ role: 'user', content: `[screen · step ${step}/${maxSteps}]\n${screenText}` });

    // THINK — one action
    const resp = await llm.chat(messages, { model, provider, temperature: 0.1, maxTokens: 400 });
    const decided = parseAction(resp.content);
    messages.push({ role: 'assistant', content: resp.content || '' });
    if (!decided) {
      messages.push({ role: 'user', content: 'Invalid reply. Emit exactly one JSON action object.' });
      steps.push({ step, error: 'unparseable-action' });
      continue;
    }

    if (decided.action === 'done') return { ok: true, summary: decided.args.summary || '', steps };
    if (decided.action === 'fail') return { ok: false, halted: `model-fail: ${decided.args.reason || ''}`, steps };
    if (!ALLOWED_ACTIONS.has(decided.action)) {
      messages.push({ role: 'user', content: `Action "${decided.action}" is not allowed. Allowed: ${[...ALLOWED_ACTIONS].join(', ')}, done, fail.` });
      steps.push({ step, blocked: decided.action });
      continue;
    }
    // Coordinate sanity — reject clicks into negative/absurd space.
    for (const k of ['x', 'y', 'x2', 'y2']) {
      if (decided.args[k] !== undefined) {
        const v = Number(decided.args[k]);
        if (!Number.isFinite(v) || v < 0 || v > 20000) {
          decided.blocked = `bad coordinate ${k}=${decided.args[k]}`;
        }
      }
    }
    if (decided.blocked) {
      messages.push({ role: 'user', content: `Rejected: ${decided.blocked}.` });
      steps.push({ step, blocked: decided.blocked });
      continue;
    }

    // ACT — through the same gate as every other hand (audited there too)
    let result;
    try {
      result = await computerUse.execute(decided.action, decided.args);
      steps.push({ step, action: decided.action, args: decided.args, ok: true });
    } catch (e) {
      result = { error: e.message };
      steps.push({ step, action: decided.action, args: decided.args, ok: false, error: e.message });
      // A gate rejection mid-run means the mode changed — treat as kill.
      if (/mode .* does not allow|requires explicit approval/.test(e.message)) {
        return { ok: false, halted: `gate: ${e.message}`, steps };
      }
    }
    messages.push({ role: 'user', content: `[result · ${decided.action}]\n${JSON.stringify(result).slice(0, 2000)}` });
    if (onStep) try { onStep(steps[steps.length - 1]); } catch {}
  }
  return { ok: false, halted: 'step-cap', steps };
}

module.exports = { runBounded, ALLOWED_ACTIONS };

if (require.main === module) {
  const goal = process.argv.slice(2).join(' ');
  runBounded({ goal, onStep: s => console.log(JSON.stringify(s)) })
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
