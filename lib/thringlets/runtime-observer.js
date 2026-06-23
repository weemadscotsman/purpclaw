'use strict';

/**
 * Thringlet Runtime Observer
 * ══════════════════════════
 * Maps PURPCLAW runtime signals into emotional interactions, dispatched into
 * the LOCAL Thringlet colony (lib/thringlets/engine.js). No external deps.
 *
 * Watches:
 *   • EventBus (:7782) SSE topics — `harness.*`, `tower.*`, `gatekeeper.*`,
 *     `karen.*`, `service.*`, `audit.*`, `system.*`
 *   • Service-reach matrix — direct probes against documented services
 *   • Harness service snapshot (:7798) — recent state
 *
 * Throttle:
 *   • Per-Thringlet cooldown: 30s
 *   • Colony-wide cap: 6 interactions/min
 *
 * Mood mapping (canonical from thringlet_fossil_record.md):
 *   services healthy        → reward
 *   required service down   → challenge
 *   harness done            → reward
 *   harness failed          → challenge
 *   karen escalation        → stimulate
 *   gatekeeper block        → challenge
 *   spaghetti > 60          → stimulate (goblin mode)
 *   idle > 10min            → calm (sleepy)
 */

const http = require('http');
const EventEmitter = require('events');
const { getColony } = require('./engine');

const PORTS = {
  eventbus:     parseInt(process.env.EVENTBUS_PORT     || '7782', 10),
  api:          parseInt(process.env.API_PORT          || '7780', 10),
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT || '7784', 10),
  tower:        parseInt(process.env.TOWER_PORT        || '7790', 10),
  state:        parseInt(process.env.STATE_PORT        || '7783', 10),
  harness:      parseInt(process.env.HARNESS_PORT      || '7798', 10),
  gatekeeper:   parseInt(process.env.GATEKEEPER_PORT   || '7791', 10),
};

const REQUIRED_SERVICES = ['api', 'tower', 'orchestrator', 'eventbus'];
const POLL_INTERVAL_MS = parseInt(process.env.THRINGLET_POLL_MS || '12000', 10);
const PER_THRINGLET_COOLDOWN_MS = 30_000;
const COLONY_BUDGET_PER_MIN = 6;
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;
const DECAY_SWEEP_MS = 30 * 60 * 1000; // every 30 min run a decay sweep
const TOPICS = ['harness', 'tower', 'gatekeeper', 'karen', 'service', 'audit', 'system'];

const now = () => Date.now();

// ─── HTTP probe helper ────────────────────────────────────────────────────────

function getJSON(port, path, timeoutMs = 2500) {
  return new Promise(resolve => {
    const req = http.request({
      hostname: '127.0.0.1', port, path, method: 'GET', timeout: timeoutMs,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: JSON.parse(d || '{}') }); }
        catch { resolve({ ok: false, status: res.statusCode, raw: d }); }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.end();
  });
}

// ─── Bus → interaction translator ─────────────────────────────────────────────

function mapBusEventToInteraction(topic, evt) {
  const type = String(evt?.type || evt?.event || '').toLowerCase();
  const status = String(evt?.status || '').toLowerCase();

  if (topic === 'harness') {
    if (type.includes('job.finished') || type.includes('subtask.accepted') || status === 'done') {
      return { kind: 'reward', reason: `harness ${type || 'finished'}`, source: 'bus:harness' };
    }
    if (type.includes('subtask.rejected') || status === 'failed') {
      return { kind: 'challenge', reason: `harness ${type || 'failed'}`, source: 'bus:harness' };
    }
  }
  if (topic === 'karen' || type.includes('karen') || type.includes('escalation')) {
    return { kind: 'stimulate', reason: 'Karen escalation', source: 'bus:karen' };
  }
  if (topic === 'gatekeeper' && (status === 'blocked' || type.includes('block'))) {
    return { kind: 'challenge', reason: 'gatekeeper block', source: 'bus:gatekeeper' };
  }
  if (topic === 'tower' && (type.includes('agent_complete') || type.includes('agent_spawned'))) {
    return { kind: 'stimulate', reason: `tower ${type}`, source: 'bus:tower' };
  }
  if (topic === 'audit' && evt?.spaghettiScore != null) {
    const score = Number(evt.spaghettiScore);
    if (score > 60) return { kind: 'stimulate', reason: `spaghetti score ${score} — goblin mode`, weight: 3, source: 'bus:audit' };
    if (score < 20) return { kind: 'reward', reason: `clean architecture (score ${score})`, source: 'bus:audit' };
  }
  return null;
}

// ─── Observer ────────────────────────────────────────────────────────────────

class RuntimeObserver extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.colony = opts.colony || getColony(opts.storageOptions);
    this.pollIntervalMs = opts.pollIntervalMs || POLL_INTERVAL_MS;
    this.colonyBudgetPerMin = opts.colonyBudgetPerMin || COLONY_BUDGET_PER_MIN;
    this.idleThresholdMs = opts.idleThresholdMs || IDLE_THRESHOLD_MS;
    this.cache = { lastPoll: 0, services: {}, harness: null };
    this.history = [];                           // dispatched interactions
    this.budgetWindow = [];                      // timestamps for colony cap
    this.lastEventAt = now();
    this.timer = null;
    this.decayTimer = null;
    this.busSubscribers = [];
    this.ensureDefaultsRan = false;
  }

  async start() {
    // Make sure there's a colony to talk to
    if (!this.ensureDefaultsRan) {
      await this.colony.ensureDefaultColony('operator');
      this.ensureDefaultsRan = true;
    }
    await this.poll();
    this.timer = setInterval(() => this.poll().catch(() => {}), this.pollIntervalMs);
    this.decayTimer = setInterval(() => this.colony.runDecaySweep().catch(() => {}), DECAY_SWEEP_MS);
    this.subscribeToBus();
    this.emit('started');
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.decayTimer) clearInterval(this.decayTimer);
    this.timer = null;
    this.decayTimer = null;
    this.busSubscribers.forEach(req => { try { req.destroy(); } catch {} });
    this.busSubscribers = [];
    this.emit('stopped');
  }

  // ─── EventBus subscription ─────────────────────────────────────────────────

  subscribeToBus() {
    for (const topic of TOPICS) this.subscribeTopic(topic);
  }

  subscribeTopic(topic) {
    const req = http.request({
      hostname: '127.0.0.1', port: PORTS.eventbus,
      path: `/events/${encodeURIComponent(topic)}`,
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    }, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString('utf8');
        const events = buf.split('\n\n');
        buf = events.pop() || '';
        for (const raw of events) {
          const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(5).trim());
            this.onBusEvent(topic, evt);
          } catch { /* ignore */ }
        }
      });
      res.on('end', () => setTimeout(() => this.subscribeTopic(topic), 2000));
    });
    req.on('error', () => setTimeout(() => this.subscribeTopic(topic), 4000));
    req.end();
    this.busSubscribers.push(req);
  }

  onBusEvent(topic, evt) {
    this.lastEventAt = now();
    this.emit('bus-event', { topic, evt });
    const mapped = mapBusEventToInteraction(topic, evt);
    if (mapped) this.dispatch(mapped);
  }

  // ─── Periodic poll ─────────────────────────────────────────────────────────

  async poll() {
    const start = now();
    const [api, tower, orchestrator, state, harness, gatekeeper, eventbus] = await Promise.all([
      getJSON(PORTS.api,          '/api/health',     1500),
      getJSON(PORTS.tower,        '/tower/status',   2000),
      getJSON(PORTS.orchestrator, '/api/health',     1500),
      getJSON(PORTS.state,        '/health',         1500),
      getJSON(PORTS.harness,      '/health',         1500),
      getJSON(PORTS.gatekeeper,   '/api/status',     1500),
      getJSON(PORTS.eventbus,     '/state',          1500),
    ]);
    this.cache.services = {
      api: api.ok, tower: tower.ok, orchestrator: orchestrator.ok,
      state: state.ok, harness: harness.ok, gatekeeper: gatekeeper.ok, eventbus: eventbus.ok
    };
    this.cache.harness = harness.ok ? harness.data : null;
    this.cache.lastPoll = start;

    const allOn = Object.values(this.cache.services).every(Boolean);
    const reqDown = REQUIRED_SERVICES.filter(k => !this.cache.services[k]);

    if (reqDown.length > 0) {
      this.dispatch({
        kind: 'challenge',
        reason: `required services down: ${reqDown.join(', ')}`,
        weight: Math.min(reqDown.length, 3),
        source: 'poll:service-health',
      });
    } else if (this.idleTooLong()) {
      this.dispatch({ kind: 'calm', reason: 'colony idle > threshold', source: 'poll:idle-watch' });
    } else if (allOn) {
      this.dispatch({ kind: 'reward', reason: 'all monitored services healthy', source: 'poll:service-health' });
    }

    this.emit('polled', { durationMs: now() - start, services: this.cache.services });
  }

  idleTooLong() {
    return now() - this.lastEventAt > this.idleThresholdMs;
  }

  // ─── Dispatch ──────────────────────────────────────────────────────────────

  async dispatch(interaction) {
    if (!this.checkColonyBudget()) {
      this.history.push({ ts: now(), interaction, throttled: 'colony-budget' });
      this.trimHistory();
      this.emit('throttled', interaction);
      return null;
    }

    const result = await this.colony.dispatchToOne(
      interaction.kind,
      { reason: interaction.reason, weight: interaction.weight || 1, source: interaction.source || 'observer' },
      PER_THRINGLET_COOLDOWN_MS
    );

    if (!result) {
      this.history.push({ ts: now(), interaction, throttled: 'all-cooling-down' });
      this.trimHistory();
      this.emit('throttled-per-thringlet', interaction);
      return null;
    }

    this.budgetWindow.push(now());
    this.history.push({
      ts: now(),
      interaction,
      deliveredTo: result.thringlet.id,
      thringletName: result.thringlet.name,
      snapshot: { emotion: result.thringlet.emotion, emotionLabel: result.thringlet.emotionLabel,
                  bondLevel: result.thringlet.bondLevel, corruption: result.thringlet.corruption },
      message: result.result.message,
      ability: result.result.abilityActivated || null,
    });
    this.trimHistory();
    this.emit('dispatched', { interaction, result });
    return result;
  }

  checkColonyBudget() {
    const cutoff = now() - 60_000;
    this.budgetWindow = this.budgetWindow.filter(ts => ts > cutoff);
    return this.budgetWindow.length < this.colonyBudgetPerMin;
  }

  trimHistory() {
    if (this.history.length > 200) this.history.splice(0, this.history.length - 200);
  }

  // ─── Public snapshot ───────────────────────────────────────────────────────

  async snapshot() {
    return {
      pollIntervalMs: this.pollIntervalMs,
      lastPoll: this.cache.lastPoll,
      services: this.cache.services,
      colonySize: await this.colony.size(),
      lastEventAt: this.lastEventAt,
      idleSinceMs: now() - this.lastEventAt,
      historyRecent: this.history.slice(-30),
    };
  }
}

function createObserver(opts) {
  return new RuntimeObserver(opts);
}

module.exports = {
  RuntimeObserver,
  createObserver,
  mapBusEventToInteraction,
  REQUIRED_SERVICES,
};
