'use strict';

/**
 * steering-router — the ONE source of truth for "where does this request go".
 *
 * A chat request is not always a chat answer. This decides the execution route:
 *   chat   → answer inline (no job)
 *   agent  → hand to a specific agent (@mention or named)
 *   swarm  → multi-agent mission via the swarm coordinator
 *   research → deep-research group
 *   job    → a work task → opens a kernel job (mapped→planned→delegated→queued
 *            →executed→finished), which auto-chains via lib/job-chain.
 *
 * classify() is pure + deterministic (cheap heuristics, no LLM) so it's testable
 * and fast. steer() acts on the decision: for work it opens a real kernel job
 * and returns its id; for chat it returns delegated:false so the caller answers
 * inline. Every decision is logged into the job-chain so the routing is visible.
 */

const chain = require('./job-chain');
const PHASE_ROUTER = (() => { try { return require('./phase-router'); } catch { return null; } })();

// Imperative verbs that mean "do work", not "answer a question".
const WORK_VERBS = /\b(build|create|make|implement|add|write|fix|repair|refactor|clean\s?up|deploy|ship|release|test|audit|review|optimi[sz]e|migrate|generate|scaffold|set\s?up|install|configure|wire|integrate|automate|run|execute|delete|remove|rename|update|upgrade)\b/i;
const RESEARCH_VERBS = /\b(research|investigate|find\s?out|look\s?up|compare|analy[sz]e|survey|explore|gather|summari[sz]e)\b/i;
const SWARM_HINTS = /\b(swarm|all\s+agents|whole\s+team|everyone|every\s+agent|the\s+team|fan\s?out|parallel(ize|ise)?)\b/i;
const QUESTION_HINT = /^(who|what|when|where|why|how|which|is|are|can|could|should|do|does|did|will|would|explain|tell\s+me|show\s+me)\b/i;
const GREETING = /^(hi|hey|hello|yo|sup|thanks|thank\s+you|ok(ay)?|cool|nice|gm|good\s+(morning|evening))\b/i;

/**
 * Classify a request into an execution route. Pure — no side effects.
 * @returns {{route:string, area:string, confidence:number, reason:string, agent?:string}}
 */
function classify(message, opts = {}) {
  const text = String(message || '').trim();
  if (!text) return { route: 'chat', area: 'chat', confidence: 1, reason: 'empty' };

  // Slash-command → activate a named skill directly.
  const slash = text.match(/^\/([a-z][a-z0-9_-]{1,40})/i);
  if (slash) {
    return { route: 'skill', area: 'tool', skill: slash[1].toLowerCase(), confidence: 0.95, reason: `slash /${slash[1]}` };
  }
  // "use/run/activate the X skill" → skill.
  const skillPhrase = text.match(/\b(?:use|run|activate|invoke)\s+(?:the\s+)?([a-z][a-z0-9_-]{2,40})\s+skill\b/i)
    || text.match(/\bskill[:\s]+([a-z][a-z0-9_-]{2,40})\b/i);
  if (skillPhrase) {
    return { route: 'skill', area: 'tool', skill: skillPhrase[1].toLowerCase(), confidence: 0.85, reason: `skill ${skillPhrase[1]}` };
  }
  // Explicit @mention → route to that agent.
  const mention = text.match(/@([a-z][a-z0-9_-]{1,30})/i);
  if (mention) {
    return { route: 'agent', area: 'tower', agent: mention[1].toLowerCase(), confidence: 0.9, reason: `@mention ${mention[1]}` };
  }
  // Explicit mode override wins (mode=swarm/plan/execute from the composer).
  if (opts.mode === 'swarm' || SWARM_HINTS.test(text)) {
    return { route: 'swarm', area: 'coordinator', confidence: 0.85, reason: 'swarm hint/mode' };
  }
  // Greetings / acknowledgements → plain chat.
  if (GREETING.test(text) && text.length < 40) {
    return { route: 'chat', area: 'chat', confidence: 0.9, reason: 'greeting' };
  }
  // Research intent → deep-research group.
  if (RESEARCH_VERBS.test(text) && !WORK_VERBS.test(text)) {
    return { route: 'research', area: 'research', confidence: 0.7, reason: 'research verbs' };
  }
  // Work verbs → a job, UNLESS it's phrased as a question ("how do I build…").
  if (WORK_VERBS.test(text) && !QUESTION_HINT.test(text)) {
    return { route: 'job', area: 'kernel', confidence: 0.75, reason: 'imperative work verb' };
  }
  // Questions / everything else → chat answer.
  return { route: 'chat', area: 'chat', confidence: 0.6, reason: QUESTION_HINT.test(text) ? 'question' : 'default' };
}

// Map a steering route to the kernel's executionRoute value.
function kernelRouteFor(route) {
  if (route === 'swarm') return 'swarm-coordinator';
  if (route === 'research') return 'deep-research-group';
  return ''; // default kernel routing (agent/job)
}

/**
 * Act on the decision. For work routes, opens a real kernel job (auto-chained)
 * and returns its id. For chat, returns delegated:false (caller answers inline).
 *
 * @param {string} message
 * @param {object} opts { sessionId, source, mode, execute=true, kernel }
 * @returns {{route, area, delegated, jobId?, confidence, reason, agent?}}
 */
function steer(message, opts = {}) {
  const decision = classify(message, opts);
  const jobId = opts.jobId || `steer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Log the routing decision as the opening of the chain (mapped → planned).
  chain.start(jobId, { area: 'chat', detail: `steer: "${String(message).slice(0, 80)}"` });
  chain.step(jobId, { stage: 'routed', area: 'steering', to: decision.route, detail: `${decision.route} (${decision.reason}, conf ${decision.confidence})` });

  // Plain chat → no job. Caller answers inline.
  if (decision.route === 'chat') {
    return { ...decision, jobId, delegated: false };
  }

  // Work route. Open a kernel job unless explicitly told not to (dry classify).
  if (opts.execute === false) {
    return { ...decision, jobId, delegated: false, wouldDelegate: true };
  }
  try {
    const kernel = opts.kernel || require('./api-harness-kernel').getApiHarnessKernel({ rootDir: process.cwd() });
    const input = {
      goal: message,
      route: kernelRouteFor(decision.route),
      source: opts.source || 'chat-steer',
      sessionId: opts.sessionId,
    };
    if (decision.agent) input.preferredAgents = [decision.agent];
    // Skill route: name the skill in the goal so the job's agent fires that
    // tool (skills are registered as native tools).
    if (decision.route === 'skill' && decision.skill) input.goal = `Use the ${decision.skill} skill: ${message}`;

    // S8 Phase Router: consult the model selection table before opening the job.
    // getModel() uses the goal text + cost budget to pick the right model for
    // the task phase. If PHASE_ROUTER is dark the kernel picks its own default.
    if (PHASE_ROUTER && input.sessionId) {
      const selected = PHASE_ROUTER.getModel(input.goal, { sessionId: input.sessionId, source: input.source });
      if (selected) input.model = selected;
    }

    chain.step(jobId, { stage: 'delegated', area: 'steering', to: decision.area, detail: `opening kernel job (${input.route || 'default'})` });
    const snap = kernel.createJob(input);
    const realId = snap?.id || snap?.jobId || jobId;
    chain.step(jobId, { stage: 'queued', area: 'kernel', to: realId, detail: `kernel job ${realId} queued` });
    return { ...decision, jobId: realId, steerId: jobId, delegated: true };
  } catch (e) {
    chain.fail(jobId, { area: 'kernel', detail: 'failed to open job', error: e });
    return { ...decision, jobId, delegated: false, error: e.message };
  }
}

module.exports = { classify, steer, kernelRouteFor };

// Self-check: classification is the load-bearing decision — verify the routes.
if (require.main === module) {
  const assert = require('assert');
  const cases = [
    ['hey how are you', 'chat'],
    ['what is the agent tower?', 'chat'],
    ['how do I build a login page', 'chat'],       // question about work → still chat
    ['build a login page with JWT auth', 'job'],
    ['fix the failing auth tests', 'job'],
    ['research the best vector DBs for 2026', 'research'],
    ['@ghost review this PR', 'agent'],
    ['swarm the whole codebase audit', 'swarm'],
    ['refactor memory_matrix_v2.py', 'job'],
    ['/deep-research quantum computing', 'skill'],
    ['use the pdf skill on this doc', 'skill'],
  ];
  for (const [msg, want] of cases) {
    const got = classify(msg).route;
    assert.strictEqual(got, want, `"${msg}" → got ${got}, want ${want}`);
  }
  console.log('steering-router self-check: PASS —', cases.length, 'routes classified correctly');
}
