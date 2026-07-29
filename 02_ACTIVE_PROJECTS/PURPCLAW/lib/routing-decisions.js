'use strict';

/**
 * lib/routing-decisions.js — CANONICAL ROUTING DECISION FILE
 * ============================================================
 *
 * ONE place that resolves ALL routing decisions.
 * Every surface (CLI ask, unified_api, agent-gateway, model-router, agent-router)
 * reads from this file. No surface calls providers directly.
 *
 * Settings hierarchy (highest wins):
 *   1. Per-agent override  (opts.agentModel / opts.agentProvider)
 *   2. Explicit lane       (opts.lane / PURPCLAW_LANE)
 *   3. Explicit model      (opts.model / PURPCLAW_MODEL)
 *   4. Explicit provider    (opts.provider / PURPCLAW_PROVIDER)
 *   5. .env LLM_*          (LLM_PROVIDER, LLM_MODEL, etc.)
 *   6. Lane defaults       (hard-coded per lane)
 *
 * Routing resolution path for each call-site:
 *   CLI ask           → lib/commands/ask.js → routing-decisions.js
 *   Web SSE/JSON      → unified_api.js → routing-decisions.js → llm.streamChat
 *   Agent gateway     → agent-gateway.js → routing-decisions.js → llm.streamChat
 *   model-router.js    → delegates to this file (reads LANES from here)
 *   agent-router.js    → delegates to this file (reads LANES + fallbacks)
 *
 * Lanes (each maps to a provider/model pair):
 *   code     — general chat, coding, quick answers  (minimax / MiniMax-M2.7)
 *   reason   — planning, architecture, reasoning   (nvidia / deepseek-v4-pro)
 *   review   — analysis, QA, comparison           (nvidia / glm-5.1)
 *   longctx  — research, whole-repo, summarization (nvidia / kimi-k2.6)
 *   swarm    — swarm orchestration                (nvidia / kimi-k2.6)
 *   cheap    — fast/cheap tasks                   (nvidia / llama-3.1-8b-instruct)
 *   strong   — high-quality complex tasks         (nvidia / deepseek-v4-pro)
 *
 * Provider profiles: primary + fallback per lane
 * Model aliases: resolved at call time
 * Rate-limit failover: per-provider cooldown tracking
 * Token + cost tracking: recordLLMUsage called at every completion
 */

const LLM_PROVIDERS = require('./llm-provider').PROVIDERS;
const path = require('path');
const fs = require('fs');

// ── Load environment ──────────────────────────────────────────────────────────
const envFile = path.join(__dirname, '..', '.env');
const env = {};
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) env[key.trim()] = valueParts.join('=').trim();
  });
}

// ── User settings (provider-config.json — settings page) ─────────────────────
// provider-config.js reads ~/.purpclaw/provider-config.json and respects
// user-config > env > lane-default precedence.
let _providerConfig = null;
function _loadProviderConfig() {
  if (!_providerConfig) {
    try { _providerConfig = require('./runtime/provider-config'); } catch (_) { _providerConfig = null; }
  }
  return _providerConfig;
}
function envVal(key, fallback) {
  return process.env[key] || env[key] || fallback;
}

// ── Provider profiles ─────────────────────────────────────────────────────────
const PROVIDER_PROFILES = {
  // Primary (operator directive): normal chat always uses MiniMax platform
  minimax: {
    provider: 'minimax',
    model: 'MiniMax-M2.7',
    baseUrl: 'https://api.minimax.io/v1',
    for: 'general chat, coding, quick answers (default)',
  },
  // NVIDIA NIM pool — used for reason/review/longctx/swarm lanes
  nvidia: {
    provider: 'nvidia',
    model: 'meta/llama-3.1-70b-instruct',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    for: 'NVIDIA NIM — use for reason, review, longctx, swarm lanes',
  },
  deepseek: {
    provider: 'deepseek',
    model: 'deepseek-ai/deepseek-v4-pro',
    baseUrl: 'https://api.deepseek.com/v1',
    for: 'DeepSeek — strong reasoning, planning',
  },
  kimi: {
    provider: 'kimi',
    model: 'moonshotai/kimi-k2.6',
    baseUrl: 'https://api.moonshot.cn/v1',
    for: 'Kimi K2.6 — long context, swarm orchestration',
  },
  glm: {
    provider: 'glm',
    model: 'z-ai/glm-5.1',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    for: 'GLM 5.1 — review, analysis',
  },
  // Local fallback
  ollama: {
    provider: 'ollama',
    model: envVal('OLLAMA_MODEL', 'qwen2.5:3b'),
    baseUrl: envVal('OLLAMA_BASE_URL', 'http://localhost:11434/v1'),
    for: 'Local fallback — ollama',
  },
  lmstudio: {
    provider: 'lmstudio',
    model: envVal('LMSTUDIO_MODEL', 'local-model'),
    baseUrl: envVal('LMSTUDIO_BASE_URL', 'http://localhost:1234/v1'),
    for: 'Local fallback — LM Studio',
  },
};

// ── NIM guard: redirect nvidia to minimax when NIM is down ───────────────────
// While the NVIDIA NIM key pool is dead (HTTP 403), redirect any nvidia lane
// to the working MiniMax platform so chat/delegation never hits a 403.
// Flip PURPCLAW_NIM_DOWN=0 (env) the moment live NVIDIA keys are restored.
function nimRedirect(r) {
  if (r && r.provider === 'nvidia' && envVal('PURPCLAW_NIM_DOWN', '1') !== '0') {
    return {
      ...r,
      provider: 'minimax',
      model: 'MiniMax-M2.7',
      label: (r.label || 'MiniMax M2.7') + ' (NIM down → MiniMax)',
      reason: (r.reason || '') + ' [NIM 403 → minimax]',
    };
  }
  return r;
}

// ── Lane definitions ──────────────────────────────────────────────────────────
// LANES is the single source of truth for all lane → provider/model mapping.
// model-router.js and agent-router.js both import this object.
const LANES = {
  code: {
    provider: 'minimax',
    model: 'MiniMax-M2.7',
    agent: 'robot',
    label: 'MiniMax M2.7',
    for: 'code, general, quick answers (default)',
    fallbacks: ['minimaxai/minimax-m3', 'moonshotai/kimi-k2.6'],
  },
  reason: {
    provider: 'nvidia',
    model: 'deepseek-ai/deepseek-v4-pro',
    agent: 'dragon',
    label: 'DeepSeek V4 Pro',
    for: 'planning, architecture, multi-step reasoning',
    fallbacks: ['deepseek-ai/deepseek-v4-flash', 'moonshotai/kimi-k2.6', 'minimaxai/minimax-m3'],
  },
  review: {
    provider: 'nvidia',
    model: 'z-ai/glm-5.1',
    agent: 'ghost',
    label: 'GLM 5.1',
    for: 'analysis, review, QA, comparison, audit',
    fallbacks: ['moonshotai/kimi-k2.6', 'minimaxai/minimax-m3'],
  },
  longctx: {
    provider: 'nvidia',
    model: 'moonshotai/kimi-k2.6',
    agent: 'duck',
    label: 'Kimi K2.6',
    for: 'research, long-context, whole-repo, summarization',
    fallbacks: ['minimaxai/minimax-m3', 'z-ai/glm-5.1'],
  },
  swarm: {
    provider: 'nvidia',
    model: 'moonshotai/kimi-k2.6',
    agent: 'wolf',
    label: 'Kimi K2.6 Swarm',
    for: 'swarm orchestration, multi-agent coordination, parallel delegation',
    fallbacks: ['minimaxai/minimax-m3', 'deepseek-ai/deepseek-v4-flash'],
  },
  cheap: {
    provider: 'nvidia',
    model: 'meta/llama-3.1-8b-instruct',
    agent: 'rabbit',
    label: 'Llama 3.1 8B',
    for: 'fast, cheap tasks',
    fallbacks: ['deepseek-ai/deepseek-v4-flash', 'minimaxai/minimax-m3'],
  },
  strong: {
    provider: 'nvidia',
    model: 'deepseek-ai/deepseek-v4-pro',
    agent: 'dragon',
    label: 'DeepSeek V4 Pro',
    for: 'high-quality complex tasks',
    fallbacks: ['moonshotai/kimi-k2.6', 'minimaxai/minimax-m3'],
  },
};

const DEFAULT_LANE = 'code';

// ── Model aliases (resolved at call time) ────────────────────────────────────
const MODEL_ALIASES = {
  'mini':     'minimaxai/minimax-m3',
  'minimax':  'minimaxai/minimax-m3',
  'm3':       'minimaxai/minimax-m3',
  'kimi':     'moonshotai/kimi-k2.6',
  'k2.6':     'moonshotai/kimi-k2.6',
  'glm':      'z-ai/glm-5.1',
  'glm-5':    'z-ai/glm-5.1',
  'ds':       'deepseek-ai/deepseek-v4-pro',
  'deepseek': 'deepseek-ai/deepseek-v4-pro',
  'llama':    'meta/llama-3.1-70b-instruct',
  'nvidia':   'meta/llama-3.1-70b-instruct',
  'flash':    'deepseek-ai/deepseek-v4-flash',
  'reason':   'deepseek-ai/deepseek-v4-pro',
};

function resolveAlias(model) {
  if (!model) return null;
  const lower = String(model).toLowerCase().trim();
  return MODEL_ALIASES[lower] || model;
}

// ── Keyword heuristics for auto-classification ────────────────────────────────
// Highest score wins; ties → DEFAULT_LANE. Fast, no LLM call.
const RULES = [
  { lane: 'code',    weight: 2, re: /\b(code|coding|debug|bug|refactor|function|class|component|api|endpoint|implement|fix|error|stack ?trace|compile|build me|write (a|the|me)? ?(function|script|class|component|module)|typescript|javascript|python|rust|golang|sql|regex|unit ?test|lint)\b/i },
  { lane: 'reason',  weight: 2, re: /\b(plan|architect|architecture|design|strategy|break ?down|decompose|orchestrat|multi-?step|road ?map|how (should|would|do) (i|we)|approach|reason|why|trade-?off|decide|coordinate|swarm|delegate|workflow|pipeline)\b/i },
  { lane: 'review',  weight: 2, re: /\b(analy[sz]e?|review|evaluate|assess|audit|critique|compare|classif|qa|quality|security|vulnerab|inspect|verify)\b/i },
  { lane: 'longctx', weight: 2, re: /\b(research|summari[sz]e?|whole[- ]repo|entire (codebase|repo)|long[- ]context|read (all|every)|investigate|survey|deep ?dive|gather)\b/i },
  { lane: 'cheap',   weight: 2, re: /\b(simple|quick|fast|cheap|one[- ]liner|tiny|small)\b/i },
  { lane: 'strong',  weight: 2, re: /\b(complex|hard|difficult|expert|advanced|deep|thorough|comprehensive)\b/i },
  // light conversational pull toward the default code/general brain
  { lane: 'code',    weight: 1, re: /\b(hi|hey|yo|hello|thanks|lol|what'?s up|tell me|chat|talk|joke|opinion|think)\b/i },
];

// ── Rate-limit cooldown tracking ──────────────────────────────────────────────
const _provThrottle = new Map();
const PROVIDER_RPM = { minimax: 18, nvidia: 40, kimi: 18, deepseek: 18, glm: 18, gemini: 30, ollama: 600, lmstudio: 600 };
function _provRpm(p) { return PROVIDER_RPM[p] || 24; }
function _provState(p) {
  let s = _provThrottle.get(p);
  if (!s) { s = { lastAt: 0, cooldownUntil: 0, backoffMs: 0 }; _provThrottle.set(p, s); }
  return s;
}
function _statusOf(e) {
  const n = Number(e && (e.status || e.code));
  if (n) return n;
  const m = String((e && e.message) || '').match(/\b(429|503|502|500|403|401)\b/);
  return m ? Number(m[1]) : 0;
}
async function _throttleGate(provider) {
  const s = _provState(provider);
  const now = Date.now();
  if (now < s.cooldownUntil) {
    const secs = Math.ceil((s.cooldownUntil - now) / 1000);
    const err = new Error(`provider "${provider}" is cooling down ${secs}s after a rate-limit (429) — holding instead of slamming the API`);
    err.status = 429; err.cooldown = true;
    throw err;
  }
  const minGap = Math.ceil(60000 / _provRpm(provider));
  const wait = s.lastAt + minGap - now;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  s.lastAt = Date.now();
}
function _noteResult(provider, statusOrErr) {
  if (statusOrErr && statusOrErr.cooldown) return;
  const s = _provState(provider);
  const code = typeof statusOrErr === 'number' ? statusOrErr : _statusOf(statusOrErr);
  if (code === 429 || code === 503 || code === 502) {
    s.backoffMs = Math.min(s.backoffMs ? s.backoffMs * 2 : 30000, 600000);
    s.cooldownUntil = Date.now() + s.backoffMs;
  } else if (code === 0 || (code >= 200 && code < 400)) {
    s.backoffMs = 0; s.cooldownUntil = 0;
  }
}
function llmThrottleState() {
  return [..._provThrottle.entries()].map(([p, s]) => ({ provider: p, coolingMs: Math.max(0, s.cooldownUntil - Date.now()), backoffMs: s.backoffMs }));
}

// ── Token + cost tracking ─────────────────────────────────────────────────────
function recordLLMUsage(provider, model, usage) {
  if (!usage || (!usage.prompt_tokens && !usage.completion_tokens)) return;
  try {
    const logDir = path.join(__dirname, '..', 'agent_work');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    let inputCostPerMillion = 0.15;
    let outputCostPerMillion = 0.60;
    const p = String(provider).toLowerCase();
    const m = String(model).toLowerCase();
    if (p === 'openai') {
      if (m.includes('gpt-4o-mini')) { inputCostPerMillion = 0.15; outputCostPerMillion = 0.60; }
      else if (m.includes('gpt-4o')) { inputCostPerMillion = 2.50; outputCostPerMillion = 10.00; }
    } else if (p === 'anthropic') {
      if (m.includes('haiku')) { inputCostPerMillion = 0.25; outputCostPerMillion = 1.25; }
      else if (m.includes('sonnet')) { inputCostPerMillion = 3.00; outputCostPerMillion = 15.00; }
    } else if (p === 'gemini') {
      if (m.includes('flash')) { inputCostPerMillion = 0.075; outputCostPerMillion = 0.30; }
      else if (m.includes('pro')) { inputCostPerMillion = 1.25; outputCostPerMillion = 5.00; }
    } else if (p === 'deepseek') {
      inputCostPerMillion = 0.14; outputCostPerMillion = 0.28;
    }
    const prompt = usage.prompt_tokens || 0;
    const completion = usage.completion_tokens || 0;
    const total = usage.total_tokens || (prompt + completion);
    const estimatedCost = (prompt * inputCostPerMillion + completion * outputCostPerMillion) / 1_000_000;
    const entry = {
      timestamp: new Date().toISOString(),
      provider,
      model,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total,
      estimatedCost: parseFloat(estimatedCost.toFixed(6)),
    };
    fs.appendFileSync(path.join(logDir, 'llm-ledger.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    // silent safety — never break API requests
  }
}

// ── Primary resolve function ───────────────────────────────────────────────────
/**
 * resolve(opts) → { provider, model, lane, label, agent, fallbacks, reason, chain }
 *
 * Resolves a routing decision from opts. All surfaces call this.
 *
 * opts:
 *   lane     — explicit lane name
 *   model    — explicit model (overrides lane default)
 *   provider — explicit provider (overrides lane default)
 *   agent    — per-agent override (agent name → look up its preferred lane)
 *   message  — text to auto-classify if no lane/model given
 */
function resolve(opts = {}) {
  const { lane: explicitLane, model: explicitModel, provider: explicitProvider, agent, message } = opts;

  // 1. Per-agent override: agent name → preferred lane
  if (agent && !explicitLane && !explicitModel) {
    const agentLane = AGENT_LANE_PREFERENCES[String(agent).toLowerCase()];
    if (agentLane && LANES[agentLane]) {
      const resolved = { ...LANES[agentLane], lane: agentLane, reason: `agent '${agent}' prefers lane '${agentLane}'` };
      return nimRedirect(resolved);
    }
  }

  // 2. Explicit lane
  if (explicitLane && LANES[explicitLane]) {
    // Apply user settings from provider-config.json first (settings page overrides).
    // This is what makes the settings UI actually change runtime behavior.
    const pc = _loadProviderConfig();
    const userLane = pc ? pc.getLane(explicitLane) : null;
    const resolved = { ...LANES[explicitLane], lane: explicitLane };
    if (userLane && (userLane.provider || userLane.model)) {
      if (userLane.provider) { resolved.provider = userLane.provider; }
      if (userLane.model)    { resolved.model = resolveAlias(userLane.model); }
      resolved.reason = `user settings for '${explicitLane}'`;
    } else {
      resolved.reason = 'explicit lane';
    }
    // Explicit overrides always win over both lane defaults and user settings
    if (explicitModel) {
      resolved.model = resolveAlias(explicitModel);
      resolved.reason += ` (model override: ${explicitModel})`;
    }
    if (explicitProvider) {
      resolved.provider = explicitProvider;
      resolved.reason += ` (provider override: ${explicitProvider})`;
    }
    return nimRedirect(resolved);
  }

  // 3. Explicit model (no lane)
  if (explicitModel) {
    const resolved = {
      provider: explicitProvider || 'nvidia',
      model: resolveAlias(explicitModel),
      lane: 'custom',
      agent: null,
      label: explicitModel,
      reason: 'explicit model',
      fallbacks: [],
    };
    return nimRedirect(resolved);
  }

  // 4. Explicit provider only (rare — usually with model)
  if (explicitProvider && !explicitModel) {
    const resolved = {
      provider: explicitProvider,
      model: LLM_PROVIDERS[explicitProvider]?.defaultModel || 'default',
      lane: 'custom',
      agent: null,
      label: explicitProvider,
      reason: 'explicit provider',
      fallbacks: [],
    };
    return nimRedirect(resolved);
  }

  // 5. Auto-classify from message
  if (message) {
    const text = String(message || '');
    const scores = {};
    for (const r of RULES) {
      if (r.re.test(text)) scores[r.lane] = (scores[r.lane] || 0) + r.weight;
    }
    let best = DEFAULT_LANE, bestScore = 0;
    for (const [l, s] of Object.entries(scores)) {
      if (s > bestScore) { best = l; bestScore = s; }
    }
    const resolved = { ...LANES[best], lane: best, reason: bestScore ? `classified '${best}' (score ${bestScore})` : 'default lane' };
    return nimRedirect(resolved);
  }

  // 6. Fall back to default lane
  const resolved = { ...LANES[DEFAULT_LANE], lane: DEFAULT_LANE, reason: 'default lane' };
  return nimRedirect(resolved);
}

// ── Agent → lane preferences ─────────────────────────────────────────────────
const AGENT_LANE_PREFERENCES = {
  robot:  'code',
  dragon: 'reason',
  ghost:  'review',
  duck:   'longctx',
  wolf:   'swarm',
  rabbit: 'cheap',
  shark:  'strong',
};

// ── Get full fallback chain for a resolved decision ──────────────────────────
function getChain(resolved) {
  if (!resolved) return [];
  const { model, fallbacks = [], provider } = resolved;
  const chain = [model];
  // Add lane fallbacks
  for (const fb of fallbacks) {
    if (!chain.includes(fb)) chain.push(fb);
  }
  return chain;
}

// ── Per-hop provider (primary vs NIM for fallbacks) ─────────────────────────
function providerForHop(hopIndex, primaryProvider, chainModel) {
  if (hopIndex === 0) return primaryProvider;
  // Fallback hops use nvidia (NIM)
  return 'nvidia';
}

// ── List all lanes (for UIs) ─────────────────────────────────────────────────
function listLanes() {
  return Object.entries(LANES).map(([lane, v]) => ({ lane, ...v }));
}

// ── Throttle state export ────────────────────────────────────────────────────
function throttleState() {
  return llmThrottleState();
}

module.exports = {
  // Core resolution
  resolve,

  // Lane definitions (re-exported for model-router.js / agent-router.js)
  LANES,
  DEFAULT_LANE,

  // Utilities
  resolveAlias,
  getChain,
  providerForHop,
  listLanes,
  MODEL_ALIASES,
  AGENT_LANE_PREFERENCES,
  RULES,

  // Rate-limit tracking
  throttleState,
  _provState,
  _noteResult,
  _throttleGate,

  // Cost tracking
  recordLLMUsage,

  // Provider profiles
  PROVIDER_PROFILES,
};
