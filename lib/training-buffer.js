'use strict';

/**
 * purpclaw training buffer — record every kernel job as a training trajectory
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Why: the strategic plan calls for a 24/7 self-training loop. Before that
 * can run, every job's trajectory (input → state changes → final report)
 * needs to be persisted to disk in a format fine-tuning tools can ingest.
 *
 * What this writes:
 *   <baseDir>/raw/YYYY-MM-DD.ndjson         — every job, one JSON per line
 *   <baseDir>/exports/baseline.jsonl       — flat JSONL of all trajectories
 *   <baseDir>/exports/baseline.json        — same data, array form
 *   <baseDir>/exports/baseline.sharegpt.json — ShareGPT format (for axolotl/qlora)
 *   <baseDir>/exports/baseline.chatml.jsonl  — ChatML format (for unsloth/raw)
 *   <baseDir>/stats.json                    — running counters
 *
 * The baseDir is opt-in (default E:/training/). Set PURPCLAW_TRAINING_DIR in
 * .env to override. The buffer is ALWAYS WRITES, NEVER THROWS — a write
 * failure logs to stderr but does not break the calling job.
 *
 * Schema per record:
 *   {
 *     ts: <iso>,                       // when recorded
 *     job: { id, route, mode, source, goal, state, ... },  // the kernel job
 *     trajectory: [
 *       { stage, at, type, message, ... }   // the addEvent() history
 *     ],
 *     input:  <string>,                 // the original message / goal
 *     output: <string>,                 // finalReport or failure message
 *     reward: <number 0..1>,            // 1.0 = success, 0.0 = failed, fraction = partial
 *     skills: <string[]>,              // tags from the job (e.g. 'swarm', 'research')
 *     durationMs: <number>,            // wall-clock from accepted → completed/failed
 *     source: <string>,                // 'api-kernel' | 'orchestrator' | 'swarm' | etc.
 *   }
 */

const fs   = require('fs');
const path = require('path');
const { privacyPromptBlock, privacyMetadata } = require('./runtime/privacy-policy');

const DEFAULT_BASE = process.env.PURPCLAW_TRAINING_DIR || 'E:/training';
const TRAINING_SYSTEM_PROMPT = [
  'You are Purpclaw Mission Control. You execute work via kernel jobs, swarm missions, and group research. Be terse, accurate, and report outcomes concretely.',
  privacyPromptBlock(),
].join('\n\n');

function todayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
   * Record a single job. Safe to call from any code path — never throws.
   * `job` is the kernel job object; reward defaults to 1.0 / 0.0 from state.
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
      privacy: privacyMetadata(),
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
      // Do not throw — the job must not fail because the buffer failed.
      console.error('[training-buffer] write failed:', e.message);
      return { recorded: false, reason: 'write-failed', error: e.message };
    }
  }

  /**
   * Record many jobs in one call. Used for back-fill from the kernel jobs list.
   */
  recordMany(jobs) {
    const results = [];
    for (const job of jobs) results.push(this.record(job));
    return results;
  }

  /**
   * List all daily NDJSON files, oldest first.
   */
  listDays() {
    try {
      return fs.readdirSync(this.dailyDir)
        .filter(f => f.endsWith('.ndjson'))
        .sort()
        .map(f => path.join(this.dailyDir, f));
    } catch { return []; }
  }

  /**
   * Read all records, optionally filtered by date range. Returns array of records.
   */
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
   * Export all records in the requested format.
   *   format: 'jsonl' | 'json' | 'sharegpt' | 'chatml'
   * Returns { file, count } or { error }.
   */
  export({ format = 'jsonl', since, until } = {}) {
    const records = this.readAll({ since, until });
    if (!records.length) return { error: 'no-records' };

    let outFile = null, body = null;
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
        // ShareGPT format: { conversations: [ { from: 'human'|'gpt'|'system', value: '...' } ] }
        outFile = path.join(this.exportDir, `baseline-${stamp}.sharegpt.json`);
        const convs = records.filter(r => r.output).map(r => ({
          conversations: [
            { from: 'system', value: TRAINING_SYSTEM_PROMPT },
            { from: 'human',  value: r.input || '' },
            { from: 'gpt',    value: r.output || '' },
          ],
        }));
        body = JSON.stringify(convs, null, 2);
        break;
      }
      case 'chatml': {
        // ChatML: { role: 'system'|'user'|'assistant', content: '...' } per line
        outFile = path.join(this.exportDir, `baseline-${stamp}.chatml.jsonl`);
        body = records.filter(r => r.output).map(r => JSON.stringify({
          messages: [
            { role: 'system',    content: TRAINING_SYSTEM_PROMPT },
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
   * Compute reward stats from the on-disk buffer. Useful for `purpclaw training stats`.
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
      for (const s of r.skills || []) {
        bySkill[s] = (bySkill[s] || 0) + 1;
      }
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
