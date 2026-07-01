'use strict';

/**
 * PURPCLAW Shared Action Layer — Timeline / Memory writeback
 * ===========================================================
 *
 * One source of truth for the timeline event write + memory readback.
 * Every surface (CLI, TUI, Web, Mobile) calls into here. No surface
 * bypasses this layer to write directly to lib/timeline.js or
 * lib/memory-client.js.
 *
 * The timeline writes append-only events to registry/timeline.json
 * (via lib/timeline.js). The memory writeback is the "moment" a workflow
 * outcome gets committed to the cognitive spine.
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const TIMELINE = require(path.join(ROOT, 'lib', 'timeline'));
const MEMORY = (() => {
  try { return require(path.join(ROOT, 'lib', 'memory-client')); } catch { return null; }
})();

const ACTIONS = {
  record: { description: 'Record an event in the timeline' },
  recent: { description: 'Tail the recent N timeline events' },
  patterns: { description: 'Detect repeated patterns → tradition candidates' },
  weave: { description: 'Commit a key moment to the memory matrix' },
  recall: { description: 'Query the memory matrix by intent' },
};

function run(action, options = {}) {
  const surface = options.surface || 'cli';
  const def = ACTIONS[action];
  if (!def) {
    return { ok: false, action, surface, error: `unknown action: ${action}` };
  }

  const caps = loadCapabilities();
  const cap = caps['timeline'] || {};
  if (cap[surface] === false) {
    return {
      ok: true, action, surface,
      unavailable: true,
      reason: `timeline.${action} not wired for surface=${surface}`,
    };
  }

  try {
    let result;
    if (action === 'record') {
      const { kind, payload, runId } = options;
      result = TIMELINE.append(kind || 'surface.event', payload || {}, runId);
    } else if (action === 'recent') {
      result = TIMELINE.recent(options.n || 20);
    } else if (action === 'patterns') {
      result = TIMELINE.patterns(options || {});
    } else if (action === 'weave') {
      if (!MEMORY) return { ok: false, action, surface, error: 'memory-client not loaded' };
      result = MEMORY.ingest(options);
    } else if (action === 'recall') {
      if (!MEMORY) return { ok: false, action, surface, error: 'memory-client not loaded' };
      result = MEMORY.recall(options);
    }
    return { ok: true, action, surface, result };
  } catch (e) {
    return { ok: false, action, surface, error: e.message };
  }
}

function listActions() {
  return Object.entries(ACTIONS).map(([k, v]) => ({ key: k, description: v.description }));
}

function loadCapabilities() {
  try {
    const p = path.join(ROOT, 'registry', 'surface-capabilities.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { /* fall through */ }
  return {};
}

module.exports = { run, listActions, ACTIONS };