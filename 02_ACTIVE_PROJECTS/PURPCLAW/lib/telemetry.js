'use strict';
const PURP_PATHS = require('./paths');
/**
 * lib/telemetry.js — PurpClaw private telemetry loop
 *
 * Logs locally: prompts, corrections, repeated tasks, failed answers,
 * accepted outputs, provider performance, token cost, latency, files used,
 * agent outcomes. User-controlled. Never sent off-machine.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const POCKET_DIR = process.env.POCKET_DIR || path.join(PURP_PATHS.DATA_ROOT, 'pocket');
const LOG_PATH = path.join(POCKET_DIR, 'telemetry.jsonl');
const EXPORT_PATH = path.join(POCKET_DIR, 'telemetry-export.json');

class Telemetry {
  constructor() {
    if (!fs.existsSync(POCKET_DIR)) fs.mkdirSync(POCKET_DIR, { recursive: true });
  }

  record(event) {
    if (!process.env.POCKET_TELEMETRY || process.env.POCKET_TELEMETRY === '0') return;
    const entry = {
      ...event,
      ts: Date.now(),
      day: new Date().toISOString().slice(0, 10),
    };
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  }

  prompt(content, agent = 'user', provider = null) {
    this.record({ type: 'prompt', content, agent, provider });
  }

  response(content, agent = 'assistant', provider = null, accepted = true) {
    this.record({ type: 'response', content, agent, provider, accepted });
  }

  correction(before, after, agent = 'user') {
    this.record({ type: 'correction', before, after, agent });
  }

  taskCompleted(task, agent, success = true, durationMs = 0) {
    this.record({ type: 'task', task, agent, success, durationMs });
  }

  providerCall(provider, model, inputTokens, outputTokens, latencyMs, success = true) {
    this.record({ type: 'provider', provider, model, inputTokens, outputTokens, latencyMs, success });
  }

  fileUsed(path, context = null) {
    this.record({ type: 'file', path, context });
  }

  /**
   * Get summary statistics.
   */
  summary(since = null) {
    if (!fs.existsSync(LOG_PATH)) {
      return { total: 0, byType: {}, byDay: {}, byProvider: {} };
    }
    const sinceTs = since ? new Date(since).getTime() : 0;
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const stats = {
      total: 0,
      byType: {},
      byDay: {},
      byProvider: {},
      totalTokens: 0,
      totalCost: 0,
      totalLatency: 0,
      successRate: 0,
    };
    let success = 0, total = 0;
    for (const l of lines) {
      try {
        const e = JSON.parse(l);
        if (e.ts < sinceTs) continue;
        stats.total++;
        stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
        stats.byDay[e.day] = (stats.byDay[e.day] || 0) + 1;
        if (e.provider) {
          stats.byProvider[e.provider] = (stats.byProvider[e.provider] || 0) + 1;
        }
        if (e.inputTokens) stats.totalTokens += e.inputTokens;
        if (e.outputTokens) stats.totalTokens += e.outputTokens;
        if (e.latencyMs) stats.totalLatency += e.latencyMs;
        if (e.type === 'provider') {
          total++;
          if (e.success) success++;
        }
      } catch {}
    }
    if (total > 0) stats.successRate = Math.round((success / total) * 100);
    return stats;
  }

  /**
   * Recent prompts (for showing the user their own patterns).
   */
  recentPrompts(n = 20) {
    if (!fs.existsSync(LOG_PATH)) return [];
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).slice(-200);
    return lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e && e.type === 'prompt')
      .slice(-n);
  }

  /**
   * Export telemetry for analysis (user's own use).
   */
  export() {
    if (!fs.existsSync(LOG_PATH)) return { ok: true, data: [] };
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const data = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    fs.writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
    return { ok: true, count: data.length, path: EXPORT_PATH };
  }

  /**
   * Wipe telemetry (user's right to be forgotten).
   */
  clear() {
    if (fs.existsSync(LOG_PATH)) fs.unlinkSync(LOG_PATH);
    return { ok: true };
  }

  /**
   * Extract preference signals from corrections.
   * Returns: { patterns: [{ before, after, count }] }
   */
  preferences() {
    if (!fs.existsSync(LOG_PATH)) return { patterns: [] };
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    const counts = new Map();
    for (const l of lines) {
      try {
        const e = JSON.parse(l);
        if (e.type === 'correction' && e.before && e.after) {
          const key = `${e.before}→${e.after}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      } catch {}
    }
    const patterns = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([k, v]) => {
        const [before, after] = k.split('→');
        return { before, after, count: v };
      });
    return { patterns };
  }
}

module.exports = { Telemetry, LOG_PATH, POCKET_DIR };
