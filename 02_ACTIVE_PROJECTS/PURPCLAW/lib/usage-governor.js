/**
 * lib/usage-governor.js
 *
 * THE central Usage Governor — one gate before every provider/model call.
 *
 * Tracks: role, provider, model, key slot, tokens, rpm, cooldown, failures,
 *        cache hits, active calls, throttled requests.
 *
 * Rules:
 *   - NVIDIA NIM: 40 RPM per key (per operator directive 2026-06-24)
 *   - MiniMax platform: 18 RPM
 *   - kimi/deepseek/glm: 18 RPM each
 *   - gemini: 30 RPM
 *   - ollama/lmstudio (local): 600 RPM (no remote limit)
 *
 * Role budgets (tokens-per-minute ceiling):
 *   chat_coordinator: 60k tpm (cheap, fast)
 *   swarm_orchestrator: 40k tpm (capped)
 *   researcher: explicit only — 20k tpm
 *   builder/code_repair: 80k tpm (medium/high)
 *   fallback: 10k tpm (emergency only)
 *
 * DIRECT_CHAT protection: only chat_coordinator role. One model call.
 * HYBRID_TASK: capped delegation, max 2 parallel, max 1 retry per lane,
 *              max 2 fallback hops, summarise before fan-out.
 *
 * Cache: TTL-based caches for provider health, model list, session summary,
 *        repo inventory, previous audit/route map.
 *
 * Cooldown: exponential on 429/503/500/403/401 — 30s → 60s → 120s → 240s → 480s → 600s cap.
 */

'use strict';

const EVENT = (() => { try { return require('./event-bus'); } catch { return null; } })();

// ── Role definitions ────────────────────────────────────────────────────────
const ROLES = {
  chat_coordinator:  { rpmCap: 18,  tokenBudget: 60_000, parallel: 5, retries: 0, fallbacks: 1 },
  swarm_orchestrator:{ rpmCap: 8,   tokenBudget: 40_000, parallel: 2, retries: 1, fallbacks: 2 },
  researcher:        { rpmCap: 6,   tokenBudget: 20_000, parallel: 1, retries: 1, fallbacks: 2 },
  builder_code_repair:{rpmCap: 12,  tokenBudget: 80_000, parallel: 2, retries: 1, fallbacks: 2 },
  fallback:          { rpmCap: 4,   tokenBudget: 10_000, parallel: 1, retries: 0, fallbacks: 1 },
  tts_voice:         { rpmCap: 10,  tokenBudget: 5_000,  parallel: 1, retries: 1, fallbacks: 1 },
};

// ── Per-provider RPM caps (per key, not provider-wide) ──────────────────────
const PROVIDER_RPM_CAP = {
  minimax:  18,
  nvidia:   40,  // operator ceiling
  kimi:     18,
  deepseek: 18,
  glm:      18,
  gemini:   30,
  ollama:   600,
  lmstudio: 600,
};

const COOLDOWN_LADDER_MS = [30_000, 60_000, 120_000, 240_000, 480_000, 600_000];

// ── Key slot loader ──────────────────────────────────────────────────────────
function _loadKeys() {
  const keys = [];
  // NVIDIA pool — 10 keys
  const nvVars = ['NVIDIA_API_KEY','NVIDIA_API_KEY_PURP1','NVIDIA_API_KEY_PURP2',
    'NVIDIA_API_KEY_PURP3','NVIDIA_API_KEY_PURP4','NVIDIA_API_KEY_PURP5',
    'NVIDIA_API_KEY_BACKUP1','NVIDIA_API_KEY_BACKUP2','NVIDIA_API_KEY_BACKUP3',
    'NVIDIA_API_KEY_BACKUP4','NVIDIA_API_KEY_HERMES'];
  const seen = new Set();
  for (const v of nvVars) {
    const k = process.env[v];
    if (k && k.startsWith('nvapi-') && !seen.has(k)) {
      keys.push({ provider: 'nvidia', envVar: v, key: k });
      seen.add(k);
    }
  }
  // MiniMax
  if (process.env.MINIMAX_API_KEY && process.env.MINIMAX_API_KEY.trim().length > 8) {
    keys.push({ provider: 'minimax', envVar: 'MINIMAX_API_KEY', key: process.env.MINIMAX_API_KEY });
  }
  return keys;
}

// ── Internal state ──────────────────────────────────────────────────────────
const _keyState = new Map();   // envVar → { lastAt, cooldownUntil, backoffStep, failures429, failuresTotal }
const _roleState = new Map();  // role → { tokensThisMinute, minuteStart, activeCalls }
const _caches = {
  provider_health: new Map(),  // provider → { ok, lastCheck, ttlMs }
  model_list:      new Map(),  // provider → { models, lastFetch, ttlMs }
  session_summary: new Map(),  // sessionId → { summary, lastUsed, ttlMs }
  repo_inventory:  new Map(),  // repo → { inventory, lastScan, ttlMs }
  route_map:       new Map(),  // query → { route, lastHit, ttlMs }
};
const _stats = {
  totalCalls: 0,
  throttledRequests: 0,
  cooldownRejections: 0,
  cacheHits: 0,
  cacheMisses: 0,
  fallbackHops: 0,
  roleRejections: 0,
  startedAt: Date.now(),
};
const _activeCalls = new Map(); // callId → { role, provider, model, keySlot, startedAt }
const _listeners = new Set();   // subscribers for /api/governor/status

function _ensureKey(envVar) {
  let s = _keyState.get(envVar);
  if (!s) {
    s = { lastAt: 0, cooldownUntil: 0, backoffStep: 0, failures429: 0, failuresTotal: 0, totalCalls: 0 };
    _keyState.set(envVar, s);
  }
  return s;
}

function _ensureRole(role) {
  let s = _roleState.get(role);
  if (!s) {
    s = { tokensThisMinute: 0, minuteStart: Date.now(), activeCalls: 0 };
    _roleState.set(role, s);
  }
  // Reset token bucket every minute
  if (Date.now() - s.minuteStart >= 60_000) {
    s.tokensThisMinute = 0;
    s.minuteStart = Date.now();
  }
  return s;
}

function _pickKey(provider) {
  const all = _loadKeys().filter(k => k.provider === provider);
  if (all.length === 0) return null;
  const now = Date.now();
  // Score each key: prefer not in cooldown, then oldest lastAt (true rotation, not round-robin)
  let best = null, bestScore = -Infinity;
  for (const k of all) {
    const s = _ensureKey(k.envVar);
    if (s.cooldownUntil > now) continue;  // skip keys on cooldown
    // Score = -lastAt (oldest first); also penalize by failure count
    const age = now - s.lastAt;
    const score = age - (s.failuresTotal * 5000);
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return best;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * gateCheck({ role, provider, model, keySlot? })
 * Returns { ok, reason?, key?, cooldownMs? }
 *
 * Single gate before every model call.
 */
function gateCheck({ role, provider, model, keySlot }) {
  _stats.totalCalls++;
  const roleDef = ROLES[role];
  if (!roleDef) {
    _stats.roleRejections++;
    return { ok: false, reason: `unknown_role:${role}` };
  }

  // Role parallelism cap
  const rs = _ensureRole(role);
  if (rs.activeCalls >= roleDef.parallel) {
    _stats.throttledRequests++;
    return { ok: false, reason: `role_parallel_cap:${role}:${rs.activeCalls}/${roleDef.parallel}` };
  }

  // Role token budget
  if (rs.tokensThisMinute >= roleDef.tokenBudget) {
    _stats.throttledRequests++;
    return { ok: false, reason: `role_token_budget:${role}:${rs.tokensThisMinute}/${roleDef.tokenBudget}` };
  }

  // Per-key RPM cap (NVIDIA 40, others 18 etc.)
  const rpmCap = PROVIDER_RPM_CAP[provider] || 18;
  const now = Date.now();
  const localProvider = provider === 'ollama' || provider === 'lmstudio';
  const allKeys = localProvider
    ? [{ provider, envVar: `LOCAL_${provider.toUpperCase()}`, value: '' }]
    : _loadKeys().filter(k => k.provider === provider);
  if (allKeys.length === 0) {
    return { ok: false, reason: `no_keys_for_provider:${provider}` };
  }

  // If a specific key was requested, check it. Otherwise pick freshest.
  let chosen = localProvider ? allKeys[0] : null;
  if (keySlot) {
    const k = allKeys.find(x => x.envVar === keySlot);
    if (k) {
      const s = _ensureKey(k.envVar);
      if (s.cooldownUntil > now) {
        _stats.cooldownRejections++;
        return { ok: false, reason: `key_cooldown:${k.envVar}`, cooldownMs: s.cooldownUntil - now };
      }
      // RPM gap: 60000 / rpmCap ms between calls
      const minGap = Math.ceil(60_000 / rpmCap);
      if (now - s.lastAt < minGap) {
        _stats.throttledRequests++;
        return { ok: false, reason: `key_rpm:${k.envVar}:${Math.ceil((minGap - (now - s.lastAt)) / 1000)}s` };
      }
      chosen = k;
    }
  }
  if (!chosen) {
    chosen = _pickKey(provider);
    if (!chosen) {
      _stats.cooldownRejections++;
      return { ok: false, reason: `all_keys_cooldown:${provider}` };
    }
    const s = _ensureKey(chosen.envVar);
    const minGap = Math.ceil(60_000 / rpmCap);
    if (now - s.lastAt < minGap) {
      _stats.throttledRequests++;
      return { ok: false, reason: `key_rpm:${chosen.envVar}:${Math.ceil((minGap - (now - s.lastAt)) / 1000)}s` };
    }
  }

  // Reserve the call slot
  rs.activeCalls++;
  s_total_active_calls_inc();

  const callId = `${role}:${provider}:${model}:${now}:${Math.random().toString(36).slice(2, 8)}`;
  _activeCalls.set(callId, {
    callId, role, provider, model, keySlot: chosen.envVar, startedAt: now,
  });

  // v2.1 — Auto-release safety net: if recordResult never fires (consumer
  // dropped the stream, request aborted mid-flight, generator never closed),
  // release the slot after LEAK_TIMEOUT_MS so chat_coordinator doesn't get
  // permanently blocked. This is a belt-and-braces guard alongside the
  // try/finally in streamChat.
  const LEAK_TIMEOUT_MS = 30_000;
  const timer = setTimeout(() => {
    const stillThere = _activeCalls.get(callId);
    if (stillThere && !stillThere.released) {
      _activeCalls.delete(callId);
      rs.activeCalls = Math.max(0, rs.activeCalls - 1);
      // Mark as released so recordResult is a no-op
      stillThere.released = true;
      _stats.totalCalls++;  // count the leak as a tracked event
    }
  }, LEAK_TIMEOUT_MS);
  timer.unref();  // don't keep the process alive

  return { ok: true, key: chosen, callId, roleDef, _leakTimer: timer };
}

/**
 * recordResult({ callId, status, tokens?, latencyMs? })
 * status: 'ok' | 'rate_limit' | 'auth' | 'timeout' | 'stall' | 'quota' | 'error'
 *
 * Updates key cooldown, role token usage, cache invalidation hints.
 */
function recordResult({ callId, status, tokens = 0, latencyMs = 0 }) {
  const call = _activeCalls.get(callId);
  if (!call) return;
  if (call.released) return;  // already auto-released by leak guard
  _activeCalls.delete(callId);

  const rs = _ensureRole(call.role);
  rs.activeCalls = Math.max(0, rs.activeCalls - 1);
  s_total_active_calls_dec();

  // Token accounting (rough estimate; stream reports actuals when available)
  rs.tokensThisMinute += tokens;

  const ks = _ensureKey(call.keySlot);
  ks.lastAt = Date.now();
  ks.totalCalls++;

  if (status === 'ok') {
    // Reset backoff step on success
    if (ks.backoffStep > 0) ks.backoffStep--;
    return;
  }

  ks.failuresTotal++;
  if (status === 'rate_limit' || status === 'quota') {
    ks.failures429++;
    ks.backoffStep = Math.min(ks.backoffStep + 1, COOLDOWN_LADDER_MS.length - 1);
    ks.cooldownUntil = Date.now() + COOLDOWN_LADDER_MS[ks.backoffStep];
    // Invalidate provider health cache — let it re-probe
    _caches.provider_health.delete(call.provider);
  } else if (status === 'auth') {
    // Long cooldown on auth failures (bad key — don't keep slamming)
    ks.cooldownUntil = Date.now() + 600_000;  // 10 min
    ks.backoffStep = COOLDOWN_LADDER_MS.length - 1;
  } else if (status === 'timeout' || status === 'stall') {
    // Short cooldown — might just be slow
    ks.cooldownUntil = Date.now() + 15_000;
  } else {
    // Generic error: mild cooldown
    ks.cooldownUntil = Date.now() + 5_000;
  }

  if (EVENT) _safe(() => EVENT.publish('governor.failure', { role: call.role, provider: call.provider, model: call.model, status, cooldownMs: ks.cooldownUntil - Date.now() }));
}

// ── Cache layer ─────────────────────────────────────────────────────────────

/**
 * cacheGet(kind, key) — returns cached value or undefined
 */
function cacheGet(kind, key) {
  const m = _caches[kind];
  if (!m) return undefined;
  const entry = m.get(key);
  if (!entry) { _stats.cacheMisses++; return undefined; }
  if (Date.now() - entry.at > entry.ttlMs) { m.delete(key); _stats.cacheMisses++; return undefined; }
  _stats.cacheHits++;
  entry.hits++;
  return entry.value;
}

/**
 * cacheSet(kind, key, value, ttlMs) — store with TTL
 */
function cacheSet(kind, key, value, ttlMs = 60_000) {
  const m = _caches[kind];
  if (!m) return;
  m.set(key, { value, at: Date.now(), ttlMs, hits: 0 });
}

/**
 * cacheInvalidate(kind, key?) — drop one key or all of a kind
 */
function cacheInvalidate(kind, key) {
  const m = _caches[kind];
  if (!m) return;
  if (key === undefined) m.clear(); else m.delete(key);
}

// ── Status snapshot ─────────────────────────────────────────────────────────

/**
 * status() — full snapshot for /api/governor/status
 */
function status() {
  const now = Date.now();
  const keys = _loadKeys();
  const keySnap = keys.map(k => {
    const s = _ensureKey(k.envVar);
    return {
      envVar: k.envVar,
      provider: k.provider,
      cooldownUntil: s.cooldownUntil,
      cooldownRemainingMs: Math.max(0, s.cooldownUntil - now),
      onCooldown: s.cooldownUntil > now,
      backoffStep: s.backoffStep,
      failures429: s.failures429,
      failuresTotal: s.failuresTotal,
      totalCalls: s.totalCalls,
      lastAt: s.lastAt,
      lastAtAgoMs: now - s.lastAt,
    };
  });
  const roleSnap = {};
  for (const role of Object.keys(ROLES)) {
    const s = _ensureRole(role);
    roleSnap[role] = {
      activeCalls: s.activeCalls,
      parallelCap: ROLES[role].parallel,
      tokensThisMinute: s.tokensThisMinute,
      tokenBudget: ROLES[role].tokenBudget,
      minuteResetInMs: 60_000 - (now - s.minuteStart),
      rpmCap: ROLES[role].rpmCap,
    };
  }
  const cacheSnap = {};
  for (const [kind, m] of Object.entries(_caches)) {
    cacheSnap[kind] = { size: m.size, entries: Array.from(m.keys()).slice(0, 20) };
  }
  return {
    uptimeMs: now - _stats.startedAt,
    stats: { ..._stats },
    keys: keySnap,
    roles: roleSnap,
    caches: cacheSnap,
    activeCalls: Array.from(_activeCalls.values()),
  };
}

// ── Subscribe (for SSE) ─────────────────────────────────────────────────────
function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Internal helpers ────────────────────────────────────────────────────────
function s_total_active_calls_inc() {}
function s_total_active_calls_dec() {}
function _safe(fn) { try { fn(); } catch (_) {} }

// ── DIRECT_CHAT / HYBRID_TASK guards ────────────────────────────────────────

/**
 * guardDirectChat(text, opts) — returns true if this message is casual chat
 * and must NOT trigger swarm/agents/multi-call fan-out.
 */
const CASUAL_PATTERNS = /^(yo|yio|bro|lol|haha|thanks|thx|cheers|hey|hi|hello|are you there|you good|you there|what happened|explain briefly|briefly|status)\b/i;
const CASUAL_KEYWORDS = /\b(lost you|lost ya|you good|still there|hello\?|hi\?|hey\?|you alive|everything ok)\b/i;
function guardDirectChat(text, opts = {}) {
  const t = String(text || '').trim();
  if (t.length <= 12 && CASUAL_PATTERNS.test(t)) return true;
  if (CASUAL_KEYWORDS.test(t)) return true;
  // If explicitly forced via opts, override
  if (opts.forceTask === true) return false;
  if (opts.forceDirect === true) return true;
  return false;
}

/**
 * guardHybridTask(text, opts) — returns delegation plan: { parallel, retries, fallbacks, summariseFirst }
 */
function guardHybridTask(text, opts = {}) {
  const role = opts.role || 'builder_code_repair';
  const def = ROLES[role] || ROLES.builder_code_repair;
  return {
    role,
    parallel: opts.parallel ?? def.parallel,
    retries: opts.retries ?? def.retries,
    fallbacks: opts.fallbacks ?? def.fallbacks,
    summariseFirst: opts.summariseFirst !== false,  // default true
    maxParallel: 2,
  };
}

// ── Listeners dispatch ──────────────────────────────────────────────────────
function _broadcast(evt) {
  for (const fn of _listeners) { try { fn(evt); } catch {} }
}

// Patch recordResult to also broadcast
const _origRecordResult = recordResult;
function recordResultPub(opts) {
  _origRecordResult(opts);
  _broadcast({ type: 'call_done', ...opts, ts: Date.now() });
}

module.exports = {
  ROLES,
  PROVIDER_RPM_CAP,
  gateCheck,
  recordResult: recordResultPub,
  cacheGet,
  cacheSet,
  cacheInvalidate,
  status,
  subscribe,
  guardDirectChat,
  guardHybridTask,
  _loadKeys,
  _pickKey,
};
