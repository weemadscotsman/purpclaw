'use strict';

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

const https = require('https');
const http  = require('http');
const { URL } = require('url');

// ── Provider registry ─────────────────────────────────────────────────────────

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
    defaultModel : 'deepseek-chat',
    authHeader   : 'Bearer',
    format       : 'openai',
  },
  openrouter: {
    baseUrl      : 'https://openrouter.ai/api/v1',
    defaultModel : 'anthropic/claude-3.5-haiku',
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
    temperature : opts.temperature ?? 0.7,
    max_tokens  : opts.maxTokens   ?? 4096,
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
  const cfg = cfgOverride || mainConfig();
  return runWithFallback(cfg, messages, opts);
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
  return resp.content;
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

module.exports = {
  chat,
  swarm,
  complete,
  getProviderInfo,
  listProviders,
  PROVIDERS,
  // Low-level — exposed for testing and custom integrations
  chatOpenAI,
  chatAnthropic,
  chatGemini,
  resolveConfig,
  fallbackConfig,
};
