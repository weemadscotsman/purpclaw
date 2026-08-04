'use strict';

/**
 * services/event-bus — Pub/Sub Event Bus
 * Stub — in-process pub/sub for harness events.
 */
const { EventEmitter } = require('events');

class EventBus extends EventEmitter {
  publish(channel, payload) {
    const event = { channel, payload, ts: new Date().toISOString() };
    this.emit(channel, event);
    this.emit('*', event);
  }

  subscribe(channel, handler) {
    this.on(channel, handler);
    return () => this.off(channel, handler);
  }

  // Built-in channels
  channels() {
    return ['harness.start', 'harness.subtask', 'harness.verification',
            'harness.done', 'harness.error', 'harness.stage'];
  }
}

module.exports = { EventBus };
