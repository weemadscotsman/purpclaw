'use strict';

// Auto-load .env if dotenv is available. This makes the LLM provider
// work both from the API server (unified_api.js) and from the CLI
// (bin/purpclaw.js) without each caller having to remember to call
// dotenv.config() first.
try { require('dotenv').config(); } catch (e) { /* dotenv not installed, fall through */ }

const https = require('https');
const http  = require('http');
const { URL } = require('url');

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
async function* streamChatOpenAI(cfg, messages, opts = {}) {
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
    temperature : opts.temperature ?? 0.7,
    max_tokens  : opts.maxTokens   ?? 4096,
    ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    ...(opts.tools          ? { tools: opts.tools, tool_choice: opts.toolChoice || 'auto' } : {}),
    ...(opts.stop           ? { stop: opts.stop }  : {}),
  };

  const payload = JSON.stringify(body);
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
    req.write(payload); req.end();
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    // Read the error body then throw
    let body = '';
    for await (const c of res) body += c;
    throw new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`);
  }

  // Parse SSE stream. Format:
  //   data: {"choices":[{"delta":{"content":"tok"}}]}\n\n
  //   data: [DONE]\n\n
  let buf = '';
  let model = '';
  for await (const chunk of res) {
    buf += chunk.toString('utf-8');
    let nl;
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
        const content = delta?.content || '';
        if (content) yield { content, done: false, model };
        // OpenAI puts usage in the last chunk sometimes
        if (j.usage) yield { content: '', done: true, model, usage: j.usage };
      } catch (e) { /* skip malformed line */ }
    }
  }
  // If we exit the loop without [DONE], signal end
  yield { content: '', done: true, model };
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
    throw new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 300)}`);
  }

  let buf = '';
  let model = body.model;
  for await (const chunk of res) {
    buf += chunk.toString('utf-8');
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload_ = line.slice(5).trim();
      try {
        const j = JSON.parse(payload_);
        if (j.type === 'message_start' && j.message?.model) model = j.message.model;
        if (j.type === 'content_block_delta' && j.delta?.text) {
          yield { content: j.delta.text, done: false, model };
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
    throw new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 300)}`);
  }

  let buf = '';
  for await (const chunk of res) {
    buf += chunk.toString('utf-8');
    let nl;
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
        if (text) yield { content: text, done: false, model };
        // Check for finish
        if (j.candidates?.[0]?.finishReason) {
          const usage = j.usageMetadata ? {
            prompt_tokens: j.usageMetadata.promptTokenCount || 0,
            completion_tokens: j.usageMetadata.candidatesTokenCount || 0,
            total_tokens: j.usageMetadata.totalTokenCount || 0,
          } : undefined;
          yield { content: '', done: true, model, usage };
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
  // Honor `opts.provider` — explicit provider override per-call.
  // Falls through to env-based cfg if no provider was passed.
  if (opts.provider && PROVIDERS[opts.provider]) {
    cfg = resolveConfig('LLM');
    cfg.providerName = opts.provider;
    const p = PROVIDERS[opts.provider];
    cfg.provider = p;
    cfg.baseUrl  = opts.baseUrl || process.env[`${(opts.provider || 'LLM').toUpperCase()}_BASE_URL`] || p.baseUrl;
    cfg.apiKey   = opts.apiKey  || process.env[`${opts.provider.toUpperCase()}_API_KEY`] || process.env.LLM_API_KEY || p.apiKey || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : '') || '';
    cfg.extraHeaders = p.extraHeaders || {};
    // When --provider is passed without --model, use the new
    // provider's default model. (If the caller passed --model, that
    // wins, since they explicitly asked for a specific model.)
    cfg.model = opts.model || p.defaultModel;
  }
  // Auto-route: model names containing "/" (e.g. "openai/gpt-oss-20b:free")
  // are OpenRouter model IDs. If the active provider isn't already
  // OpenRouter, switch the route so the call actually works.
  if (opts.model && opts.model.includes('/') && cfg.providerName !== 'openrouter') {
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
  // Honor `opts.provider` — explicit per-call override.
  if (opts.provider && PROVIDERS[opts.provider]) {
    cfg = resolveConfig('LLM');
    cfg.providerName = opts.provider;
    const p = PROVIDERS[opts.provider];
    cfg.provider = p;
    cfg.baseUrl  = opts.baseUrl || process.env[`${opts.provider.toUpperCase()}_BASE_URL`] || p.baseUrl;
    cfg.apiKey   = opts.apiKey  || process.env[`${opts.provider.toUpperCase()}_API_KEY`] || process.env.LLM_API_KEY || p.apiKey || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : '') || '';
    cfg.extraHeaders = p.extraHeaders || {};
    cfg.model = opts.model || p.defaultModel;
  }
  if (opts.model && opts.model.includes('/') && cfg.providerName !== 'openrouter') {
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
  streamChat,
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
