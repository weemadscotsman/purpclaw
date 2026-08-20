'use strict';
/**
 * lib/memory-config.js — the engine room behind Settings → Memory.
 *
 * Every knob here is read at a real call site. If a setting cannot change what
 * the runtime does, it does not belong in this file: a settings page full of
 * switches wired to nothing is worse than no settings page, because it lies.
 *
 * The distinction that matters, and that the composer must not blur:
 *
 *   composer memory scope  — how far recall may reach FOR THIS MISSION
 *   settings memory config — how the memory system itself behaves, ALWAYS
 *
 * The seven-layer spine is persistent by default and stays alive at every
 * composer scope. `enabled: false` here is the only real off-switch, and it is
 * the operator's to throw.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');
const FILE = path.join(DATA, 'memory-config.json');

// Layers the spine knows about. Recall reads the ones enabled here AND permitted
// by the mission's scope — the narrower of the two always wins.
const ALL_LAYERS = ['episodic', 'semantic', 'procedural', 'symbolic', 'temporal', 'counterfactual', 'affective'];

const DEFAULTS = Object.freeze({
  enabled: true,                 // master switch for recall AND record
  persistAcrossSessions: true,   // memory is meant to survive a restart
  layers: ALL_LAYERS.slice(),
  recall: {
    limit: 5,                    // atoms placed in front of the model per turn
    crossSession: true,
    crossProject: false,         // ask-before-bleeding between projects
    dejaVu: true,                // execution-pattern recognition
  },
  write: {
    conversations: true,
    toolOutcomes: true,
    derivedRequireEvidence: true, // inference is never silently promoted to fact
  },
  retentionDays: 0,              // 0 = keep permanently
});

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // Merge over defaults so a config written by an older build keeps working
    // rather than silently losing a subsystem.
    return {
      ...DEFAULTS, ...raw,
      layers: Array.isArray(raw.layers) ? raw.layers.filter(l => ALL_LAYERS.includes(l)) : DEFAULTS.layers,
      recall: { ...DEFAULTS.recall, ...(raw.recall || {}) },
      write:  { ...DEFAULTS.write,  ...(raw.write  || {}) },
    };
  } catch { return clone(DEFAULTS); }
}

function save(patch = {}) {
  const cur = load();
  const next = {
    ...cur, ...patch,
    layers: Array.isArray(patch.layers) ? patch.layers.filter(l => ALL_LAYERS.includes(l)) : cur.layers,
    recall: { ...cur.recall, ...(patch.recall || {}) },
    write:  { ...cur.write,  ...(patch.write  || {}) },
  };
  next.recall.limit = Math.max(0, Math.min(50, Number(next.recall.limit) || 0));
  next.retentionDays = Math.max(0, Number(next.retentionDays) || 0);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  } catch { /* read-only disk — settings stay in-process for this run */ }
  return next;
}

/**
 * Resolve config against a mission's memory scope. The narrower of the two
 * wins, so turning a layer off in Settings cannot be overridden by picking
 * Persistent in the composer, and picking Session cannot widen past Settings.
 */
function effective(scopeReach) {
  const cfg = load();
  if (!cfg.enabled) {
    return { enabled: false, layers: [], limit: 0, crossSession: false, crossProject: false, dejaVu: false };
  }
  const scopeLayers = scopeReach && Array.isArray(scopeReach.layers) ? scopeReach.layers : ALL_LAYERS;
  return {
    enabled: true,
    layers: cfg.layers.filter(l => scopeLayers.includes(l)),
    limit: cfg.recall.limit,
    crossSession: cfg.recall.crossSession && (scopeReach ? scopeReach.crossSession !== false : true),
    crossProject: cfg.recall.crossProject && (scopeReach ? scopeReach.crossProject !== false : true),
    dejaVu: cfg.recall.dejaVu,
    write: cfg.write,
  };
}

module.exports = { load, save, effective, DEFAULTS, ALL_LAYERS, FILE };
