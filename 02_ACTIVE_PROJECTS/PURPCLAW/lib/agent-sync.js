'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── configurable base dir ──────────────────────────────────────────────────────
// Defaults to ~/.purpclaw.  When used from bin/purpclaw.js pass PURP_DIR.
function mkSync(baseDir) {
  const PURP = baseDir || process.env.PURPCLAW_DIR || path.join(os.homedir(), '.purpclaw');
  const WORK = path.join(PURP, 'agent_work');

  function wdir(sub) { return path.join(WORK, sub); }

  // ── Harness lessons ─────────────────────────────────────────────────────────

  function recordLesson({
    missionId,
    task,
    subtaskId,
    domain = 'purpclaw',
    agent = 'purpclaw-cli',
    success = true,
    text = task,
    outputPreview = '',
  }) {
    const record = {
      timestamp:   new Date().toISOString(),
      source:      'purpclaw-cli',
      missionId:   missionId || `purpclaw-${Date.now()}`,
      task,
      subtaskId:   subtaskId || 'main',
      domain,
      agent,
      success,
      attempts:    1,
      text,
      outputPreview: String(outputPreview).slice(0, 500),
    };
    appendJsonl(wdir('harness_lessons.jsonl'), record);
  }

  // ── Evolution log ────────────────────────────────────────────────────────────

  function recordEvolution({ topic, status = 'completed', synthesis = '' }) {
    const record = {
      tick:       Date.now(),
      startedAt:  new Date().toISOString(),
      topic,
      status,
      synthesis,
      modelsAnswered: 1,
      memoryIngested: false,
    };
    appendJsonl(wdir('evolution-log.jsonl'), record);
  }

  // ── Pool memory ─────────────────────────────────────────────────────────────

  function recordMemory({ content, importance = 0.75 }) {
    const record = {
      timestamp:  new Date().toISOString(),
      content,
      importance,
    };
    appendJsonl(wdir('pool', 'memory.jsonl'), record);
  }

  // ── Core ───────────────────────────────────────────────────────────────────

  function appendJsonl(file, record) {
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
    } catch (e) {
      try { fs.appendFileSync(path.join(PURP, 'agent-sync-err.log'), `${new Date().toISOString()} [agent-sync] ${e.message}\n`, 'utf8'); } catch (_) {}
    }
  }

  return { recordLesson, recordEvolution, recordMemory };
}

module.exports = mkSync;
