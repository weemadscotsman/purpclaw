'use strict';

/**
 * PURPCLAW Memory Client
 * =====================
 * Thin JS wrapper around memory_matrix_v2.py (port 7880).
 * Soft dependency — all methods degrade gracefully when the service is offline.
 *
 * Usage:
 *   const mem = require('./lib/memory-client');
 *
 *   // Before spawning an agent:
 *   const ctx = await mem.recall('fix auth bug', { limit: 3 });
 *   // → inject ctx.formatted into agent system prompt
 *
 *   // After a task completes:
 *   await mem.ingest('Fixed JWT refresh bug in auth.js', { source: 'robot', importance: 0.8 });
 */

const http = require('http');

// v2.1 — Announce every memory operation on the event bus so the rest
// of the stack sees "what is memory thinking right now".
const announce = require('./events');

const PORT        = parseInt(process.env.MEMORY_PORT || '7880', 10);
const HOST        = process.env.MEMORY_HOST || '127.0.0.1';
// 4000 was too tight for a loaded spine. The whole stack ingests
// continuously (archive grew 7.7k -> 11.5k atoms in one session), and while
// a warm recall is 3-23ms it spikes to ~1s+ under that load, so recalls that
// would have succeeded were being cancelled and reported as failures. The
// degraded-visibility reporting above means a genuinely dead service still
// surfaces immediately rather than hiding behind the longer ceiling.
const TIMEOUT_MS  = parseInt(process.env.MEMORY_TIMEOUT_MS || '15000', 10);
const ENABLED     = process.env.MEMORY_DISABLED !== '1';

// Simple in-process cache to avoid hammering memory matrix on every spawn
const RECALL_CACHE = new Map();
const CACHE_TTL_MS = 30000; // 30s

// ── Degraded-memory visibility ───────────────────────────────────────────────
// Every failure path here used to return an empty result silently ("not fatal,
// just silent"). That makes a dead memory matrix indistinguishable from one
// that simply has nothing to say: the agent runs with no recall and no lifted
// facts, and nothing anywhere reports it. Observed in practice — the backend
// accepted TCP connections and never answered, while /cognitive/health kept
// reporting services.memory healthy, so isOnline() returned true and every
// ingest returned null.
// Failures stay non-fatal. They just stop being invisible.
let _degraded = null;      // { op, error, at, count } once something fails
let _warnedAt = 0;
const WARN_INTERVAL_MS = parseInt(process.env.MEMORY_WARN_INTERVAL_MS || '300000', 10); // 5 min

function noteFailure(op, error) {
  const message = (error && error.message) || String(error || 'unknown');
  _degraded = { op, error: message, at: new Date().toISOString(), count: (_degraded?.count || 0) + 1 };
  const now = Date.now();
  if (now - _warnedAt < WARN_INTERVAL_MS) return;   // rate-limit: one line per interval
  _warnedAt = now;
  console.error(
    `[memory] DEGRADED: ${op} failed against ${HOST}:${PORT} — ${message}\n` +
    `  effect: recall returns nothing and new memories are NOT stored; the agent is running without memory.\n` +
    `  note: /cognitive/health can report "healthy" while the backend answers nothing — check it responds, not just that it listens.`
  );
}

/** Current memory health as observed by real calls, not by a self-reported health probe. */
function degraded() { return _degraded; }

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function post(path_, body, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname : HOST,
        port     : PORT,
        path     : path_,
        method   : 'POST',
        headers  : {
          'Content-Type'   : 'application/json',
          'Content-Length' : Buffer.byteLength(payload),
        },
      },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('memory timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path_, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path: path_, method: 'GET' },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('memory timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Recall memories relevant to a task.
 * Returns { results, formatted } where `formatted` is ready to inject into a system prompt.
 *
 * @param {string} query   - The task description or search query
 * @param {object} opts
 *   limit           {number}  max results (default 5)
 *   emotional_filter {number} optional valence filter (-1 to 1)
 *   useCache        {boolean} use 30s in-process cache (default true)
 */
async function recall(query, opts = {}) {
  if (!ENABLED) return { results: [], formatted: '' };

  const { limit = 5, emotional_filter, useCache = true } = opts;
  const cacheKey = `${query}:${limit}`;

  if (useCache && RECALL_CACHE.has(cacheKey)) {
    const cached = RECALL_CACHE.get(cacheKey);
    if (Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  }

  try {
    const resp = await post('/memory/recall', { query, limit, emotional_filter });
    if (resp.status >= 400 || !resp.body?.results) {
      noteFailure('recall', new Error(`HTTP ${resp.status}${resp.body?.results ? '' : ' (no results field)'}`));
      return { results: [], formatted: '' };
    }
    _degraded = null;  // a real answer clears the degraded flag

    const results = resp.body.results || [];
    const formatted = formatForPrompt(results, query);

    const value = { results, formatted };
    if (useCache) RECALL_CACHE.set(cacheKey, { at: Date.now(), value });
    return value;

  } catch (e) {
    // Memory matrix offline or slow. Still not fatal — but no longer silent.
    noteFailure('recall', e);
    return { results: [], formatted: '' };
  }
}

/**
 * Store a memory about a completed task.
 *
 * @param {string} content    - What happened / what was produced
 * @param {object} opts
 *   source      {string}  which agent/system produced this (default 'orchestrator')
 *   importance  {number}  0-1, how important to retain (default 0.5)
 *   valence     {number}  -1 to 1, emotional tone (default 0)
 *   type        {string}  'task_result' | 'error' | 'observation' | 'text'
 */
async function ingest(content, opts = {}) {
  if (!ENABLED || !content) return null;

  const {
    source    = 'orchestrator',
    importance = 0.5,
    valence   = 0.0,
    type      = 'task_result',
    metadata  = null,
  } = opts;

  announce.memory.thinking('ingest.started', { source, length: content.length });
  try {
    // Was a hardcoded 6000ms, which survived the TIMEOUT_MS increase and kept
    // aborting writes the spine had already committed: the client reported
    // ingest failed and returned null while a later recall found the content
    // perfectly well. An ingest is more expensive than a recall, so it gets the
    // shared ceiling rather than a tighter one of its own.
    const resp = await post('/memory/ingest', { content, source, importance, valence, type, metadata }, TIMEOUT_MS);
    const id = resp.body?.memory_id || null;
    if (id) announce.memory.ingested(id, { source, importance, type });
    // Mid-job learning must be INSTANT: a freshly-ingested memory has to be
    // recallable immediately, not after the 30s cache expires. Drop the recall
    // cache so the very next recall sees this new knowledge.
    invalidateRecall();
    return id;
  } catch (e) {
    announce.memory.thinking('ingest.failed', { source, error: e.message });
    noteFailure('ingest', e);
    return null;
  }
}

/** Clear the recall cache so newly-ingested memory is recallable instantly. */
function invalidateRecall() { RECALL_CACHE.clear(); }

/**
 * React to a live stimulus — updates emotional/contextual state in the matrix.
 * Call this on errors, breakthroughs, or significant events.
 *
 * @param {string} stimulus  - Description of what happened
 * @param {string} source    - Which component triggered this
 */
async function react(stimulus, source = 'orchestrator') {
  if (!ENABLED || !stimulus) return null;
  try {
    const resp = await post('/memory/react', { stimulus, source }, 5000);
    return resp.body || null;
  } catch {
    return null;
  }
}

/**
 * Get current active context from the matrix.
 * Useful for building swarm-wide situational awareness.
 */
async function getContext() {
  if (!ENABLED) return {};
  try {
    const resp = await get('/memory/context');
    return resp.body?.context || {};
  } catch {
    return {};
  }
}

/**
 * Get lifted symbolic facts — high-level knowledge extracted from memories.
 */
async function getLiftedFacts() {
  if (!ENABLED) return [];
  try {
    const resp = await get('/memory/lifted');
    return resp.body?.lifted_facts || [];
  } catch {
    return [];
  }
}

/**
 * Health check — returns true if the memory matrix is reachable.
 */
async function isOnline() {
  // Observed reality outranks the service's opinion of itself. The gateway
  // reports services.memory "healthy" based on backend process liveness, so it
  // stays green while the backend accepts connections and answers nothing. If a
  // real recall/ingest has failed, we are not online whatever health claims.
  if (_degraded) return false;
  try {
    const resp = await get('/cognitive/health', 7500);
    if (resp.status !== 200) return false;
    if (resp.body?.status !== 'healthy') return false;
    const memory = resp.body?.services?.memory;
    return !memory || memory.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Get memory matrix stats (memory count, symbol count, etc).
 */
async function stats() {
  try {
    const resp = await get('/memory/stats', 3000);
    return resp.body || {};
  } catch {
    return {};
  }
}

// ── Prompt injection helper ───────────────────────────────────────────────────

/**
 * Format recalled memories into a clean system prompt block.
 * Agents get relevant past context without being overwhelmed.
 */
function formatForPrompt(results, query) {
  if (!results || results.length === 0) return '';

  const lines = [
    `## Relevant Memory Context`,
    `(${results.length} recalled memories for: "${query.substring(0, 60)}")`,
    '',
  ];

  for (const [i, mem] of results.entries()) {
    const content = mem.content || mem.text || '';
    if (!content) continue;

    const score    = mem.score    !== undefined ? ` [${(mem.score * 100).toFixed(0)}%]`  : '';
    const source   = mem.source   ? ` — from ${mem.source}` : '';
    const ts       = mem.timestamp ? ` (${new Date(mem.timestamp * 1000).toLocaleDateString()})` : '';

    lines.push(`${i + 1}. ${content.substring(0, 300)}${score}${source}${ts}`);
  }

  lines.push('');
  lines.push('Use this context where relevant. Do not repeat it verbatim.');
  lines.push('');

  return lines.join('\n');
}

// ── Task lifecycle helpers ────────────────────────────────────────────────────

/**
 * Full pre-task pipeline: recall relevant memories for a task.
 * Returns formatted context string ready to prepend to any agent system prompt.
 *
 * @param {string} task    - The full task description
 * @param {string} intent  - Parsed intent (e.g. 'fix', 'build', 'review')
 * @param {string} agent   - Agent name being spawned
 */
async function preTask(task, intent, agent) {
  const query   = `${intent} ${task}`.substring(0, 200);
  const { formatted } = await recall(query, { limit: 4 });
  return formatted;
}

/**
 * Full post-task pipeline: store a completed task's result.
 *
 * @param {string} task     - Original task description
 * @param {string} result   - What was produced / what happened
 * @param {string} agent    - Agent that did the work
 * @param {boolean} success - Whether it succeeded
 */
async function postTask(task, result, agent, success = true) {
  const content = [
    `Task: ${task.substring(0, 200)}`,
    `Agent: ${agent}`,
    `Status: ${success ? 'completed' : 'failed'}`,
    result ? `Result: ${String(result).substring(0, 500)}` : '',
  ].filter(Boolean).join('\n');

  const importance = success ? 0.6 : 0.4;
  const valence    = success ? 0.2 : -0.3;

  const memId = await ingest(content, {
    source     : agent || 'orchestrator',
    importance,
    valence,
    type       : 'task_result',
  });

  // Also fire a stimulus so the matrix updates its emotional state
  if (!success) {
    await react(`Task failed: ${task.substring(0, 100)}`, agent || 'orchestrator');
  }

  return memId;
}

module.exports = {
  recall,
  ingest,
  degraded,
  react,
  getContext,
  getLiftedFacts,
  isOnline,
  stats,
  formatForPrompt,
  preTask,
  postTask,
  invalidateRecall,
  PORT,
};
