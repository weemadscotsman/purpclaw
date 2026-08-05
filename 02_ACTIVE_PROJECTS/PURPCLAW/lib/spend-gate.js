'use strict';
const PURP_PATHS = require('./paths');
/**
 * lib/spend-gate.js — PurpClaw Pocket OS SpendGate
 * Tracks token spend, enforces daily/monthly budgets, rate limits per agent.
 * Logs every check. Returns ALLOW / DENY with reason.
 *
 * Storage: E:/training/pocket/spend-log.jsonl (per-day append)
 *          E:/training/pocket/spend-config.json (current limits)
 * Billing errors from LLM API calls are routed through lib/billing-lifecycle.js
 * for exact user-facing copy per docs/billing-lifecycle.md.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// Billing lifecycle wiring — lazy to avoid circular requires during boot.
let _billingLifecycle = null;
function billingLifecycle() {
  if (!_billingLifecycle) {
    try {
      _billingLifecycle = require('./billing-lifecycle');
    } catch {
      _billingLifecycle = null;
    }
  }
  return _billingLifecycle;
}

// Lazy-resolved so tests can set POCKET_DIR before the first call.
function pocketDir() {
  return process.env.POCKET_DIR
    || path.join(PURP_PATHS.DATA_ROOT, 'pocket');
}
function configPath() { return path.join(pocketDir(), 'spend-config.json'); }
function logPath() { return path.join(pocketDir(), 'spend-log.jsonl'); }
function statePath() { return path.join(pocketDir(), 'spend-state.json'); }

const DEFAULT_CONFIG = {
  dailyTokenCap: 1_000_000,        // 1M tokens/day
  monthlyTokenCap: 25_000_000,     // 25M tokens/month
  perRequestCap: 16_000,           // 16K tokens/request
  maxRequestsPerMinute: 30,       // 30 req/min
  maxRequestsPerDay: 5_000,       // 5k req/day
  perAgentCaps: {},                // { agentName: { dailyTokens, dailyRequests } }
  providerCaps: {},                // { provider: { dailyTokens, dailyRequests } }
  // Approximate cost per 1K tokens (USD)
  costPer1K: {
    openai: 0.03,
    anthropic: 0.015,
    gemini: 0.001,
    deepseek: 0.001,
    openrouter: 0.005,
    ollama: 0,
    default: 0.01,
  },
  // Auto-kill agents that exceed limit
  killOnBreach: false,
  // Alert thresholds (0-1 fraction)
  alertAt: [0.5, 0.8, 0.95],
};

// ── Atomic state writes (file lock + temp + fsync + rename) ──

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return { day: todayKey(), month: monthKey(), dailyTokens: 0, dailyRequests: 0, dailyCost: 0, monthlyTokens: 0, lastReset: null };
  }
}

function saveState(state) {
  const dir = pocketDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = statePath() + '.tmp.' + process.pid + '.' + Date.now();
  const data = JSON.stringify(state, null, 2);
  try {
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const verify = fs.readFileSync(tmp, 'utf8');
    if (verify !== data) throw new Error('tmp file size mismatch');
    fs.renameSync(tmp, statePath());
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

// Per-process in-memory lock around read-modify-write.
// Stops two threads in the SAME process from racing on the counters.
// Cross-process safety comes from the atomic temp+rename above.
class Mutex {
  constructor() { this._held = false; this._q = []; }
  async acquire() {
    if (!this._held) { this._held = true; return; }
    await new Promise(res => this._q.push(res));
    this._held = true;
  }
  release() {
    this._held = false;
    const next = this._q.shift();
    if (next) next();
  }
  async run(fn) {
    await this.acquire();
    try { return fn(); } finally { this.release(); }
  }
}

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) }; }
  catch { return { ...DEFAULT_CONFIG }; }
  }

  function saveConfig(config) {
  const dir = pocketDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  }

function todayKey() { return new Date().toISOString().slice(0, 10); }
function monthKey() { return new Date().toISOString().slice(0, 7); }

function appendLog(entry) {
  const dir = pocketDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath(), JSON.stringify({ ...entry, ts: Date.now() }) + '\n');
}

class SpendGate {
  constructor(config = {}) {
    this.config = { ...loadConfig(), ...config };  // allow override at construction
    this.state = loadState();
    this.recentRequests = [];  // for rate limiting
    this._mutex = new Mutex();  // serializes read-modify-write
  }

  configure(partial) {
    this.config = { ...this.config, ...partial };
    saveConfig(this.config);
    return this.config;
  }

  getConfig() { return this.config; }

  /**
   * Check if a request should be allowed. Returns { allow: bool, reason?, remaining? }
   * Atomic: all state mutations happen under the in-process mutex so
   * concurrent checks can't race on day-rollover or rate-limit cleanup.
   * @param {object} req { agent, provider, estimatedTokens, model }
   */
  async check(req) {
    return this._mutex.run(() => this._checkSync(req));
  }

  _checkSync(req) {
    const { agent = 'unknown', provider = 'default', estimatedTokens = 0, model = null } = req;

    // Day roll-over
    if (this.state.day !== todayKey()) {
      this.state.day = todayKey();
      this.state.dailyTokens = 0;
      this.state.dailyRequests = 0;
      this.state.dailyCost = 0;
    }
    if (this.state.month !== monthKey()) {
      // Month rolled over — reset counters and persist so rollover survives restart
      this.state.month = monthKey();
      this.state.monthlyTokens = 0;
      this.state.lastReset = new Date().toISOString();
      saveState(this.state);
    }
    // Per-request cap
    if (estimatedTokens > this.config.perRequestCap) {
      this._log('deny', req, 'per-request cap exceeded');
      return { allow: false, reason: `Request uses ${estimatedTokens} tokens, cap is ${this.config.perRequestCap}` };
    }

    // Daily token cap
    if (this.state.dailyTokens + estimatedTokens > this.config.dailyTokenCap) {
      this._log('deny', req, 'daily token cap');
      return { allow: false, reason: `Daily token cap (${this.config.dailyTokenCap}) would be exceeded` };
    }

    // Monthly cap
    if (this.state.monthlyTokens + estimatedTokens > this.config.monthlyTokenCap) {
      this._log('deny', req, 'monthly token cap');
      return { allow: false, reason: `Monthly token cap (${this.config.monthlyTokenCap}) would be exceeded` };
    }

    // Daily request count
    if (this.state.dailyRequests >= this.config.maxRequestsPerDay) {
      this._log('deny', req, 'daily request cap');
      return { allow: false, reason: `Daily request cap (${this.config.maxRequestsPerDay}) reached` };
    }

    // Rate limit (requests per minute)
    const oneMinAgo = Date.now() - 60_000;
    this.recentRequests = this.recentRequests.filter(t => t > oneMinAgo);
    if (this.recentRequests.length >= this.config.maxRequestsPerMinute) {
      this._log('deny', req, 'rate limit');
      return { allow: false, reason: `Rate limit: ${this.config.maxRequestsPerMinute} req/min exceeded` };
    }

    // Per-agent caps
    const agentCap = this.config.perAgentCaps[agent];
    if (agentCap) {
      const today = this._todayAgentUsage(agent);
      if (agentCap.dailyTokens && today.tokens + estimatedTokens > agentCap.dailyTokens) {
        this._log('deny', req, `agent ${agent} daily token cap`);
        return { allow: false, reason: `Agent ${agent} daily token cap reached` };
      }
      if (agentCap.dailyRequests && today.requests >= agentCap.dailyRequests) {
        this._log('deny', req, `agent ${agent} daily request cap`);
        return { allow: false, reason: `Agent ${agent} daily request cap reached` };
      }
    }

    // Per-provider caps
    const provCap = this.config.providerCaps[provider];
    if (provCap) {
      const today = this._todayProviderUsage(provider);
      if (provCap.dailyTokens && today.tokens + estimatedTokens > provCap.dailyTokens) {
        this._log('deny', req, `provider ${provider} daily token cap`);
        return { allow: false, reason: `Provider ${provider} daily token cap reached` };
      }
    }

    this._log('allow', req);
    // Atomically reserve the estimated tokens. If actual spend differs,
    // the record() call's adjust logic fixes the delta.
    this.state.dailyTokens += estimatedTokens;
    this.state.monthlyTokens += estimatedTokens;
    this.state.dailyRequests += 1;
    this.recentRequests.push(Date.now());
    saveState(this.state);

    // ── Rollover/Threshold alerts ───────────────────────────────────────
    const now = this.state;
    const dailyFrac = now.dailyTokens / this.config.dailyTokenCap;
    const monthlyFrac = now.monthlyTokens / this.config.monthlyTokenCap;
    const ALERT = this.config.alertAt || [0.5, 0.8, 0.95];
    const activeAlerts = [];
    for (const threshold of ALERT) {
      if (dailyFrac >= threshold) activeAlerts.push(`daily ${(dailyFrac * 100).toFixed(1)}%`);
      if (monthlyFrac >= threshold) activeAlerts.push(`monthly ${(monthlyFrac * 100).toFixed(1)}%`);
    }
    const newAlerts = activeAlerts.filter(a => !(this._lastAlerts || []).includes(a));
    if (newAlerts.length && this.config.onAlert) {
      for (const a of newAlerts) this.config.onAlert(a);
    }
    this._lastAlerts = activeAlerts;

    return {
      allow: true,
      estimatedTokens,
      remaining: { dailyTokens: this.config.dailyTokenCap - this.state.dailyTokens }
    };
  }

  /**
   * Record actual spend after a request completes.
   * The check() call already reserved `estimatedTokens` against the
   * daily cap. This adjusts by the delta (actual - estimated).
   * If the user didn't call check() first, this is a flat add.
   * Atomic: serialized via in-process mutex.
   */
  async record(agent, provider, inputTokens, outputTokens, model = null, opts = {}) {
    return this._mutex.run(() => {
      const total = (inputTokens || 0) + (outputTokens || 0);
      const cost = this._estimateCost(provider, inputTokens, outputTokens);
      const reserved = opts.reserved || 0;
      const delta = total - reserved;  // positive = over, negative = under

      this.state.dailyTokens = Math.max(0, this.state.dailyTokens + delta);
      this.state.monthlyTokens = Math.max(0, this.state.monthlyTokens + delta);
      // dailyRequests already incremented in check(); no change
      this.state.dailyCost += cost;

      appendLog({
        type: 'spend',
        agent, provider, model,
        inputTokens, outputTokens, total, reserved, delta,
        cost: cost.toFixed(4),
        day: todayKey(),
      });

      saveState(this.state);
      return { total, cost, reserved, delta, dailyTotal: this.state.dailyTokens };
    });
  }

  /**
   * Render a user-facing billing error message from an LLM API error.
   * Routes the raw API error through billing-lifecycle.js for exact copy
   * per docs/billing-lifecycle.md §2.
   *
   * @param {object} apiError — raw error from LLM API call
   * @returns {string} user-facing error message
   */
  renderBillingError(apiError) {
    const bl = billingLifecycle();
    if (!bl) return `🔴 Billing error: ${(apiError?.error?.message) || apiError?.error || 'unknown'}`;

    const mapped = bl.mapLlmApiError(apiError);
    if (!mapped) return `🔴 ${apiError?.error?.message || apiError?.error || 'Billing request failed.'}`;

    const cfg = bl.loadBillingConfig();
    return bl.renderBillingError({
      code:        mapped.eventCode,
      remainingUsd: mapped.remainingUsd,
      portalUrl:   mapped.portalUrl || cfg.defaultPortalUrl,
      retryAfter:  mapped.retryAfter,
    });
  }

  getStatus() {
    const daily = this.state.dailyTokens || 0;
    const monthly = this.state.monthlyTokens || 0;
    return {
      day: this.state.day,
      month: this.state.month,
      dailyTokens: daily,
      dailyRequests: this.state.dailyRequests,
      dailyCost: this.state.dailyCost.toFixed(2),
      monthlyTokens: monthly,
      dailyCap: this.config.dailyTokenCap,
      monthlyCap: this.config.monthlyTokenCap,
      dailyUsedFrac: daily / this.config.dailyTokenCap,
      monthlyUsedFrac: monthly / this.config.monthlyTokenCap,
      recentRate: this.recentRequests.length,
    };
  }

  reset() {
    this.state = { day: todayKey(), month: monthKey(), dailyTokens: 0, dailyRequests: 0, dailyCost: 0, monthlyTokens: 0 };
    this.recentRequests = [];
    saveState(this.state);
    return this.state;
  }

  _estimateCost(provider, inputTokens, outputTokens) {
    const rate = this.config.costPer1K[provider] || this.config.costPer1K.default;
    return ((inputTokens + outputTokens) / 1000) * rate;
  }

  _log(action, req, reason = null) {
    appendLog({ type: 'check', action, ...req, reason });
  }

  _todayAgentUsage(agent) {
    // Quick scan of today's log
    try {
      const lines = fs.readFileSync(logPath(), 'utf8').split('\n').filter(Boolean).slice(-500);
      const today = todayKey();
      let tokens = 0, requests = 0;
      for (const l of lines) {
        try {
          const e = JSON.parse(l);
          if (e.type === 'spend' && e.agent === agent && e.day === today) {
            tokens += e.total || 0;
            requests += 1;
          }
        } catch {}
      }
      return { tokens, requests };
    } catch {
      return { tokens: 0, requests: 0 };
    }
  }

  _todayProviderUsage(provider) {
    try {
      const lines = fs.readFileSync(logPath(), 'utf8').split('\n').filter(Boolean).slice(-500);
      const today = todayKey();
      let tokens = 0;
      for (const l of lines) {
        try {
          const e = JSON.parse(l);
          if (e.type === 'spend' && e.provider === provider && e.day === today) {
            tokens += e.total || 0;
          }
        } catch {}
      }
      return { tokens };
    } catch {
      return { tokens: 0 };
    }
  }
}

module.exports = { SpendGate, DEFAULT_CONFIG, pocketDir, configPath, logPath, statePath };
