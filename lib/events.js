'use strict';

/**
 * lib/events.js — Universal, fire-and-forget event broadcaster for PURPCLAW.
 *
 * Every subsystem (memory, bigboss, idle-engine, self-evolution, coding-eval,
 * autonomous-diagnostics, agent_tower, worker-pool, orchestrator) imports this
 * and announces what it's doing. The eventbus fans the events out to anything
 * that cares (cockpit, dashboards, memory spine, routing layer).
 *
 * Why: right now most subsystems do work SILENTLY. Memory ingests, bigboss
 * commands, idle cycles, self-evolution ticks, eval runs — none of them tell
 * the rest of the stack. This wrapper is the "loud teeth" that fixes that.
 *
 * Usage:
 *   const announce = require('./lib/events');
 *   announce.thinking({ source: 'memory', step: 'recall', query: 'PURPCLAW' });
 *   announce.task('started',  { source: 'bigboss', task: '...' });
 *   announce.task('finished', { source: 'bigboss', result: '...' });
 *   announce.tool('called',  { source: 'agent', tool: 'read', args: {...} });
 *   announce.route({ from: 'task', to: 'swarm', lane: 'CODE' });
 *
 * Each event goes to the eventbus :7782 with a hierarchical topic like:
 *   memory.thinking.recall.started
 *   bigboss.task.spawned.finished
 *   idle.cycle.started
 *   evolution.thinking.tick.started
 *   coding_eval.task.running.finished
 *
 * The eventbus is on :7782. We POST to /publish with a 2s timeout.
 * If the bus is down, we degrade silently — never block the caller.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const retention = require('./memory-retention');

const EVENTBUS_HOST = process.env.EVENTBUS_HOST || '127.0.0.1';
const EVENTBUS_PORT = Number(process.env.EVENTBUS_PORT || 7782);
const TIMEOUT_MS = 2000;

// Pre-load the local trace file path so we can always record what we did
// even if the bus is down. This is the "show your working" guarantee.
const PURP = path.resolve(__dirname, '..');
const TRACE_DIR = path.join(PURP, 'agent_work', 'trace');
const TRACE_FILE = path.join(TRACE_DIR, 'events.jsonl');

function ensureTraceDir() {
  try {
    if (!fs.existsSync(TRACE_DIR)) {
      fs.mkdirSync(TRACE_DIR, { recursive: true });
    }
  } catch (_) { /* best-effort */ }
}

function appendLocalTrace(event) {
  try {
    ensureTraceDir();
    fs.appendFileSync(TRACE_FILE, JSON.stringify(event) + '\n', 'utf8');
  } catch (_) { /* best-effort */ }
}

function postJSON(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: EVENTBUS_HOST,
      port: EVENTBUS_PORT,
      path: '/publish',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data),
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 }));
    });
    req.on('error', () => resolve({ ok: false, error: 'bus_unreachable' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

/**
 * Low-level: emit a raw event to the bus + local trace.
 */
function emit({ namespace, action, source, step, payload }) {
  const safeNs = String(namespace || 'misc').replace(/[^a-z0-9_.-]/gi, '_');
  const safeAction = String(action || 'event').replace(/[^a-z0-9_.-]/gi, '_');
  const topic = `${safeNs}.${safeAction}`;
  const event = {
    type: topic,
    topic,
    namespace: safeNs,
    action: safeAction,
    source: source || 'unknown',
    step: step || null,
    payload: payload || {},
    timestamp: new Date().toISOString(),
  };
  // Always record locally first so the trace survives a bus outage
  appendLocalTrace(event);
  retention.rememberRuntimeEvent(event);
  // Then fire to the bus (non-blocking — we don't await at the call site,
  // the caller can if they want backpressure)
  postJSON(event).catch(() => { /* already resolved false */ });
  return event;
}

/**
 * Public, typed helpers per major subsystem. Use these so the topic
 * vocabulary stays consistent across the stack.
 */

const announce = {
  emit,

  // ── Memory spine ────────────────────────────────────────────────────
  memory: {
    thinking: (step, payload = {}) => emit({ namespace: 'memory', action: `thinking.${step}`, source: 'memory', step, payload }),
    ingested:  (memoryId, payload = {}) => emit({ namespace: 'memory', action: 'ingested', source: 'memory', payload: { memoryId, ...payload } }),
    recalled:  (query, results, payload = {}) => emit({ namespace: 'memory', action: 'recalled', source: 'memory', payload: { query, resultCount: Array.isArray(results) ? results.length : 0, ...payload } }),
    counterfactual: (branchId, payload = {}) => emit({ namespace: 'memory', action: 'counterfactual', source: 'memory', payload: { branchId, ...payload } }),
  },

  // ── Bigboss commands ────────────────────────────────────────────────
  bigboss: {
    started:  (cmd, args, payload = {}) => emit({ namespace: 'bigboss', action: 'started', source: 'bigboss', payload: { cmd, args, ...payload } }),
    finished: (cmd, result, payload = {}) => emit({ namespace: 'bigboss', action: 'finished', source: 'bigboss', payload: { cmd, result, ...payload } }),
    failed:   (cmd, error, payload = {}) => emit({ namespace: 'bigboss', action: 'failed', source: 'bigboss', payload: { cmd, error, ...payload } }),
  },

  // ── Coding eval ─────────────────────────────────────────────────────
  coding: {
    task:   (action, payload = {}) => emit({ namespace: 'coding_eval', action: `task.${action}`, source: 'coding-eval', payload }),
    score:  (task, score, payload = {}) => emit({ namespace: 'coding_eval', action: 'scored', source: 'coding-eval', payload: { task, score, ...payload } }),
  },

  // ── Idle engine / self-evolution / AutoDream ───────────────────────
  idle: {
    cycle: (action, payload = {}) => emit({ namespace: 'idle', action: `cycle.${action}`, source: 'idle-engine', payload }),
    dream: (action, payload = {}) => emit({ namespace: 'autodream', action: action, source: 'autodream', payload }),
    evolve: (action, payload = {}) => emit({ namespace: 'evolution', action: action, source: 'self-evolution', payload }),
  },

  // ── Agents / tower / spawn ─────────────────────────────────────────
  agent: {
    spawned:  (agentName, task, payload = {}) => emit({ namespace: 'agent', action: 'spawned', source: 'agent-tower', payload: { agentName, task, ...payload } }),
    toolCall: (agentName, tool, args, payload = {}) => emit({ namespace: 'agent', action: 'tool.call', source: agentName, payload: { tool, args, ...payload } }),
    toolResult: (agentName, tool, ok, payload = {}) => emit({ namespace: 'agent', action: 'tool.result', source: agentName, payload: { tool, ok, ...payload } }),
    finished: (agentName, result, payload = {}) => emit({ namespace: 'agent', action: 'finished', source: 'agent-tower', payload: { agentName, result, ...payload } }),
  },

  // ── v2.1 — Lifecycle flow: called → routed → executed → watched → stopped → logged → verified → repaired → archived ──
  flow: {
    // Stage 1 — CALLED. The user request hits the stack (chat / chat-swarm / harness / cli / tui / ui).
    called: (entry, payload = {}) => emit({ namespace: 'flow', action: 'called', source: entry || 'chat', payload }),

    // Stage 2 — ROUTED. The stack picked a provider + model.
    routed: (provider, model, payload = {}) => emit({ namespace: 'flow', action: 'routed', source: 'agent-router', payload: { provider, model, ...payload } }),

    // Stage 3 — EXECUTED. The agent emitted a tool call (or finished with no tool).
    executed: (action, payload = {}) => emit({ namespace: 'flow', action: `executed.${action}`, source: 'agent-loop', payload }),

    // Stage 4 — WATCHED. A tool ran, a side effect happened, an agent worked, the bus fanned out.
    watched: (what, payload = {}) => emit({ namespace: 'flow', action: `watched.${what}`, source: 'watcher', payload }),

    // Stage 5 — STOPPED. The turn ended. Reply is sealed.
    stopped: (ok, payload = {}) => emit({ namespace: 'flow', action: 'stopped', source: 'agent-loop', payload: { ok, ...payload } }),

    // Stage 6 — LOGGED. The trace.jsonl has been appended.
    logged: (where, payload = {}) => emit({ namespace: 'flow', action: 'logged', source: 'trace', payload: { where, ...payload } }),

    // Stage 7 — VERIFIED. Gates ran (provider health, tool result, build, doctor, security-audit).
    verified: (gate, payload = {}) => emit({ namespace: 'flow', action: `verified.${gate}`, source: 'verifier', payload }),

    // Stage 8 — REPAIRED. Self-heal / idle-engine / self-evolution fired a fix.
    repaired: (what, payload = {}) => emit({ namespace: 'flow', action: `repaired.${what}`, source: 'repair', payload }),

    // Stage 9 — ARCHIVED. The turn is on disk (memory spine, trace file, agent_work/, notifications.jsonl).
    archived: (sink, payload = {}) => emit({ namespace: 'flow', action: 'archived', source: 'archive', payload: { sink, ...payload } }),
  },

  // ── Generic routing / tool / thinking trace ───────────────────────
  route: (from, to, payload = {}) => emit({ namespace: 'routing', action: 'dispatch', source: 'router', payload: { from, to, ...payload } }),
  tool: (action, payload = {}) => emit({ namespace: 'tool', action: action, source: 'registry', payload }),
  thinking: (step, payload = {}) => emit({ namespace: 'thinking', action: step, source: 'agent-loop', payload }),

  // ── Job / build / upgrade / evolve — generic lifecycle ───────────
  job: (action, payload = {}) => emit({ namespace: 'job', action: action, source: 'bigboss', payload }),
  build: (action, payload = {}) => emit({ namespace: 'build', action: action, source: 'orchestrator', payload }),
  upgrade: (action, payload = {}) => emit({ namespace: 'upgrade', action: action, source: 'self-evolution', payload }),
  evolve: (action, payload = {}) => emit({ namespace: 'evolve', action: action, source: 'self-evolution', payload }),
  cycle: (action, payload = {}) => emit({ namespace: 'cycle', action: action, source: 'idle-engine', payload }),

  // ── Cockpit / system / health ──────────────────────────────────────
  system: (action, payload = {}) => emit({ namespace: 'system', action: action, source: 'system', payload }),
  health: (action, payload = {}) => emit({ namespace: 'health', action: action, source: 'clinic', payload }),

  /**
   * Synchronous variant — returns the bus POST result instead of fire-and-forget.
   * Use when the caller needs to confirm the bus actually received the event.
   */
  async emitSync(payload) {
    const event = emit(payload);
    return postJSON(event);
  },

  /**
   * Get the local trace file path (for debugging / offline audit).
   */
  getTracePath: () => TRACE_FILE,
  getTraceDir:  () => TRACE_DIR,
};

module.exports = announce;
