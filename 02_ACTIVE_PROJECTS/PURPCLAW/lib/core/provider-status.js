'use strict';
/**
 * lib/core/provider-status.js — Provider State Machine
 * ====================================================
 *
 * Provider status has explicit states, not just "ready" vs nothing.
 *
 * States:
 *   missing          — no key/config found
 *   configured      — key/env exists
 *   verified        — test call passed
 *   auth_failed     — key rejected (401/403)
 *   local_unavailable — local service not running
 *   available       — free/local option exists but unverified
 */

const https = require('https');
const http  = require('http');

// ── Load dotenv ──────────────────────────────────────────────────────
try { require('dotenv').config(); } catch (_) {}

const STATES = {
  MISSING:        'missing',
  CONFIGURED:     'configured',
  VERIFIED:       'verified',
  AUTH_FAILED:    'auth_failed',
  LOCAL_UNAVAIL:  'local_unavailable',
  AVAILABLE:      'available',
};

// ── Provider config ────────────────────────────────────────────────────

// Provider → which env vars hold their config
const PROVIDER_ENV = {
  'minimax-native': { key: ['MINIMAX_API_KEY'],      baseUrl: ['MINIMAX_BASE_URL', 'MINIMAX_API_ENDPOINT'], model: ['MINIMAX_MODEL'] },
  'minimax':        { key: ['MINIMAX_API_KEY'],      baseUrl: ['MINIMAX_BASE_URL', 'MINIMAX_API_ENDPOINT'], model: ['MINIMAX_MODEL'] },
  'nvidia-nim':    { key: ['NVIDIA_NIM_API_KEY', 'NVAPI_KEY', 'NVID...EY'], baseUrl: ['NVIDIA_NIM_BASE_URL'], model: ['NVIDIA_NIM_MODEL'] },
  'nvidia':        { key: ['NVIDIA_NIM_API_KEY', 'NVAPI_KEY'], baseUrl: ['NVIDIA_NIM_BASE_URL'], model: ['NVIDIA_NIM_MODEL'] },
  'deepseek':      { key: ['DEEPSEEK_API_KEY'],      baseUrl: [], model: [] },
  'deepseek-nim':  { key: ['DEEPSEEK_API_KEY'],      baseUrl: [], model: [] },
  'kimi':          { key: ['KIMI_API_KEY'],          baseUrl: [], model: [] },
  'kimi-nim':      { key: ['KIMI_API_KEY'],          baseUrl: [], model: [] },
  'ollama':        { key: [],                          baseUrl: [], model: [] }, // local, no key
  'lmstudio':      { key: [],                          baseUrl: [], model: [] }, // local, no key
  'openai':        { key: ['OPENAI_API_KEY'],          baseUrl: [], model: [] },
  'anthropic':     { key: ['ANTHROPIC_API_KEY'],      baseUrl: [], model: [] },
  'gemini':        { key: ['GEMINI_API_KEY'],          baseUrl: [], model: [] },
  'openrouter':    { key: ['OPENROUTER_API_KEY'],     baseUrl: [], model: [] },
  'groq':          { key: ['GROQ_API_KEY'],            baseUrl: [], model: [] },
  'together':      { key: ['TOGETHER_API_KEY'],        baseUrl: [], model: [] },
  'mistral':       { key: ['MISTRAL_API_KEY'],         baseUrl: [], model: [] },
  'github-models': { key: ['GITHUB_TOKEN'],            baseUrl: [], model: [] },
  'codex':         { key: ['CODEX_API_KEY'],           baseUrl: [], model: [] },
  'custom':        { key: ['LLM_API_KEY'],             baseUrl: ['LLM_BASE_URL'], model: [] },
};

// Role descriptions
const PROVIDER_ROLES = {
  'minimax-native': 'primary chat + delegation controller',
  'minimax':        'primary chat + delegation controller',
  'nvidia-nim':    'worker model gateway',
  'nvidia':        'worker model gateway',
  'deepseek-nim':  'backend/review worker',
  'deepseek':      'backend/review worker',
  'minimax-nim':   'frontend/creative worker',
  'kimi-nim':      'swarm worker',
  'kimi':          'swarm worker',
  'ollama':        'local free worker',
  'lmstudio':      'local free worker',
  'openrouter':    'multi-model gateway',
  'groq':          'fast free worker',
  'openai':        'general worker',
  'anthropic':     'general worker',
  'gemini':        'general worker',
  'github-models': 'free worker',
};

// ── State detection ────────────────────────────────────────────────────

function getEnv(vars) {
  for (const v of vars) {
    if (v && process.env[v] && process.env[v].length > 0) return process.env[v];
  }
  return null;
}

function hasKey(provider) {
  const env = PROVIDER_ENV[provider];
  if (!env) return false;
  return getEnv(env.key) !== null;
}

function isLocal(provider) {
  return provider === 'ollama' || provider === 'lmstudio';
}

function isFree(provider) {
  return provider === 'ollama' || provider === 'lmstudio' || provider === 'github-models';
}

/**
 * Get the current state of a provider WITHOUT making a test call.
 * @param {string} provider
 * @returns {{ state: string, provider: string, role: string, hasKey: boolean, baseUrl?: string }}
 */
function getProviderStatus(provider) {
  const normalized = normalizeProvider(provider);
  const env = PROVIDER_ENV[normalized] || PROVIDER_ENV[provider] || {};
  const role = PROVIDER_ROLES[normalized] || PROVIDER_ROLES[provider] || 'worker';

  // Local provider
  if (isLocal(provider)) {
    const running = checkLocalService(normalized);
    return {
      state: running ? STATES.AVAILABLE : STATES.LOCAL_UNAVAIL,
      provider: normalized,
      role,
      hasKey: false,
      localService: running ? 'running' : 'not running',
    };
  }

  // Free provider
  if (isFree(provider)) {
    return {
      state: STATES.AVAILABLE,
      provider: normalized,
      role,
      hasKey: hasKey(normalized),
    };
  }

  // Paid provider — check for key
  const key = getEnv(env.key || []);
  if (!key) {
    return {
      state: STATES.MISSING,
      provider: normalized,
      role,
      hasKey: false,
    };
  }

  // Key exists — we can't know if it's valid without a test call
  // Return CONFIGURED as the optimistic state
  const baseUrl = getEnv(env.baseUrl || []) || null;
  return {
    state: STATES.CONFIGURED,
    provider: normalized,
    role,
    hasKey: true,
    baseUrl,
    keyMask: key.substring(0, 6) + '...' + key.substring(key.length - 4),
  };
}

function normalizeProvider(provider) {
  if (!provider) return 'unknown';
  const p = provider.toLowerCase();
  // Check full names first before partial matches
  if (p === 'minimax-native' || p === 'minimax') return 'minimax-native';
  if (p === 'nvidia-nim' || p === 'nvidia' || p === 'nvidia-nim-gateway') return 'nvidia-nim';
  if (p === 'deepseek-nim' || p === 'deepseek') return 'deepseek-nim';
  if (p === 'kimi-nim' || p === 'kimi' || p === 'moonshotai' || p === 'moonshot') return 'kimi-nim';
  return p;
}

function checkLocalService(provider) {
  if (provider === 'ollama') {
    return checkHttp('http://localhost:11434', '/api/tags');
  }
  if (provider === 'lmstudio') {
    return checkHttp('http://localhost:1234', '/v1/models');
  }
  return false;
}

function checkHttp(url, path_) {
  return new Promise(resolve => {
    try {
      const u = new URL(path_, url);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.get(u, { timeout: 2000 }, res => {
        resolve(res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Verify a provider by making a test API call.
 * @param {string} provider
 * @returns {Promise<{ state: string, provider: string, role: string, latencyMs?: number, error?: string }>}
 */
async function verifyProvider(provider) {
  const status = getProviderStatus(provider);
  const normalized = status.provider;

  // Can't verify what's missing or local unavailable
  if (status.state === STATES.MISSING) return { ...status, error: 'no key configured' };
  if (status.state === STATES.LOCAL_UNAVAIL) return { ...status, error: 'local service not running' };

  // Local — just check if it's up
  if (isLocal(normalized)) {
    const running = await checkLocalService(normalized);
    return {
      ...status,
      state: running ? STATES.VERIFIED : STATES.LOCAL_UNAVAIL,
      localService: running ? 'responding' : 'not responding',
    };
  }

  // Make a test chat call
  const start = Date.now();
  try {
    const result = await testChat(normalized);
    return {
      ...status,
      state: result.ok ? STATES.VERIFIED : STATES.AUTH_FAILED,
      latencyMs: Date.now() - start,
      error: result.error || undefined,
    };
  } catch (err) {
    return {
      ...status,
      state: STATES.AUTH_FAILED,
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

/**
 * Make a minimal test chat call to a provider.
 */
async function testChat(provider) {
  const normalized = normalizeProvider(provider);
  const env = PROVIDER_ENV[normalized] || PROVIDER_ENV[provider] || {};

  const key = getEnv(env.key);
  const baseUrl = getEnv(env.baseUrl) || getDefaultBaseUrl(normalized);
  const model  = getEnv(env.model)   || getDefaultModel(normalized);

  if (!key) return { ok: false, error: 'no API key' };

  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 5,
  });

  const u = new URL('/v1/chat/completions', baseUrl);
  const mod = u.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = mod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 8000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          resolve({ ok: false, error: `HTTP ${res.statusCode} — auth failed` });
        } else if (res.statusCode === 200) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });
    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

function getDefaultBaseUrl(provider) {
  const urls = {
    'minimax-native': 'https://api.minimax.io/v1',
    'minimax':        'https://api.minimax.io/v1',
    'nvidia-nim':     'https://integrate.api.nvidia.com/v1',
    'deepseek-nim':   'https://api.deepseek.com/v1',
    'deepseek':       'https://api.deepseek.com/v1',
    'kimi-nim':       'https://api.moonshot.cn/v1',
    'kimi':           'https://api.moonshot.cn/v1',
    'openai':         'https://api.openai.com/v1',
    'anthropic':      'https://api.anthropic.com',
    'gemini':         'https://generativelanguage.googleapis.com',
    'openrouter':     'https://openrouter.ai/api/v1',
    'groq':           'https://api.groq.com/openai/v1',
    'together':       'https://api.together.xyz/v1',
    'mistral':        'https://api.mistral.ai/v1',
    'custom':         process.env.LLM_BASE_URL || '',
  };
  return urls[provider] || '';
}

function getDefaultModel(provider) {
  const models = {
    'minimax-native': 'MiniMax-M2.7',
    'minimax':        'MiniMax-M2.7',
    'nvidia-nim':     'meta/llama-4-maverick',
    'deepseek-nim':   'deepseek-ai/deepseek-v4-pro',
    'deepseek':       'deepseek-chat',
    'kimi-nim':       'moonshotai/kimi-k2.6',
    'kimi':           'kimi-k2-5',
    'openai':         'gpt-4o-mini',
    'anthropic':      'claude-3-5-haiku',
    'gemini':         'gemini-2.5-flash',
    'openrouter':     'openai/gpt-4o-mini',
    'groq':           'llama-3.3-70b-versatile',
    'together':       'meta-llama/llama-3-70b',
    'mistral':        'mistral-small',
    'custom':         'default',
  };
  return models[provider] || '';
}

/**
 * Get all configured providers with their states.
 * @returns {Array<{ provider: string, state: string, role: string, hasKey: boolean }>}
 */
function getAllProviderStatus() {
  const allProviders = [
    'minimax-native', 'nvidia-nim',
    'deepseek-nim', 'kimi-nim',
    'openai', 'anthropic', 'gemini',
    'openrouter', 'groq', 'together', 'mistral',
    'ollama', 'lmstudio',
    'github-models', 'codex',
  ];

  return allProviders.map(p => {
    const s = getProviderStatus(p);
    return {
      provider: s.provider,
      state: s.state,
      role: s.role,
      hasKey: s.hasKey,
      keyMask: s.keyMask || null,
      localService: s.localService || null,
    };
  }).filter(p => p.state !== STATES.MISSING || p.hasKey);
}

// ── CLI formatter ─────────────────────────────────────────────────────

function formatState(state) {
  switch (state) {
    case STATES.VERIFIED:       return '\x1b[32m✓ verified\x1b[0m';
    case STATES.CONFIGURED:      return '\x1b[33m⚙ configured\x1b[0m';
    case STATES.AUTH_FAILED:     return '\x1b[31m✗ auth_failed\x1b[0m';
    case STATES.LOCAL_UNAVAIL:   return '\x1b[31m✗ local_unavailable\x1b[0m';
    case STATES.AVAILABLE:       return '\x1b[36m○ available\x1b[0m';
    case STATES.MISSING:          return '\x1b[90m— missing\x1b[0m';
    default:                      return `\x1b[90m${state}\x1b[0m`;
  }
}

function printProviderStatus(provider) {
  const s = getProviderStatus(provider);
  console.log(`\x1b[1m${s.provider}\x1b[0m  ${formatState(s.state)}`);
  console.log(`  role: ${s.role}`);
  if (s.hasKey) console.log(`  key:  ${s.keyMask}`);
  if (s.localService) console.log(`  local: ${s.localService}`);
}

function printAllProviders() {
  console.log('\x1b[1mPURPCLAW Provider Status\x1b[0m\n');
  const all = getAllProviderStatus();
  if (all.length === 0) {
    console.log('  No providers configured. Run `purpclaw setup` to get started.\n');
    return;
  }
  // Group by state
  const verified = all.filter(p => p.state === STATES.VERIFIED);
  const configured = all.filter(p => p.state === STATES.CONFIGURED);
  const available = all.filter(p => p.state === STATES.AVAILABLE);
  const failed = all.filter(p => p.state === STATES.AUTH_FAILED || p.state === STATES.LOCAL_UNAVAIL);
  const missing = all.filter(p => p.state === STATES.MISSING);

  const group = (label, items) => {
    if (!items.length) return;
    console.log(`\x1b[1m${label}\x1b[0m`);
    for (const p of items) {
      const mask = p.keyMask ? `  ${p.keyMask}` : p.localService ? `  (${p.localService})` : '';
      console.log(`  ${formatState(p.state)}  \x1b[36m${p.provider}\x1b[0m  ${p.role}${mask}`);
    }
    console.log('');
  };

  group('Verified:', verified);
  group('Configured (key found, not tested):', configured);
  group('Available (free/local):', available);
  group('Failed:', failed);
  group('Missing (not configured):', missing);
}

// ── Exports ───────────────────────────────────────────────────────────

module.exports = {
  STATES,
  PROVIDER_STATES: STATES,
  getProviderStatus,
  verifyProvider,
  getAllProviderStatus,
  formatState,
  printProviderStatus,
  printAllProviders,
  normalizeProvider,
};
