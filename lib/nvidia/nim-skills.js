'use strict';

/**
 * lib/nvidia/nim-skills.js — NVIDIA NIM skills as native PURPCLAW tools.
 *
 * Wires the 3 NIM skill categories (developer_tools, accelerated_computing,
 * ai_and_machine_learning) into the tool registry with 5-key rotation
 * (primary + backup per lane) so the swarm can spread across ~200 RPM
 * aggregate with automatic failover on 429/401.
 *
 * Each skill = a tool that calls the NIM API at:
 *   https://integrate.api.nvidia.com/v1/chat/completions
 *
 * Skills available in each domain (NIM catalog, mid-2026):
 *   developer_tools:        "Build with a Single NIM", "Embeddings API Quickstart"
 *   accelerated_computing:  "GPU Performance Hints", "TensorRT-LLM Engine Build"
 *   ai_and_machine_learning:"RAG with LangChain + NIM", "NeMo Guardrails Setup"
 *
 * Map (NIM domain → PURPCLAW division):
 *   developer_tools         → ENGINEERING · SCIENCE
 *   accelerated_computing   → INFRASTRUCTURE · SCIENCE
 *   ai_and_machine_learning → INTELLIGENCE · SCIENCE
 *   swarm                   → multi-division fanout (Kimi/DeepSeek routing)
 *   planning_quick          → ENGINEERING (DeepSeek Pro/Flash lanes)
 *
 * v2.0 — 5 primary lanes + 5 backup lanes (per operator's pool).
 *        Each lane has: primary key + backup key + cooldown tracker.
 *        Failover: primary → backup → HERMES → NVIDIA_API_KEY.
 *        On 429/401: key is cooled down for 60s before retry.
 */

const https = require('https');

const NIM_BASE = process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// 5 primary + 5 backup NIM keys (per the operator's pool).
// Per-lane key assignment separates traffic so a runaway lane can't starve
// another, gives clean per-key logs, and lets us disable/reroute one lane
// without touching the others. Backup keys kick in only when the primary
// for that lane is rate-limited (429) or unauthorized (401).
//
// Lane map (NIM domain → {primary env var, backup env var}):
//   ai_and_machine_learning → PURP1/BACKUP1  (default provider lane, high traffic)
//   accelerated_computing   → PURP2/BACKUP2  (eval/benchmark traffic)
//   developer_tools         → PURP3/BACKUP3  (engineering/code review)
//   swarm                   → PURP4/BACKUP4  (parallel agent bursts)
//   planning_quick          → PURP5/BACKUP5  (DeepSeek Pro/Flash planner/quick)
const LANE_KEY_ENV = {
  'ai_and_machine_learning': { primary: 'NVIDIA_API_KEY_PURP1', backup: 'NVIDIA_API_KEY_BACKUP1' },
  'accelerated_computing':   { primary: 'NVIDIA_API_KEY_PURP2', backup: 'NVIDIA_API_KEY_BACKUP2' },
  'developer_tools':         { primary: 'NVIDIA_API_KEY_PURP3', backup: 'NVIDIA_API_KEY_BACKUP3' },
  'swarm':                   { primary: 'NVIDIA_API_KEY_PURP4', backup: 'NVIDIA_API_KEY_BACKUP4' },
  'planning_quick':          { primary: 'NVIDIA_API_KEY_PURP5', backup: 'NVIDIA_API_KEY_BACKUP5' },
};
const HERMES_KEY = process.env.NVIDIA_API_KEY_HERMES || process.env.NVIDIA_API_KEY;

// Cooldown state per env var name. unhealthyUntil = epoch ms when key can be retried.
// dead = permanently bad (401 invalid key) — won't be retried until process restart.
const keyHealth = {};   // { [envVarName]: { unhealthyUntil, dead, lastError, failures } }
const COOLDOWN_MS = 60_000;  // 60s cooldown after a 429
const MAX_FAILURES_BEFORE_DEAD = 3;  // after 3 strikes, mark dead

function keyState(envVar) {
  if (!keyHealth[envVar]) keyHealth[envVar] = { unhealthyUntil: 0, dead: false, lastError: null, failures: 0 };
  return keyHealth[envVar];
}
function isAvailable(envVar) {
  const s = keyState(envVar);
  if (s.dead) return false;
  return Date.now() >= s.unhealthyUntil;
}
function markCooldown(envVar, statusCode, errMsg) {
  const s = keyState(envVar);
  s.lastError = errMsg;
  if (statusCode === 401 || statusCode === 403) {
    // Unauthorized — likely bad key, but allow a few retries in case it's transient.
    s.failures++;
    if (s.failures >= MAX_FAILURES_BEFORE_DEAD) {
      s.dead = true;
      console.warn(`[nim] ${envVar} marked DEAD after ${s.failures} auth failures: ${errMsg}`);
    } else {
      s.unhealthyUntil = Date.now() + COOLDOWN_MS;
    }
  } else if (statusCode === 429) {
    // Rate limited — back off for 60s, try backup.
    s.unhealthyUntil = Date.now() + COOLDOWN_MS;
  }
}
function resetKey(envVar) {
  if (keyHealth[envVar]) {
    keyHealth[envVar].unhealthyUntil = 0;
    keyHealth[envVar].failures = 0;
  }
}

const laneCounters = {};
function nextKey(domain, opts = {}) {
  // Try primary → backup → HERMES → NVIDIA_API_KEY, skipping any key that is
  // currently cooled down or marked dead.
  const lane = LANE_KEY_ENV[domain];
  const candidates = [];
  if (lane) {
    candidates.push(lane.primary, lane.backup);
  }
  candidates.push('NVIDIA_API_KEY_HERMES', 'NVIDIA_API_KEY');

  for (const envVar of candidates) {
    if (!isAvailable(envVar)) continue;
    const k = process.env[envVar];
    if (!k) continue;
    laneCounters[domain] = (laneCounters[domain] || 0) + 1;
    return k;
  }
  // Last-ditch: if everything is on cooldown, force the lane primary anyway.
  const forced = lane && process.env[lane.primary];
  if (forced) return forced;
  throw new Error(`no available NIM keys for domain '${domain}' (all lanes cooled down or missing)`);
}
function laneStats() {
  return {
    calls: Object.fromEntries(Object.entries(laneCounters).map(([d, n]) => [d, { calls: n }])),
    keyHealth: Object.fromEntries(Object.entries(keyHealth).map(([k, s]) => [k, {
      dead: s.dead,
      cooling: Date.now() < s.unhealthyUntil,
      failures: s.failures,
      lastError: s.lastError,
    }])),
  };
}

// v2.1 hardening via the same patterns the orchestrator uses
async function withRetry(fn, { attempts = 3, baseMs = 200 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i === attempts - 1) break;
      const delay = Math.min(2000, baseMs * (2 ** i)) + Math.random() * 50;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function httpJson({ model, messages, maxTokens = 512, temperature = 0.7, timeoutMs = 30000, domain }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature });
    // Track which env var we used so we can cooldown the right one on failure.
    const usedKey = nextKey(domain);
    const req = https.request({
      hostname: 'integrate.api.nvidia.com', port: 443, path: '/v1/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + usedKey,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          // Identify which env var provided this key so we can cooldown the
          // right lane. nextKey() returned the value, not the env var name,
          // so reverse-lookup it.
          const envVar = reverseLookupKeyEnv(usedKey, domain);
          if (envVar) markCooldown(envVar, res.statusCode, `NIM ${model} → ${res.statusCode}`);
          return reject(new Error(`NIM ${model} → ${res.statusCode}: ${d.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`NIM request timed out after ${timeoutMs}ms`)));
    req.write(payload);
    req.end();
  });
}

// Given a key value + domain, figure out which env var supplied it so the
// cooldown hook can mark the right lane. Returns null if it was HERMES or
// NVIDIA_API_KEY (no lane attribution possible).
function reverseLookupKeyEnv(keyValue, domain) {
  if (!keyValue) return null;
  const lane = LANE_KEY_ENV[domain];
  if (lane) {
    if (process.env[lane.primary] === keyValue) return lane.primary;
    if (process.env[lane.backup] === keyValue) return lane.backup;
  }
  if (process.env.NVIDIA_API_KEY_HERMES === keyValue) return 'NVIDIA_API_KEY_HERMES';
  if (process.env.NVIDIA_API_KEY === keyValue) return 'NVIDIA_API_KEY';
  return null;
}

// ── NIM SKILL DEFINITIONS ──────────────────────────────────────────────
// Each skill is (id, division, model, description). The runtime will
// auto-create a tool for each skill.
const NIM_SKILLS = [
  // ════════ developer_tools → ENGINEERING ════════
  { id: 'nim_build_with_nim',      domain: 'developer_tools',         division: 'ENGINEERING',   model: 'meta/llama-3.1-8b-instruct',  description: 'Walk a developer through building their first NIM-backed chat app.' },
  { id: 'nim_embeddings_quickstart',domain:'developer_tools',         division: 'ENGINEERING',   model: 'nvidia/nv-embedqa-e5-v5',    description: 'Generate embeddings for a corpus using the NIM Embeddings API.' },
  { id: 'nim_code_review',         domain: 'developer_tools',         division: 'ENGINEERING',   model: 'deepseek-ai/deepseek-v4-flash', description: 'AI code review for a single file, using DeepSeek V4.' },
  { id: 'nim_pr_summary',          domain: 'developer_tools',         division: 'ENGINEERING',   model: 'meta/llama-3.1-70b-instruct', description: 'Summarize a diff or pull request in under 200 words.' },
  { id: 'nim_test_generator',      domain: 'developer_tools',         division: 'ENGINEERING',   model: 'deepseek-ai/deepseek-coder-6.7b-instruct', description: 'Generate unit tests for a function in any common language.' },

  // ════════ accelerated_computing → INFRASTRUCTURE ════════
  { id: 'nim_gpu_perf_hints',     domain: 'accelerated_computing',   division: 'INFRASTRUCTURE', model: 'meta/llama-3.1-8b-instruct',  description: 'Quick GPU performance tuning tips for common workload patterns.' },
  { id: 'nim_tensorrt_llm_build',  domain: 'accelerated_computing',   division: 'INFRASTRUCTURE', model: 'mistralai/mistral-7b-instruct-v0.3', description: 'TensorRT-LLM engine build command and config for a given model.' },
  { id: 'nim_cuda_kernel_explain', domain: 'accelerated_computing',   division: 'INFRASTRUCTURE', model: 'meta/llama-3.1-70b-instruct', description: 'Explain what a CUDA kernel does, line by line.' },
  { id: 'nim_nemo_train',          domain: 'accelerated_computing',   division: 'INFRASTRUCTURE', model: 'meta/llama-3.1-8b-instruct',  description: 'NeMo framework train command for a given model + dataset.' },
  { id: 'nim_triton_serve',        domain: 'accelerated_computing',   division: 'INFRASTRUCTURE', model: 'meta/llama-3.1-8b-instruct',  description: 'Triton Inference Server config for serving a model with NIM.' },

  // ════════ ai_and_machine_learning → INTELLIGENCE ════════
  { id: 'nim_rag_langchain',       domain: 'ai_and_machine_learning', division: 'INTELLIGENCE',  model: 'meta/llama-3.1-70b-instruct', description: 'RAG pipeline using LangChain + NVIDIA NIM as the inference backend.' },
  { id: 'nim_nemo_guardrails',     domain: 'ai_and_machine_learning', division: 'INTELLIGENCE',  model: 'meta/llama-3.1-8b-instruct',  description: 'Set up NeMo Guardrails on a NIM-served model with a sample config.' },
  { id: 'nim_finetune_lora',       domain: 'ai_and_machine_learning', division: 'INTELLIGENCE',  model: 'meta/llama-3.1-8b-instruct',  description: 'LoRA fine-tuning recipe for a base model on a custom dataset.' },
  { id: 'nim_prompt_optimize',     domain: 'ai_and_machine_learning', division: 'INTELLIGENCE',  model: 'meta/llama-3.1-70b-instruct', description: 'Optimize a prompt for a target NIM model, returning the improved version.' },
  { id: 'nim_model_compare',      domain: 'ai_and_machine_learning', division: 'INTELLIGENCE',  model: 'deepseek-ai/deepseek-v4-pro',  description: 'Compare two NIM models on a given prompt and score the responses.' },
];

// ── REGISTER SKILLS AS TOOLS ───────────────────────────────────────────
function registerNimSkills(registry) {
  if (!registry || typeof registry.register !== 'function') {
    throw new Error('registerNimSkills requires a ToolRegistry with .register()');
  }
  let count = 0;
  for (const skill of NIM_SKILLS) {
    // skill.id is already prefixed with 'nim_' (e.g. 'nim_build_with_nim')
    const toolName = skill.id;
    registry.register({
      name: toolName,
      description: `[NIM:${skill.domain}] ${skill.description}`,
      division: skill.division,
      domain: skill.domain,
      model: skill.model,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The input text/prompt for the NIM skill' },
          maxTokens: { type: 'number', default: 512, description: 'Max output tokens' },
        },
        required: ['prompt'],
      },
      async execute(args) {
        const { prompt, maxTokens = 512 } = args || {};
        if (!prompt) return { ok: false, error: 'prompt is required' };
        return withRetry(() => httpJson({
          model: skill.model,
          messages: [{ role: 'user', content: prompt }],
          maxTokens,
          domain: skill.domain,  // route via the lane key for this domain
        })).then(r => ({
          ok: true,
          skill: skill.id,
          model: skill.model,
          division: skill.division,
          text: r.choices?.[0]?.message?.content || r.choices?.[0]?.text || r.raw,
          usage: r.usage || null,
        })).catch(e => ({ ok: false, skill: skill.id, error: e.message }));
      },
    });
    count++;
  }
  return { registered: count, byDomain: NIM_SKILLS.reduce((acc, s) => {
    acc[s.domain] = (acc[s.domain] || 0) + 1; return acc;
  }, {}) };
}

module.exports = {
  registerNimSkills,
  NIM_SKILLS,
  nextKey,
  laneStats,
  LANE_KEY_ENV,
  withRetry,
  httpJson,
  markCooldown,
  resetKey,
  isAvailable,
  keyHealth,
  COOLDOWN_MS,
};
