'use strict';
/**
 * lib/hooks/lifecycle-bus.js — S1: Lifecycle Event Bus
 * Source: Claude Code hooks / Steering vNext S1
 *
 * Canonical lifecycle events:
 *   SessionStart     SessionEnd       PromptSubmit
 *   PreToolUse      PostToolUse      TurnStop
 *   TeammateIdle    TaskCompleted
 *   WorktreeCreate  WorktreeRemove
 *   MemoryWrite
 *   ApprovalRequested  ApprovalResolved
 *
 * Every hook is user-registrable, deterministic, ordered, and logged.
 * Bus is fire-and-forget — hooks never block the caller.
 */

const { EventEmitter } = require('events');

const HOOK_TOPICS = [
  'SessionStart','SessionEnd','PromptSubmit',
  'PreToolUse','PostToolUse','TurnStop',
  'TeammateIdle','TaskCompleted',
  'WorktreeCreate','WorktreeRemove',
  'MemoryWrite',
  'ApprovalRequested','ApprovalResolved',
  'SubagentStop',   // fires when a spawned subagent halts (DelegationManager emits this)
  'UserPromptSubmit', // mirrors PARITY_HOOKS event name for compatibility
];

class LifecycleBus extends EventEmitter {
  constructor() {
    super();
    this._hooks = {};
    this._auditLog = [];
    this._hookCounter = 0;
    for (const t of HOOK_TOPICS) this._hooks[t] = [];
  }

  /** Register a hook. Returns hookId for later unregister(). */
  register(topic, fn, order = 100) {
    if (!this._hooks[topic]) {
      throw new Error(`lifecycle-bus: unknown topic "${topic}". Valid: ${HOOK_TOPICS.join(', ')}`);
    }
    const id = `hook-${++this._hookCounter}`;
    this._hooks[topic].push({ id, fn, order });
    this._hooks[topic].sort((a, b) => a.order - b.order);
    return id;
  }

  /** Remove a registered hook by id. */
  unregister(hookId) {
    for (const topic of Object.keys(this._hooks)) {
      const idx = this._hooks[topic].findIndex(h => h.id === hookId);
      if (idx !== -1) { this._hooks[topic].splice(idx, 1); return; }
    }
  }

  /** Fire all hooks for a topic — never throws, never blocks caller. */
  async fire(topic, payload = {}) {
    if (!this._hooks[topic] || !this._hooks[topic].length) return;

    const record = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      topic, payload,
      timestamp: new Date().toISOString(),
      hookCount: this._hooks[topic].length,
    };

    this._auditLog.push(record);
    if (this._auditLog.length > 500) this._auditLog.shift();

    await Promise.allSettled(
      this._hooks[topic].map(h =>
        Promise.resolve()
          .then(() => h.fn(payload))
          .catch(err => {
            this._auditLog.push({
              id: record.id + '-err', topic,
              hookId: h.id, error: String(err),
              timestamp: new Date().toISOString(),
            });
          })
      )
    );

    return record;
  }

  // ── Convenience shortcut methods ───────────────────────────────────────

  sessionStart(sessionId, opts = {}) {
    return this.fire('SessionStart', { sessionId, ...opts });
  }

  sessionEnd(sessionId, reason = 'natural', stats = {}) {
    return this.fire('SessionEnd', { sessionId, reason, ...stats });
  }

  promptSubmit(messages, turn = 0) {
    return this.fire('PromptSubmit', { messages, turn });
  }

  preToolUse(tool, args, callId, turn) {
    return this.fire('PreToolUse', { tool, args, callId, turn });
  }

  postToolUse(tool, args, result, callId, turn) {
    return this.fire('PostToolUse', { tool, args, result, callId, turn, ok: result.ok ?? false });
  }

  turnStop(turn, hadTools, messageCount) {
    return this.fire('TurnStop', { turn, hadTools, messageCount });
  }

  approvalRequested(tool, args, risk, callId) {
    return this.fire('ApprovalRequested', { tool, args, risk, callId });
  }

  approvalResolved(callId, decision, reason) {
    return this.fire('ApprovalResolved', { callId, decision, reason });
  }

  taskCompleted(sessionId, turns, totalContent, stats = {}) {
    return this.fire('TaskCompleted', { sessionId, turns, totalContent, ...stats });
  }

  memoryWrite(scope, key, value) {
    return this.fire('MemoryWrite', { scope, key, value });
  }

  worktreeCreate(path, branch) {
    return this.fire('WorktreeCreate', { path, branch });
  }

  worktreeRemove(path, branch) {
    return this.fire('WorktreeRemove', { path, branch });
  }

  // ── emit() — OpenClaude hook compatibility ──────────────────────────
  // PARITY_HOOKS calls LIFECYCLE.emit() so all hook events land in one bus.
  emit(topic, payload = {}) {
    return this.fire(topic, payload);
  }

  // ── Audit & introspection ─────────────────────────────────────────────

  getAuditLog(n = 50) { return this._auditLog.slice(-n); }

  listHooks() {
    return Object.fromEntries(
      Object.entries(this._hooks).map(([topic, hs]) => [topic, hs.map(h => ({ id: h.id, order: h.order }))])
    );
  }

  topics() { return [...HOOK_TOPICS]; }
}

const bus = new LifecycleBus();
module.exports = bus;
module.exports.LifecycleBus = LifecycleBus;
module.exports.LifecycleBusInstance = bus;
