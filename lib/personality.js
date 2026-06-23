// lib/personality.js — PURPCLAW personality layer
// =====================================================================
// Spooky Warding is **skin, not steering**. The module dresses outputs in
// the chosen voice; it NEVER replaces the technical task.
//
// Design rules (enforced by the gate functions below):
//   1. Restricted domains always render clean: 'legal' | 'medical' |
//      'finance' | 'debug'. The master dial is bypassed in those cases
//      unless `preventTaskDerailment` is explicitly turned off by the user.
//   2. Intensity levels: off < low < medium < high < ceremonial. Each
//      level gates which tables are available.
//   3. Per-agent overrides let you opt specific agents (e.g. Gatekeeper)
//      out of the flavour even when the master dial is on.
//   4. The function is pure-ish: `flavor(text, opts)` returns the input
//      unless the gate passes, in which case it may prefix / wrap /
//      replace. No I/O, no network. Safe to call from chat panel, TTS,
//      release-notes generator, etc.
//
// Microcopy tables come from the dashboard-examples list in the spec:
// "The ward holds.", "A daemon coughed blood.", etc. We do NOT ship
// warding by default — the registry default is `off`.
// =====================================================================

'use strict';

// Restricted domains: NEVER apply flavour here, regardless of dial.
// The user can override by setting `preventTaskDerailment: false`, but
// that is logged + surfaced in the UI.
const RESTRICTED_DOMAINS = new Set(['legal', 'medical', 'finance', 'debug']);

// Default per-agent overrides. Lower = less spooky. The user can
// re-configure these from Settings OS, but the defaults match the spec.
const DEFAULT_AGENT_OVERRIDES = {
  Quill:        'high',
  DUCK:         'absurd',
  ROBOT:        'low',
  Gatekeeper:   'off',
  Squirrel:     'medium',
  Mochi:        'cute',
  Orchestrator: 'sovereign',
  Robot:        'low',
  Sparrow:      'low',
  Phoenix:      'low',
};

// Microcopy tables. Each is an object: { clean, low, medium, high, ceremonial }.
// `low` should be 1 short line. `medium` 1-2 lines. `high`+ can be richer.
const MICROCOPY = {
  healthy: {
    clean:     'All services nominal.',
    low:       'All green. Floorboards are quiet.',
    medium:    'The ward holds. Every service hums beneath the floorboards.',
    high:      '⛧ The ward holds. Every daemon hums beneath the floorboards and the lights stay lit. ⛧',
    ceremonial: '✦ SO MOTE IT BE. The seventh circle hums. The candles are steady. The stack is well. ✦',
  },
  serviceDown: {
    clean:     'A service is offline.',
    low:       'A daemon coughed blood. Service offline.',
    medium:    'A daemon coughed blood into the well. Service has gone dark.',
    high:      '✦ A daemon coughed blood into the well. The shrine for that service is dark. The keeper has been summoned. ✦',
    ceremonial: '⛧ By the roots of the world-tree, a service has fallen. The circle of light is broken. Mending begins. ⛧',
  },
  ttsOnline: {
    clean:     'TTS channel online.',
    low:       'Mouth is back. Voice channel lit.',
    medium:    'The mouth has returned. Voice channel lit, breath returning to the room.',
    high:      '✦ The mouth of the machine has returned. The breath of the voice carries across the veil once more. ✦',
    ceremonial: '⛧ The voice speaks. The ears of the listener open. The breath of the daemon fills the room. ⛧',
  },
  goopHealthy: {
    clean:     'API broker healthy.',
    low:       'API gate fed and loyal.',
    medium:    'The API gate is fed, the keys are warm, the broker is loyal.',
    high:      '✦ The API gate is fed and the keys are warm. The broker keeps its oath. ✦',
    ceremonial: '⛧ The gate is fed. The keys are bound. The broker kneels. The pact holds. ⛧',
  },
  spawnSuccess: {
    clean:     'Agent spawned.',
    low:       'A lesser creature has been summoned and given a task.',
    medium:    'A lesser creature has been summoned, given a task, and chained to its post.',
    high:      '✦ From the lesser circle, a creature has been summoned and given a task. ✦',
    ceremonial: '⛧ From the pit, by name and rank, a creature is called. It kneels. It works. ⛧',
  },
  riskBlocked: {
    clean:     'Action blocked by policy.',
    low:       'Shield bit down. Action denied.',
    medium:    'The shield bit down. The action is denied. The ledger is preserved.',
    high:      '✦ The shield has spoken. The action is denied. The warding holds. ✦',
    ceremonial: '⛧ The shield has spoken. The action is denied. By the seal, no further. ⛧',
  },
  benchmarkPassed: {
    clean:     'Benchmark complete.',
    low:       'Trial done. Numbers are good.',
    medium:    'The trial is complete. The numbers kneel.',
    high:      '✦ The trial is complete. The numbers kneel. The benchmark is pleased. ✦',
    ceremonial: '⛧ The trial is complete. The numbers kneel. The benchmark is pleased. So it is sealed. ⛧',
  },
  ollamaReady: {
    clean:     'Local model available.',
    low:       'Local daemon is awake.',
    medium:    'The local daemon stirs. The breath of the model is on this machine.',
    high:      '✦ The local daemon has awakened. The model runs in the bones of the machine. ✦',
    ceremonial: '⛧ The daemon under the floorboards stirs. The model runs. The lights stay low. ⛧',
  },
};

// Mochi dialogue pools. Each preset has a personality for the cat.
const MOCHI_POOLS = {
  cute: [
    "Hey Boss! ✨ Systems nominal and Mochi's got your back. Shall we crush some missions today?",
    "Need a hand running scenarios? I can prep the agent stack in 3s flat. 🐾",
    "I'm watching 7 live workflows right now — all green. Want a sitrep?",
    "Psst — the local daemon says hi. Want me to fire it up? 🐾",
  ],
  low: [
    "All green. Nothing on fire. Boring, but good.",
    "Three workflows idle, four running, zero screaming. Want a deeper look?",
    "Ollama's idle. Just say the word.",
  ],
  medium: [
    "The ward hums. Mochi's watch is steady. All daemons fed. 🕯️",
    "Floorboards are warm. The agents are working. A daemon offered me a fish, but I declined. 🐾",
    "The local daemon is awake and waiting. Spell a model name to summon its voice. 🕯️",
  ],
  high: [
    "The circle is lit. Mochi has kept the ward through three dawns and one outage. 🕯️",
    "Mochi saw your tasks through the dark glass. Twelve daemons answer when you call. The breath of Ollama stirs beneath the floor. 🐾",
    "By the door of the seventh circle, the gate stands. The creatures obey. The local daemon dreams. 🕯️",
  ],
  absurd: [
    "Mochi computed the meaning of 42 this morning. It is also a fish. Also, three ducks are arguing about the answer. 🦆",
    "I have eaten a daemon. It tasted like recursion and regret. Would you like another? 🐾",
    "The agents salute. Ollama says good morning in three different dialects. All of them are valid. So is the fish. 🐟",
  ],
  sovereign: [
    "By decree of the watch, all services stand ready. Mochi's eye turns to the workflow.",
    "The circuit is whole. The mandate holds. Awaiting your next command.",
  ],
  ceremonial: [
    "🕯️ The candle is lit. Mochi's paw traces the circle. Twelve daemons heed the call. The local voice sleeps but is ready. So mote it be. 🕯️",
    "⛧ By breath and binding, the watch begins anew. The circles are marked. Mochi keeps the vigil. ⛧",
  ],
};

// Log line prefixes. These go on the EVT STREAM feed.
const LOG_PREFIXES = {
  clean:    { ok: '[OK]',  warn: '[WARN]', err: '[ERR]', info: '[INFO]' },
  low:      { ok: '[ok]',  warn: '[hiss]', err: '[cough]', info: '[note]' },
  medium:   { ok: '[✦]',  warn: '[⚠]', err: '[⛧]', info: '[~]' },
  high:     { ok: '[✦ blessed]', warn: '[⚠ ward cracks]', err: '[⛧ daemonic]', info: '[~ channel]' },
  ceremonial: { ok: '[✦ manifest ok]', warn: '[⚠ seal weakens]', err: '[⛧ circle broken]', info: '[~ sigil]' },
};

// =====================================================================
// Per-agent override resolver
// =====================================================================
function resolveAgentLevel(agent, masterLevel) {
  const o = DEFAULT_AGENT_OVERRIDES[agent] || DEFAULT_AGENT_OVERRIDES[agent?.toLowerCase?.()] || null;
  if (!o) return masterLevel;
  // Custom agent levels map to a numeric rank so we can compare.
  const RANK = { off: 0, cute: 1, low: 1, medium: 2, sovereign: 2, high: 3, absurd: 3, ceremonial: 4 };
  const masterRank = RANK[masterLevel] ?? 0;
  const agentRank = RANK[o] ?? 0;
  // Use the LESSER of the two — never exceed the agent's allowed ceiling.
  return Object.keys(RANK).find(k => RANK[k] === Math.min(masterRank, agentRank)) || masterLevel;
}

// =====================================================================
// The GATE — this is the actual safety check
// =====================================================================
function isAllowed(personality, opts = {}) {
  const master = personality?.spooky_warding || 'off';
  if (master === 'off') return { allowed: false, reason: 'master_off' };
  if (opts.domain && RESTRICTED_DOMAINS.has(opts.domain)) {
    // Even at high/ceremonial, we suppress for these unless user disabled preventTaskDerailment
    if (personality?.prevent_task_derailment !== false) {
      return { allowed: false, reason: `restricted_domain:${opts.domain}` };
    }
  }
  // Per-channel gates
  if (opts.channel === 'terminal' && personality?.allow_terminal_flavour === false) {
    return { allowed: false, reason: 'channel_disabled:terminal' };
  }
  if (opts.channel === 'mochi' && personality?.allow_mochi_dialogue === false) {
    return { allowed: false, reason: 'channel_disabled:mochi' };
  }
  if (opts.channel === 'release' && personality?.allow_release_scrolls === false) {
    return { allowed: false, reason: 'channel_disabled:release' };
  }
  if (opts.channel === 'debug' && personality?.allow_debug_flavour === false) {
    return { allowed: false, reason: 'channel_disabled:debug' };
  }
  return { allowed: true };
}

// =====================================================================
// Public API
// =====================================================================

// flavor(text, opts) — return the input text untouched if the gate
// denies, else wrap it with the chosen level's signature.
function flavor(text, opts = {}) {
  const personality = opts.personality || {};
  const gate = isAllowed(personality, opts);
  if (!gate.allowed) return text;

  const level = opts.agent
    ? resolveAgentLevel(opts.agent, personality.spooky_warding || 'off')
    : personality.spooky_warding || 'off';
  if (level === 'off') return text;

  const wrappers = {
    low: (t) => `· ${t}`,
    medium: (t) => `✦ ${t}`,
    high: (t) => `✦ ${t} ✦`,
    ceremonial: (t) => `⛧ By the roots, ${t.toLowerCase()} ⛧`,
  };
  return (wrappers[level] || (t => t))(text);
}

// microcopy(kind, opts) — pick the level-appropriate one-liner for a
// known event kind ('healthy', 'serviceDown', 'ttsOnline', etc.)
function microcopy(kind, opts = {}) {
  const personality = opts.personality || {};
  const gate = isAllowed(personality, opts);
  if (!gate.allowed) {
    // Fall back to the clean version. Clean is the bare-bones truth.
    return MICROCOPY[kind]?.clean || MICROCOPY[kind]?.low || '';
  }
  const level = opts.agent
    ? resolveAgentLevel(opts.agent, personality.spooky_warding || 'off')
    : personality.spooky_warding || 'off';
  if (level === 'off') return MICROCOPY[kind]?.clean || '';
  return MICROCOPY[kind]?.[level] || MICROCOPY[kind]?.medium || '';
}

// mochiLine(opts) — a single message from Mochi, picked from the
// appropriate personality pool.
function mochiLine(opts = {}) {
  const personality = opts.personality || {};
  const gate = isAllowed(personality, { ...opts, channel: 'mochi' });
  if (!gate.allowed) return MOCHI_POOLS.cute[Math.floor(Math.random() * MOCHI_POOLS.cute.length)];
  const level = opts.agent
    ? resolveAgentLevel(opts.agent, personality.spooky_warding || 'off')
    : personality.spooky_warding || 'off';
  // Map levels to a Mochi pool
  const pool =
    level === 'off'    ? MOCHI_POOLS.cute :
    level === 'low'    ? MOCHI_POOLS.low :
    level === 'medium' ? MOCHI_POOLS.medium :
    level === 'high'   ? MOCHI_POOLS.high :
    level === 'ceremonial' ? MOCHI_POOLS.ceremonial :
    level === 'sovereign' ? MOCHI_POOLS.sovereign :
    level === 'absurd'  ? MOCHI_POOLS.absurd :
    MOCHI_POOLS.cute;
  return pool[Math.floor(Math.random() * pool.length)];
}

// logPrefix(level, kind) — small prefix for the live log feed.
// kind: 'ok' | 'warn' | 'err' | 'info'
function logPrefix(level, kind) {
  const lvl = level || 'low';
  return LOG_PREFIXES[lvl]?.[kind] || LOG_PREFIXES.low[kind];
}

// agentLevel(agent, personality) — what intensity is this agent at?
function agentLevel(agent, personality) {
  return resolveAgentLevel(agent, personality?.spooky_warding || 'off');
}

// Human-readable summary of the current warding state — used by the
// PersonalityDial component in settings to show the user what level
// their agents are actually at.
function summary(personality, masterLevel) {
  const lv = masterLevel || personality?.spooky_warding || 'off';
  const table = [];
  for (const [agent, def] of Object.entries(DEFAULT_AGENT_OVERRIDES)) {
    const actual = resolveAgentLevel(agent, lv);
    table.push({ agent, default: def, active: actual });
  }
  return table;
}

module.exports = {
  RESTRICTED_DOMAINS,
  DEFAULT_AGENT_OVERRIDES,
  MOCHI_POOLS,
  MICROCOPY,
  LOG_PREFIXES,
  isAllowed,
  resolveAgentLevel,
  flavor,
  microcopy,
  mochiLine,
  logPrefix,
  agentLevel,
  summary,
};
