/**
 * PURPCLAW Memory Confidence & Erosion Engine
 *
 * THE EROSION DOCTRINE:
 * Memory should not be perfect.
 * Records should decay.
 * Confidence should be tracked.
 * Contradictions should be allowed.
 *
 * Because culture is built from the bits we keep,
 * the bits we lose,
 * and the bits we fill in with stories.
 *
 * Cold Case Protocol:
 * When confidence drops below 20%, the memory becomes a cold case.
 * Agents can still reference it. They just can't agree on what happened.
 * That's not a bug. That's the feature.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const ROOT = require('./studio-constants').ROOT;

/** Default world state for erosion calculations */
const DEFAULT_WORLD = {
  build_health: 100,
  council_mood: 'NORMAL',
  provider_latency: 'NORMAL',
  goose_energy: 'NORMAL',
  smith_alert_level: 'LOW',
};

/** Erosion rates per hour (fraction of confidence lost per hour) */
const BASE_DECAY_RATE = 0.0015; // ~1% per day (24h)

/** Emotionally charged events lose confidence 40% more slowly */
const EMOTIONAL_DECAY_MULTIPLIER = 0.6;

/** If more than 3 agents disagree, the memory fragments faster */
const FRAGMENTATION_DECAY_MULTIPLIER = 1.5;

/** Cold case threshold */
const COLD_CASE_THRESHOLD = 0.20;

/** Load the memory store */
function loadStore() {
  const MEMORY_FILE = path.join(ROOT, 'registry', 'meeting-memories.json');
  try {
    if (!fs.existsSync(MEMORY_FILE)) return { memories: [] };
    const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return { memories: data };
    return data;
  } catch (e) {
    return { memories: [] };
  }
}

/** Save the memory store */
function saveStore(store) {
  const MEMORY_FILE = path.join(ROOT, 'registry', 'meeting-memories.json');
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Compute eroded confidence for a memory entry.
 * @param {object} memory - Memory entry from meeting-memories.json
 * @param {object} world - World state (optional, for emotional context)
 * @returns {number} Eroded confidence 0.0–1.0
 */
function erode(memory, world) {
  if (!memory) return 0;
  const base = memory.confidence || memory.confidence_initial || 0.95;
  const ageHours = memory._age_hours ||
    ((Date.now() - new Date(memory.timestamp).getTime()) / (1000 * 60 * 60));

  const emotional = memory.is_funny || memory.mood_shift || memory.is_important;
  const emotionallyCharged = emotional ? EMOTIONAL_DECAY_MULTIPLIER : 1.0;
  const fragmented = (memory.conflicting_accounts || 0) > 3 ? FRAGMENTATION_DECAY_MULTIPLIER : 1.0;

  const rate = BASE_DECAY_RATE * emotionallyCharged * fragmented;
  const eroded = Math.max(0, base - (ageHours * rate));
  return Math.round(eroded * 1000) / 1000; // 3 decimal precision
}

/**
 * Update _age_hours and _eroded_confidence for all memories.
 * Call this on load or via a daily cron.
 */
function computeErosion() {
  const store = loadStore();
  let changed = false;
  for (const m of store.memories) {
    const eroded = erode(m);
    if (m._eroded_confidence !== eroded) {
      m._eroded_confidence = eroded;
      m._age_hours = (Date.now() - new Date(m.timestamp).getTime()) / (1000 * 60 * 60);
      changed = true;
    }
  }
  if (changed) saveStore(store);
  return store;
}

/**
 * Record a new memory with confidence metadata.
 * Called after every Studio session ends.
 *
 * @param {object} session - Session summary from Studio.endSession()
 * @param {object} opts
 *   confidence_initial: starting confidence (default 0.95)
 *   is_funny: emotional event (decays slower)
 *   is_important: emotionally significant
 *   mood_shift: emotional event
 *   tags: string[] for cold-case queries
 * @returns {object} The memory entry as stored
 */
function recordMemory(session, opts) {
  opts = opts || {};
  const store = loadStore();

  const memory = {
    session_id: session.id || session.session_id,
    timestamp: session.timestamp || new Date().toISOString(),
    mode: session.mode,
    topic: session.topic || null,
    decision: session.decision || null,
    attendees: session.attendees || 0,
    turns: session.turns || 0,

    // Confidence system
    confidence_initial: opts.confidence_initial || 0.95,
    confidence: opts.confidence_initial || 0.95,
    _eroded_confidence: opts.confidence_initial || 0.95,
    _age_hours: 0,

    // Erosion metadata
    is_funny: opts.is_funny || session.funny_moment ? true : false,
    is_important: opts.is_important || false,
    mood_shift: opts.mood_shift || session.mood_shift || null,

    // Cold case / fragmentation
    conflicting_accounts: 0,
    fragmented: false,
    cold_case: false,

    // Cold case protocol fields
    touchpoints: session.touchpoints || [],
    quote: session.quote || null,
    summary: session.summary || null,
    duck_observation: session.duck_observation || null,
    tags: opts.tags || [],

    // Historians can annotate
    annotations: [],
    versions: [],
  };

  store.memories.push(memory);
  saveStore(store);
  return memory;
}

/**
 * Get memories filtered by eroded confidence threshold.
 *
 * @param {object} opts
 *   threshold: minimum eroded confidence (0–1, default 0)
 *   above: true = get memories ABOVE threshold (reliable)
 *          false = get memories BELOW threshold (cold cases)
 *   limit: max results (default 20)
 *   tag: filter by tag
 *   world: world state for erosion calc
 * @returns {object[]} filtered memories with eroded_confidence attached
 */
function getMemories(opts) {
  opts = opts || {};
  const world = opts.world || DEFAULT_WORLD;
  const store = computeErosion();

  let results = store.memories.map(function(m) {
    return Object.assign({}, m, { _eroded_confidence: erode(m, world) });
  });

  const threshold = opts.threshold !== undefined ? opts.threshold : 0;
  if (opts.above !== undefined) {
    results = results.filter(function(m) {
      return opts.above ? m._eroded_confidence >= threshold : m._eroded_confidence < threshold;
    });
  }

  if (opts.tag) {
    results = results.filter(function(m) {
      return (m.tags || []).includes(opts.tag);
    });
  }

  results.sort(function(a, b) { return b.timestamp > a.timestamp ? 1 : -1; });
  if (opts.limit) results = results.slice(0, opts.limit);

  return results;
}

/**
 * Get the cold case ledger — all memories below COLD_CASE_THRESHOLD.
 * These are the organisation's open mysteries.
 */
function getColdCases(opts) {
  return getMemories(Object.assign({}, opts, {
    above: false,
    threshold: COLD_CASE_THRESHOLD,
  }));
}

/**
 * Add a conflicting account from a specific agent.
 * When a second agent remembers the event differently, call this.
 *
 * @param {string} sessionId
 * @param {string} agentId
 * @param {string} accountText - what this agent remembers
 * @param {number} confidence_override - how confident this agent is (0–1)
 */
function addConflictingAccount(sessionId, agentId, accountText, confidence_override) {
  const store = loadStore();
  const memory = store.memories.find(function(m) { return m.session_id === sessionId; });
  if (!memory) return null;

  if (!memory.conflicting_accounts) memory.conflicting_accounts = 0;
  memory.conflicting_accounts += 1;

  memory.versions = memory.versions || [];
  memory.versions.push({
    agent: agentId,
    account: accountText,
    confidence: confidence_override !== undefined ? confidence_override : 0.5,
    timestamp: new Date().toISOString(),
  });

  // Fragment threshold
  if (memory.conflicting_accounts >= 2) {
    memory.fragmented = true;
    memory.cold_case = memory.conflicting_accounts >= 3;
  }

  // Re-erosion after fragmentation
  memory._eroded_confidence = erode(memory);
  saveStore(store);
  return memory;
}

/**
 * Add an annotation (historian's note) to a memory.
 */
function annotateMemory(sessionId, annotator, note) {
  const store = loadStore();
  const memory = store.memories.find(function(m) { return m.session_id === sessionId; });
  if (!memory) return null;
  memory.annotations = memory.annotations || [];
  memory.annotations.push({
    annotator: annotator,
    note: note,
    timestamp: new Date().toISOString(),
  });
  saveStore(store);
  return memory;
}

/**
 * Get a confidence report for an agent's perspective on a memory.
 * Agents have different reliability profiles.
 */
function getAgentConfidenceProfile(agentId) {
  // Agents with high infrastructure responsibility have better recall for technical events
  const profiles = {
    hermes: { technical: 0.95, emotional: 0.7, social: 0.6 },
    memory: { technical: 0.98, emotional: 0.98, social: 0.98 },
    smith: { technical: 0.97, emotional: 0.5, social: 0.4 },
    goose: { technical: 0.6, emotional: 0.95, social: 0.95 },
    maverick: { technical: 0.85, emotional: 0.7, social: 0.8 },
    phoenix: { technical: 0.7, emotional: 0.85, social: 0.9 },
    finance: { technical: 0.9, emotional: 0.6, social: 0.7 },
  };
  return profiles[agentId] || { technical: 0.7, emotional: 0.7, social: 0.7 };
}

/**
 * Check if a memory is contested — multiple agents disagree.
 */
function isContested(sessionId) {
  const store = loadStore();
  const memory = store.memories.find(function(m) { return m.session_id === sessionId; });
  if (!memory) return false;
  return (memory.conflicting_accounts || 0) >= 2;
}

/**
 * Format a memory for CLI display — shows confidence and erosion state.
 */
function formatMemory(memory, world) {
  const eroded = erode(memory, world);
  const state = eroded >= 0.75 ? 'solid' : eroded >= 0.40 ? 'weathered' : eroded >= 0.20 ? 'faded' : 'COLD CASE';
  const stateEmoji = eroded >= 0.75 ? '🟢' : eroded >= 0.40 ? '🟡' : eroded >= 0.20 ? '🟠' : '💀';

  const lines = [];
  lines.push('');
  lines.push('📋 ' + (memory.topic || memory.mode || 'memory') + ' [' + stateEmoji + ' ' + state + ' ' + Math.round(eroded * 100) + '%]');
  if (memory.quote && memory.quote.text) {
    lines.push('  💬 "' + memory.quote.text + '" — ' + (memory.quote.agent_name || memory.quote.agent));
  }
  if (memory.summary) lines.push('  ' + memory.summary.substring(0, 120));
  if (memory.funny_moment) lines.push('  😂 ' + memory.funny_moment);
  if (memory.fragmented) lines.push('  ⚠ Fragmented — ' + (memory.conflicting_accounts || 0) + ' conflicting accounts');
  if (memory.cold_case) lines.push('  💀 COLD CASE — nobody agrees on what happened');
  if (memory.annotations && memory.annotations.length) {
    lines.push('  📝 ' + memory.annotations.length + ' historian annotation(s)');
  }
  if (memory.is_funny) lines.push('  [emotionally charged — slow decay]');
  const ageDays = Math.round((memory._age_hours || 0) / 24 * 10) / 10;
  lines.push('  age: ' + ageDays + 'd | attendees: ' + memory.attendees);
  return lines.join('\n');
}

/**
 * Generate a confidence report for all memories.
 */
function confidenceReport(opts) {
  const world = opts && opts.world || DEFAULT_WORLD;
  const store = computeErosion();
  const all = store.memories.map(function(m) {
    return Object.assign({}, m, { _eroded_confidence: erode(m, world) });
  });

  const solid = all.filter(function(m) { return m._eroded_confidence >= 0.75; });
  const weathered = all.filter(function(m) { return m._eroded_confidence >= 0.40 && m._eroded_confidence < 0.75; });
  const faded = all.filter(function(m) { return m._eroded_confidence >= 0.20 && m._eroded_confidence < 0.40; });
  const cold = all.filter(function(m) { return m._eroded_confidence < 0.20; });
  const fragmented = all.filter(function(m) { return m.fragmented; });

  return {
    total: all.length,
    solid: solid.length,
    weathered: weathered.length,
    faded: faded.length,
    cold_cases: cold.length,
    fragmented: fragmented.length,
    avg_confidence: Math.round(all.reduce(function(s, m) { return s + m._eroded_confidence; }, 0) / all.length * 100),
  };
}

module.exports = {
  erode,
  computeErosion,
  recordMemory,
  getMemories,
  getColdCases,
  addConflictingAccount,
  annotateMemory,
  getAgentConfidenceProfile,
  isContested,
  formatMemory,
  confidenceReport,
  COLD_CASE_THRESHOLD,
};
