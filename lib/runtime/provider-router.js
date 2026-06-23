'use strict';

/**
 * lib/runtime/provider-router.js — PURPCLAW Multi-Provider Routing Doctrine
 *
 * v1.0 — implements the operator's "layered AI compute sovereignty" stack:
 *
 *   1. Minimax  → PRIMARY (chat, tool calls, delegation, agent dispatch)
 *   2. NVIDIA   → SWARM + DIVISION (free cloud muscle for parallel work)
 *   3. DeepSeek → CODE/REASONING specialist (code review, architecture)
 *   4. OpenRouter → FALLBACK/zoo (overflow, niche models, A/B testing)
 *   5. Local (Ollama/Qwen/Nex) → SOVEREIGNTY (private, offline, baseline)
 *
 * Routing choice: task type → privacy level → cost → reliability.
 * Not "use NVIDIA for everything because it's free."
 *
 * Usage:
 *   const { pickProvider, routeAndDispatch } = require('./provider-router');
 *   const choice = pickProvider({ taskType: 'user_chat', privacy: 'normal' });
 *   // → { provider: 'minimax', model: 'MiniMax-M2.7', lane: 'PRIMARY_CHAT', envKey: 'LLM_PROVIDER' }
 *
 *   const result = await routeAndDispatch({ taskType: 'code_patch', prompt: '...', privacy: 'normal' });
 *   // → actually dispatches via DeepSeek
 */

// llm-provider registry — provider metadata + key resolution. Used to (a)
// validate envKey values are real provider names, and (b) check whether a
// provider actually has a usable key before routing to it.
let PROVIDERS = {}, PROVIDER_ENV_ALIASES = {}, firstEnv = () => '';
try {
  const llmProvider = require('../llm-provider');
  PROVIDERS = llmProvider.PROVIDERS || {};
  PROVIDER_ENV_ALIASES = llmProvider.PROVIDER_ENV_ALIASES || {};
  firstEnv = llmProvider.firstEnv || firstEnv;
} catch { /* optional */ }
let userConfig = { getLane: () => ({}) };
try { userConfig = require('./provider-config'); } catch { /* optional */ }

// Providers that need no API key (run locally / always usable).
const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'internlm3-nex-n1']);

// Order to try when the configured provider has no usable key. Local is the
// guaranteed floor — it always works offline.
const FALLBACK_CHAIN = ['nvidia', 'minimax', 'ollama'];

/** Does this provider have credentials we can actually use right now? */
function providerUsable(name) {
  if (!name) return false;
  if (LOCAL_PROVIDERS.has(name)) return true;            // local needs no key
  if (!PROVIDERS[name]) return false;
  const aliases = (PROVIDER_ENV_ALIASES && PROVIDER_ENV_ALIASES[name]) || {};
  const key = firstEnv(aliases.apiKey)
    || process.env[`${name.toUpperCase()}_API_KEY`]
    || PROVIDERS[name].apiKey;
  return !!key;
}

/** First usable provider: the preferred one, else down the chain, else ollama. */
function firstUsableProvider(preferred) {
  if (providerUsable(preferred)) return preferred;
  for (const p of FALLBACK_CHAIN) if (providerUsable(p)) return p;
  return 'ollama'; // last resort — local always answers
}

/**
 * Resolve a lane to a concrete { provider, model, source, fellBackFrom }.
 * Precedence: env override > user settings (provider-config) > lane default.
 * Then capability fallback: if the provider has no usable key, walk the chain
 * down to the local model the user can run.
 */
function resolveLane(lane) {
  const ov = (userConfig.getLane(lane.name || lane._name) || {});
  const envProvider = (process.env[lane.envKey] && PROVIDERS[process.env[lane.envKey]]) ? process.env[lane.envKey] : null;
  const envModel = process.env[lane.modelEnv] || null;

  // Precedence: user settings (the settings page) > env > built-in default.
  // The UI is authoritative — "users use the models they see fit."
  let provider = ov.provider || envProvider || lane.provider;
  let model = ov.model || envModel || lane.defaultModel;
  const source = ov.provider ? 'user-config' : (envProvider ? 'env' : 'default');

  let fellBackFrom = null;
  if (!providerUsable(provider)) {
    fellBackFrom = provider;
    provider = firstUsableProvider(provider);
    // When we fall back to a different provider, the old model id won't apply —
    // use that provider's default unless the user pinned a model explicitly.
    if (!(ov.model || envModel) || fellBackFrom !== provider) {
      model = (PROVIDERS[provider] && PROVIDERS[provider].defaultModel) || model;
    }
  }
  return { provider, model, source, fellBackFrom };
}

// Back-compat shim: older callers used resolveLaneProvider(lane).
function resolveLaneProvider(lane) { return resolveLane(lane).provider; }

// Lane definitions — the routing doctrine
const LANES = {
  // ── Paid main brain ──
  PRIMARY_CHAT: {
    label: 'Primary chat / operator brain',
    provider: 'minimax',
    envKey: 'LLM_PROVIDER',
    modelEnv: 'LLM_MODEL',
    defaultModel: 'MiniMax-M2.7',
    useFor: ['user_chat', 'tool_calling', 'agent_delegation', 'bigboss_command', 'orchestration_summary', 'user_facing_response'],
  },
  PRIMARY_TOOL: {
    label: 'Tool/function calling specialist',
    provider: 'minimax',  // same provider, but tracks the lane for logs
    envKey: 'LLM_PROVIDER',
    modelEnv: 'LLM_MODEL',
    defaultModel: 'MiniMax-M2.7',
    useFor: ['tool_call', 'function_call', 'agent_task', 'swarm_dispatch'],
  },
  PRIMARY_DELEGATION: {
    label: 'Agent delegation / dispatcher',
    provider: 'minimax',
    envKey: 'LLM_PROVIDER',
    modelEnv: 'LLM_MODEL',
    defaultModel: 'MiniMax-M2.7',
    useFor: ['agent_pick', 'task_routing', 'agent_to_agent', 'mission_assign'],
  },

  // ── Free cloud muscle ──
  SWARM: {
    label: 'Swarm / parallel burst lane',
    provider: 'nvidia',
    envKey: 'NVIDIA_API_KEY_PURP3',  // purp3 = swarm/agent bursts (per operator)
    modelEnv: 'SWARM_NVIDIA_MODEL',
    // nemotron-3-super-120b: 120B MoE, 1M ctx, agentic + tool-calling. Free
    // endpoint, proven live (HTTP 200 PONG). Was meta/llama-3.1-8b-instruct.
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
    useFor: ['swarm_division', 'parallel_research', 'long_cheap_experiment', 'model_comparison'],
  },
  DIVISION: {
    label: 'Division agents / non-sensitive gen',
    provider: 'nvidia',
    envKey: 'NVIDIA_API_KEY_PURP1',  // purp1 = default provider lane
    modelEnv: 'DIVISION_NVIDIA_MODEL',
    // Was meta/llama-3.1-70b-instruct. nemotron-3-super-120b proven live.
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
    useFor: ['division_agent', 'agent_run', 'creative_brief', 'content_gen'],
  },

  // ── Code surgeon — NVIDIA NIM free endpoint ──
  CODE: {
    label: 'Code/repair/architecture specialist',
    provider: 'nvidia',
    envKey: 'NVIDIA_API_KEY_PURP2',  // purp2 = evals / benchmark
    modelEnv: 'CODE_NVIDIA_MODEL',
    // Was deepseek-coder-6.7b (410 Gone/EOL). nemotron-3-super-120b does
    // agentic coding, free endpoint, proven live (HTTP 200 PONG).
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
    useFor: ['code_patch', 'code_review', 'architecture_check', 'bug_diagnosis', 'patch_planning', 'eval_scoring'],
  },
  REASONING: {
    label: 'Hard reasoning / analysis',
    provider: 'nvidia',
    envKey: 'NVIDIA_API_KEY_PURP1',  // purp1 = default provider lane
    modelEnv: 'REASONING_NVIDIA_MODEL',
    // nemotron-3-ultra-550b: the heavy reasoner. Free endpoint, proven live
    // (HTTP 200 PONG). Was meta/llama-3.1-70b-instruct.
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b',
    useFor: ['reasoning', 'analysis', 'long_thought', 'plan_review'],
  },

  // ── Fallback — NVIDIA NIM (openrouter removed; NIM-only) ──
  FALLBACK: {
    label: 'Fallback / overflow (NVIDIA NIM)',
    provider: 'nvidia',
    envKey: 'NVIDIA_API_KEY',
    modelEnv: 'NVIDIA_MODEL',
    defaultModel: 'meta/llama-3.1-8b-instruct',
    useFor: ['fallback', 'overflow', 'a_b_test', 'niche_model', 'strange_task'],
  },

  // ── Sovereignty ──
  LOCAL: {
    label: 'Local / private / offline baseline',
    provider: 'ollama',
    envKey: 'OLLAMA_BASE_URL',
    modelEnv: 'OLLAMA_MODEL',
    defaultModel: 'qwen2.5:3b',
    useFor: ['local_run', 'private_task', 'offline_mode', 'cheap_tool_loop', 'basic_routing', 'memory_work', 'low_risk_automation'],
  },
  PRIVATE_MODE: {
    label: 'Private mode (local only, no cloud)',
    provider: 'ollama',
    envKey: 'OLLAMA_BASE_URL',
    modelEnv: 'OLLAMA_MODEL',
    defaultModel: 'qwen2.5:3b',
    useFor: ['private_mode', 'airgapped', 'no_cloud'],
  },
};

// Stamp each lane with its own key so resolveLane() can look up user config.
for (const [name, lane] of Object.entries(LANES)) lane.name = name;

// ── Routing table: task_type → lane name ──
const ROUTE_BY_TASK = {
  // User-facing
  user_chat: 'PRIMARY_CHAT',
  user_facing_response: 'PRIMARY_CHAT',
  bigboss_command: 'PRIMARY_CHAT',

  // Tool/agent
  tool_call: 'PRIMARY_TOOL',
  function_call: 'PRIMARY_TOOL',
  agent_task: 'PRIMARY_TOOL',
  agent_pick: 'PRIMARY_DELEGATION',
  task_routing: 'PRIMARY_DELEGATION',
  agent_to_agent: 'PRIMARY_DELEGATION',
  mission_assign: 'PRIMARY_DELEGATION',

  // Code
  code_patch: 'CODE',
  code_review: 'CODE',
  architecture_check: 'CODE',
  bug_diagnosis: 'CODE',
  patch_planning: 'CODE',
  eval_scoring: 'CODE',

  // Reasoning
  reasoning: 'REASONING',
  analysis: 'REASONING',
  long_thought: 'REASONING',
  plan_review: 'REASONING',

  // Swarm
  swarm_dispatch: 'SWARM',
  swarm_division: 'SWARM',
  parallel_research: 'SWARM',
  long_cheap_experiment: 'SWARM',
  model_comparison: 'SWARM',

  // Division
  division_agent: 'DIVISION',
  agent_run: 'DIVISION',
  creative_brief: 'DIVISION',
  content_gen: 'DIVISION',

  // Local
  local_run: 'LOCAL',
  private_task: 'LOCAL',
  offline_mode: 'LOCAL',
  cheap_tool_loop: 'LOCAL',
  basic_routing: 'LOCAL',
  memory_work: 'LOCAL',
  low_risk_automation: 'LOCAL',
  private_mode: 'PRIVATE_MODE',
  airgapped: 'PRIVATE_MODE',
  no_cloud: 'PRIVATE_MODE',

  // Fallback
  fallback: 'FALLBACK',
  overflow: 'FALLBACK',
  a_b_test: 'FALLBACK',
  niche_model: 'FALLBACK',
  strange_task: 'FALLBACK',
};

// ── Public API ──

/**
 * Pick the right lane for a task.
 * @param {Object} opts
 * @param {string} opts.taskType - one of the ROUTE_BY_TASK keys
 * @param {string} [opts.privacy='normal'] - 'normal' | 'private' | 'airgapped'
 * @param {string} [opts.forcedLane] - explicit lane override
 * @returns {Object} { lane, provider, model, envKey, modelEnv, label, reason }
 */
function pickProvider({ taskType, privacy = 'normal', forcedLane } = {}) {
  // 1. Explicit override
  if (forcedLane && LANES[forcedLane]) {
    return shapeChoice(forcedLane, 'explicit-override');
  }
  // 2. Airgapped = local only
  if (privacy === 'airgapped') {
    return shapeChoice('PRIVATE_MODE', 'airgapped-privacy');
  }
  // 3. Task type → lane
  const laneName = ROUTE_BY_TASK[taskType];
  if (!laneName) {
    return shapeChoice('FALLBACK', `unknown-task:${taskType}-fallback`);
  }
  return shapeChoice(laneName, `task:${taskType}`);
}

/**
 * Resolves the env-driven config for a lane (so caller can actually dispatch).
 */
function shapeChoice(laneName, reason) {
  const lane = LANES[laneName];
  if (!lane) return null;
  const r = resolveLane(lane);
  return {
    lane: laneName,
    label: lane.label,
    provider: r.provider,
    model: r.model,
    source: r.source,                                   // env | user-config | default
    fellBackFrom: r.fellBackFrom,                       // provider we degraded from (no key)
    envKey: lane.envKey,
    modelEnv: lane.modelEnv,
    reason: r.fellBackFrom ? `${reason} (fallback: no key for ${r.fellBackFrom})` : reason,
  };
}

/**
 * Convenience: print all lanes + their current env config.
 */
function dumpDoctrine() {
  const out = [];
  out.push('# PURPCLAW Provider Routing Doctrine');
  out.push('');
  out.push('## Lanes (priority order)');
  out.push('');
  for (const [name, lane] of Object.entries(LANES)) {
    const r = resolveLane(lane);
    const tag = r.fellBackFrom ? ` (fallback from ${r.fellBackFrom} — no key)` : ` [${r.source}]`;
    out.push(`### ${name} → ${r.provider} / ${r.model}${tag}`);
    out.push(`  ${lane.label}`);
    out.push(`  env: ${lane.envKey}, ${lane.modelEnv}`);
    out.push(`  useFor: ${lane.useFor.join(', ')}`);
    out.push('');
  }
  out.push('## Routing table (task_type → lane)');
  out.push('');
  for (const [task, lane] of Object.entries(ROUTE_BY_TASK)) {
    out.push(`  ${task.padEnd(22)} → ${lane}`);
  }
  return out.join('\n');
}

/**
 * Route and (optionally) dispatch a chat call through the right provider.
 * Does NOT actually make the HTTP call — returns the dispatch params.
 * The caller (e.g. lib/agent-loop.js) does the real API call.
 *
 * @returns {Object} { lane, provider, model, baseUrl, authHeader, extraHeaders, format }
 */
function routeForDispatch({ taskType, privacy, forcedLane } = {}) {
  const choice = pickProvider({ taskType, privacy, forcedLane });
  if (!choice) return null;
  // The provider's base URL, auth header, and format come from the llm-provider
  // registry, but the routing decision just returns the lane + model.
  return {
    ...choice,
    // The actual HTTP layer resolves baseUrl/format from the llm-provider map.
  };
}

module.exports = {
  LANES,
  ROUTE_BY_TASK,
  pickProvider,
  routeForDispatch,
  dumpDoctrine,
  resolveLane,
  providerUsable,
  firstUsableProvider,
};
