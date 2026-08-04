'use strict';

/**
 * SPEC-004: Priority Steer Channels
 *
 * Two channels for operator control during active turns:
 * 1. interrupt now — fires at next safe point, abandons current turn
 * 2. queue next — queues a directive for the next turn boundary
 *
 * Wiring: imported by agent-loop.js, emits LIFECYCLE events on state change.
 */

const EventEmitter = require('events');

// ── State ─────────────────────────────────────────────────────────────────

const _emitter = new EventEmitter();
_emitter.setMaxListeners(100);

let _interrupting   = false;   // interrupt flag — cleared after use
let _interruptReason = '';
let _queue          = [];       // FIFO directive queue
let _idleSince     = null;     // timestamp when agent went idle
let _activeTurn    = false;    // is an active turn in progress

// Config
let INTERRUPT_MAX_LATENCY_MS = 500;
let QUEUE_MAX_SIZE           = 10;

// ── Interrupt ───────────────────────────────────────────────────────────────

/**
 * Fire an interrupt. The agent checks this flag at each safe point
 * (between tool calls, at turn boundary). Clears automatically after
 * the turn abandons.
 *
 * @param {string} [reason] — why the interrupt was fired
 */
function interrupt(reason) {
  _interrupting   = true;
  _interruptReason = reason || 'operator interrupt';
  _emitter.emit('interrupt', { reason: _interruptReason, at: new Date().toISOString() });
  return { interrupting: true, reason: _interruptReason, at: new Date().toISOString() };
}

/**
 * Check if an interrupt is pending. Call this at safe points in agent-loop.
 * Returns { pending: boolean, reason: string }
 * After returning true, the caller MUST call clearInterrupt() to consume it.
 */
function pollInterrupt() {
  if (_interrupting) {
    return { pending: true, reason: _interruptReason };
  }
  return { pending: false, reason: '' };
}

/**
 * Consume the interrupt flag. Called by agent-loop after handling.
 */
function clearInterrupt() {
  const was = _interruptReason;
  _interrupting   = false;
  _interruptReason = '';
  return was;
}

/**
 * Check if interrupt should fire right now (called by agent-loop at safe points).
 * Returns true if interrupt is pending AND agent should abandon current work.
 */
function shouldInterrupt() {
  return _interrupting;
}

// ── Queue Next ─────────────────────────────────────────────────────────────

/**
 * Queue a directive for the next turn boundary.
 * Does NOT interrupt — applies at turn end.
 *
 * @param {string} directive — the task/directive text
 * @param {object} [opts]     — priority, tags, context
 */
function queueNext(directive, opts = {}) {
  if (_queue.length >= QUEUE_MAX_SIZE) {
    throw new Error(`Queue full (${QUEUE_MAX_SIZE}). Clear or wait.`);
  }
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    directive,
    priority:    opts.priority    || 'normal',
    tags:        opts.tags         || [],
    context:     opts.context      || {},
    queuedAt:    new Date().toISOString(),
    status:      'queued',  // queued | executing | done
  };
  _queue.push(item);
  _emitter.emit('queue', { action: 'add', item });
  return item;
}

/**
 * Peek at the queue without consuming.
 */
function peekQueue() {
  return [..._queue];
}

/**
 * Consume the next queued directive (FIFO). Called at turn boundary.
 * Returns null if queue is empty.
 */
function dequeue() {
  const item = _queue.shift();
  if (item) {
    item.status = 'executing';
    _emitter.emit('queue', { action: 'dequeue', item });
  }
  return item || null;
}

/**
 * Clear the entire queue.
 */
function clearQueue() {
  const count = _queue.length;
  _queue = [];
  _emitter.emit('queue', { action: 'clear', count });
  return count;
}

/**
 * Remove a specific item by id.
 */
function removeFromQueue(itemId) {
  const idx = _queue.findIndex(i => i.id === itemId);
  if (idx >= 0) {
    const [removed] = _queue.splice(idx, 1);
    _emitter.emit('queue', { action: 'remove', item: removed });
    return removed;
  }
  return null;
}

// ── Status ────────────────────────────────────────────────────────────────

/**
 * Full steer status for diagnostics.
 */
function steerStatus() {
  return {
    interrupting:   _interrupting,
    interruptReason: _interruptReason,
    queueSize:      _queue.length,
    queue:          [..._queue],
    idleSince:      _idleSince,
    activeTurn:     _activeTurn,
  };
}

/**
 * Mark turn as active (agent started work).
 */
function turnStarted() {
  _activeTurn = true;
  _idleSince  = null;
}

/**
 * Mark turn as complete (agent went idle).
 */
function turnEnded() {
  _activeTurn = false;
  _idleSince  = new Date().toISOString();
}

/**
 * Configure latency parameters.
 */
function configure(opts = {}) {
  if (opts.interruptMaxLatencyMs !== undefined) INTERRUPT_MAX_LATENCY_MS = opts.interruptMaxLatencyMs;
  if (opts.queueMaxSize !== undefined)           QUEUE_MAX_SIZE           = opts.queueMaxSize;
}

// ── Event API ──────────────────────────────────────────────────────────────

/**
 * Subscribe to steer events.
 * @returns {function} unsubscribe
 */
function on(event, handler) {
  _emitter.on(event, handler);
  return () => _emitter.off(event, handler);
}

// ── Module API ─────────────────────────────────────────────────────────────

module.exports = {
  interrupt,
  pollInterrupt,
  clearInterrupt,
  shouldInterrupt,
  queueNext,
  peekQueue,
  dequeue,
  clearQueue,
  removeFromQueue,
  steerStatus,
  turnStarted,
  turnEnded,
  configure,
  on,
  get INTERRUPT_MAX_LATENCY_MS() { return INTERRUPT_MAX_LATENCY_MS; },
  get QUEUE_MAX_SIZE()           { return QUEUE_MAX_SIZE; },
};
