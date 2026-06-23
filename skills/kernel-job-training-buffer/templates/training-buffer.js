'use strict';

/**
 * training-buffer.js — record every kernel job as a training trajectory.
 *
 * Copy this file to your stack's `lib/training-buffer.js` and require it
 * from the kernel's finishJob() method. The buffer is best-effort and
 * never throws — a disk failure here must not break the runtime.
 *
 *   const { TrainingBuffer } = require('./training-buffer');
 *   const buf = new TrainingBuffer();
 *   buf.record(kernelJob, { source: 'kernel' });
 *
 *   const { file, count } = buf.export({ format: 'chatml' });
 *
 * Disable with `PURPCLAW_TRAINING_DISABLED=1` in .env. Configure the
 * output directory with `PURPCLAW_TRAINING_DIR` (default E:/training).
 */

const fs   = require('fs');
const path = require('path');

const DEFAULT_BASE = process.env.PURPCLAW_TRAINING_DIR || 'E:/training';

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

class TrainingBuffer {
  constructor(opts = {}) {
    this.baseDir   = opts.baseDir || DEFAULT_BASE;
    this.enabled   = process.env.PURPCLAW_TRAINING_DISABLED !== '1' && opts.enabled !== false;
    this.dailyDir  = path.join(this.baseDir, 'raw');
    this.exportDir = path.join(this.baseDir, 'exports');
    this.statsFile = path.join(this.baseDir, 'stats.json');
    this.stats     = this._loadStats();
    ensureDir(this.dailyDir);
    ensureDir(this.exportDir);
  }

  _loadStats() {
    try {
      const raw = fs.readFileSync(this.statsFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { totalRecorded: 0, totalSuccess: 0, totalFailed: 0, totalExported: 0, lastRecordTs: null, lastExportTs: null };
    }
  }

  _saveStats() {
    try { fs.writeFileSync(this.statsFile, JSON.stringify(this.stats, null, 2)); } catch {}
  }

  /**
   * Record a single job. `job` is the kernel job object.
   * `opts.reward` overrides the auto-derived reward.
   */
  record(job, opts = {}) {
    if (!this.enabled) return { recorded: false, reason: 'disabled' };
    if (!job || !job.id) return { recorded: false, reason: 'no-job' };

    const ts = new Date().toISOString();
    const finishedAt = job.finishedAt ? new Date(job.finishedAt).getTime() : null;
    const acceptedAt  = job.createdAt  ? new Date(job.createdAt).getTime()  : null;
    const durationMs  = (finishedAt && acceptedAt) ? finishedAt - acceptedAt : (opts.durationMs || null);

    let reward = opts.reward;
    if (typeof reward !== 'number') {
      reward = (job.state === 'completed') ? 1.0
             : (job.state === 'failed' || job.state === 'blocked') ? 0.0
             : 0.5;
    }

    const record = {
      ts,
      job: {
        id:       job.id,
        route:    job.route,
        mode:     job.mode,
        source:   job.source,
        goal:     job.goal,
        state:    job.state,
        tags:     job.tags || [],
      },
      trajectory: Array.isArray(job.events) ? job.events : (job.trace || []),
      input:  job.goal || job.input || '',
      output: job.finalReport || job.synthesis || job.error || '',
      reward,
      skills: (job.tags || []).filter(t => typeof t === 'string'),
      durationMs,
      source: opts.source || job.source || 'unknown',
    };

    try {
      const file = path.join(this.dailyDir, `${todayStamp()}.ndjson`);
      fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
      this.stats.totalRecorded += 1;
      if (reward >= 1.0) this.stats.totalSuccess += 1;
      else if (reward === 0.0) this.stats.totalFailed += 1;
      this.stats.lastRecordTs = ts;
      this._saveStats();
      return { recorded: true, file, reward };
    } catch (e) {
      console.error('[training-buffer] write failed:', e.message);
      return { recorded: false, reason: 'write-failed', error: e.message };
    }
  }

  /** Record many jobs in one call (used by backfill). */
  recordMany(jobs) {
    const results = [];
    for (const job of jobs) results.push(this.record(job));
    return results;
  }

  /** List all daily NDJSON files, oldest first. */
  listDays() {
    try {
      return fs.readdirSync(this.dailyDir)
        .filter(f => f.endsWith('.ndjson'))
        .sort()
        .map(f => path.join(this.dailyDir, f));
    } catch { return []; }
  }

  /** Read all records, optionally filtered by date range. */
  readAll({ since, until } = {}) {
    const out = [];
    for (const file of this.listDays()) {
      const day = path.basename(file, '.ndjson');
      if (since && day < since) continue;
      if (until && day > until) continue;
      try {
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try { out.push(JSON.parse(line)); } catch {}
        }
      } catch (e) {
        console.error(`[training-buffer] read failed for ${file}:`, e.message);
      }
    }
    return out;
  }

  /**
   * Export records in the requested format.
   *   format: 'jsonl' | 'json' | 'sharegpt' | 'chatml'
   * Returns { file, count, format } or { error }.
   */
  export({ format = 'jsonl', since, until } = {}) {
    const records = this.readAll({ since, until });
    if (!records.length) return { error: 'no-records' };

    // The system prompt is in the EXPORT, not the record. Changing the
    // system prompt is a one-line edit; baking it into the supervision
    // data would force a retrain.
    const SYSTEM_PROMPT = 'You are Purpclaw Mission Control. You execute work via kernel jobs, swarm missions, and group research. Be terse, accurate, and report outcomes concretely.';

    let outFile, body;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    switch (format) {
      case 'jsonl':
        outFile = path.join(this.exportDir, `baseline-${stamp}.jsonl`);
        body = records.map(r => JSON.stringify(r)).join('\n');
        break;
      case 'json':
        outFile = path.join(this.exportDir, `baseline-${stamp}.json`);
        body = JSON.stringify(records, null, 2);
        break;
      case 'sharegpt': {
        outFile = path.join(this.exportDir, `baseline-${stamp}.sharegpt.json`);
        const convs = records.filter(r => r.output).map(r => ({
          conversations: [
            { from: 'system', value: SYSTEM_PROMPT },
            { from: 'human',  value: r.input || '' },
            { from: 'gpt',    value: r.output || '' },
          ],
        }));
        body = JSON.stringify(convs, null, 2);
        break;
      }
      case 'chatml': {
        outFile = path.join(this.exportDir, `baseline-${stamp}.chatml.jsonl`);
        body = records.filter(r => r.output).map(r => JSON.stringify({
          messages: [
            { role: 'system',    content: SYSTEM_PROMPT },
            { role: 'user',      content: r.input || '' },
            { role: 'assistant', content: r.output || '' },
          ],
        })).join('\n');
        break;
      }
      default:
        return { error: `unknown-format: ${format}` };
    }

    try {
      fs.writeFileSync(outFile, body, 'utf8');
      this.stats.totalExported += 1;
      this.stats.lastExportTs = new Date().toISOString();
      this._saveStats();
      return { file: outFile, count: records.length, format };
    } catch (e) {
      return { error: e.message };
    }
  }

  /**
   * Aggregate stats from the on-disk buffer.
   * (Named `summary` to avoid colliding with the `this.stats` property.)
   */
  summary() {
    const records = this.readAll();
    if (!records.length) return { total: 0, success: 0, failed: 0, partial: 0, avgReward: 0, byRoute: {}, bySkill: {} };
    const byRoute = {}, bySkill = {};
    let totalReward = 0;
    for (const r of records) {
      const route = r.job?.route || 'unknown';
      const ok = r.reward >= 1.0;
      const fail = r.reward === 0.0;
      byRoute[route] = byRoute[route] || { total: 0, success: 0, failed: 0 };
      byRoute[route].total += 1;
      if (ok) byRoute[route].success += 1;
      else if (fail) byRoute[route].failed += 1;
      for (const s of r.skills || []) bySkill[s] = (bySkill[s] || 0) + 1;
      totalReward += r.reward;
    }
    return {
      total: records.length,
      success: records.filter(r => r.reward >= 1.0).length,
      failed: records.filter(r => r.reward === 0.0).length,
      partial: records.filter(r => r.reward > 0 && r.reward < 1.0).length,
      avgReward: Number((totalReward / records.length).toFixed(4)),
      byRoute,
      bySkill,
    };
  }
}

module.exports = { TrainingBuffer, DEFAULT_BASE };
