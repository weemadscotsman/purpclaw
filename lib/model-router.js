'use strict';

/**
 * MODEL ROUTER — auto provider/model routing for PURPCLAW chat surfaces.
 *
 * The stack reads the user's message, classifies the job, and routes it to the
 * best model "lane". Lanes are NOT redefined here — they are the SAME lanes the
 * swarm/tower uses, imported from `agent_routing_matrix.js` (single source of
 * truth) so chat routing and swarm per-agent routing never drift apart.
 *
 * Lane → model → representative always-active swarm agent (must match the tower
 * bindings in agent_routing_matrix.js AGENT_MODEL):
 *   code     CODE     minimaxai/minimax-m3        → ROBOT   (coding, general, default)
 *   reason   REASON   deepseek-ai/deepseek-v4-pro → DRAGON  (planning, architecture, reasoning)
 *   review   REVIEW   z-ai/glm-5.1 (NIM)          → GHOST   (analysis, review, QA)
 *   longctx  LONGCTX  moonshotai/kimi-k2.6        → DUCK    (research, long-context)
 *
 * All on NVIDIA NIM (the 5+5 key pool). REVIEW uses NIM GLM 5.1 unless GLM_API_KEY
 * is set, mirroring modelForAgent()'s fallback.
 */

let MX = null;
try { MX = require('../agent_routing_matrix'); } catch (_) { MX = null; }

// Pull lane models from the matrix; fall back to literals if the matrix can't
// be loaded so the router still works standalone.
const M = (MX && MX.MODELS) || {
  CODE:       { provider: 'nvidia', model: 'minimaxai/minimax-m3' },
  REASON:     { provider: 'nvidia', model: 'deepseek-ai/deepseek-v4-pro' },
  REVIEW_NIM: { provider: 'nvidia', model: 'z-ai/glm-5.1' },
  LONGCTX:    { provider: 'nvidia', model: 'moonshotai/kimi-k2.6' },
};
const REVIEW = (!process.env.GLM_API_KEY && M.REVIEW_NIM) ? M.REVIEW_NIM : (M.REVIEW || M.REVIEW_NIM);

// Ordered NIM fallback chains — buttery smoothness: if a lane's primary model
// rate-limits (429) or errors before streaming, the chat path glides to the
// next model instead of hard-failing. Every chain ends on the proven-reliable
// general models (minimax-m3 / kimi-k2.6). deepseek-v4-pro is the flaky one on
// NIM free tier, so its lane has the deepest chain. All NVIDIA NIM.
const FB = {
  code:    ['moonshotai/kimi-k2.6', 'z-ai/glm-5.1'],
  reason:  ['deepseek-ai/deepseek-v4-flash', 'moonshotai/kimi-k2.6', 'minimaxai/minimax-m3'],
  review:  ['moonshotai/kimi-k2.6', 'minimaxai/minimax-m3'],
  longctx: ['minimaxai/minimax-m3', 'z-ai/glm-5.1'],
};

const LANES = {
  code:    { ...M.CODE,   agent: 'robot',  label: 'MiniMax M3',     for: 'code, general, quick answers (default)', fallbacks: FB.code },
  reason:  { ...M.REASON, agent: 'dragon', label: 'DeepSeek V4 Pro', for: 'planning, architecture, multi-step reasoning', fallbacks: FB.reason },
  review:  { ...REVIEW,   agent: 'ghost',  label: 'GLM 5.1',         for: 'analysis, review, QA, comparison, audit', fallbacks: FB.review },
  longctx: { ...M.LONGCTX,agent: 'duck',   label: 'Kimi K2.6',       for: 'research, long-context, whole-repo, summarization', fallbacks: FB.longctx },
};

const DEFAULT_LANE = 'code'; // MiniMax M3 — the orchestrator-sibling general brain

// Keyword heuristics. Highest score wins; ties → DEFAULT_LANE. Fast, no LLM call.
const RULES = [
  { lane: 'code',    weight: 2, re: /\b(code|coding|debug|bug|refactor|function|class|component|api|endpoint|implement|fix|error|stack ?trace|compile|build me|write (a|the|me)?\s*(function|script|class|component|module)|typescript|javascript|python|rust|golang|sql|regex|unit ?test|lint)\b/i },
  { lane: 'reason',  weight: 2, re: /\b(plan|architect|architecture|design|strategy|break ?down|decompose|orchestrat|multi-?step|road ?map|how (should|would|do) (i|we)|approach|reason|why|trade-?off|decide|coordinate|swarm|delegate|workflow|pipeline)\b/i },
  { lane: 'review',  weight: 2, re: /\b(analy[sz]e?|review|evaluate|assess|audit|critique|compare|classif|qa|quality|security|vulnerab|inspect|verify)\b/i },
  { lane: 'longctx', weight: 2, re: /\b(research|summari[sz]e?|whole[- ]repo|entire (codebase|repo)|long[- ]context|read (all|every)|investigate|survey|deep ?dive|gather)\b/i },
  // light conversational pull toward the default code/general brain
  { lane: 'code',    weight: 1, re: /\b(hi|hey|yo|hello|thanks|lol|what'?s up|tell me|chat|talk|joke|opinion|think)\b/i },
];

/**
 * route(message, opts) → { provider, model, lane, label, agent, reason }
 * opts.lane     — force a lane
 * opts.model    — force a raw model id (provider defaults to nvidia)
 * opts.provider — override provider for opts.model
 */
function route(message, opts = {}) {
  if (opts.lane && LANES[opts.lane]) {
    return { ...LANES[opts.lane], lane: opts.lane, reason: 'explicit lane' };
  }
  if (opts.model) {
    return { provider: opts.provider || 'nvidia', model: opts.model, lane: 'custom', label: opts.model, agent: null, reason: 'explicit model' };
  }

  const text = String(message || '');
  const scores = {};
  for (const r of RULES) {
    if (r.re.test(text)) scores[r.lane] = (scores[r.lane] || 0) + r.weight;
  }

  let best = DEFAULT_LANE, bestScore = 0;
  for (const [lane, s] of Object.entries(scores)) {
    if (s > bestScore) { best = lane; bestScore = s; }
  }

  const lane = LANES[best];
  return { ...lane, lane: best, reason: bestScore ? `classified '${best}' (score ${bestScore})` : 'default lane' };
}

/** List lanes for UIs / the swarm roster. */
function listLanes() {
  return Object.entries(LANES).map(([lane, v]) => ({ lane, ...v }));
}

module.exports = { LANES, DEFAULT_LANE, route, listLanes };
