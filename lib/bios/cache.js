'use strict';
/**
 * lib/bios/cache.js — in-process state + ring-buffer event emitter.
 *
 *   record(row)           — push one probe row
 *   snapshot()            → rows: Map<service_id, latest row>
 *   boot(bootId)          — start a boot session; returns boot metadata
 *   advance(bootId, …)    — move a boot session forward
 *   subscribe(fn)         — receive every record + advance event
 *
 * The cache is the only side-effect outlet for probe.js. The wire layer
 * (lib/bios/wire.js) reads `snapshot()` per request — never blocking on a
 * pending probe; UI SSEs are fed by `subscribe()`.
 *
 * Memory ceiling: rows are deduped by service_id (latest wins). Boots are
 * deduped by bootId and GC'd after 50 entries.
 */

const EventEmitter = require('events');
const BOOT_GC_LIMIT = 50;

class BiosCache extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    /** @type {Map<string, object>} */
    this._rows = new Map();       // service_id → latest row
    /** @type {Map<string, object>} */
    this._boots = new Map();      // bootId → boot metadata
  }

  record(row) {
    if (!row || !row.service_id) return;
    this._rows.set(row.service_id, row);
    this.emit('record', row);
  }

  snapshot() {
    return Array.from(this._rows.values());
  }

  boot(bootId, profile) {
    if (this._boots.size > BOOT_GC_LIMIT) {
      const first = this._boots.keys().next().value;
      this._boots.delete(first);
    }
    const meta = {
      bootId,
      profile,
      started_at: new Date().toISOString(),
      ended_at: null,
      stage: 'starting',
      percent: 0,
      rows: [],
      verdict: null,
    };
    this._boots.set(bootId, meta);
    this.emit('boot', meta);
    return meta;
  }

  advance(bootId, patch) {
    const meta = this._boots.get(bootId);
    if (!meta) return null;
    Object.assign(meta, patch);
    this.emit('boot', meta);
    return meta;
  }

  end(bootId, patch) {
    const meta = this._boots.get(bootId);
    if (!meta) return null;
    meta.ended_at = new Date().toISOString();
    Object.assign(meta, patch);
    this.emit('boot', meta);
    return meta;
  }

  bootMeta(bootId) {
    return this._boots.get(bootId) || null;
  }

  subscribe(fn) {
    this.on('record', fn);
    this.on('boot', fn);
    return () => {
      this.off('record', fn);
      this.off('boot', fn);
    };
  }
}

module.exports = new BiosCache();
