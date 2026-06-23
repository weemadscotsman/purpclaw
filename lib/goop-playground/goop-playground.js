'use strict';
/**
 * goop-playground.js — GOOP_PLAYGROUND API Broker (port 7895)
 *
 * A controlled gateway between PurpClaw agents and the public internet.
 * Implements the safety policy from the architecture spec:
 *   - Default-deny
 *   - GET-only MVP
 *   - Cache by default
 *   - Per-agent + per-API rate limits
 *   - Per-division permissions
 *   - Secrets never exposed to agents (none in MVP — all verified APIs
 *     are no-auth; keys for paid APIs come in V2 via Auth Vault Bridge)
 *   - Unknown APIs blocked
 *   - Failure paths return ok:false (never fake success)
 *   - Logs redact any secret-like field values
 *
 * Endpoints:
 *   GET  /health        — broker health
 *   GET  /apis          — list verified APIs (filtered by caller's permissions)
 *   GET  /apis/search   — search verified + mega-list (unverified)
 *   GET  /call          — invoke an API (only verified)
 *   GET  /usage         — usage stats per agent
 *   GET  /cache         — cache stats + keys
 *   POST /admin/disable — disable an API (out of MVP scope; placeholder)
 *
 * Run standalone:  node lib/goop-playground/goop-playground.js
 * Or use as a library: const broker = require('./goop-playground-broker');
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.GOOP_PORT || '7895', 10);
const REGISTRY_PATH = path.join(__dirname, 'api-registry.json');
const LOG_PATH = path.join(__dirname, 'usage-ledger.jsonl');

// ── Registry ──────────────────────────────────────────────────
let _registry = null;

function saveRegistry() {
  if (!_registry) return;
  const out = {
    ..._registry.raw,
    verified: _registry.verified,
  };
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(out, null, 2));
  // Re-index
  _registry.verifiedById = {};
  for (const api of _registry.verified) _registry.verifiedById[api.id] = api;
}

function loadRegistry() {
  if (_registry) return _registry;
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  // Index verified by id
  const verifiedById = {};
  for (const api of raw.verified || []) verifiedById[api.id] = api;
  _registry = {
    raw,
    verified:      raw.verified || [],
    verifiedById,
    divisionPermissions: raw.division_permissions || {},
    settings:      raw.global_settings || {},
  };
  return _registry;
}

// ── Cache (in-memory LRU, capped) ─────────────────────────────
const CACHE_MAX = 5000;
const _cache = new Map();  // key -> { value, expires }
function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    _cache.delete(key);
    return null;
  }
  // LRU bump
  _cache.delete(key);
  _cache.set(key, entry);
  return entry.value;
}
function cacheSet(key, value, ttlSec) {
  if (_cache.size >= CACHE_MAX) {
    // Drop oldest
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(key, { value, expires: Date.now() + ttlSec * 1000 });
}
function cacheStats() {
  let liveCount = 0;
  for (const e of _cache.values()) if (e.expires > Date.now()) liveCount++;
  return { size: _cache.size, live: liveCount, max: CACHE_MAX };
}

// ── Rate limit (sliding 1-minute window) ──────────────────────
const _rateLimitBuckets = new Map();  // key -> array of timestamps
function rateLimitCheck(key, rpm) {
  const now = Date.now();
  const cutoff = now - 60_000;
  let arr = _rateLimitBuckets.get(key) || [];
  arr = arr.filter(t => t > cutoff);
  _rateLimitBuckets.set(key, arr);
  if (arr.length >= rpm) return false;
  arr.push(now);
  return true;
}
function rateLimitStatus(key) {
  const now = Date.now();
  const cutoff = now - 60_000;
  const arr = (_rateLimitBuckets.get(key) || []).filter(t => t > cutoff);
  return { used: arr.length, window: 'sliding_1m' };
}

// ── Usage ledger ──────────────────────────────────────────────
const _usageTotals = new Map();  // 'agent:api' -> { calls, hits, misses, errors }
function logUsage(entry) {
  // Redact secrets
  const redacted = redactSecrets(entry);
  // Append to JSONL
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(redacted) + '\n');
  } catch (e) { /* don't crash on log failure */ }
  // Update in-memory totals
  const k = `${entry.agent}:${entry.api_id}`;
  const t = _usageTotals.get(k) || { calls: 0, hits: 0, misses: 0, errors: 0, lastCall: 0 };
  t.calls++;
  if (entry.cache_hit) t.hits++; else t.misses++;
  if (entry.status === 'error') t.errors++;
  t.lastCall = entry.ts;
  _usageTotals.set(k, t);
}
function redactSecrets(entry) {
  // Drop fields that look like secrets
  const out = { ...entry };
  delete out.api_key;
  delete out.oauth_token;
  delete out.authorization;
  delete out.token;
  delete out.apiKey;
  return out;
}
function usageStats(filter = {}) {
  const out = [];
  for (const [k, v] of _usageTotals.entries()) {
    const [agent, apiId] = k.split(':');
    if (filter.agent && agent !== filter.agent) continue;
    if (filter.api_id && apiId !== filter.api_id) continue;
    out.push({ agent, api_id: apiId, ...v });
  }
  return out.sort((a, b) => b.calls - a.calls);
}

// ── Permission gate ──────────────────────────────────────────
function isAllowed(agent, api) {
  const reg = loadRegistry();
  // Agent division inferred from agent name (e.g. "DUCK" → "MEDIA_OPS")
  // or from a provided division query param
  const division = api._caller_division;
  if (!division) return { allowed: false, reason: 'unknown_division' };
  const allowedCategories = reg.divisionPermissions[division] || [];
  if (!allowedCategories.includes(api.category)) {
    return { allowed: false, reason: `division ${division} not allowed for category ${api.category}` };
  }
  return { allowed: true, division };
}

// ── HTTP server ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-goop-broker', '1.0');
  res.setHeader('access-control-allow-origin', '*');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const start = Date.now();
  let body = '';
  req.on('data', chunk => body += chunk);
  await new Promise(r => req.on('end', r));

  // ── /health ────────────────────────────────────────────────
  if (url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      broker: 'goop_playground',
      version: require('./package.json').version || '0.1.0',
      port: PORT,
      verifiedApis: loadRegistry().verified.length,
      cache: cacheStats(),
      uptimeSec: Math.floor(process.uptime()),
    });
  }

  // ── /apis (list verified, filtered by caller's division) ─
  if (url.pathname === '/apis' && req.method === 'GET') {
    const division = url.searchParams.get('division');
    const reg = loadRegistry();
    const all = reg.verified.map(api => {
      const permission = division
        ? isAllowed('?', { ...api, _caller_division: division })
        : { allowed: null, reason: 'specify ?division= to check' };
      // Strip the _caller_division field we added for the check
      const { _caller_division, ...cleanApi } = api;
      return { ...cleanApi, permission };
    });
    return json(res, 200, { ok: true, total: all.length, division: division || null, apis: all });
  }

  // ── /apis/search (verified + mega-list unverified) ─────────
  if (url.pathname === '/apis/search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const division = url.searchParams.get('division');
    const includeUnverified = url.searchParams.get('include_unverified') === '1';
    if (!q) return json(res, 400, { ok: false, error: 'q required' });

    const reg = loadRegistry();
    const verifiedHits = reg.verified.filter(api =>
      (api.name + ' ' + api.category + ' ' + api.docs).toLowerCase().includes(q)
    );
    const out = {
      ok: true,
      q,
      verified:   verifiedHits.map(({ _caller_division, ...a }) => a),
      unverified: [],
    };
    if (includeUnverified) {
      // Lazy-load the mega-list and search
      try {
        const mega = require('../api-mega-list');
        const megaHits = mega.search(q, 20);
        out.unverified = megaHits;
      } catch (e) { /* mega-list not available, skip */ }
    }
    return json(res, 200, out);
  }

  // ── /call (the only way agents reach the internet) ────────
  if (url.pathname === '/call' && req.method === 'GET') {
    return handleCall(url, res, req);
  }

  // ── /usage ─────────────────────────────────────────────────
  if (url.pathname === '/usage' && req.method === 'GET') {
    const agent = url.searchParams.get('agent') || null;
    return json(res, 200, { ok: true, entries: usageStats({ agent }) });
  }

  // ── /cache ─────────────────────────────────────────────────
  if (url.pathname === '/cache' && req.method === 'GET') {
    return json(res, 200, { ok: true, ...cacheStats() });
  }

  // ── POST /suggest — agent suggests a new API (does NOT auto-enable) ─
  if (url.pathname === '/suggest' && req.method === 'POST') {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch (e) {}
    const suggestion = {
      ts: Date.now(),
      suggested_by: parsed.agent || 'unknown',
      division:   parsed.division || null,
      api_id:     parsed.api_id || null,
      name:       parsed.name || null,
      url:        parsed.url || null,
      category:   parsed.category || null,
      reason:     parsed.reason || null,
      status:     'pending_review',
    };
    const suggestPath = path.join(__dirname, 'suggestions.jsonl');
    fs.appendFileSync(suggestPath, JSON.stringify(suggestion) + '\n');
    return json(res, 200, {
      ok: true,
      status: 'received',
      hint: 'suggestion queued for human review; broker will NOT auto-enable the API',
      suggestion,
    });
  }

  // ── /suggestions — list pending agent suggestions ────────────
  if (url.pathname === '/suggestions' && req.method === 'GET') {
    const suggestPath = path.join(__dirname, 'suggestions.jsonl');
    if (!fs.existsSync(suggestPath)) return json(res, 200, { ok: true, suggestions: [] });
    const lines = fs.readFileSync(suggestPath, 'utf-8').trim().split('\n').filter(Boolean);
    const out = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return json(res, 200, { ok: true, count: out.length, suggestions: out.slice(-50) });
  }

  // ── /enable — admin-only: enable a verified API ────────────
  if (url.pathname === '/enable' && req.method === 'POST') {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch (e) {}
    const id = parsed.id || url.searchParams.get('id');
    if (!id) return json(res, 400, { ok: false, error: 'id required' });
    const reg = loadRegistry();
    const api = reg.verifiedById[id];
    if (!api) return json(res, 404, { ok: false, error: `api not found: ${id}` });
    api.enabled = true;
    api.callable = true;
    api.last_health_check = new Date().toISOString();
    saveRegistry();
    return json(res, 200, { ok: true, id, enabled: true, callable: true, ts: api.last_health_check });
  }

  // ── /disable — admin-only: disable a verified API ───────────
  if (url.pathname === '/disable' && req.method === 'POST') {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch (e) {}
    const id = parsed.id || url.searchParams.get('id');
    if (!id) return json(res, 400, { ok: false, error: 'id required' });
    const reg = loadRegistry();
    const api = reg.verifiedById[id];
    if (!api) return json(res, 404, { ok: false, error: `api not found: ${id}` });
    api.enabled = false;
    api.callable = false;
    saveRegistry();
    return json(res, 200, { ok: true, id, enabled: false, callable: false });
  }

  // ── default ────────────────────────────────────────────────
  return json(res, 404, { ok: false, error: 'not_found', path: url.pathname });
});

// ── /call handler ────────────────────────────────────────────
async function handleCall(url, res, req) {
  const apiId = url.searchParams.get('id') || url.searchParams.get('api_id');
  const agent = url.searchParams.get('agent') || 'unknown';
  const division = url.searchParams.get('division') || null;

  if (!apiId) return json(res, 400, { ok: false, error: 'id required' });

  const reg = loadRegistry();
  const api = reg.verifiedById[apiId];
  if (!api) {
    return json(res, 404, { ok: false, error: `api not found: ${apiId}`, hint: 'only verified APIs can be called' });
  }
  if (api.status !== 'verified') {
    return json(res, 403, { ok: false, error: `api not verified: ${apiId}`, status: api.status, hint: 'use api_suggest to request verification' });
  }
  if (api.enabled === false) {
    return json(res, 403, { ok: false, error: `api disabled: ${apiId}`, status: api.status, hint: 'admin disabled this api' });
  }
  if (api.callable === false) {
    return json(res, 403, { ok: false, error: `api not callable: ${apiId}`, status: api.status, hint: 'no adapter / health check' });
  }

  // Permission gate
  const permission = isAllowed(agent, { ...api, _caller_division: division });
  if (!permission.allowed) {
    return json(res, 403, { ok: false, error: 'forbidden', reason: permission.reason, agent, division, api_id: apiId });
  }

  // Build request URL
  const params = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (!['id', 'api_id', 'agent', 'division'].includes(k)) params[k] = v;
  }
  // Validate required params
  if (api.schema && api.schema.required) {
    for (const req of api.schema.required) {
      if (!params[req]) {
        return json(res, 400, { ok: false, error: `missing required param: ${req}`, schema: api.schema });
      }
    }
  }
  // Path-based APIs (e.g. wikipedia, hn_item): need title/id
  let targetUrl = api.base_url;
  if (api.id === 'wikipedia_summary' && params.title) {
    targetUrl += '/' + encodeURIComponent(params.title);
  } else if (api.id === 'hn_item' && params.id) {
    targetUrl += '/' + encodeURIComponent(params.id) + '.json';
  } else {
    // Query-string based
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'title' && k !== 'id') qs.append(k, v);
    }
    const qstr = qs.toString();
    if (qstr) targetUrl += (targetUrl.includes('?') ? '&' : '?') + qstr;
  }

  // Cache check
  const cacheKey = crypto.createHash('sha256').update(targetUrl).digest('hex');
  const cached = cacheGet(cacheKey);
  if (cached) {
    const entry = {
      ts: Date.now(), agent, division, api_id: apiId,
      url: targetUrl, status: 'ok', cache_hit: true, durationMs: 0,
    };
    logUsage(entry);
    return json(res, 200, {
      ok: true, api_id: apiId, agent, division,
      cache_hit: true, value: cached, durationMs: 0,
    });
  }

  // Rate limit check
  const rateKey = `${agent}:${apiId}`;
  const rpm = api.rate_limit_rpm || reg.settings.default_rate_limit.rpm || 30;
  if (!rateLimitCheck(rateKey, rpm)) {
    return json(res, 429, {
      ok: false, error: 'rate_limited', agent, api_id: apiId,
      limit: { rpm }, usage: rateLimitStatus(rateKey),
    });
  }

  // Fetch
  const start = Date.now();
  let fetchRes;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), reg.settings.request_timeout_ms || 10000);
    fetchRes = await fetch(targetUrl, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
  } catch (e) {
    const entry = {
      ts: Date.now(), agent, division, api_id: apiId,
      url: targetUrl, status: 'error', cache_hit: false, durationMs: Date.now() - start,
      error: e.message,
    };
    logUsage(entry);
    return json(res, 502, { ok: false, error: 'fetch_failed', message: e.message, api_id: apiId });
  }

  if (!fetchRes.ok) {
    const entry = {
      ts: Date.now(), agent, division, api_id: apiId,
      url: targetUrl, status: 'error', cache_hit: false, durationMs: Date.now() - start,
      http_status: fetchRes.status,
    };
    logUsage(entry);
    return json(res, 502, { ok: false, error: 'http_error', http_status: fetchRes.status, api_id: apiId });
  }

  // Read body
  const contentType = fetchRes.headers.get('content-type') || '';
  let value;
  if (contentType.includes('json')) {
    value = await fetchRes.json();
  } else {
    value = await fetchRes.text();
  }
  // Cap payload
  const sizeBytes = Buffer.byteLength(JSON.stringify(value), 'utf-8');
  if (sizeBytes > (reg.settings.max_payload_bytes || 1048576)) {
    return json(res, 413, { ok: false, error: 'payload_too_large', sizeBytes, max: reg.settings.max_payload_bytes });
  }
  const durationMs = Date.now() - start;

  // Cache
  const ttl = api.cache_ttl_seconds || reg.settings.default_cache_ttl || 600;
  cacheSet(cacheKey, value, ttl);

  // Log
  logUsage({
    ts: Date.now(), agent, division, api_id: apiId,
    url: targetUrl, status: 'ok', cache_hit: false, durationMs, sizeBytes,
  });

  return json(res, 200, {
    ok: true, api_id: apiId, agent, division,
    cache_hit: false, value, durationMs, sizeBytes,
  });
}

// ── Helpers ──────────────────────────────────────────────────
function json(res, status, body) {
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

// ── Start ────────────────────────────────────────────────────
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[GOOP_PLAYGROUND] broker listening on http://127.0.0.1:${PORT}`);
    console.log(`[GOOP_PLAYGROUND] verified APIs: ${loadRegistry().verified.length}`);
  });
  process.on('SIGINT',  () => { console.log('shutdown'); server.close(); process.exit(0); });
  process.on('SIGTERM', () => { server.close(); process.exit(0); });
}

module.exports = {
  loadRegistry,
  isAllowed,
  cacheGet,
  cacheSet,
  cacheStats,
  rateLimitCheck,
  rateLimitStatus,
  logUsage,
  usageStats,
  handleCall,
  server,
};
