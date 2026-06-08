'use strict';
/**
 * lib/spend-gate.js — PurpClaw Pocket OS SpendGate
 * Tracks token spend, enforces daily/monthly budgets, rate limits per agent.
 * Logs every check. Returns ALLOW / DENY with reason.
 *
 * Storage: E:/training/pocket/spend-log.jsonl (per-day append)
 *          E:/training/pocket/spend-config.json (current limits)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const POCKET_DIR = process.env.POCKET_DIR
  || path.join(os.homedir(), '.purpclaw', 'pocket');
const CONFIG_PATH = path.join(POCKET_DIR, 'spend-config.json');
const LOG_PATH = path.join(POCKET_DIR, 'spend-log.jsonl');
const STATE_PATH = path.join(POCKET_DIR, 'spend-state.json');

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

// ── State (in-memory, persisted periodically) ──────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { day: todayKey(), month: monthKey(), dailyTokens: 0, dailyRequests: 0, dailyCost: 0, monthlyTokens: 0, lastReset: null };
  }
}

function saveState(state) {
  if (!fs.existsSync(POCKET_DIR)) fs.mkdirSync(POCKET_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function saveConfig(config) {
  if (!fs.existsSync(POCKET_DIR)) fs.mkdirSync(POCKET_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function todayKey() { return new Date().toISOString().slice(0, 10); }
function monthKey() { return new Date().toISOString().slice(0, 7); }

function appendLog(entry) {
  if (!fs.existsSync(POCKET_DIR)) fs.mkdirSync(POCKET_DIR, { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify({ ...entry, ts: Date.now() }) + '\n');
}

class SpendGate {
  constructor() {
    this.config = loadConfig();
    this.state = loadState();
    this.recentRequests = [];  // for rate limiting
  }

  configure(partial) {
    this.config = { ...this.config, ...partial };
    saveConfig(this.config);
    return this.config;
  }

  getConfig() { return this.config; }

  /**
   * Check if a request should be allowed. Returns { allow: bool, reason?, remaining? }
   * @param {object} req { agent, provider, estimatedTokens, model }
   */
  check(req) {
    const { agent = 'unknown', provider = 'default', estimatedTokens = 0, model = null } = req;

    // Day roll-over
    if (this.state.day !== todayKey()) {
      this.state.day = todayKey();
      this.state.dailyTokens = 0;
      this.state.dailyRequests = 0;
      this.state.dailyCost = 0;
    }
    if (this.state.month !== monthKey()) {
      this.state.month = monthKey();
      this.state.monthlyTokens = 0;
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
    return { allow: true, remaining: { dailyTokens: this.config.dailyTokenCap - this.state.dailyTokens - estimatedTokens } };
  }

  /**
   * Record actual spend after a request completes.
   */
  record(agent, provider, inputTokens, outputTokens, model = null) {
    const total = (inputTokens || 0) + (outputTokens || 0);
    const cost = this._estimateCost(provider, inputTokens, outputTokens);

    this.state.dailyTokens += total;
    this.state.monthlyTokens += total;
    this.state.dailyRequests += 1;
    this.state.dailyCost += cost;
    this.recentRequests.push(Date.now());

    appendLog({
      type: 'spend',
      agent, provider, model,
      inputTokens, outputTokens, total,
      cost: cost.toFixed(4),
      day: todayKey(),
    });

    saveState(this.state);
    return { total, cost, dailyTotal: this.state.dailyTokens };
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
      const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).slice(-500);
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
      const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).slice(-500);
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

module.exports = { SpendGate, DEFAULT_CONFIG, CONFIG_PATH, LOG_PATH, POCKET_DIR };
