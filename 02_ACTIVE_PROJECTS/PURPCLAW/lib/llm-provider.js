'use strict';

// Auto-load .env if dotenv is available. This makes the LLM provider
// work both from the API server (unified_api.js) and from the CLI
// (bin/purpclaw.js) without each caller having to remember to call
// dotenv.config() first.
try { require('dotenv').config(); } catch (e) { /* dotenv not installed, fall through */ }

const https = require('https');
const http  = require('http');
const { URL } = require('url');
const EVENT = (() => { try { return require('./event-bus'); } catch { return null; } })();
const PROVIDER_HEALTH = (() => { try { return require('./provider_health'); } catch { return null; } })();
// NEW HEALTH TAXONOMY: per-model states feeding /api/llm/health (provider-health.js).
const MODEL_HEALTH = (() => { try { return require('./provider-health'); } catch { return null; } })();
const publishProviderEvent = (topic, data) => {
  try { if (EVENT && EVENT.publish) EVENT.publish(topic, data); } catch { /* observability never breaks inference */ }
};

/**
 * Map raw HTTP error bodies to human-readable messages for every surface.
 * Replaces the raw "HTTP 401: {}" leak with actionable diagnosis.
 *
 * @param {string} body          - raw response body (may be empty or JSON)
 * @param {number} statusCode   - HTTP status code
 * @param {'openai'|'anthropic'|'gemini'} providerType
 * @returns {string}             - human-readable error message
 */
function humanError(body, statusCode, providerType) {
  // Try to parse structured error
  let code = null, message = null;
  try { const j = JSON.parse(body); code = j.error?.code || j.code || j.status; message = j.error?.message || j.message || j.status; } catch (_) {}

  if (statusCode === 401 || statusCode === 402 || statusCode === 403) {
    if (code === 'invalid_api_key' || code === 'error.api_key_invalid' || code === 1004 || (message && String(message).toLowerCase().includes('auth'))) {
      return `Provider authentication failed (HTTP ${statusCode}). ` +
        `Your API key is invalid, expired, or lacks permissions. ` +
        `Refresh the key for provider "${providerType}" and update your .env file.`;
    }
    if (code === 'insufficient_quota' || code === 'billing_not_enabled') {
      return `Provider "${providerType}" has no credit or the free tier is exhausted (HTTP ${statusCode}). ` +
        `Add credit or switch to a funded key.`;
    }
    if (code === 'model_not_found' || code === 'invalid_model') {
      return `Model not found (HTTP ${statusCode}). ` +
        `The model ID may be wrong or the key doesn't have access to this model.`;
    }
    return `Provider "${providerType}" rejected the request (HTTP ${statusCode}). ` +
      `Authentication, billing, or permissions issue — check your API key.`;
  }

  if (statusCode === 429) {
    return `Provider "${providerType}" rate-limited (HTTP 429). ` +
      `Wait a moment and retry, or check your request frequency.`;
  }

  if (statusCode === 500 || statusCode === 502 || statusCode === 503) {
    return `Provider "${providerType}" had a server error (HTTP ${statusCode}). ` +
      `This is usually temporary — retry shortly.`;
  }

  // Fallback: include the raw body snippet if it's meaningful
  const snippet = body && body.length > 3 ? ` — ${body.slice(0, 200)}` : '';
  return `HTTP ${statusCode}${snippet}`;
}

/**
 * PURPCLAW LLM Provider
 * =====================
 * Unified, provider-agnostic LLM interface. Bring your own API key.
 * Supports any OpenAI-compatible provider + Anthropic/Gemini natively.
 *
 * Configuration (via .env):
 *
 *   LLM_PROVIDER=openai           # Provider for orchestration/planning calls
 *   LLM_API_KEY=sk-...            # API key for that provider
 *   LLM_MODEL=gpt-4o              # Model override (provider defaults used if omitted)
 *   LLM_BASE_URL=                 # Custom base URL (for Ollama, LM Studio, proxies, etc.)
 *   LLM_FALLBACK=ollama           # Local fallback: ollama | lmstudio | off
 *   LLM_FALLBACK_MODEL=qwen2.5:3b # Local fallback model
 *   ANTHROPIC_API_KEY=...         # Provider-native aliases are also accepted
 *   GEMINI_API_KEY=...
 *
 *   SWARM_PROVIDER=kimi           # Provider for the heavy swarm reasoning engine
 *   SWARM_API_KEY=...             # API key for swarm provider (falls back to LLM_API_KEY)
 *   SWARM_MODEL=kimi-k2-5         # Swarm model
 *
 * Supported providers (OpenAI-compatible):
 *   openai      → api.openai.com
 *   kimi        → api.moonshot.cn          (Kimi K2)
 *   groq        → api.groq.com/openai/v1
 *   deepseek    → api.deepseek.com/v1
 *   openrouter  → openrouter.ai/api/v1     (access 200+ models)
 *   together    → api.together.xyz/v1
 *   mistral     → api.mistral.ai/v1
 *   ollama      → localhost:11434/v1       (fully local, free)
 *   lmstudio    → localhost:1234/v1        (fully local, free)
 *   custom      → LLM_BASE_URL            (any OpenAI-compatible endpoint)
 *
 * Supported providers (native adapters):
 *   anthropic   → api.anthropic.com        (Claude)
 *   gemini      → Google Gemini API
 *
 * Usage:
 *   const llm = require('./lib/llm-provider');
 *
 *   // Main API (orchestration, planning, analysis):
 *   const resp = await llm.chat([{ role: 'user', content: 'Hello' }]);
 *
 *   // Swarm engine (agent reasoning, heavy tasks):
 *   const resp = await llm.swarm([{ role: 'user', content: 'Analyze this codebase' }]);
 *
 *   // One-shot completion:
 *   const text = await llm.complete('Summarise this in one sentence: ...');
 */

// ── Provider registry ─────────────────────────────────────────────────────────

// ── Sampling-parameter capability map ────────────────────────────────────────
// Single source of truth for what each provider FORMAT genuinely accepts.
// Keys are OpenAI-style names; format-specific builders translate.
// The UI reads this via /api/llm/registry to build honest per-route controls
// (Settings shows a control ONLY if it appears here AND the active route's
// provider lists it). Unknown providers default to openai-format superset.
const PROVIDER_CAPABILITIES = {
  // format:openai — full OpenAI-compatible superset
  openai:         { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
  kimi:           { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','stop','response_format','tools'] },
  minimax:        { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','stop','response_format','tools'] },
  groq:           { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
  deepseek:       { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','stop','response_format','tools'] },
  nvidia:         { format: 'openai', params: ['temperature','top_p','top_k','max_tokens','frequency_penalty','presence_penalty','seed','stop','tools'] },
  openrouter:     { format: 'openai', params: ['temperature','top_p','top_k','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] }, // passes unknowns through to routed model
  'github-models':{ format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
  codex:          { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
  'codex-oauth':  { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
  together:       { format: 'openai', params: ['temperature','top_p','top_k','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
  huggingface:    { format: 'openai', params: ['temperature','top_p','top_k','max_tokens','frequency_penalty','presence_penalty','seed','stop'] },
  cloudflare:     { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','seed','stop','tools'] },
  cohere:         { format: 'openai', params: ['temperature','top_p','top_k','max_tokens','frequency_penalty','presence_penalty','seed','stop','tools'] },
  ollama:         { format: 'ollama', params: ['temperature','top_p','top_k','max_tokens','frequency_penalty','presence_penalty','seed','stop'] },
  lmstudio:       { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
  anthropic:      { format: 'anthropic', params: ['temperature','top_p','top_k','max_tokens','stop','tools'] }, // no penalties/seed in Messages API
  gemini:         { format: 'gemini', params: ['temperature','top_p','top_k','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
  custom:         { format: 'openai', params: ['temperature','top_p','max_tokens','frequency_penalty','presence_penalty','seed','stop','response_format','tools'] },
};

/**
 * Pick ONLY capability-supported sampling params from opts.
 * Returns {} when nothing is set — never fabricates defaults beyond
 * temperature/max_tokens, which the builders already apply.
 * opts uses camelCase (topP, topK, frequencyPenalty, presencePenalty, seed);
 * response is snake_case keyed for direct body spread.
 */
function samplingParams(opts = {}, cfg) {
  const cap = PROVIDER_CAPABILITIES[cfg?.providerName]
    || { params: PROVIDER_CAPABILITIES.custom.params };
  const allowed = new Set(cap.params);
  const MAP = {
    temperature:        'temperature',
    topP:               'top_p',
    topK:               'top_k',
    maxTokens:          'max_tokens',
    frequencyPenalty:   'frequency_penalty',
    presencePenalty:    'presence_penalty',
    seed:               'seed',
  };
  const out = {};
  for (const [camel, snake] of Object.entries(MAP)) {
    if (allowed.has(snake) && opts[camel] !== undefined && opts[camel] !== null) {
      out[snake] = opts[camel];
    }
  }
  return out;
}

const PROVIDERS = {
  openai: {
    baseUrl      : 'https://api.openai.com/v1',
    defaultModel : 'gpt-4o-mini',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  kimi: {
    baseUrl      : 'https://api.moonshot.cn/v1',
    defaultModel : 'kimi-k2-5',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  minimax: {
    baseUrl      : 'https://api.minimax.io/v1',
    defaultModel : 'MiniMax-M2.7',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  groq: {
    baseUrl      : 'https://api.groq.com/openai/v1',
    defaultModel : 'llama-3.3-70b-versatile',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  deepseek: {
  baseUrl      : 'https://api.deepseek.com/v1',
  defaultModel : 'deepseek-v4-pro',
  authHeader   : 'Bearer',
  format       : 'openai',
  },
  nvidia: {
    // NVIDIA NIM API — OpenAI-compatible. Free tier: 1000 requests/day for many models.
    // Get your key at https://build.nvidia.com — sign in, click any model, "Get API Key".
    baseUrl      : 'https://integrate.api.nvidia.com/v1',
    defaultModel : 'meta/llama-3.1-70b-instruct',
    authHeader   : 'Bearer',
    format       : 'openai',
    extraHeaders : { 'accept' : 'application/json' },
    //   meta/llama-3.1-70b-instruct     — 70B Llama, strong general
    //   meta/llama-3.1-8b-instruct      — 8B Llama, fast + cheap
    //   meta/llama-3.3-70b-instruct     — 70B Llama 3.3, latest
    //   mistralai/mistral-7b-instruct-v0.3
    //   google/gemma-2-9b-it            — Google Gemma 2 9B
    //   nvidia/nemotron-4-340b-instruct — NVIDIA's own 340B model
    //   qwen/qwen2.5-72b-instruct       — Alibaba Qwen 2.5 72B
    //   microsoft/phi-3-medium-128k-instruct
    // Switch with: LLM_MODEL=meta/llama-3.1-70b-instruct
  },
  openrouter: {
    baseUrl      : 'https://openrouter.ai/api/v1',
    defaultModel : 'openrouter/free',
    authHeader   : 'Bearer',
    format       : 'openai',
    extraHeaders : {
      'HTTP-Referer' : 'https://github.com/purpclaw/purpclaw',
      'X-Title'      : 'PURPCLAW',
    },
  },
  together: {
    baseUrl      : 'https://api.together.xyz/v1',
    defaultModel : 'meta-llama/Llama-3-70b-chat-hf',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  mistral: {
    baseUrl      : 'https://api.mistral.ai/v1',
    defaultModel : 'mistral-small-latest',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  huggingface: {
    // Hugging Face Router — OpenAI-compatible, generous free tier for many OSS models.
    // Get a free token at https://huggingface.co/settings/tokens (no card needed).
    baseUrl      : 'https://router.huggingface.co/v1',
    defaultModel : 'meta-llama/Llama-3.1-8B-Instruct',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  cloudflare: {
    // Cloudflare Workers AI — OpenAI-compatible, 10,000 neurons/day free.
    // Set CF_ACCOUNT_ID and CF_API_TOKEN, base URL is auto-derived.
    baseUrl      : 'https://api.cloudflare.com/client/v4/accounts/' +
                    (process.env.CF_ACCOUNT_ID || 'placeholder') + '/ai/v1',
    defaultModel : '@cf/meta/llama-3.1-8b-instruct',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  cohere: {
    // Cohere trial — OpenAI-compatible endpoint. Free trial credits, then pay-as-you-go.
    baseUrl      : 'https://api.cohere.com/compatibility/v1',
    defaultModel : 'command-r-plus',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  ollama: {
    baseUrl      : 'http://localhost:11434/v1',
    defaultModel : 'qwen2.5:3b',
    authHeader   : 'Bearer',
    format       : 'openai',
    apiKey       : 'ollama', // Ollama doesn't require a real key
  },
  lmstudio: {
    baseUrl      : 'http://localhost:1234/v1',
    defaultModel : 'local-model',
    authHeader   : 'Bearer',
    format       : 'openai',
    apiKey       : 'lm-studio',
  },
  anthropic: {
    baseUrl      : 'https://api.anthropic.com',
    defaultModel : 'claude-3-5-haiku-20241022',
    authHeader   : 'x-api-key',
    format       : 'anthropic',
    extraHeaders : { 'anthropic-version': '2023-06-01' },
  },
  gemini: {
    baseUrl      : 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel : 'gemini-2.5-flash',
    authHeader   : 'key',
    format       : 'gemini',
  },
  custom: {
    // baseUrl comes from LLM_BASE_URL env
    defaultModel : 'default',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  // GitHub Models: free tier, all major LLMs, OpenAI-compatible.
  // Endpoint: https://models.inference.ai.azure.com
  // Auth: GITHUB_TOKEN (PAT with models:read scope).
  'github-models': {
    baseUrl      : 'https://models.inference.ai.azure.com',
    defaultModel : 'gpt-4o-mini',
    authHeader   : 'Bearer',
    format       : 'openai',
    extraHeaders : {
      'X-GitHub-Api-Version': '2024-12-01',
    },
  },
  // OpenAI Codex: gpt-5-codex family via the standard OpenAI API.
  // Note: as of late 2025 the Codex CLI uses its own OAuth flow;
  // the `codex` provider here is the standard API access path.
  codex: {
    baseUrl      : 'https://api.openai.com/v1',
    defaultModel : 'gpt-5-codex',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  // Codex OAuth: when the user has authorized via `codex login` or
  // the Codex CLI's device flow. Reads CODEX_OAUTH_TOKEN from env.
  // The baseUrl points at OpenAI's API; the auth is a special JWT
  // scoped to the user's ChatGPT account.
  'codex-oauth': {
    baseUrl      : 'https://api.openai.com/v1',
    defaultModel : 'gpt-5-codex',
    authHeader   : 'Bearer',
    format       : 'openai',
    apiKeyEnv    : 'CODEX_OAUTH_TOKEN',
  },
  // Atomic Chat: provider config — endpoint not yet public. Set
  // LLM_BASE_URL=https://api.atomic-chat.example/v1 and
  // LLM_API_KEY=... via env to enable. Format is OpenAI-compatible
  // per the product spec.
  'atomic-chat': {
    baseUrl      : process.env.ATOMIC_CHAT_BASE_URL || 'https://api.atomic-chat.example/v1',
    defaultModel : 'atomic-chat-default',
    authHeader   : 'Bearer',
    format       : 'openai',
    apiKeyEnv    : 'ATOMIC_CHAT_API_KEY',
  },
};

const PROVIDER_ENV_ALIASES = {
  openai: {
    apiKey: ['OPENAI_API_KEY'],
    model: ['OPENAI_MODEL'],
    baseUrl: ['OPENAI_BASE_URL'],
  },
  anthropic: {
    apiKey: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    model: ['ANTHROPIC_MODEL', 'CLAUDE_MODEL'],
    baseUrl: ['ANTHROPIC_BASE_URL'],
  },
  gemini: {
    apiKey: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    model: ['GEMINI_MODEL', 'GOOGLE_MODEL'],
    baseUrl: ['GEMINI_BASE_URL', 'GOOGLE_BASE_URL'],
  },
  kimi: {
    apiKey: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    model: ['KIMI_MODEL', 'MOONSHOT_MODEL'],
    baseUrl: ['KIMI_BASE_URL', 'MOONSHOT_BASE_URL'],
  },
  minimax: {
    apiKey: ['MINIMAX_API_KEY'],
    model: ['MINIMAX_MODEL'],
    baseUrl: ['MINIMAX_BASE_URL', 'MINIMAX_API_ENDPOINT'],
  },
  deepseek: {
    apiKey: ['DEEPSEEK_API_KEY'],
    model: ['DEEPSEEK_MODEL'],
    baseUrl: ['DEEPSEEK_BASE_URL'],
  },
  groq: {
    apiKey: ['GROQ_API_KEY'],
    model: ['GROQ_MODEL'],
    baseUrl: ['GROQ_BASE_URL'],
  },
  together: {
    apiKey: ['TOGETHER_API_KEY'],
    model: ['TOGETHER_MODEL'],
    baseUrl: ['TOGETHER_BASE_URL'],
  },
  openrouter: {
    apiKey: ['OPENROUTER_API_KEY'],
    model: ['OPENROUTER_MODEL'],
    baseUrl: ['OPENROUTER_BASE_URL'],
  },
  nvidia: {
    apiKey: ['NVIDIA_API_KEY', 'NVAPI_KEY', 'NVIDIA_NIM_API_KEY'],
    model: ['NVIDIA_MODEL', 'NVIDIA_NIM_MODEL'],
    baseUrl: ['NVIDIA_BASE_URL', 'NVIDIA_NIM_BASE_URL', 'NVIDIA_API_BASE'],
  },
  huggingface: {
    apiKey: ['HUGGINGFACE_API_KEY', 'HF_TOKEN', 'HUGGINGFACE_TOKEN'],
    model: ['HUGGINGFACE_MODEL', 'HF_MODEL'],
    baseUrl: ['HUGGINGFACE_BASE_URL', 'HF_BASE_URL'],
  },
  cloudflare: {
    apiKey: ['CF_API_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_TOKEN'],
    model: ['CLOUDFLARE_MODEL'],
    baseUrl: ['CLOUDFLARE_BASE_URL'],
  },
  cohere: {
    apiKey: ['COHERE_API_KEY', 'CO_API_KEY'],
    model: ['COHERE_MODEL'],
    baseUrl: ['COHERE_BASE_URL'],
  },
  ollama: {
    model: ['OLLAMA_MODEL'],
    baseUrl: ['OLLAMA_BASE_URL'],
  },
  lmstudio: {
    model: ['LMSTUDIO_MODEL'],
    baseUrl: ['LMSTUDIO_BASE_URL'],
  },
};

function firstEnv(keys = []) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return '';
}

function configForProvider(providerName, opts = {}) {
  const name = String(providerName || '').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) return null;
  const aliases = PROVIDER_ENV_ALIASES[name] || {};
  const mainName = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  const isMain = mainName === name;
  return {
    providerName: name,
    provider,
    baseUrl: opts.baseUrl || firstEnv(aliases.baseUrl)
      || (isMain ? process.env.LLM_BASE_URL : '') || provider.baseUrl,
    apiKey: opts.apiKey || firstEnv(aliases.apiKey)
      || (isMain ? process.env.LLM_API_KEY : '') || provider.apiKey
      || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : '') || '',
    model: opts.model || firstEnv(aliases.model)
      || (isMain ? process.env.LLM_MODEL : '') || provider.defaultModel,
    format: provider.format,
    authHeader: provider.authHeader,
    extraHeaders: provider.extraHeaders || {},
  };
}

// ── Config resolution ─────────────────────────────────────────────────────────

function resolveConfig(envPrefix = 'LLM') {
  const providerName = (process.env[`${envPrefix}_PROVIDER`] || 'openai').toLowerCase();
  const provider     = PROVIDERS[providerName] || PROVIDERS.openai;

  const aliases  = PROVIDER_ENV_ALIASES[providerName] || {};
  const baseUrl  = process.env[`${envPrefix}_BASE_URL`] || firstEnv(aliases.baseUrl) || provider.baseUrl;
  const apiKey   = process.env[`${envPrefix}_API_KEY`]  || firstEnv(aliases.apiKey)  || provider.apiKey || '';
  const model    = process.env[`${envPrefix}_MODEL`]    || firstEnv(aliases.model)   || provider.defaultModel;

  if (!apiKey && providerName !== 'ollama' && providerName !== 'lmstudio' && providerName !== 'custom') {
    // Warn once, don't spam
    if (!resolveConfig._warned) {
      resolveConfig._warned = {};
    }
    if (!resolveConfig._warned[envPrefix]) {
      resolveConfig._warned[envPrefix] = true;
      console.warn(`[LLM] Warning: ${envPrefix}_API_KEY not set for provider "${providerName}". Set it in .env.`);
    }
  }

  return {
    providerName,
    provider,
    baseUrl,
    apiKey,
    model,
    format       : provider.format,
    authHeader   : provider.authHeader,
    extraHeaders : provider.extraHeaders || {},
  };
}

const mainConfig  = () => resolveConfig('LLM');
const swarmConfig = () => {
  // Swarm can have its own provider, falls back to main
  const swarmProvider = process.env.SWARM_PROVIDER;
  if (swarmProvider) return resolveConfig('SWARM');
  // No SWARM_PROVIDER set → use main config but check SWARM_API_KEY
  const cfg = resolveConfig('LLM');
  if (process.env.SWARM_API_KEY)  cfg.apiKey = process.env.SWARM_API_KEY;
  if (process.env.SWARM_MODEL)    cfg.model  = process.env.SWARM_MODEL;
  return cfg;
};

// ── HTTP transport ────────────────────────────────────────────────────────────

function httpRequest(url, method, headers, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;

    const opts = {
      hostname : parsed.hostname,
      port     : parsed.port || (isHttps ? 443 : 80),
      path     : parsed.pathname + parsed.search,
      method,
      headers  : {
        'Content-Type' : 'application/json',
        'User-Agent'   : 'PURPCLAW/1.0',
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed_ = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed_);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
          }
        } catch {
          reject(new Error(`Parse error (HTTP ${res.statusCode}): ${data.substring(0, 200)}`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('LLM request timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Format adapters ───────────────────────────────────────────────────────────

/**
 * OpenAI-compatible chat completion.
 */
async function chatOpenAI(cfg, messages, opts = {}) {
  const url     = `${cfg.baseUrl}/chat/completions`;
  const headers = {
    'Authorization' : `${cfg.authHeader} ${cfg.apiKey}`,
    ...cfg.extraHeaders,
  };

  const body = {
    model       : opts.model    || cfg.model,
    messages,
    // Explicit temperature/maxTokens always win; samplingParams adds only
    // capability-supported extras (top_p, penalties, seed…) from the map.
    ...(samplingParams(opts, cfg)),
    ...(!opts.temperature && opts.temperature !== 0 ? { temperature: 0.7 } : {}),
    ...(!opts.maxTokens ? { max_tokens: 4096 } : {}),
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    ...(opts.tools          ? { tools: opts.tools, tool_choice: opts.toolChoice || 'auto' } : {}),
    ...(opts.stop           ? { stop: opts.stop }  : {}),
  };

  const resp = await httpRequest(url, 'POST', headers, body, opts.timeoutMs || 60000);

  return {
    content     : resp.choices?.[0]?.message?.content || '',
    toolCalls   : resp.choices?.[0]?.message?.tool_calls || [],
    usage       : resp.usage || {},
    model       : resp.model || body.model,
    raw         : resp,
  };
}

/**
 * OpenAI-compatible STREAMING chat completion. Yields delta chunks as
 * they arrive from the server (text/event-stream → parsed SSE).
 *
 * Usage:
 *   for await (const chunk of streamChatOpenAI(cfg, messages, opts)) {
 *     process.stdout.write(chunk.content);
 *   }
 *
 * Each chunk: { content, done, model, usage? }
 *  - content: incremental text (often a few chars/tokens)
 *  - done:    true on the final chunk
 *  - model:   model name (first chunk)
 *  - usage:   token usage (final chunk, if provider returns it)
 */
/**
 * THINK LEVEL → provider params (universal cockpit slider translation).
 * 'quick'|'normal'|'hard'|'xhard'|'max' → OpenAI-style reasoning effort.
 * Returns null when no level given or level is 'normal' (provider default) —
 * the adapter NEVER fabricates reasoning support; unsupported models simply
 * receive no reasoning fields and run MODEL DEFAULT.
 */
function mapThinkParams(level) {
  if (!level || level === 'normal') return null;
  const EFFORT = { quick: 'low', hard: 'high', xhard: 'high', max: 'max' };
  const effort = EFFORT[level];
  if (!effort) return null;
  return { reasoning_effort: effort };
}

async function* streamChatOpenAI(cfg, messages, opts = {}) {
  const fs = require('fs');
  const API_LOG = require('path').join(__dirname, '..', 'var', 'purp-api.log');
  function safeLog(tag, msg) { try { fs.appendFileSync(API_LOG, `[${new Date().toISOString()}] [${tag}] ${msg}\n`, 'utf8'); } catch {} }
  safeLog('DEBUG_STREAM', `streamChatOpenAI called baseUrl=${cfg.baseUrl} model=${cfg.model} apiKeyLen=${cfg.apiKey ? cfg.apiKey.length : 0}`);
  const url     = `${cfg.baseUrl}/chat/completions`;
  const headers = {
    'Authorization' : `${cfg.authHeader} ${cfg.apiKey}`,
    'Accept'        : 'text/event-stream',
    ...cfg.extraHeaders,
  };

  const body = {
    model       : opts.model    || cfg.model,
    messages,
    stream      : true,
    // Capability-gated sampling params (see samplingParams + PROVIDER_CAPABILITIES)
    ...(samplingParams(opts, cfg)),
    ...(!opts.temperature && opts.temperature !== 0 ? { temperature: 0.7 } : {}),
    ...(!opts.maxTokens ? { max_tokens: 4096 } : {}),
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    // THINK LEVEL (composer → adapter): translate the universal cockpit level
    // into provider-native reasoning params. Only OpenAI-style `reasoning`
    // object is emitted here, and only when the caller passed a level — never
    // invent support for models that don't accept it.
    ...(mapThinkParams(opts.thinkLevel) || {}),
    ...(opts.tools          ? { tools: opts.tools, tool_choice: opts.toolChoice || 'auto' } : {}),
    ...(opts.stop           ? { stop: opts.stop }  : {}),
  };

  const payload = JSON.stringify(body);
  safeLog('SAMPLING_WIRE', `provider=${cfg?.providerName || 'unknown'} model=${body.model} sampling=${JSON.stringify(samplingParams(opts, cfg))}`);
  const parsed  = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const lib     = isHttps ? require('https') : require('http');

  const opts2 = {
    hostname : parsed.hostname,
    port     : parsed.port || (isHttps ? 443 : 80),
    path     : parsed.pathname + parsed.search,
    method   : 'POST',
    headers  : {
      'Content-Type'  : 'application/json',
      'Accept'        : 'text/event-stream',
      'Authorization' : `${cfg.authHeader} ${cfg.apiKey}`,
      ...cfg.extraHeaders,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const res = await new Promise((resolve, reject) => {
    const req = lib.request(opts2, resolve);
    req.setTimeout(opts.timeoutMs || 120000, () => req.destroy(new Error('LLM stream timeout')));
    req.on('error', reject);
    // Connect watchdog: a server that accepts TCP but never sends HTTP
    // headers would park this promise forever (req.setTimeout is an idle-
    // SOCKET timer and does not fire on a healthy open connection).
    const connectTo = setTimeout(() => {
      const err = new Error('FIRST_TOKEN_TIMEOUT');
      err.failureClass = 'FIRST_TOKEN_TIMEOUT';
      req.destroy(err);
      reject(err);
    }, opts.firstTokenTimeoutMs || 20000);
    req.on('response', () => clearTimeout(connectTo));
    req.write(payload); req.end();
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    safeLog('DEBUG_STREAM', `HTTP error status=${res.statusCode}`);
    // Read the error body then throw
    let body = '';
    for await (const c of res) body += c;
    const human = humanError(body.trim(), res.statusCode, cfg.providerName || 'openai');
    throw new Error(human);
  }

  safeLog('DEBUG_STREAM', `HTTP OK status=${res.statusCode}, starting SSE parsing`);
  // Parse SSE stream. Format:
  //   data: {"choices":[{"delta":{"content":"tok"}}]}\n\n
  //   data: [DONE]\n\n
  // Watchdog: a provider that opens the stream then goes silent (MiniMax has
  // done this live) must not hang the turn for the full request timeout.
  // Phase 1: no usable delta within firstTokenTimeoutMs -> FIRST_TOKEN_TIMEOUT.
  // Phase 2: after first token, silence > stallTimeoutMs -> STREAM_STALLED.
  const firstTokenTimeoutMs = opts.firstTokenTimeoutMs || 20000;
  const stallTimeoutMs = opts.stallTimeoutMs || 45000;
  let sawFirstToken = false;
  let watchdogFailure = null; // set by the watchdog, thrown from the read loop
  // On modern Node, res.destroy() does NOT end a `for await` parked on an idle
  // IncomingMessage (proven by repro). So race every iterator.next() against a
  // rejection gate that the watchdog trips.
  const pendingGuards = new Set();
  const fireWatchdog = (cls) => {
    if (watchdogFailure) return;
    watchdogFailure = new Error(cls);
    try { res.destroy(); } catch {}
    for (const rej of pendingGuards) { try { rej(watchdogFailure); } catch {} }
    pendingGuards.clear();
  };
  let watchdog = setTimeout(() => {
    fireWatchdog(sawFirstToken ? 'STREAM_STALLED' : 'FIRST_TOKEN_TIMEOUT');
  }, firstTokenTimeoutMs);
  const kickWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => { fireWatchdog('STREAM_STALLED'); }, stallTimeoutMs);
  };
  // Watchdog-aware wrapper around the raw response stream.
  async function* watchedChunks() {
    const it = res[Symbol.asyncIterator]();
    while (true) {
      if (watchdogFailure) throw watchdogFailure;
      const p = it.next();
      let guardRej = null;
      const guard = new Promise((_, rej) => { guardRej = rej; pendingGuards.add(rej); });
      let result;
      try {
        result = await Promise.race([p, guard]);
      } catch (e) {
        if (watchdogFailure) throw watchdogFailure;
        throw e;
      } finally { pendingGuards.delete(guardRej); }
      if (result === undefined) { try { res.destroy(); } catch {} throw watchdogFailure || new Error('STREAM_STALLED'); }
      p.catch(() => {}); // losing race must not become unhandled rejection
      if (result.done) return;
      yield result.value;
    }
  }
  let buf = '';
  // TOOL-CALL FRAGMENT ASSEMBLY LAW (2026-08-26): OpenAI-compatible providers
  // stream tool_calls as INDEXED FRAGMENTS — each SSE chunk carries a slice
  // of function.arguments. Parsing a fragment in isolation throws or yields
  // {}, which produced the "empty command args" P0 (DebtFlix transcript).
  // Accumulate by tc.index at STREAM scope; emit each call once its JSON closes.
  const toolFragBuf = {};
  // REASONING-STREAM LIVENESS LAW (2026-08-26): reasoning models (ox-alpha,
  // MiniMax-M3) stream delta.content len=0 + reasoning keys during their think
  // phase. Any parsed SSE chunk with a delta is proof of liveness — kick the
  // watchdog on chunk ARRIVAL, not only visible text, or healthy >20s think
  // phases die as FIRST_TOKEN_TIMEOUT (proven: 01:44:35 HTTP OK → deltas
  // flowing → watchdog kill ~31s in).
  const kickOnChunk = () => {
    if (sawFirstToken) kickWatchdog();
    else { sawFirstToken = true; kickWatchdog(); }
  };
  let model = '';
  try {
    for await (const chunk of watchedChunks()) {
    buf += chunk.toString('utf-8');
    let nl = null;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        yield { content: '', done: true, model };
        return;
      }
      try {
        const j = JSON.parse(payload);
        if (j.model) model = j.model;
        const delta = j.choices?.[0]?.delta;
        safeLog('DEBUG_STREAM', `SSE JSON parsed: delta keys=${delta ? Object.keys(delta).join(',') : 'null'}`);
        safeLog('DEBUG_STREAM', `SSE line: delta.content len=${delta?.content ? delta.content.length : 0}`);
        if (delta) kickOnChunk(); // any parsed delta = stream alive (see LIVENESS law above)
        // MiniMax-M3 reasoning model emits thinking in reasoning_content.
        // Accumulate it along with visible content so the full assistant output survives.
        // Strip the <think>...</think> tags so only the visible assistant text remains.
        const rawContent = delta?.content || '';
        // OpenAI-compatible transports vary: MiniMax uses reasoning_content,
        // OpenRouter passes reasoning, some pass reasoning_content inside delta.
        const rawReasoning = delta?.reasoning_content || delta?.reasoning || '';
        // Strip thinking tags from reasoning_content BEFORE adding to visible output.
        // Bugfix: rawReasoning was added to combinedRaw before the strip regex, so
        // <think>...</think> tags in reasoning_content leaked directly into yielded content.
        // MiniMax-M3 sends reasoning in reasoning_content field; strip FIRST, then
        // add only clean stripped-reasoning text (which is internal-only anyway).
                const visibleContent = rawContent
          .replace(/<\|think\|>[\s\S]*?\|>/g, '')
          .replace(/<think>[\s\S]*?<\/think>/g, '');        // Yield visible assistant text as content; reasoning_content is yielded
        // separately as `reasoning` so the cockpit can show thinking metrics
        // WITHOUT it ever entering the visible reply buffer.
        // LAW: reasoning_content ≠ visible_content — but not invisible either.
        if (rawReasoning) { sawFirstToken = true; kickWatchdog(); yield { reasoning: rawReasoning, done: false, model, provider: cfg.providerName || null }; }
        if (visibleContent) { sawFirstToken = true; kickWatchdog(); yield { content: visibleContent, done: false, model, provider: cfg.providerName || null }; }
        // Yield structured tool_calls from the streaming delta (MiniMax/OpenAI send them here)
        // toolFragBuf is declared at STREAM scope (:683) — do NOT redeclare here.
        const toolCalls = delta?.tool_calls;
        if (toolCalls && Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            // Continuation fragments carry NO function.name — only the first
            // chunk of a tool_call names it. Process any fragment that has a
            // name OR belongs to an already-open accumulator slot.
            const _slot = tc.index ?? 0;
            if (tc?.function?.name || (toolFragBuf[_slot] && tc?.function)) {
              // Contract consumed by agent-loop.js agentTurn(): it matches on
              // `chunk.type === 'tool-call'` and reads id/tool/args. A previous
              // patch changed this to {toolCall:{name,arguments}} with no type
              // and content:'', so every native tool call was silently dropped
              // (falsy content, no type match) — the agent could never run a
              // tool when tool schemas were passed. The id also matters: MiniMax
              // correlates tool results by tool_call_id.
              sawFirstToken = true; kickWatchdog();
              // Fragment-safe args parse: a single chunk may hold the whole
              // arguments string (non-fragmenting providers) — parse it; if it
              // doesn't parse, stash the raw fragment on the accumulator and
              // wait for more instead of emitting {}.
              const _fragKey = tc.index ?? 0;
              toolFragBuf[_fragKey] = toolFragBuf[_fragKey] || {};
              const buf = toolFragBuf[_fragKey];
              if (tc.id) buf.id = tc.id;
              if (tc.function.name) buf.name = tc.function.name; // remember name for continuation fragments
              let parsed = null;
              try {
                parsed = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function.arguments || {});
              } catch {
                buf.raw = (buf.raw || '') + String(tc.function.arguments || '');
                try { parsed = JSON.parse(buf.raw); } catch { parsed = null; }
              }
              if (parsed !== null && (tc.function.name || buf.name)) {
                delete buf.raw;
                if (buf.name) delete toolFragBuf[_slot]; // slot closed
                yield {
                  type: 'tool-call',
                  content: '',
                  done: false,
                  model,
                  id: buf.id || tc.id || null,
                  tool: buf.name || tc.function.name,
                  args: parsed,
                };
              }
            }
          }
        }
      } catch (_) {}
    }
    }
  } catch (e) {
    clearTimeout(watchdog);
    // Mid-stream socket death surfaces as a premature-close error with an
    // EMPTY message. Classify it explicitly so AUTO sees PROVIDER_TIMEOUT /
    // SSE_DISCONNECT semantics instead of shrugging. If the watchdog fired
    // first, its classification wins.
    if (watchdogFailure) {
      const err = new Error(watchdogFailure.message);
      err.failureClass = watchdogFailure.message;
      throw err;
    }
    const msg = String(e && e.message || '').trim();
    if (!msg || /premature close|aborted/i.test(msg)) {
      const err = new Error('SSE stream disconnected before completion');
      err.failureClass = 'SSE_DISCONNECT';
      throw err;
    }
    if (/STREAM_STALLED|FIRST_TOKEN_TIMEOUT/.test(msg)) {
      const err = new Error(msg);
      err.failureClass = msg;
      throw err;
    }
    throw e;
  } finally { clearTimeout(watchdog); }
}

/**
 * Anthropic Messages API STREAMING adapter. Yields delta chunks.
 * SSE events: message_start, content_block_start, content_block_delta,
 *             content_block_stop, message_delta, message_stop
 */
async function* streamChatAnthropic(cfg, messages, opts = {}) {
  const url = `${cfg.baseUrl}/v1/messages`;

  // Separate system prompt (Anthropic puts it outside messages)
  let systemPrompt = '';
  const filteredMessages = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n' : '') + msg.content;
    } else {
      filteredMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const body = {
    model      : opts.model || cfg.model,
    messages   : filteredMessages,
    max_tokens : opts.maxTokens ?? 4096,
    stream     : true,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  };

  const payload = JSON.stringify(body);
  const parsed  = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const lib     = isHttps ? require('https') : require('http');

  const reqOpts = {
    hostname : parsed.hostname,
    port     : parsed.port || (isHttps ? 443 : 80),
    path     : parsed.pathname + parsed.search,
    method   : 'POST',
    headers  : {
      'Content-Type'      : 'application/json',
      'Accept'            : 'text/event-stream',
      'x-api-key'         : cfg.apiKey,
      'anthropic-version' : '2023-06-01',
      ...cfg.extraHeaders,
      'Content-Length'    : Buffer.byteLength(payload),
    },
  };

  const res = await new Promise((resolve, reject) => {
    const req = lib.request(reqOpts, resolve);
    req.setTimeout(opts.timeoutMs || 120000, () => req.destroy(new Error('Anthropic stream timeout')));
    req.on('error', reject);
    req.write(payload); req.end();
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    let errBody = '';
    for await (const c of res) errBody += c;
    throw new Error(humanError(errBody.trim(), res.statusCode, 'anthropic'));
  }

  let buf = '';
  let model = body.model;
  for await (const chunk of res) {
    buf += chunk.toString('utf-8');
    let nl = null;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload_ = line.slice(5).trim();
      try {
        const j = JSON.parse(payload_);
        if (j.type === 'message_start' && j.message?.model) model = j.message.model;
        if (j.type === 'content_block_delta' && j.delta?.text) {
          safeLog('DEBUG_STREAM', `YIELDING TEXT CHUNK j.delta.text len=${(j.delta.text || '').length} model=${model}`);
          yield { content: j.delta.text, done: false, model, provider: cfg.providerName || null };
        }
        if (j.type === 'message_delta' && j.usage) {
          yield {
            content: '', done: false, model,
            usage: {
              prompt_tokens: j.usage.input_tokens || 0,
              completion_tokens: j.usage.output_tokens || 0,
              total_tokens: (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0),
            },
          };
        }
        if (j.type === 'message_stop') {
          yield { content: '', done: true, model };
          return;
        }
      } catch { /* skip malformed */ }
    }
  }
  yield { content: '', done: true, model };
}

/**
 * Google Gemini STREAMING adapter. Uses streamGenerateContent with alt=sse.
 */
async function* streamChatGemini(cfg, messages, opts = {}) {
  const model = opts.model || cfg.model;
  const url = `${cfg.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;

  let systemInstruction = '';
  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
      continue;
    }
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(msg.content || '') }],
    });
  }

  const body = {
    contents,
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 4096,
    },
  };

  const payload = JSON.stringify(body);
  const parsed  = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const lib     = isHttps ? require('https') : require('http');

  const reqOpts = {
    hostname : parsed.hostname,
    port     : parsed.port || (isHttps ? 443 : 80),
    path     : parsed.pathname + parsed.search,
    method   : 'POST',
    headers  : {
      'Content-Type'  : 'application/json',
      'Accept'        : 'text/event-stream',
      'Content-Length' : Buffer.byteLength(payload),
    },
  };

  const res = await new Promise((resolve, reject) => {
    const req = lib.request(reqOpts, resolve);
    req.setTimeout(opts.timeoutMs || 120000, () => req.destroy(new Error('Gemini stream timeout')));
    req.on('error', reject);
    req.write(payload); req.end();
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    let errBody = '';
    for await (const c of res) errBody += c;
    throw new Error(humanError(errBody.trim(), res.statusCode, 'gemini'));
  }

  let buf = '';
  for await (const chunk of res) {
    buf += chunk.toString('utf-8');
    let nl = null;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload_ = line.slice(5).trim();
      try {
        const j = JSON.parse(payload_);
        const text = (j.candidates?.[0]?.content?.parts || [])
          .map(p => p.text || '')
          .filter(Boolean)
          .join('');
        if (text) yield { content: text, done: false, model, provider: cfg.providerName || null };
        // Check for finish
        if (j.candidates?.[0]?.finishReason) {
          const usage = j.usageMetadata ? {
            prompt_tokens: j.usageMetadata.promptTokenCount || 0,
            completion_tokens: j.usageMetadata.candidatesTokenCount || 0,
            total_tokens: j.usageMetadata.totalTokenCount || 0,
          } : undefined;
          yield { content: '', done: true, model, usage, provider: cfg.providerName || null };
          return;
        }
      } catch { /* skip malformed */ }
    }
  }
  yield { content: '', done: true, model };
}


/**
 * Anthropic Messages API adapter → returns same shape as OpenAI response.
 */
async function chatAnthropic(cfg, messages, opts = {}) {
  const url     = `${cfg.baseUrl}/v1/messages`;
  const headers = {
    'x-api-key'         : cfg.apiKey,
    'anthropic-version' : '2023-06-01',
    ...cfg.extraHeaders,
  };

  // Anthropic puts system prompt separately
  let systemPrompt = '';
  const filteredMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n' : '') + msg.content;
    } else {
      filteredMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const body = {
    model      : opts.model   || cfg.model,
    messages   : filteredMessages,
    max_tokens : opts.maxTokens ?? 4096,
    ...(systemPrompt ? { system: systemPrompt }          : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.tools ? {
      tools: opts.tools.map(t => ({
        name        : t.function?.name  || t.name,
        description : t.function?.description || t.description || '',
        input_schema: t.function?.parameters  || t.parameters || { type: 'object', properties: {} },
      }))
    } : {}),
  };

  const resp = await httpRequest(url, 'POST', headers, body, opts.timeoutMs || 60000);

  // Normalise to OpenAI shape
  const textBlock  = resp.content?.find(b => b.type === 'text');
  const toolBlocks = resp.content?.filter(b => b.type === 'tool_use') || [];

  return {
    content   : textBlock?.text || '',
    toolCalls : toolBlocks.map(b => ({
      id       : b.id,
      type     : 'function',
      function : { name: b.name, arguments: JSON.stringify(b.input) },
    })),
    usage : {
      prompt_tokens     : resp.usage?.input_tokens  || 0,
      completion_tokens : resp.usage?.output_tokens || 0,
      total_tokens      : (resp.usage?.input_tokens || 0) + (resp.usage?.output_tokens || 0),
    },
    model : resp.model || body.model,
    raw   : resp,
  };
}

// ── Core chat function ────────────────────────────────────────────────────────

/**
 * Google Gemini adapter. Returns the same normalized shape as OpenAI responses.
 */
async function chatGemini(cfg, messages, opts = {}) {
  const model = opts.model || cfg.model;
  const url = `${cfg.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  let systemInstruction = '';
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
      continue;
    }
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(msg.content || '') }],
    });
  }

  const body = {
    contents,
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 4096,
      ...(opts.stop ? { stopSequences: Array.isArray(opts.stop) ? opts.stop : [opts.stop] } : {}),
    },
  };

  const resp = await httpRequest(url, 'POST', cfg.extraHeaders || {}, body, opts.timeoutMs || 60000);
  const content = (resp.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || '')
    .filter(Boolean)
    .join('');

  return {
    content,
    toolCalls: [],
    usage: {
      prompt_tokens: resp.usageMetadata?.promptTokenCount || 0,
      completion_tokens: resp.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: resp.usageMetadata?.totalTokenCount || 0,
    },
    model,
    raw: resp,
  };
}

function recordLLMUsage(provider, model, usage) {
  if (!usage || (!usage.prompt_tokens && !usage.completion_tokens)) return;
  try {
    const fs = require('fs');
    const path = require('path');
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
      estimatedCost: parseFloat(estimatedCost.toFixed(6))
    };

    fs.appendFileSync(path.join(logDir, 'llm-ledger.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    // silent safety to never break API requests
  }
}

/**
 * Send a chat completion request using the configured LLM provider.
 *
 * @param {Array}  messages  - OpenAI-format messages array
 * @param {object} opts      - Options (model, temperature, maxTokens, tools, etc.)
 * @param {object} cfgOverride - Override the resolved config (for testing / per-call providers)
 * @returns {{ content, toolCalls, usage, model, raw }}
 */
function dispatchChat(cfg, messages, opts) {
  if (cfg.format === 'anthropic') return chatAnthropic(cfg, messages, opts);
  if (cfg.format === 'gemini')    return chatGemini(cfg, messages, opts);
  return chatOpenAI(cfg, messages, opts);
}
function dispatchStreamChat(cfg, messages, opts) {
  if (cfg.format === 'anthropic') return streamChatAnthropic(cfg, messages, opts);
  if (cfg.format === 'gemini')    return streamChatGemini(cfg, messages, opts);
  return streamChatOpenAI(cfg, messages, opts);
}

/**
 * Resolve the local fallback provider used when the primary (API) provider fails.
 * API-first, local-fallback: keeps the harness working fully offline.
 *   LLM_FALLBACK           ollama | lmstudio | off   (default ollama)
 *   LLM_FALLBACK_BASE_URL  default per-provider (ollama: localhost:11434/v1)
 *   LLM_FALLBACK_MODEL     default per-provider (Ollama default: qwen2.5:3b)
 * Returns null when fallback is disabled.
 */
function fallbackConfig() {
  const mode = (process.env.LLM_FALLBACK || 'ollama').toLowerCase().trim();
  if (mode === 'off' || mode === 'none' || mode === '0') return null;
  const providerName = mode === 'lmstudio' ? 'lmstudio' : 'ollama';
  const provider = PROVIDERS[providerName];
  return {
    providerName,
    provider,
    baseUrl      : process.env.LLM_FALLBACK_BASE_URL || provider.baseUrl,
    apiKey       : provider.apiKey || '',
    model        : process.env.LLM_FALLBACK_MODEL || process.env.OLLAMA_MODEL || provider.defaultModel,
    format       : provider.format,
    authHeader   : provider.authHeader,
    extraHeaders : provider.extraHeaders || {},
    isFallback   : true,
  };
}

/**
 * Run a chat against `cfg`; on failure, transparently retry against the local
 * fallback provider (Ollama/LM Studio) if one is configured and reachable.
 * Usage is recorded on whichever provider actually answered.
 */
async function runWithFallback(cfg, messages, opts) {
  try {
    const result = await dispatchChat(cfg, messages, opts);
    recordLLMUsage(cfg.providerName, cfg.model, result.usage);
    return result;
  } catch (primaryErr) {
    const fb = fallbackConfig();
    // Don't fall back onto the same local provider we just failed on.
    if (!fb || fb.providerName === cfg.providerName) throw primaryErr;
    if (process.env.PURPCLAW_LLM_DEBUG === '1') {
      console.warn(`[LLM] primary "${cfg.providerName}" failed (${primaryErr.message}); falling back to local "${fb.providerName}/${fb.model}"`);
    }
    try {
      const result = await dispatchChat(fb, messages, opts);
      recordLLMUsage(fb.providerName, fb.model, result.usage);
      result.fallback = { from: cfg.providerName, to: fb.providerName, model: fb.model, reason: primaryErr.message };
      return result;
    } catch (fbErr) {
      const err = new Error(
        `LLM unavailable — primary "${cfg.providerName}" failed (${primaryErr.message}) ` +
        `and local fallback "${fb.providerName}" at ${fb.baseUrl} also failed (${fbErr.message}). ` +
        `Is Ollama running? Try: ollama serve`
      );
      err.primaryError = primaryErr;
      err.fallbackError = fbErr;
      throw err;
    }
  }
}

async function chat(messages, opts = {}, cfgOverride = null) {
  let cfg = cfgOverride || mainConfig();
  const explicitProvider = opts.provider && opts.provider !== 'auto' && PROVIDERS[opts.provider];
  // Honor `opts.provider` — explicit provider override per-call.
  // Falls through to env-based cfg if no provider was passed.
  if (explicitProvider) {
    cfg = configForProvider(opts.provider, opts);
  }

  // SpendGate: check budget before making the call
  if (process.env.POCKET_MODE && !opts.bypassSpendGate) {
    try {
      const { SpendGate } = require('./spend-gate');
      const gate = new SpendGate();
      const estTokens = (opts.maxTokens || 1000) + (messages.reduce((s, m) => s + (m.content || '').length, 0) / 4);
      const check = await gate.check({
        agent: opts.agent || process.env.POCKET_AGENT || 'default',
        provider: cfg.providerName,
        estimatedTokens: Math.ceil(estTokens),
      });
      if (!check.allow) {
        return {
          content: '',
          provider: cfg.providerName,
          model: cfg.model,
          error: `SpendGate: ${check.reason}`,
          blocked: true,
        };
      }
    } catch {}
  }
  // Auto-route: model names containing "/" (e.g. "openai/gpt-oss-20b:free")
  // are OpenRouter model IDs. If the active provider isn't already
  // OpenRouter, switch the route so the call actually works.
  if (opts.model && opts.model.includes('/') && !explicitProvider && cfg.providerName !== 'openrouter') {
    cfg = resolveConfig('LLM');
    cfg.providerName = 'openrouter';
    cfg.provider = PROVIDERS.openrouter;
    cfg.baseUrl = PROVIDERS.openrouter.baseUrl;
    cfg.apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || cfg.apiKey;
    cfg.extraHeaders = PROVIDERS.openrouter.extraHeaders;
    cfg.model = opts.model;
  }
  return runWithFallback(cfg, messages, opts);
}

/**
 * Streaming chat — yields delta chunks as they arrive. Same auto-routing
 * as chat(). Returns an async iterator. No fallback (callers handle
 * errors so they can surface partial responses).
 *
 *   for await (const c of streamChat(messages, { model: 'z-ai/...' })) {
 *     if (!c.done) process.stdout.write(c.content);
 *   }
 */
async function* streamChat(messages, opts = {}, cfgOverride = null) {
  let cfg = cfgOverride || mainConfig();
  // ONE ROUTER LAW (2026-08-26 TVG): direct streamChat callers must obey the
  // persisted pin too. A dead file-pin fails closed BEFORE any dispatch —
  // same law streamChatAuto enforces. (Live leak reproduced: dead pin in
  // model-override.json + plain streamChat silently served MiniMax.)
  if (!cfgOverride && !opts.provider && !opts.model) {
    try {
      const _fs = require('fs');
      const _ovFile = require('path').join(process.env.USERPROFILE || process.env.HOME || '.', '.purpclaw', 'model-override.json');
      const _ov = JSON.parse(_fs.readFileSync(_ovFile, 'utf8'));
      if (_ov && _ov.provider && !PROVIDERS[_ov.provider]) {
        publishProviderEvent('manual_pin_fail_closed', {
          reason: 'unregistered provider pin (streamChat)', provider: _ov.provider, model: _ov.model,
        });
        const _err = new Error(`MANUAL PIN FAIL-CLOSED: pinned provider '${_ov.provider}' is not registered`);
        _err.code = 'UNKNOWN_PROVIDER';
        throw _err;
      }
    } catch (e) {
      if (e.code === 'UNKNOWN_PROVIDER') throw e; // real fail-closed — propagate
      // missing/corrupt override file → no pin, proceed
    }
  }
  const explicitProvider = opts.provider && opts.provider !== 'auto' && PROVIDERS[opts.provider];
  // Honor `opts.provider` — explicit per-call override.
  if (explicitProvider) {
    cfg = configForProvider(opts.provider, opts);
  } else if (opts.provider && opts.provider !== 'auto') {
    // DEAD-PIN LAW (#24): a pinned provider unknown to the registry is NEVER
    // dispatched — but it must leave evidence. Stamp a SKIPPED attempt on the
    // same chain the routing-receipt builder consumes; silent override ends here.
    opts.__providerAttempts = Array.isArray(opts.__providerAttempts) ? opts.__providerAttempts : [];
    opts.__providerAttempts.push({
      provider: opts.provider,
      model: opts.model || null,
      ok: false,
      skipped: true,
      reason: 'UNKNOWN_PROVIDER',
      failureClass: 'UNKNOWN_PROVIDER',
    });
    publishProviderEvent('pin_skipped_unknown_provider', { provider: opts.provider });
    // MANUAL PIN FAIL-CLOSED LAW (2026-08-26): a dead pin STOPS here — it
    // never falls through to dispatch, and never gets rescued by the
    // model-slash heuristic below (that heuristic is AUTO-only).
    const _pinErr = new Error(`Pinned provider '${opts.provider}' is not in the registry — manual pins fail closed (no fallback).`);
    _pinErr.code = 'UNKNOWN_PROVIDER';
    throw _pinErr;
  }
  // Model-slash → openrouter rescue: ONLY legal when no explicit provider was
  // requested at all (pure model hint in AUTO/preference lanes). A known
  // provider pin never enters this branch; an unknown one threw above.
  if (opts.model && opts.model.includes('/') && !explicitProvider && cfg.providerName !== 'openrouter') {
    cfg = resolveConfig('LLM');
    cfg.providerName = 'openrouter';
    cfg.provider = PROVIDERS.openrouter;
    cfg.baseUrl = PROVIDERS.openrouter.baseUrl;
    cfg.apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || cfg.apiKey;
    cfg.extraHeaders = PROVIDERS.openrouter.extraHeaders;
    cfg.model = opts.model;
  }
  yield* dispatchStreamChat(cfg, messages, opts);
}

/**
 * Same as chat() but uses the SWARM provider (Kimi K2 by default).
 * Use for heavy reasoning, architecture decisions, complex multi-step tasks.
 */
async function swarm(messages, opts = {}) {
  return runWithFallback(swarmConfig(), messages, opts);
}

/**
 * One-shot text completion — wraps a string into a user message.
 *
 * @param {string} prompt
 * @param {object} opts   - Same opts as chat()
 * @param {string} system - Optional system prompt
 */
async function complete(prompt, opts = {}, system = '') {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const resp = await chat(messages, opts);
  if (resp && resp.blocked) return resp;  // pass through SpendGate blocks
  let content = resp.content || '';

  // Strip <think>...</think> thinking blocks (reasoning models like MiniMax-M3 emit these)
  // Use indexOf/lastIndexOf to avoid regex edge-cases with these tags
  {
    const open = '<think>';
    const close = '</think>';
    let start = 0;
    let cleaned = '';
    while (true) {
      const o = content.indexOf(open, start);
      if (o === -1) { cleaned += content.slice(start); break; }
      cleaned += content.slice(start, o);
      const c = content.indexOf(close, o + open.length);
      if (c === -1) { cleaned += content.slice(o); break; }
      start = c + close.length;
    }
    content = cleaned.trim();
  }

  return content;
}

// ── Provider info ─────────────────────────────────────────────────────────────

/**
 * Return current provider configuration (no secrets exposed).
 */
function getProviderInfo() {
  const main  = mainConfig();
  const sw    = swarmConfig();
  return {
    main: {
      provider : main.providerName,
      model    : main.model,
      baseUrl  : main.baseUrl,
      hasKey   : !!main.apiKey,
    },
    swarm: {
      provider : sw.providerName,
      model    : sw.model,
      baseUrl  : sw.baseUrl,
      hasKey   : !!sw.apiKey,
    },
    fallback: (() => {
      const fb = fallbackConfig();
      return fb ? { provider: fb.providerName, model: fb.model, baseUrl: fb.baseUrl } : null;
    })(),
  };
}

/**
 * List all available providers with their defaults.
 */
function listProviders() {
  return Object.entries(PROVIDERS).map(([name, p]) => ({
    name,
    defaultModel : p.defaultModel,
    baseUrl      : p.baseUrl || '(set LLM_BASE_URL)',
    format       : p.format,
    local        : name === 'ollama' || name === 'lmstudio' || name === 'custom',
    aliases      : PROVIDER_ENV_ALIASES[name] || {},
  }));
}

// ── AUTO failover ───────────────────────────────────────────────────────────
// "Auto" must not mean "pick one provider and develop an emotional attachment
// to it." It ranks the providers that actually have credentials and tries them
// in order, gliding past a provider that fails with a RETRYABLE error (429,
// 5xx, timeout, network, or provider-specific auth/quota failure — but NOT
// past a request that is simply wrong (400/404/content), because sending a
// broken request to six models is just
// distributed incompetence.
function classifyProviderError(error) {
  // Preserve an explicitly empty Error.message. Using `message || error`
  // coerces `new Error('')` to the non-empty string "Error" and hides the
  // transport condition AUTO needs to classify.
  const message = error && typeof error.message === 'string'
    ? error.message
    : String(error || '');
  const lower = message.toLowerCase();
  const statusMatch = lower.match(/(?:http\s*)?\b(\d{3})\b/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : null;
  // P0 FAILURE TAXONOMY: browser-flavoured shrugging ("Failed to fetch") must
  // normalize to a machine-usable failureClass. Every branch below sets one.
  if (/failed to fetch|networkerror|load failed/i.test(lower)) {
    return { retryable: true, reason: 'FETCH_FAILURE', failureClass: 'FETCH_FAILURE', statusCode: null,
             detail: 'browser/client fetch could not reach the provider endpoint' };
  }
  if (statusCode === 401 || statusCode === 403) {
    // fall through to auth handling below but with explicit class
  }
  // Some OpenAI-compatible gateways close a failed streaming request with an
  // empty Error. That is provider/transport-local rather than evidence that
  // the user's request is malformed, so AUTO must try the next candidate.
  // Keep non-empty unknown failures non-retryable: only this observable empty
  // transport failure gets the conservative failover treatment.
  if (!message.trim()) {
    // P0-1: one-shot origin capture — an empty Error carries a stack pointing
    // at its construction site. Log it once per occurrence so the transport
    // defect (PM2-context empty stream failure) can be root-caused.
    try {
      safeLog('DEBUG_STREAM', `EMPTY_ERR_ORIGIN name=${error && error.name} code=${error && error.code} errno=${error && error.errno} syscall=${error && error.syscall} stack=${String(error && error.stack || '(none)').split('\n').slice(0, 8).join(' | ')}`);
    } catch {}
    return { retryable: true, reason: 'empty_provider_error', failureClass: 'BAD_RESPONSE', statusCode: null,
                 detail: 'provider returned an empty error' };
      }
      if (statusCode === 400 || statusCode === 404 ||
          /content.?polic|malformed|invalid model|model not found|bad request/.test(lower)) {
        // UNRESTRICTED CONTEXT LAW (P0-1): a context-window overflow is NOT a
        // broken request — it means THIS provider's bucket is too small for a
        // legitimate task. The runtime must compact and retry, never refuse.
        // Classify it as its own failureClass so AUTO can reroute to a model
        // with sufficient capacity instead of killing the turn.
        if (/context.*(long|length|window)|maximum context|too many tokens|input.*too (long|large)|reduce the (length|size) of the messages|prompt is too long/.test(lower)) {
          return { retryable: true, reason: 'context_overflow', failureClass: 'CONTEXT_OVERFLOW', statusCode, detail: `HTTP ${statusCode}: provider context window exceeded` };
        }
        return { retryable: false, reason: 'request_rejected', failureClass: 'BAD_RESPONSE', statusCode, detail: statusCode ? `HTTP ${statusCode}` : 'request rejected' };
      }
      if (statusCode === 429 || /rate.?limit|too many requests/.test(lower)) {
        return { retryable: true, reason: 'rate_limit', failureClass: 'RATE_LIMIT', statusCode: statusCode || 429, detail: `HTTP ${statusCode || 429}` };
      }
      if ([401, 402, 403].includes(statusCode) || /invalid.?api.?key|unauthor|authentication|permissions issue|quota|billing/.test(lower)) {
        // Authentication/quota belongs to this candidate provider. In AUTO mode
        // it must not prevent a later independently configured provider serving
        // the same valid request.
        const _authQuota = statusCode === 402 || /quota|billing/.test(lower);
        return { retryable: true, reason: _authQuota ? 'quota' : 'authentication', failureClass: _authQuota ? 'QUOTA' : 'AUTH_FAILURE', statusCode, detail: statusCode ? `HTTP ${statusCode}` : 'provider authentication' };
      }
      if ((statusCode && statusCode >= 500 && statusCode <= 599) || /server error|overload|temporarily unavailable/.test(lower)) {
        return { retryable: true, reason: 'server_error', failureClass: 'SERVER_5XX', statusCode, detail: statusCode ? `HTTP ${statusCode}` : 'provider server error' };
      }
      if (message.includes('FIRST_TOKEN_TIMEOUT')) {
        // Watchdog hang classes must keep their identity: a provider that
        // accepts TCP but never streams is sicker than a slow one, and AUTO's
        // health layer escalates its cooldown accordingly.
        return { retryable: true, reason: 'timeout', failureClass: 'FIRST_TOKEN_TIMEOUT', statusCode,
                 detail: 'provider accepted the request but sent no first token' };
      }
      if (message.includes('STREAM_STALLED')) {
        return { retryable: true, reason: 'timeout', failureClass: 'STREAM_STALLED', statusCode,
                 detail: 'provider stream went silent mid-response' };
      }
      if (/timeout|timed out/.test(lower)) {
        return { retryable: true, reason: 'unavailable', failureClass: 'PROVIDER_TIMEOUT', statusCode, detail: statusCode ? `HTTP ${statusCode}` : 'provider timeout' };
      }
      if (/connection refused|econnrefused|enotfound|dns|getaddrinfo/.test(lower)) {
        return { retryable: true, reason: 'unavailable', failureClass: /enotfound|dns|getaddrinfo/.test(lower) ? 'DNS_FAILURE' : 'CONNECTION_REFUSED', statusCode, detail: 'provider endpoint unreachable' };
      }
      if ([408, 409, 425].includes(statusCode) || /econn|socket|network|unavailable|\babort(?:ed)?\b|connection (?:closed|reset)|sse/i.test(lower)) {
        return { retryable: true, reason: 'unavailable', failureClass: 'SSE_DISCONNECT', statusCode, detail: statusCode ? `HTTP ${statusCode}` : 'provider connection lost mid-stream' };
      }
      return { retryable: false, reason: 'unknown', failureClass: 'UNKNOWN', statusCode, detail: statusCode ? `HTTP ${statusCode}` : 'provider error' };
}

function retryableProviderError(msg) {
  // One classifier owns this decision. Keeping a second string list here
  // previously made HTTP 401 retryable in AUTO's lifecycle but non-retryable
  // through this public compatibility helper.
  return classifyProviderError(new Error(String(msg || ''))).retryable;
}

function normalizeProviderName(value, env = process.env) {
  const requested = String(value || '').trim().toLowerCase();
  if (!requested || requested === 'auto') return requested || 'auto';
  if (requested === 'claude') return 'anthropic';
  if (requested === 'local') return String(env.LLM_FALLBACK || 'ollama').toLowerCase() === 'lmstudio' ? 'lmstudio' : 'ollama';
  return PROVIDERS[requested] ? requested : null;
}

// Ordered list of providers that actually have a usable key configured.
function eligibleProviders(opts = {}) {
  const env = opts.env || process.env;
  const configuredOrder = String(opts.order || env.PURPCLAW_AUTO_PROVIDER_ORDER || '')
    .split(',').map(name => normalizeProviderName(name, env)).filter(Boolean);
  const defaultOrder = ['minimax','kimi','openai','anthropic','gemini','deepseek','groq','nvidia','together','openrouter','huggingface'];
  const primary = normalizeProviderName(opts.prefer || env.LLM_PROVIDER || 'openai', env);
  const fallbackMode = String(env.LLM_FALLBACK || 'ollama').toLowerCase().trim();
  const local = fallbackMode === 'off' || fallbackMode === 'none' || fallbackMode === '0'
    ? [] : [fallbackMode === 'lmstudio' ? 'lmstudio' : 'ollama'];
  const prefOrder = [...new Set([primary, ...configuredOrder, ...defaultOrder, ...local].filter(Boolean))];
  const hasKey = (name) => {
    if (name === 'ollama' || name === 'lmstudio') return local.includes(name);
    const envs = (PROVIDER_ENV_ALIASES[name] && PROVIDER_ENV_ALIASES[name].apiKey) || [];
    if (envs.some(key => String(env[key] || '').trim().length > 0)) return true;
    return name === primary && String(env.LLM_API_KEY || '').trim().length > 0;
  };
  const configured = prefOrder.filter(n => PROVIDERS[n] && hasKey(n));
  if (configured.length) {
    return configured.filter(name => !PROVIDER_HEALTH ||
      !PROVIDER_HEALTH.isProviderAvailable || PROVIDER_HEALTH.isProviderAvailable(name));
  }
  if (primary && PROVIDERS[primary]) return [primary];
  try { return [mainConfig().providerName]; } catch { return ['openai']; }
}

// Stream with automatic failover across eligible providers. Records the full
// attempt chain on opts.__providerAttempts and emits {type:'provider-failover'}
// so the surface can show "OpenAI x 429 -> MiniMax ok" instead of a dead mission.
async function* streamChatAuto(messages, opts = {}, runtime = {}) {
  const rank = runtime.eligibleProviders || eligibleProviders;
  const dispatch = runtime.streamChat || streamChat;
  // SMART AUTO (0): MANUAL override — /model <name> persists a pinned model that
  // outranks AUTO classification and session affinity until /model auto clears it.
  // Stored at ~/.purpclaw/model-override.json (fresh read every call — no cache).
  if (!opts.provider && !opts.model && !opts.prefer) {
    try {
      const fs = require('fs');
      const path = require('path');
      const _ovFile = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.purpclaw', 'model-override.json');
      const ov = JSON.parse(fs.readFileSync(_ovFile, 'utf8'));
      // NAMED AUTO POOLS: pool selection rides in the same override file.
      // MANUAL pins ignore it entirely (pinned = fail-closed); only AUTO
      // routing consults opts.__pinPool. Null/absent → global scored pool.
      if (ov && typeof ov.pool === 'string' && ov.pool) opts.__pinPool = ov.pool;
      if (ov && ov.model) {
        // MANUAL pin lands as explicit provider+model — NOT `prefer`: prefer
        // is normalized as a provider *name* (model IDs normalize to null)
        // and is deleted from providerOpts at dispatch, so a model parked in
        // prefer silently never reached the wire.
        const _pinT0 = Date.now();
        if (ov.provider && !PROVIDERS[ov.provider]) {
          // DEAD-PIN RECEIPT LAW (#24): an unknown pinned provider must leave
          // evidence in attempted[] instead of being silently overridden.
          opts.__providerAttempts = opts.__providerAttempts || [];
          opts.__providerAttempts.push({
            provider: ov.provider, model: ov.model, ok: false,
            skipped: 'pinned provider not registered', failureClass: 'unknown-provider',
            started_at: _pinT0, ended_at: Date.now(),
          });
          publishProviderEvent('manual_override_dead_pin', { provider: ov.provider, model: ov.model });
        }
        if (ov.provider && PROVIDERS[ov.provider]) opts.provider = ov.provider;
        // MANUAL PIN FAIL-CLOSED LAW (2026-08-26): a model-only pin (no
        // registered provider) or a dead-provider pin NEVER half-applies.
        // Setting opts.model without a provider would let the pin drift into
        // the AUTO ranking (unknown model dies → loop deletes it → another
        // provider serves silently — the ox-alpha→MiniMax leak). Fail closed:
        // record evidence, arm the manual flag, and force a one-element
        // ranking that cannot succeed so the turn surfaces the failure.
        if (!opts.provider) {
          // DEAD-PIN FAIL-CLOSED (2026-08-26 TVG): an unregistered provider
          // pin must be a HARD STOP — the old code recorded evidence then
          // fell through to AUTO, silently serving MiniMax (the exact
          // haunted-router symptom). Do NOT throw inside this try — the
          // empty catch below would swallow it. Stash and rethrow outside.
          publishProviderEvent('manual_pin_fail_closed', {
            reason: 'unregistered provider pin', provider: ov.provider, model: ov.model,
          });
          opts.__deadPinError = new Error(`MANUAL PIN FAIL-CLOSED: pinned provider '${ov.provider}' is not registered`);
          opts.__deadPinError.code = 'UNKNOWN_PROVIDER';
          opts.__deadPinError.failureClass = 'unknown-provider';
        } else {
          opts.model = ov.model;
          opts.__manualOverrideApplied = { provider: opts.provider, model: ov.model };
        }
        publishProviderEvent('manual_override', { provider: opts.__manualOverrideApplied.provider, model: ov.model, deadPin: !!(ov.provider && !PROVIDERS[ov.provider]) });
      }
    } catch {}
  }
  // SMART AUTO (0b): a dead file-pin must fail the turn BEFORE any routing —
  // rethrow here, outside the swallowed try (2026-08-26 TVG fix).
  if (opts.__deadPinError) {
    throw opts.__deadPinError;
  }
  // SMART AUTO (1): session affinity — a healthy session stays on its model
  // instead of roulette-wheeling between candidates every message.
  // LAW: never overrides a MANUAL pin — operator pin outranks affinity.
  let _smartAuto; try { _smartAuto = require('./smart-auto'); } catch {}
  if (_smartAuto && opts.sessionId && !opts.prefer && !opts.__manualOverrideApplied) {
    const aff = _smartAuto.getSessionAffinity(opts.sessionId);
    if (aff && rank(opts).some(p => (p === aff.provider) || (p && p.name === aff.provider))) {
      opts.__affinityApplied = { provider: aff.provider, model: aff.model };
      publishProviderEvent('session_affinity', {
        provider: aff.provider, model: aff.model, sessionId: opts.sessionId,
      });
    }
  }
  // SCORED ROUTER (1.5): when no pin/override/affinity decided the route, ask
  // the scored router (canonical registry + health taxonomy) for the best
  // model. Its pick becomes `prefer` — a strong hint, not a prison: provider
  // failover below still applies if the pick's provider errors.
  // LAW: never fires over a MANUAL pin.
  if (!opts.provider && !opts.prefer && !opts.__manualOverrideApplied) {
    try {
      const R = require('./smart-router');
      const H = require('./provider-health');
      const sel = await R.selectModel(
        { taskClass: opts.taskClass || 'CHAT', thinkLevel: opts.thinkLevel,
          minContext: opts.minContext || 0, preferFree: true,
          pool: opts.__pinPool || 'global' },
        H.snapshot());
      // POOL-ISOLATION LAW (2026-08-26): accept the scored pick from ANY
      // registered provider — NIM/Native/OpenRouter alike. The old
      // `provider === 'openrouter'` filter made Global AUTO secretly an
      // OpenRouter-only pool. prefer+models wiring is generic: dispatch
      // consumes provider hint + per-provider model override.
      if (sel && sel.selected && sel.selected.id && PROVIDERS[sel.selected.provider]) {
        const _prov = sel.selected.provider;
        opts.prefer = _prov;
        opts.models = { ...opts.models, [_prov]: sel.selected.id };
        opts.__scoredRouterApplied = {
          id: sel.selected.id, reason: sel.reason,
          candidates: sel.candidates, fallbacks: sel.fallbacks,
          poolId: sel.poolId || 'global',
          fallbackPolicy: (sel.poolId && sel.poolId !== 'global') ? 'pool-scored' : 'global-scored',
        };
        publishProviderEvent('scored_router_selected', opts.__scoredRouterApplied);
      }
    } catch (_) { /* router unavailable → legacy ranking path */ }
  }
  let ranking = rank(opts);
  // MANUAL PIN FAIL-CLOSED LAW (2026-08-26, Eddie TVG): an explicit provider
  // pin produces a ONE-ELEMENT ranking — no cross-provider failover, no
  // in-provider model swap (Region A below checks this flag), no affinity,
  // no scored-router rescue. Manual means pinned: failure surfaces to the
  // operator verbatim. Only explicit AUTO pool selections may fail over.
  const _hardPin = opts.provider && opts.provider !== 'auto' && PROVIDERS[opts.provider];
  // DEAD FILE-PIN ENFORCEMENT (2026-08-26 TVG): the pre-loop dead-pin path
  // (unknown provider in model-override.json) arms __pinFailClosed but nothing
  // consumed it — the full AUTO ranking survived and served a different model.
  // A dead pin must produce an UNSATISFIABLE one-element ranking so the turn
  // fails closed instead of silently re-routing.
  if (opts.__pinFailClosed && !ranking.includes(opts.provider)) {
    ranking = ['__dead_pin__'];
  }
  if (_hardPin) {
    ranking = [opts.provider];
    opts.failClosedManual = true;
    if (!opts.allowPartialFailover) opts.__pinFailClosed = true;
  } else if (opts.model && (!opts.provider || opts.provider === 'auto')) {
    // MODEL-ONLY PIN LAW (2026-08-26, Eddie TVG): a pin carrying ONLY a model
    // (provider auto/unset) must resolve its owning provider and become a hard
    // pin — otherwise the full AUTO ranking survives and the scored router can
    // silently serve a different model (the ox-alpha→MiniMax-M2.7 leak).
    // Unresolvable model → fail closed immediately with an explicit error.
    let _owner = null;
    try {
      // Lazy require: model-registry requires this module at top level (cycle).
      const MODEL_REGISTRY = require('./model-registry');
      const _m = MODEL_REGISTRY.getCachedModels().find(m =>
        m.id === opts.model || `${m.provider}/${m.id}` === opts.model ||
        (Array.isArray(m.aliases) && m.aliases.includes(opts.model)));
      if (_m && PROVIDERS[_m.provider]) _owner = _m.provider;
    } catch (_) {}
    if (_owner) {
      opts.provider = _owner;
      if (typeof opts.model === 'string' && opts.model.includes('/')) {
        opts.model = opts.model.split('/').slice(1).join('/');
      }
      // Stamp override identity so routing-receipt records resolved=pin
      // (otherwise scoredPick wins the `resolved` slot and a healthy turn
      // gets falsely flagged RESOLVED_NOT_SERVED).
      opts.__manualOverrideApplied = { provider: _owner, model: opts.model };
      ranking = [_owner];
      opts.failClosedManual = true;
      if (!opts.allowPartialFailover) opts.__pinFailClosed = true;
    } else {
      throw new Error(`MANUAL PIN FAIL-CLOSED: model '${opts.model}' has no registered provider — no AUTO rescue`);
    }
  }
  // DEAD-PIN RECEIPT LAW (#24): a pin naming an UNREGISTERED provider never
  // enters `ranking` (the guard above requires PROVIDERS[opts.provider]), so it
  // would be silently overridden with zero evidence. Record the skipped pin
  // attempt BEFORE the real chain so receipts show requested→served divergence.
  if (opts.provider && opts.provider !== 'auto' && !PROVIDERS[opts.provider]) {
    const _deadPinT0 = Date.now();
    opts.__providerAttempts = opts.__providerAttempts || [];
    if (!opts.__providerAttempts.some(a => a.provider === opts.provider && a.skipped === 'pinned provider not registered')) {
      opts.__providerAttempts.push({
        provider: opts.provider, model: opts.model || null, ok: false,
        skipped: 'pinned provider not registered', failureClass: 'unknown-provider',
        started_at: _deadPinT0, ended_at: Date.now(),
      });
      publishProviderEvent('manual_override_dead_pin', { provider: opts.provider, model: opts.model || null });
    }
    // MANUAL PIN FAIL-CLOSED LAW (2026-08-26): the SKIPPED stamp alone left
    // this function free to fall through and dispatch the default ranking —
    // i.e., the exact silent provider jump Eddie caught live. A dead pin is
    // now a hard stop BEFORE any dispatch; no rescue, no pool, no swap.
    const _deadPinErr = new Error(`MANUAL PIN FAIL-CLOSED: pinned provider '${opts.provider}' is not registered`);
    _deadPinErr.code = 'UNKNOWN_PROVIDER';
    _deadPinErr.failureClass = 'unknown-provider';
    throw _deadPinErr;
  }
  if (!ranking.length) {
    throw new Error('All configured providers are temporarily cooling down');
  }
  // Seed with any pre-loop dead-pin SKIPPED record (#24) so it isn't wiped
  // when this array is assigned back onto opts.__providerAttempts. Keep-working
  // fallback records ('requested-model-failed') are preserved the same way —
  // the failed direct candidate must survive into the final receipt chain.
  const attempts = (opts.__providerAttempts || []).filter(a =>
    a.skipped === 'pinned provider not registered' || a.failureClass === 'requested-model-failed');
  let lastErr = null;
  // SMART AUTO (1b): affinity provider bubbles to the front of the ranking.
  if (_smartAuto && opts.__affinityApplied) {
    const p = opts.__affinityApplied.provider;
    const idx = ranking.indexOf(p);
    if (idx > 0) { ranking.splice(idx, 1); ranking.unshift(p); }
  }
  for (let i = 0; i < ranking.length; i++) {
    const prov = ranking[i];
    let yielded = false;
    const _attemptT0 = Date.now();
    try {
      // SMART AUTO (2): model-class filter — never route ordinary chat at a
      // classifier/embedding/VL-only model even if the catalogue offers it.
      // SMART AUTO (2): resolve this provider's effective model, skip non-chat models
      const _effModel = (opts.models && opts.models[prov]) || null;
      const _badModel = _smartAuto && typeof _smartAuto.isChatCapableModel === 'function'
        ? !_smartAuto.isChatCapableModel(_effModel) : false;
      if (_badModel) {
        attempts.push({ provider: prov, ok: false, skipped: 'model-class filter', started_at: _attemptT0, ended_at: Date.now(), model: _effModel || null });
        continue;
      }
      const providerOpts = { ...opts, provider: prov };
      // A model ID selected for the failed provider is usually invalid on the
      // next API. Unless the caller supplies a per-provider model, fallbacks
      // use their own registered default instead of repeating a guaranteed 404.
      if (opts.models && opts.models[prov]) providerOpts.model = opts.models[prov];
      else if (i > 0 && !opts.preserveModelOnFailover) delete providerOpts.model;
      delete providerOpts.env;
      delete providerOpts.order;
      delete providerOpts.models;
      delete providerOpts.prefer;
      publishProviderEvent('provider_selected', {
        provider: prov, model: providerOpts.model || null, mode: 'auto', attempt: i + 1,
        sessionId: opts.sessionId || null,
      });
      const _accum = [];
      const _attemptStartedAt = Date.now();
      for await (const ev of dispatch(messages, providerOpts)) {
        yielded = true;
        if (ev && typeof ev === 'object' && typeof ev.content === 'string') _accum.push(ev.content);
        yield ev && typeof ev === 'object' ? { ...ev, provider: prov } : ev;
      }
      attempts.push({ provider: prov, ok: true, started_at: _attemptStartedAt, ended_at: Date.now(), model: providerOpts.model || null });
      if (MODEL_HEALTH) MODEL_HEALTH.recordSuccess(`${prov}::${providerOpts.model || 'default'}`);
      // KEEP-WORKING LAW (2026-08-25) REGION C: after a successful OpenRouter
      // attempt, opportunistically refresh the free-pool catalog in the
      // background so the next AUTO call sees the newest :free list without
      // waiting out the 10-minute TTL. Fire-and-forget — never blocks or
      // fails the chat that just succeeded.
      if (prov === 'openrouter') {
        setTimeout(() => { fetchOpenRouterModels({ force: true }).catch(() => {}); }, 0);
      }
      if (PROVIDER_HEALTH && PROVIDER_HEALTH.markProviderUp) {
        PROVIDER_HEALTH.markProviderUp(prov, { mode: 'auto', sessionId: opts.sessionId || null });
      }
      // SMART AUTO (1c): success locks session affinity.
      // SMART AUTO (3): quality gate on accumulated text — a "successful"
      // HTTP 200 that produced classifier output or word soup is NOT success;
      // record it and let the caller decide to retry the next candidate via
      // allowPartialFailover. We surface it as a provider event + flag.
      if (_smartAuto) {
        const qIssue = _smartAuto.checkOutputQuality(_accum.join(''));
        if (qIssue) {
          publishProviderEvent('output_quality_reject', {
            provider: prov, reason: qIssue, sessionId: opts.sessionId || null,
          });
          opts.__qualityReject = { provider: prov, reason: qIssue };
          _smartAuto.clearSessionAffinity(opts.sessionId, qIssue);
          // A rejected output is NOT success. If another candidate remains and
          // the caller opted into partial-failover (agent loop), discard the
          // bad draft via provider-retry-reset and try the next provider.
          const moreQ = i < ranking.length - 1;
          if (moreQ && opts.allowPartialFailover === true) {
            yield { type: 'provider-retry-reset', from: prov, reason: `quality:${qIssue}` };
            attempts.push({ provider: prov, ok: false, reason: `quality reject: ${qIssue}`, started_at: _attemptT0, ended_at: Date.now() });
            continue;
          }
        } else {
          _smartAuto.setSessionAffinity(opts.sessionId, prov, providerOpts.model || null, 'success');
          try {
            const H = require('./provider-health');
            H.recordSuccess(prov + '::' + (providerOpts.model || opts.prefer || '*'));
            H.recordSuccess(prov);
          } catch (_) {}
        }
      }
      opts.__providerAttempts = attempts;
      return;
    } catch (e) {
      lastErr = e;
      // TEMP-INSTRUMENTATION P0-1: capture origin of empty-message errors.
      const _emsg = String(e && e.message || '');
      if (!_emsg.trim()) {
        try {
          safeLog('DEBUG_STREAM', `EMPTY_ERR_ORIGIN provider=${prov} attempt=${i + 1} name=${e && e.name} code=${e && e.code} errno=${e && e.errno} syscall=${e && e.syscall} stack=${String(e && e.stack || '(none)').split('\n').slice(0, 6).join(' | ')}`);
        } catch {}
      }
      const info = classifyProviderError(e);
      // Preserve an explicit failureClass stamped by the transport layer
      // (e.g. SSE_DISCONNECT from mid-stream socket death).
      if (!info.failureClass && e && e.failureClass) info.failureClass = e.failureClass;
      // HEALTH TAXONOMY: record granular per-model state so the scored router
      // and /api/llm/health see real failures, not just the boolean layer.
      try {
        const H = require('./provider-health');
        H.recordFromError(prov + '::' + (opts.model || opts.prefer || '*'), e);
        H.recordFromError(prov, e);
      } catch (_) {}
      const health = info.retryable && PROVIDER_HEALTH && PROVIDER_HEALTH.markProviderDown
        ? PROVIDER_HEALTH.markProviderDown(prov, info.reason, info.detail) : null;
      // KEEP-WORKING LAW (2026-08-25) REGION A: in-provider model swap. When
      // OpenRouter fails on one model (404/empty/5xx), try its NEXT free-pool
      // model before giving up on the whole provider. We park the replacement
      // in opts.models.openrouter; when the ranking loop revisits this
      // provider it picks up the swapped model instead of repeating a
      // guaranteed-dead id. One swap per failure; tried ids accumulate in
      // opts.__orTried so we never loop on the same corpse.
      if (prov === 'openrouter' && !opts.__orSwapDone && !opts.failClosedManual) {
        try {
          const pool = (typeof freeModels === 'function')
            ? freeModels(lastKnownGoodModels() || []) : [];
          const tried = opts.__orTried || new Set();
          tried.add(opts.models && opts.models.openrouter || opts.model || null);
          const nextFree = pool.find(m => m && !tried.has(m.id));
          if (nextFree) {
            opts.__orTried = tried;
            opts.models = opts.models || {};
            opts.models.openrouter = nextFree.id;
            attempts.push({ provider: prov, ok: false, orModelSwap: nextFree.id,
              reason: info.reason, started_at: _attemptT0, ended_at: Date.now() });
            publishProviderEvent('or_in_provider_swap', {
              from: opts.prefer || null, to: nextFree.id,
              reason: info.reason, sessionId: opts.sessionId || null });
            // Re-insert openrouter immediately after current index so the very
            // next attempt stays on this provider with the fresh model.
            ranking.splice(i + 1, 0, prov);
          }
          opts.__orSwapDone = true; // one swap per call keeps the chain bounded
        } catch (_) { /* discovery unavailable — normal failover proceeds */ }
      }
      if (MODEL_HEALTH) MODEL_HEALTH.recordFromError(`${prov}::${(opts.model || opts.prefer || 'default')}`, { status: info.statusCode, message: `${info.reason}: ${info.detail}` });
      attempts.push({ provider: prov, ok: false, reason: info.reason, statusCode: info.statusCode,
                      started_at: _attemptT0, ended_at: Date.now(),
                      cooldownMs: health && health.cooldownMs || 0,
                      cooldownUntil: health && health.retryAfter || null });
      publishProviderEvent('provider_failed', {
        provider: prov, mode: 'auto', attempt: i + 1, reason: info.reason,
        statusCode: info.statusCode, retryable: info.retryable,
        cooldownMs: health && health.cooldownMs || 0,
        cooldownUntil: health && health.retryAfter || null,
        sessionId: opts.sessionId || null,
      });
      const more = i < ranking.length - 1;
      // Ordinary streaming consumers cannot retry after partial output without
      // duplicating/splicing the answer. The agent loop is different: it holds
      // a complete model turn behind its execution gate. It explicitly opts
      // into a reset marker so the abandoned provider draft can be discarded
      // before the next candidate starts.
      // KEEP-WORKING LAW (2026-08-25): a mid-stream failure must not kill a
      // mission that has other candidates left — retryable or not. Under
      // allowPartialFailover (agent loop only), ANY yielded-then-died attempt
      // becomes a buffered reset so the next candidate starts clean. Raw
      // stream consumers (no opt-in) still abort on partial output. A
      // zero-output failure always advances like any other candidate failure.
      const partialFailoverOk = opts.allowPartialFailover === true && more;
      const bufferedReset = yielded && info.retryable && partialFailoverOk;
      const nonRetryableReset = yielded && !info.retryable && partialFailoverOk;
      if ((yielded && !partialFailoverOk) || !more) {
        opts.__providerAttempts = attempts;
        throw String(e && e.message || '').trim() ? e : new Error(info.detail);
      }
      if (bufferedReset || nonRetryableReset) {
        yield { type: 'provider-retry-reset', from: prov,
                reason: nonRetryableReset ? `non-retryable:${info.reason}` : info.reason };
      }
      yield { type: 'provider-failover', from: prov, to: ranking[i + 1],
              reason: info.reason, failureClass: info.failureClass || info.reason || null,
              statusCode: info.statusCode, detail: info.detail,
              cooldownMs: health && health.cooldownMs || 0,
              cooldownUntil: health && health.retryAfter || null };
    }
  }
  opts.__providerAttempts = attempts;
  throw lastErr || new Error('no eligible provider succeeded');
}

// ── OpenRouter dynamic model discovery + free-pool classification (cached) ──
const _orModelCache = { data: null, fetchedAt: 0, TTL_MS: 10 * 60 * 1000 };

async function fetchOpenRouterModels(opts = {}) {
  const now = Date.now();
  if (!opts.force && _orModelCache.data && (now - _orModelCache.fetchedAt) < _orModelCache.TTL_MS) {
    return { cached: true, fetchedAt: _orModelCache.fetchedAt, models: _orModelCache.data };
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set — cannot discover OpenRouter catalog');
  // KEEP-WORKING LAW (2026-08-25): global fetch() stalls inside the long-running
  // PM2 process on this box (undici pool state; same call succeeds in-process).
  // Use raw https.get — independent of any dispatcher/pool state.
  const json = await new Promise((resolve, reject) => {
    const req = require('https').get({
      hostname: 'openrouter.ai', path: '/api/v1/models',
      headers: { Authorization: `Bearer ${key}` },
      timeout: opts.timeoutMs || 15000,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const err = new Error(`openrouter /models HTTP ${res.statusCode}: ${data.slice(0, 200)}`);
          err.statusCode = res.statusCode;
          reject(err);
          return;
        }
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('openrouter /models timeout')); });
    req.on('error', reject);
  });
  const models = Array.isArray(json.data)
    ? json.data.map(m => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length,
        pricing_prompt: m.pricing && m.pricing.prompt,
        pricing_completion: m.pricing && m.pricing.completion,
        free: !!(m.id && m.id.endsWith(':free')) ||
              !!(m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0),
      }))
    : [];
  _orModelCache.data = models;
  _orModelCache.fetchedAt = now;
  return { cached: false, fetchedAt: now, count: models.length, models };
}

// Last-known-good catalogue for degraded mode — cache survives TTL failures.
function lastKnownGoodModels() {
  return Array.isArray(_orModelCache.data) ? _orModelCache.data : null;
}

function freeModels(models) {
  const list = Array.isArray(models) ? models : (_orModelCache.data || []);
  return list.filter(m => m.free).sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
}

module.exports = {
  streamChatAuto, eligibleProviders, retryableProviderError, classifyProviderError, normalizeProviderName,
  _configForProvider: configForProvider,
  chat,
  streamChat,
  swarm,
  complete,
  getProviderInfo,
  listProviders,
  PROVIDERS,
  PROVIDER_CAPABILITIES,
  samplingParams,
  fetchOpenRouterModels,
  lastKnownGoodModels,
  freeModels,
  // Low-level — exposed for testing and custom integrations
  chatOpenAI,
  chatAnthropic,
  chatGemini,
  resolveConfig,
  fallbackConfig,
};
