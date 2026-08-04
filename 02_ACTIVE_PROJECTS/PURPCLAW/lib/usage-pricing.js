'use strict';

/**
 * lib/usage-pricing.js — Usage tracking and pricing database
 *
 * Ports Hermes agent/usage_pricing.py (~1334 lines)
 *
 * Tracks CanonicalUsage per provider/model and computes cost.
 * Uses native JavaScript numbers (no decimal.js dependency).
 */

const path = require('path');
const os   = require('os');
const fs   = require('fs');

const PURP_DIR     = process.env.PURP_DIR || path.join(os.homedir(), '.purpclaw');
const PRICING_CACHE = path.join(PURP_DIR, 'pricing-cache.json');

// ── Canonical Usage ────────────────────────────────────────────────────────────

class CanonicalUsage {
  constructor(data = {}) {
    this.input_tokens       = data.input_tokens       || 0;
    this.output_tokens      = data.output_tokens      || 0;
    this.cache_read_tokens  = data.cache_read_tokens  || 0;
    this.cache_write_tokens = data.cache_write_tokens || 0;
    this.reasoning_tokens   = data.reasoning_tokens   || 0;
    this.request_count      = data.request_count      || 1;
    this.raw_usage          = data.raw_usage          || null;
  }

  get prompt_tokens() { return this.input_tokens + this.cache_read_tokens + this.cache_write_tokens; }
  get total_tokens() { return this.prompt_tokens + this.output_tokens; }

  add(other) {
    if (!(other instanceof CanonicalUsage)) return this;
    return new CanonicalUsage({
      input_tokens:       this.input_tokens       + other.input_tokens,
      output_tokens:      this.output_tokens      + other.output_tokens,
      cache_read_tokens:  this.cache_read_tokens  + other.cache_read_tokens,
      cache_write_tokens: this.cache_write_tokens + other.cache_write_tokens,
      reasoning_tokens:   this.reasoning_tokens   + other.reasoning_tokens,
      request_count:      this.request_count      + other.request_count,
      raw_usage: null,
    });
  }

  toJSON() {
    return {
      input_tokens:       this.input_tokens,
      output_tokens:      this.output_tokens,
      cache_read_tokens:  this.cache_read_tokens,
      cache_write_tokens: this.cache_write_tokens,
      reasoning_tokens:   this.reasoning_tokens,
      request_count:      this.request_count,
    };
  }
}

// ── Pricing Entry ─────────────────────────────────────────────────────────────

class PricingEntry {
  constructor(data = {}) {
    this.input_cost_per_million       = data.input_cost_per_million       ?? null;
    this.output_cost_per_million      = data.output_cost_per_million      ?? null;
    this.cache_read_cost_per_million = data.cache_read_cost_per_million ?? null;
    this.cache_write_cost_per_million= data.cache_write_cost_per_million?? null;
    this.currency = data.currency || 'USD';
  }

  _perMillion(costPerMillion, tokens) {
    if (costPerMillion == null) return null;
    return (costPerMillion * tokens) / 1_000_000;
  }

  totalCost(usage) {
    const u = usage instanceof CanonicalUsage ? usage : new CanonicalUsage(usage);
    let total = 0;
    const ic = this._perMillion(this.input_cost_per_million, u.input_tokens);
    const oc = this._perMillion(this.output_cost_per_million, u.output_tokens);
    const cr = this._perMillion(this.cache_read_cost_per_million, u.cache_read_tokens);
    const cw = this._perMillion(this.cache_write_cost_per_million, u.cache_write_tokens);
    if (ic !== null) total += ic;
    if (oc !== null) total += oc;
    if (cr !== null) total += cr;
    if (cw !== null) total += cw;
    return total;
  }
}

// ── Default Pricing Table ──────────────────────────────────────────────────────

const DEFAULT_PRICING = {
  'openai/gpt-4o':               { input: 5.00,   output: 15.00 },
  'openai/gpt-4o-mini':          { input: 0.15,   output: 0.60 },
  'anthropic/claude-sonnet-4':    { input: 3.00,   output: 15.00 },
  'anthropic/claude-opus-4':      { input: 15.00,  output: 75.00 },
  'anthropic/claude-3-5-sonnet': { input: 1.50,   output: 7.50 },
  'google/gemini-2.5-pro':       { input: 1.25,   output: 5.00 },
  'google/gemini-2.5-flash':     { input: 0.075,   output: 0.30 },
  'deepseek/deepseek-chat':       { input: 0.27,    output: 1.10 },
  'minimax/MiniMax-M3':           { input: 0.00,    output: 0.00 },
  'nvidia/llama-3.1-nemotron':   { input: 0.20,    output: 0.30 },
};

function buildPricingTable() {
  const table = {};
  for (const [model, prices] of Object.entries(DEFAULT_PRICING)) {
    table[model] = new PricingEntry({ input_cost_per_million: prices.input, output_cost_per_million: prices.output });
  }
  return table;
}

// ── Usage Tracker ─────────────────────────────────────────────────────────────

class UsageTracker {
  constructor() {
    this.usage   = new CanonicalUsage();
    this.cost    = 0;
    this.byModel = new Map();
    this.started = Date.now();
  }

  add(usageData, pricing = null, model = 'default') {
    const u = usageData instanceof CanonicalUsage ? usageData : new CanonicalUsage(usageData);
    this.usage = this.usage.add(u);
    if (pricing) {
      const p = pricing instanceof PricingEntry ? pricing : new PricingEntry(pricing);
      const c = p.totalCost(u);
      this.cost += c;
      if (!this.byModel.has(model)) this.byModel.set(model, { usage: new CanonicalUsage(), cost: 0 });
      const ex = this.byModel.get(model);
      ex.usage = ex.usage.add(u);
      ex.cost += c;
    }
    return this;
  }

  stats() {
    return {
      usage: {
        input_tokens:       this.usage.input_tokens,
        output_tokens:      this.usage.output_tokens,
        cache_read_tokens:  this.usage.cache_read_tokens,
        cache_write_tokens: this.usage.cache_write_tokens,
        reasoning_tokens:   this.usage.reasoning_tokens,
        total_tokens:       this.usage.total_tokens,
        prompt_tokens:      this.usage.prompt_tokens,
        request_count:      this.usage.request_count,
      },
      cost_usd:      parseFloat(this.cost.toFixed(6)),
      by_model:      [...this.byModel.entries()].map(([m, v]) => ({
        model: m, usage: v.usage.toJSON(), cost_usd: parseFloat(v.cost.toFixed(6)),
      })),
      session_start:    new Date(this.started).toISOString(),
      session_seconds:  Math.round((Date.now() - this.started) / 1000),
    };
  }

  save() {
    const dir = path.join(PURP_DIR, 'usage');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `usage-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(this.stats(), null, 2));
    return file;
  }
}

// ── Pricing Resolver ───────────────────────────────────────────────────────────

let _pricingCache = null;

function loadPricingCache() {
  if (_pricingCache) return _pricingCache;
  if (!fs.existsSync(PRICING_CACHE)) return null;
  try { _pricingCache = JSON.parse(fs.readFileSync(PRICING_CACHE, 'utf8')); return _pricingCache; }
  catch { return null; }
}

function resolvePricing(provider, model) {
  const cache = loadPricingCache();
  if (cache) {
    const key = `${provider}/${model}`;
    if (cache[key]) return new PricingEntry(cache[key]);
  }
  const table = buildPricingTable();
  for (const [name, entry] of Object.entries(table)) {
    const m = name.split('/')[1] || '';
    if (name.includes(model) || model.includes(m)) return entry;
  }
  return new PricingEntry();
}

function estimateCost(provider, model, usageData) {
  const pricing = resolvePricing(provider, model);
  const u = usageData instanceof CanonicalUsage ? usageData : new CanonicalUsage(usageData);
  return {
    cost_usd:     parseFloat(pricing.totalCost(u).toFixed(6)),
    pricing_mode: pricing.input_cost_per_million ? 'estimated' : 'unknown',
    provider, model,
    usage: u.toJSON(),
  };
}

module.exports = {
  CanonicalUsage,
  PricingEntry,
  UsageTracker,
  resolvePricing,
  estimateCost,
  buildPricingTable,
  PRICING_CACHE,
};
