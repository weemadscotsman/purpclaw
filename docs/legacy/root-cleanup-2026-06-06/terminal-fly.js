#!/usr/bin/env node
'use strict';

/**
 * PURPCLAW — Terminal Fly
 * ══════════════════════════
 * Port: 7799
 *
 * A tiny build-state familiar that watches git, tests, agent events,
 * and fish audit results — then reacts visibly in the Mission Control UI.
 *
 * It is NOT spyware. It does NOT secretly watch everything.
 * It watches agreed project paths only, connected via EventBus.
 *
 * Canon phrase: "Smoke test or shut up."
 *
 * Ports:
 *   :7799  HTTP + SSE  — fly state + SSE stream for UI
 *   :7782  EventBus   — subscribes to agent.*, harness.*, fish.*
 *
 * Run:  node terminal-fly.js
 * Or:   purpclaw safe-start terminal-fly
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');

// ── Config ────────────────────────────────────────────────────────────────────

const FLY_PORT    = parseInt(process.env.FLY_PORT    || '7799', 10);
const EVENTBUS    = process.env.EVENTBUS_PORT       || '7782';
const PURP_ROOT   = process.env.PURPCLAW_ROOT       || path.resolve(__dirname, '..');
const WATCH_DIRS  = (process.env.FLY_WATCH_DIRS || PURP_ROOT)
  .split(',')
  .map(d => path.resolve(d.trim()))
  .filter(Boolean);

// ── Fly states ────────────────────────────────────────────────────────────────

const STATE = {
  IDLE:      'idle',      // watching, nothing special happening
  NOD:       'nod',       // tests passed / PR merged / build clean
  BUZZ:      'buzz',      // activity in progress / agent working
  GROOM:     'groom',     // git clean / everything tidy
  POINT:     'point',     // pointing at something missing (evidence, commit msg)
  PANIC:     'panic',     // service down / API limit hit / bad error
  FACEDesk:  'faceplant', // tests failing / build broken
  LAP:       'lap',       // celebratory lap — PR opened, job done
  SUMMON:    'summon',    // accuracy fish was invoked
};

const TRANSITIONS = {
  [STATE.IDLE]:      [STATE.BUZZ, STATE.NOD, STATE.GROOM, STATE.PANIC, STATE.FACEDesk, STATE.POINT, STATE.LAP, STATE.SUMMON],
  [STATE.NOD]:       [STATE.IDLE, STATE.BUZZ, STATE.PANIC],
  [STATE.BUZZ]:      [STATE.IDLE, STATE.NOD, STATE.FACEDesk, STATE.LAP, STATE.PANIC],
  [STATE.GROOM]:     [STATE.IDLE],
  [STATE.POINT]:     [STATE.IDLE, STATE.BUZZ, STATE.PANIC],
  [STATE.PANIC]:     [STATE.IDLE, STATE.BUZZ, STATE.FACEDesk],
  [STATE.FACEDesk]:  [STATE.IDLE, STATE.BUZZ, STATE.NOD, STATE.PANIC],
  [STATE.LAP]:       [STATE.IDLE, STATE.NOD],
  [STATE.SUMMON]:    [STATE.IDLE, STATE.NOD, STATE.FACEDesk, STATE.POINT],
};

// One-line brutal fly messages per state + trigger
const MESSAGES = {
  [STATE.IDLE]:  ['watching.', 'just vibes.', 'the pile remembers.', 'nothing to do.', 'eddie where'],

  [STATE.NOD]:   [
    'Tests green. Well done, cathedral builder.',
    'Build clean. Ship it.',
    'PR merged. Fish approved.',
    'Smoke test passed. Finally.',
    'Build passed. I almost believed in you.',
  ],

  [STATE.BUZZ]:  [
    'Agent running. Something is happening.',
    'Buzz buzz. Work is being done.',
    'Active. Stay alert.',
  ],

  [STATE.GROOM]: [
    'Git clean. I\'m impressed.',
    'Clean repo. Rarer than honesty.',
    'No changes. Either done or avoiding work.',
  ],

  [STATE.POINT]: [
    'No commit message. Fix it, genius.',
    'Evidence missing. Fish is already annoyed.',
    'That file isn\'t tracked. Classic Eddie.',
    'No evidence store found. Where\'s the proof?',
    'Uncommitted. The repo is judging you.',
  ],

  [STATE.PANIC]: [
    'Service down. Check the stack.',
    'API limit hit. Rate limit reached.',
    'Connection lost. Something died.',
    'Backend offline. Restart it, Eddie.',
  ],

  [STATE.FACEDesk]: [
    'Tests failing. Face. Desk. Repeat.',
    'Build broken. Fix it before the fish finds out.',
    'Syntax error. Classic.',
    'npm install failed. Dependencies, Eddie.',
    'You said production-ready. I found Math.random().',
  ],

  [STATE.LAP]:   [
    'PR opened. Celebratory lap complete.',
    'Job done. One lap around the screen.',
    'Mission complete. Fly approves.',
    'Fish gave a wet nod. That\'s rare.',
  ],

  [STATE.SUMMON]: [
    'Fish summoned. Claims will be audited.',
    'Accuracy Fish activated. Good luck.',
    'Fish is watching. The cathedral will be inspected.',
  ],
};

const IDLE_TIMEOUT_MS = 8000;  // return to IDLE after this long in any other state

// ── Fly class ─────────────────────────────────────────────────────────────────

class TerminalFly extends EventEmitter {
  constructor() {
    super();
    this.state      = STATE.IDLE;
    this.message   = 'watching.';
    this.prevState = STATE.IDLE;
    this.since     = Date.now();
    this.history   = [];          // recent state transitions
    this.sseClients = new Set();  // active SSE connections
    this._idleTimer = null;
    this._gitCache  = {};         // path → { dirty, branch, untracked }
    this._testCache = {};         // path → { passing, output }
    this._servicesUp = true;       // last known service health
    this._lastEvent = null;       // last EventBus event
    this._watching  = false;

    this._pollGit();
    this._startIdleReset();
  }

  // ── State transitions ──────────────────────────────────────────────────────

  setState(newState, message) {
    if (newState === this.state) return;

    // Validate transition
    const allowed = TRANSITIONS[this.state] || [];
    if (!allowed.includes(newState)) {
      // Force transition for PANIC and FACEDesk — always allowed
      if (newState !== STATE.PANIC && newState !== STATE.FACEDesk) {
        return;
      }
    }

    const entry = {
      from:     this.state,
      to:       newState,
      message:  message || this._pickMessage(newState),
      at:       Date.now(),
    };

    this.prevState = this.state;
    this.state     = newState;
    this.message   = entry.message;
    this.since     = Date.now();
    this.history.push(entry);
    if (this.history.length > 20) this.history.shift();

    this._resetIdleTimer();
    this._broadcast();
    this.emit('state', this._snapshot());
  }

  _pickMessage(state) {
    const msgs = MESSAGES[state];
    if (!msgs || msgs.length === 0) return 'watching.';
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  _resetIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (this.state !== STATE.IDLE) {
        this.setState(STATE.IDLE, 'idle again.');
      }
    }, IDLE_TIMEOUT_MS);
  }

  _startIdleReset() {
    this._idleTimer = setTimeout(() => {
      if (this.state === STATE.IDLE) {
        this.setState(STATE.IDLE, this._pickMessage(STATE.IDLE));
      }
      this._startIdleReset();
    }, 30000 + Math.random() * 20000);
  }

  // ── Git watching ───────────────────────────────────────────────────────────

  async _pollGit() {
    this._watching = true;
    for (const dir of WATCH_DIRS) {
      await this._checkGit(dir);
    }
    setTimeout(() => this._pollGit(), 5000);
  }

  async _checkGit(dir) {
    const cached = this._gitCache[dir];
    const prev  = cached ? cached.dirty : undefined;

    try {
      const branch = await this._git(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], '').catch(() => '?');
      const status = await this._git(['-C', dir, 'status', '--porcelain'], '').catch(() => '');
      const dirty  = status.trim().length > 0;
      const untracked = status.includes('??');
      const staged    = status.includes('M ') || status.includes('A ') || status.includes('D ');

      this._gitCache[dir] = { dirty, branch, untracked, staged, status };

      // React to git changes
      if (dirty && !prev) {
        this.setState(STATE.POINT, 'Git dirty — something changed.');
      } else if (!dirty && prev === true) {
        this.setState(STATE.GROOM, 'Git clean — someone committed.');
      }
    } catch { /* best-effort */ }
  }

  _git(args, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd, windowsHide: true, timeout: 3000 });
      let out = '';
      child.stdout.on('data', d => out += d);
      child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(`git exit ${code}`)));
      child.on('error', reject);
      setTimeout(() => { child.kill(); reject(new Error('git timeout')); }, 3000);
    });
  }

  // ── EventBus ───────────────────────────────────────────────────────────────

  connectEventBus() {
    try {
      const req = http.request({
        hostname: '127.0.0.1',
        port: EVENTBUS,
        path: '/events/fish,agent,harness,gatekeeper,github',
        method: 'GET',
        headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
      }, res => {
        if (res.statusCode !== 200) {
          console.log('[fly] EventBus returned', res.statusCode, '— retrying in 5s');
          setTimeout(() => this.connectEventBus(), 5000);
          return;
        }
        res.on('data', chunk => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const event = JSON.parse(line.slice(5));
              this._onBusEvent(event);
            } catch { /* ignore parse errors */ }
          }
        });
        res.on('end', () => {
          console.log('[fly] EventBus disconnected — reconnecting in 3s');
          setTimeout(() => this.connectEventBus(), 3000);
        });
      });
      req.on('error', () => {
        console.log('[fly] EventBus unreachable — retrying in 5s');
        setTimeout(() => this.connectEventBus(), 5000);
      });
      req.end();
    } catch {
      setTimeout(() => this.connectEventBus(), 5000);
    }
  }

  _onBusEvent(event) {
    this._lastEvent = event;
    const { type, topic } = event;

    // ── Fish audit events ──────────────────────────────────────────────────
    if (topic === 'fish' || type.startsWith('fish') || type.includes('fish')) {
      if (event.verdict === 'HARD_SLAP' || event.verdict === 'RED_SLAP') {
        this.setState(STATE.FACEDesk, 'Fish: hard slap incoming.');
      } else if (event.verdict === 'WET_NOD' || event.verdict === 'RELEASE') {
        this.setState(STATE.NOD, 'Fish gave a wet nod. Rare.');
      } else if (type.includes('summon') || type.includes('audit')) {
        this.setState(STATE.SUMMON, 'Accuracy Fish summoned.');
      }
      return;
    }

    // ── Agent events ───────────────────────────────────────────────────────
    if (type === 'agent_spawned' || type === 'agent.started') {
      this.setState(STATE.BUZZ, `${event.agentName || 'Agent'} working.`);
    }
    if (type === 'agent_complete' || type === 'agent.completed' || type === 'agent.done') {
      if (event.success || event.status === 'completed') {
        this.setState(STATE.NOD, `${event.agentName || 'Agent'} finished.`);
      }
    }
    if (type === 'agent.error' || type === 'agent.failed') {
      this.setState(STATE.PANIC, `${event.agentName || 'Agent'} errored.`);
    }

    // ── Harness events ─────────────────────────────────────────────────────
    if (type === 'harness.job.finished' || type === 'job.done') {
      if (event.state === 'done' || event.state === 'completed') {
        this.setState(STATE.LAP, 'Harness job complete. One lap.');
      } else {
        this.setState(STATE.FACEDesk, 'Harness job failed.');
      }
    }
    if (type === 'harness.subtask.challenged') {
      this.setState(STATE.FACEDesk, `Subtask challenged — ${(event.reason || '').slice(0, 40)}`);
    }
    if (topic === 'harness' && type.includes('fish')) {
      // fish overrode a subtask verdict
      if (event.verdict === 'HARD_SLAP' || event.verdict === 'RED_SLAP') {
        this.setState(STATE.POINT, 'Fish: claim unsupported. Fix it.');
      }
    }

    // ── Gatekeeper events ───────────────────────────────────────────────────
    if (type === 'gatekeeper.approved' || type === 'pr.approved') {
      this.setState(STATE.LAP, 'Gatekeeper approved. Rare and beautiful.');
    }
    if (type === 'gatekeeper.rejected' || type === 'pr.rejected') {
      this.setState(STATE.FACEDesk, 'Gatekeeper rejected. The goblin wins.');
    }

    // ── GitHub events ──────────────────────────────────────────────────────
    if (type === 'pr.opened' || type === 'github.pr.created') {
      this.setState(STATE.LAP, 'PR opened. Celebratory lap initiated.');
    }
    if (type === 'pr.merged' || type === 'github.pr.merged') {
      this.setState(STATE.LAP, 'PR merged. Fish approved. Cathedral standing.');
    }
    if (type === 'branch.created' || type === 'github.branch.created') {
      this.setState(STATE.BUZZ, 'Branch created. Work is starting.');
    }

    // ── Error / panic events ───────────────────────────────────────────────
    if (type === 'error' || type === 'service.down' || type === 'api.limit') {
      this.setState(STATE.PANIC, `${type}: ${(event.message || '').slice(0, 40)}`);
    }
  }

  // ── SSE broadcast ────────────────────────────────────────────────────────

  _broadcast() {
    const payload = JSON.stringify(this._snapshot());
    for (const res of this.sseClients) {
      try { res.write(`data: ${payload}\n\n`); } catch {}
    }
  }

  _snapshot() {
    return {
      state:      this.state,
      message:    this.message,
      since:      this.since,
      duration:   Date.now() - this.since,
      history:    this.history.slice(-5),
      lastEvent:  this._lastEvent ? { type: this._lastEvent.type, topic: this._lastEvent.topic } : null,
      watching:   this._watching,
      gitDirty:   Object.values(this._gitCache).some(g => g.dirty),
      servicesUp: this._servicesUp,
    };
  }

  // ── HTTP server ──────────────────────────────────────────────────────────

  start(port) {
    const fly = this;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      // ── SSE stream ─────────────────────────────────────────────────────
      if (url.pathname === '/fly/stream' || url.pathname === '/stream') {
        res.writeHead(200, {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        // send current state immediately
        res.write(`data: ${JSON.stringify(fly._snapshot())}\n\n`);
        fly.sseClients.add(res);
        req.on('close', () => fly.sseClients.delete(res));
        return;
      }

      // ── REST: current state ──────────────────────────────────────────────
      if (url.pathname === '/fly/state' || url.pathname === '/state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fly._snapshot()));
        return;
      }

      // ── REST: git status ───────────────────────────────────────────────
      if (url.pathname === '/fly/git') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fly._gitCache));
        return;
      }

      // ── REST: history ────────────────────────────────────────────────────
      if (url.pathname === '/fly/history') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fly.history.slice(-20)));
        return;
      }

      // ── Health ───────────────────────────────────────────────────────────
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', state: fly.state }));
        return;
      }

      // 404
      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(port, '0.0.0.0', () => {
      console.log(`[fly] Terminal Fly listening on :${port}`);
      console.log(`[fly] Watching: ${WATCH_DIRS.join(', ')}`);
      this.connectEventBus();
    });

    server.on('error', err => {
      console.error('[fly] Server error:', err.message);
      process.exit(1);
    });
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

const fly = new TerminalFly();
fly.start(FLY_PORT);

// Log startup
console.log('[fly] Terminal Fly booting...');
console.log(`[fly] EventBus: :${EVENTBUS}`);
console.log(`[fly] Port: :${FLY_PORT}`);
console.log('[fly] "Smoke test or shut up."');
