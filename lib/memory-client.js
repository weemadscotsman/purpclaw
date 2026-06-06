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

const PORT        = parseInt(process.env.MEMORY_PORT || '7880', 10);
const HOST        = process.env.MEMORY_HOST || '127.0.0.1';
const TIMEOUT_MS  = parseInt(process.env.MEMORY_TIMEOUT_MS || '4000', 10);
const ENABLED     = process.env.MEMORY_DISABLED !== '1';

// Simple in-process cache to avoid hammering memory matrix on every spawn
const RECALL_CACHE = new Map();
const CACHE_TTL_MS = 30000; // 30s

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
      return { results: [], formatted: '' };
    }

    const results = resp.body.results || [];
    const formatted = formatForPrompt(results, query);

    const value = { results, formatted };
    if (useCache) RECALL_CACHE.set(cacheKey, { at: Date.now(), value });
    return value;

  } catch {
    // Memory matrix offline or slow — not fatal, just silent
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
  } = opts;

  try {
    const resp = await post('/memory/ingest', { content, source, importance, valence, type }, 6000);
    return resp.body?.memory_id || null;
  } catch {
    return null;
  }
}

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
  try {
    const resp = await get('/health', 2000);
    return resp.status === 200 && resp.body?.status === 'healthy';
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
  react,
  getContext,
  getLiftedFacts,
  isOnline,
  stats,
  formatForPrompt,
  preTask,
  postTask,
  PORT,
};
