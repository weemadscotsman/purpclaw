'use strict';
/**
 * lib/events.js — announce helper for the PURPCLAW event bus.
 *
 * RECONSTRUCTED 2026-08-04. The original was lost in the filesystem re-org and
 * was never tracked by git (`git rev-list --all -- lib/events.js` returns
 * nothing), so this is rebuilt from its call sites, not recovered:
 *
 *   lib/agent-loop.js:457,484,531   announce.thinking(event, data?)
 *   lib/memory-client.js:187,203    announce.memory.thinking(event, data?)
 *   lib/memory-client.js:196        announce.memory.ingested(id, data?)
 *
 * Those five lines are the entire proven surface. Anything else the original
 * exported is gone and is not guessed at here.
 *
 * Two hard constraints come from where it is called:
 *
 *  1. It must never throw and never reject. memory-client.js:203 calls it from
 *     inside a catch block — an announce failure there would replace a handled
 *     memory error with an unhandled one.
 *  2. It must not require ../unified_eventbus. That module calls
 *     server.listen(7782) at import time, so importing it from a library binds
 *     a port in every process that touches memory. lib/event-bus.js does
 *     exactly that and is why the eventbus hit EADDRINUSE and restart-looped
 *     543 times. This file speaks HTTP to the bus instead.
 */

const http = require('http');

const PORT = parseInt(process.env.EVENTBUS_PORT || '7782', 10);
const HOST = process.env.EVENTBUS_HOST || '127.0.0.1';
const TIMEOUT_MS = parseInt(process.env.EVENTBUS_TIMEOUT_MS || '250', 10);
// Telemetry is never worth blocking a turn for. If the bus is down, drop it.
const ENABLED = process.env.PURPCLAW_ANNOUNCE !== 'off';

let downSince = 0;
// After a failure, stop dialling for a bit. Otherwise every agent turn pays a
// connect-refused round trip per announce while the bus is being restarted.
const BACKOFF_MS = 10_000;

function emit(channel, payload) {
  if (!ENABLED) return false;
  if (downSince && Date.now() - downSince < BACKOFF_MS) return false;

  let body;
  try {
    body = JSON.stringify({ channel, payload: { ...payload, pid: process.pid, ts: new Date().toISOString() } });
  } catch {
    // Payload had a cycle or a BigInt. Announce is not worth a crash.
    return false;
  }

  try {
    const req = http.request({
      host: HOST, port: PORT, path: '/publish', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.resume(); downSince = 0; });
    req.setTimeout(TIMEOUT_MS, () => req.destroy());
    req.on('error', () => { downSince = Date.now(); });
    req.end(body);
    return true;
  } catch {
    downSince = Date.now();
    return false;
  }
}

const announce = {
  emit,

  /** Agent-loop lifecycle narration. */
  thinking(event, data = {}) {
    return emit('agent.thinking', { event, ...data });
  },

  memory: {
    /** Memory-subsystem narration: ingest.started, ingest.failed, ... */
    thinking(event, data = {}) {
      return emit('memory.thinking', { event, ...data });
    },
    /** A memory atom was durably stored. */
    ingested(id, data = {}) {
      return emit('memory.ingested', { id, ...data });
    },
  },
};

module.exports = announce;

// ponytail: self-check rather than a test file — this module has no unit-test
// harness around it and the only failure that matters is "announce threw".
if (require.main === module) {
  const assert = require('assert');
  const cycle = {}; cycle.self = cycle;
  process.env.PURPCLAW_ANNOUNCE = 'on';

  // Must not throw with the bus absent, with cyclic payloads, or with no args.
  assert.doesNotThrow(() => announce.thinking('selfcheck'));
  assert.doesNotThrow(() => announce.thinking('selfcheck', { model: 'x' }));
  assert.doesNotThrow(() => announce.memory.thinking('selfcheck', { error: 'boom' }));
  assert.doesNotThrow(() => announce.memory.ingested('mem_1', { source: 'selfcheck' }));
  assert.strictEqual(emit('selfcheck.cycle', cycle), false, 'cyclic payload must be dropped, not thrown');

  // The call sites in agent-loop.js and memory-client.js must all resolve.
  for (const p of ['thinking', 'memory.thinking', 'memory.ingested']) {
    const fn = p.split('.').reduce((o, k) => o && o[k], announce);
    assert.strictEqual(typeof fn, 'function', `announce.${p} must exist — it is called on a hot path`);
  }

  console.log('lib/events.js self-check OK (5 assertions, bus not required)');
}
