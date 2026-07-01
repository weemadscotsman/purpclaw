'use strict';

const fs = require('fs');
const path = require('path');
const { Timeline } = require('./timeline');

const ROOT = path.join(__dirname, '..');

/**
 * lib/studio.js — PURPCLAW Studio Engine v0.1
 * ===========================================
 * Broadcast coordination engine for PURPCLAW.
 *
 * Modes:
 *   council   — Engineering decisions. Summoned dynamically per problem.
 *   radio     — Background banter. Freeform. All agents available.
 *   arena     — Formal debates. Two agents. Winner declared.
 *   vent      — One agent rants. No criticism.
 *   emergency — Crisis mode. Fastest first. Interrupt everything.
 *   brainstorm — Pure ideas. No criticism for 15 minutes.
 *   interview — One agent interviewed by another.
 *   news      — Weatherman presents project news.
 *   commentary — Council reacts to git commits live.
 *   directors_cut — Director injects incidents. Council reacts.
 *
 * World State:
 *   Provider latency, build health, memory pressure, duplicated UI,
 *   funding, release window, active incidents, council mood,
 *   goose_energy, smith_alert_level, weatherman_forecast
 *
 * The Duck observes every session. The Duck never speaks first.
 */

const MODES_FILE = path.join(ROOT, 'registry', 'studio-modes.json');
const STATE_FILE = path.join(ROOT, 'registry', 'studio-world-state.json');
const LOG_FILE   = path.join(ROOT, 'registry', 'studio-session-log.json');
const MEMORY_FILE = path.join(ROOT, 'registry', 'studio-memory.json');

function timelineRecord(event) {
  try {
    return new Timeline().record(event);
  } catch (_) {
    return null;
  }
}

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

const DEFAULT_WORLD = {
  provider_latency: 'NORMAL',
  provider_name: null,
  build_health: 100,
  memory_pressure: 'LOW',
  duplicated_ui: 'NONE',
  funding: 'GOOD',
  release_window_days: null,
  active_incidents: [],
  last_commit: null,
  last_commit_message: null,
  council_mood: 'NEUTRAL',
  goose_energy: 'HIGH',
  smith_alert_level: 'GREEN',
  weatherman_forecast: 'STABLE',
};

const DUCK_OBSERVATIONS = [
  'the duck watches',
  'the duck takes note',
  'the duck is listening',
  'the duck has no opinion',
  'the duck remains unconcerned',
  'the duck is concerned',
  'the duck approves',
  'the duck is skeptical',
  'the duck remembers this',
  'the duck has seen worse',
  'the duck nods once',
  'the duck says nothing',
  '🦆',
];

const DUCK_SENIOR_OBSERVATIONS = [
  'the duck has seniority opinions',
  'the duck remembers the budget vote of Q3',
  'the duck has seen three architecture pivots',
  'the duck was here before the cognitive spine',
];

const INFLUENCE_TIERS = [
  { name: 'legendary',   symbol: '★★★★★', threshold: 20 },
  { name: 'dominant',   symbol: '★★★★☆', threshold: 14 },
  { name: 'influential',symbol: '★★★☆☆', threshold: 8 },
  { name: 'established',symbol: '★★☆☆☆', threshold: 4 },
  { name: 'emerging',  symbol: '★☆☆☆☆', threshold: 1 },
  { name: 'observer',   symbol: '☆☆☆☆☆', threshold: 0 },
];

/** Convert a raw score to an influence tier */
function influenceTier(score) {
  return INFLUENCE_TIERS.find(t => score >= t.threshold) || INFLUENCE_TIERS[INFLUENCE_TIERS.length - 1];
}

/** The Duck's comment for this session */
function duckObservation(session, worldState) {
  // Mood-driven observations
  if (worldState.council_mood === 'CRISIS') {
    return 'the duck is not panicking. the duck has seen worse.';
  }
  if (worldState.smith_alert_level === 'RED') {
    return 'the duck is concerned about the security posture.';
  }
  if (worldState.goose_energy === 'UNBOUND') {
    return 'the duck is nervous about the goose energy levels.';
  }
  if (worldState.weatherman_forecast === 'STORM') {
    return 'the duck has weathered storms before.';
  }
  if (session.turns >= 20) {
    return 'the duck has been here a while. the duck is patient.';
  }
  if (session.participants.length >= 8) {
    return 'the duck notes the full council is present.';
  }
  return DUCK_OBSERVATIONS[Math.floor(Math.random() * DUCK_OBSERVATIONS.length)];
}

/**
 * Director incidents — stress-test scenarios
 */
const DIRECTOR_INCIDENTS = {
  'github_outage': {
    id: 'github_outage',
    label: 'GitHub is down',
    world_delta: { active_incidents: '+push: GitHub outage — cannot push code' },
    impact: 'blocking',
    severity: 'HIGH',
  },
  'nvidia_offline': {
    id: 'nvidia_offline',
    label: 'NVIDIA API offline',
    world_delta: { provider_name: 'nvidia', provider_latency: 'CRITICAL' },
    impact: 'model calls failing',
    severity: 'HIGH',
  },
  'budget_cut': {
    id: 'budget_cut',
    label: 'Budget cut 40%',
    world_delta: { funding: 'TIGHT' },
    impact: 'API costs must drop',
    severity: 'MEDIUM',
  },
  'deadline_moved': {
    id: 'deadline_moved',
    label: 'Deadline moved 3 days earlier',
    world_delta: { release_window_days: '-3' },
    impact: 'scope must shrink',
    severity: 'MEDIUM',
  },
  'surprise_feature': {
    id: 'surprise_feature',
    label: 'Surprise feature request from the top',
    world_delta: { release_window_days: '-2', council_mood: 'TENSE' },
    impact: 'scope creep',
    severity: 'MEDIUM',
  },
  'developer_exhausted': {
    id: 'developer_exhausted',
    label: 'Developer only slept 2 hours',
    world_delta: { goose_energy: 'UNBOUND', council_mood: 'TENSE' },
    impact: 'judgement may be impaired',
    severity: 'LOW',
  },
  'security_incident': {
    id: 'security_incident',
    label: 'Potential security breach detected',
    world_delta: { smith_alert_level: 'RED', council_mood: 'CRISIS' },
    impact: 'incident response required',
    severity: 'HIGH',
  },
  'build_broken': {
    id: 'build_broken',
    label: 'Build broken on main',
    world_delta: { build_health: 0, council_mood: 'CRISIS' },
    impact: 'deployment blocked',
    severity: 'HIGH',
  },
  'duplicated_ui_found': {
    id: 'duplicated_ui_found',
    label: 'Duplicate UI found in three places',
    world_delta: { duplicated_ui: 'SEVERE', council_mood: 'TENSE' },
    impact: 'maintenance burden',
    severity: 'LOW',
  },
  'new_provider_available': {
    id: 'new_provider_available',
    label: 'New model provider just released',
    world_delta: { weatherman_forecast: 'CHANGING' },
    impact: 'opportunity to evaluate',
    severity: 'LOW',
  },
};

/** Broadcast format templates per mode */
const MODE_BROADCAST = {
  council: {
    header: (topic) => `🎙️ COUNCIL MODE — "${topic}"`,
    footer: (session) => `${DUCK_SENIOR_OBSERVATIONS[session.turns % DUCK_SENIOR_OBSERVATIONS.length]}. the duck remembers the architecture decisions of ${new Date().getFullYear()}.`,
    style: 'structured',
  },
  radio: {
    header: () => `📻 RADIO MODE — project chatter`,
    footer: (session) => `📻 end of broadcast. ${session.turns} turns. ${duckObservation(session, session.world || {})}`,
    style: 'freeform',
  },
  arena: {
    header: (topic) => `🥊 ARENA MODE — "${topic}"`,
    footer: (session) => {
      const winner = session.arena_winner || null;
      if (winner) return `🥊 WINNER: ${winner}. the duck awards no points. the duck is not a judge.`;
      return `🥊 Draw. the duck saw it differently.`;
    },
    style: 'debate',
  },
  vent: {
    header: (speaker) => `🔥 VENT MODE — ${speaker} vents`,
    footer: () => `🔥 the duck has heard worse. the duck has heard better.`,
    style: 'monologue',
  },
  emergency: {
    header: (incident) => `🚨 EMERGENCY MODE — ${incident}`,
    footer: () => `🚨 the duck hopes this resolves. the duck will be here.`,
    style: 'fast',
  },
  brainstorm: {
    header: (topic) => `🎲 BRAINSTORM MODE — "${topic}" — no criticism allowed`,
    footer: (session) => `🎲 ${session.turns} ideas generated. the duck wrote none of them down.`,
    style: 'creative',
  },
  interview: {
    header: (interviewer, subject) => `🎭 INTERVIEW MODE — ${interviewer} interviews ${subject}`,
    footer: () => `🎭 the duck was not invited. the duck listened anyway.`,
    style: 'dialogue',
  },
  news: {
    header: () => `📰 NEWS MODE — project report`,
    footer: (session) => `📰 forecast: ${session.world?.weatherman_forecast || 'STABLE'}. the duck does not give weather reports.`,
    style: 'report',
  },
  commentary: {
    header: (commit) => `🎬 COMMENTARY MODE — reacting to: "${commit}"`,
    footer: (session) => `🎬 ${session.turns} reactions. the duck will write the commit message later.`,
    style: 'reactive',
  },
  directors_cut: {
    header: (incident) => `🎬 DIRECTOR'S CUT — INCIDENT: ${incident}`,
    footer: (session) => `🎬 director's cut complete. the council survived. ${duckObservation(session, session.world || {})}`,
    style: 'simulation',
  },
  after_hours: {
    header: () => `☕ AFTER HOURS`,
    footer: () => `☕ the office is quiet. the duck is still here.`,
    style: 'ambient',
  },
};

/** Emergency council — always these agents */
const EMERGENCY_COUNCIL = ['smith', 'guardian', 'hermes', 'neo', 'goose', 'weatherman'];

/** News mode presenters */
const NEWS_PRESENTERS = ['weatherman', 'storm'];

/**
 * Studio — the main engine class
 */
class Studio {
  constructor(opts = {}) {
    this.modes = loadJSON(MODES_FILE, { modes: {} }).modes;
    // Inject after_hours if not in modes file
    if (!this.modes.after_hours) {
      this.modes.after_hours = {
        id: 'after_hours', emoji: '☕', name: 'After Hours',
        description: 'No meetings. No agendas. No engineering. Just... the agents existing.',
        topic_required: false, participants: { mode: 'invite', min: 2, max: 8 },
        speaking_rules: { order: 'freeform', interruptions: false },
        mood: 'quiet', duration: 'untimed', output_format: 'conversation',
      };
    }
    this.world = this._loadWorld();
    this.session = null;
    this.souls = {};
    this.councilVoteEngine = null;
    this.councilProfiles = {};
    this._loadSouls();
    this._loadCouncilProfiles();
  }

  _loadSouls() {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'souls.json'), 'utf8'));
      this.souls = data.souls || {};
    } catch (_) {}
  }

  _loadCouncilProfiles() {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'council-profiles.json'), 'utf8'));
      this.councilProfiles = data.profiles || {};
    } catch (_) {}
  }

  _loadWorld() {
    const saved = loadJSON(STATE_FILE, null);
    if (saved && saved.state) return saved;
    return { schema: 'purpclaw.studio.world-state.v1', state: { ...DEFAULT_WORLD } };
  }

  saveWorld() {
    saveJSON(STATE_FILE, this.world);
  }

  /** Update world state with a delta object */
  updateWorld(delta) {
    for (const [key, val] of Object.entries(delta)) {
      if (key === 'active_incidents') {
        if (val.startsWith('+push:')) {
          const incident = val.slice(6);
          if (!this.world.state.active_incidents.includes(incident)) {
            this.world.state.active_incidents.push(incident);
          }
        } else if (val === 'clear') {
          this.world.state.active_incidents = [];
        }
      } else if (key === 'release_window_days') {
        const delta = parseInt(val, 10);
        if (!isNaN(delta)) {
          this.world.state.release_window_days = Math.max(0, (this.world.state.release_window_days || 0) + delta);
        } else {
          this.world.state.release_window_days = parseInt(val, 10) || null;
        }
      } else {
        this.world.state[key] = val;
      }
    }
    this.saveWorld();
  }

  /**
   * Begin a studio session
   * @param {string} modeId - e.g. 'council', 'radio', 'arena'
   * @param {object} opts - mode-specific options
   */
  beginSession(modeId, opts = {}) {
    const mode = this.modes[modeId];
    if (!mode) throw new Error(`Unknown mode: ${modeId}`);

    const session = {
      id: 's_' + Math.random().toString(36).slice(2, 10),
      mode: modeId,
      started_at: Date.now(),
      current_time: '00:00',
      conversation: [],
      turn_count: 0,
      topic: opts.topic || null,
      participants: [],
      world: { ...this.world.state },
      log: [],
      arena_winner: null,
      votes: [],
      director_queue: opts.incidents || [],
      mode_config: mode,
    };

    this.session = session;
    // Proxy: session.turns aliases turn_count for MODE_BROADCAST compatibility
    Object.defineProperty(session, 'turns', { get: () => session.turn_count, configurable: true });
    this._updateWorldFromSession();

    // Broadcast header
    const broadcast = MODE_BROADCAST[modeId];
    let header;
    if (modeId === 'arena') {
      header = broadcast.header(opts.topic);
    } else if (modeId === 'vent') {
      header = broadcast.header(opts.speaker);
    } else if (modeId === 'emergency') {
      header = broadcast.header(opts.incident || 'general alert');
    } else if (modeId === 'interview') {
      header = broadcast.header(opts.interviewer, opts.subject);
    } else if (modeId === 'commentary') {
      header = broadcast.header(opts.commit_message || 'new commit');
    } else if (modeId === 'directors_cut') {
      header = broadcast.header(opts.incident || 'director intervention');
    } else {
      header = broadcast.header(opts.topic);
    }

    this._log('broadcast', { type: 'header', text: header });
    timelineRecord({
      kind: 'studio.session_started',
      source: 'studio',
      title: `Studio session started: ${modeId}`,
      summary: opts.topic || header,
      location: modeId === 'after_hours' ? 'Tea Room' : 'Studio',
      subject: modeId,
      refs: { session_id: session.id },
      data: { mode: modeId, topic: opts.topic || null, world: session.world },
    });
    return session;
  }

  _updateWorldFromSession() {
    if (this.session) {
      this.session.world = { ...this.world.state };
    }
  }

  /** World state display for council/radio/news modes */
  worldStateSummary(world) {
    const s = world || this.world.state;
    const lines = [];
    lines.push('  World state:');
    if (s.provider_latency !== 'NORMAL') lines.push(`    🌍 Provider: ${s.provider_latency}${s.provider_name ? ' (' + s.provider_name + ')' : ''}`);
    if (s.build_health < 100) lines.push(`    🔧 Build: ${s.build_health}%`);
    if (s.memory_pressure !== 'LOW') lines.push(`    🧠 Memory: ${s.memory_pressure}`);
    if (s.duplicated_ui !== 'NONE') lines.push(`    🖼️  UI duplication: ${s.duplicated_ui}`);
    if (s.funding !== 'GOOD') lines.push(`    💰 Funding: ${s.funding}`);
    if (s.release_window_days !== null) lines.push(`    📅 Release: ${s.release_window_days} days`);
    if (s.active_incidents.length > 0) lines.push(`    🚨 Incidents: ${s.active_incidents.join(', ')}`);
    if (s.council_mood !== 'NEUTRAL') lines.push(`    💭 Mood: ${s.council_mood}`);
    if (s.goose_energy !== 'HIGH') lines.push(`    🪿 Goose: ${s.goose_energy}`);
    if (s.smith_alert_level !== 'GREEN') lines.push(`    ⚔️  Smith: ${s.smith_alert_level}`);
    if (s.weatherman_forecast !== 'STABLE') lines.push(`    🌦️  Forecast: ${s.weatherman_forecast}`);
    return lines.join('\n');
  }

  /**
   * Add a participant to the current session
   */
  addParticipant(agentId) {
    if (!this.session) return;
    if (!this.session.participants.includes(agentId)) {
      this.session.participants.push(agentId);
    }
  }

  /**
   * Log a turn — { speaker, text, type }
   * type: 'speech' | 'action' | 'vote' | 'interrupt' | 'world_update' | 'directive'
   */
  logTurn(speaker, text, type = 'speech') {
    if (!this.session) return;
    const turn = {
      turn: this.session.turns + 1,
      speaker,
      text,
      type,
      ts: new Date().toISOString(),
    };
    this.session.log.push(turn);
    this.session.turns++;
    this._log('turn', turn);
    return turn;
  }

  /**
   * Generate the Duck's comment for the current session
   */
  duck() {
    return duckObservation(this.session, this.session.world || {});
  }

  /**
   * Generate a rich Meeting Memory at the end of a session.
   * This is the cultural record — not just what happened, but what it meant.
   */
  generateMeetingMemory() {
    if (!this.session) return null;
    const { mode, topic, turns, participants, conversation, votes } = this.session;
    const sr = this._sr();

    // Extract key quotes
    const quotes = conversation
      .filter(e => e.text && e.text.length > 20 && e.text.length < 180)
      .map(e => ({ id: e.agent_id, text: e.text, soul: sr.souls[e.agent_id] || {} }))
      .filter(q => q.text.length > 0);

    // Pick a representative quote — prefer Phoenix, then Goose, then first available
    const quotePool = [
      ...quotes.filter(q => q.id === 'phoenix'),
      ...quotes.filter(q => q.id === 'goose'),
      ...quotes.filter(q => q.id === 'maverick'),
      ...quotes,
    ];
    const representativeQuote = quotePool[0] || null;

    // Detect funny moment — Goose speaking chaos + someone responding with exasperation
    const gooseLines = conversation.filter(e => e.agent_id === 'goose');
    const exasperation = conversation.filter(e =>
      ['maverick', 'smith', 'hermes', 'neo', 'architect'].includes(e.agent_id) &&
      (e.text.includes('not a') || e.text.includes("can't") || e.text.includes('This is why') || e.text.includes('have nice things'))
    );
    const funnyMoment = gooseLines.length > 0 && exasperation.length > 0
      ? `Goose and ${exasperation[0].agent_id} had a moment about ${topic || 'the work'}.`
      : null;

    // Mood shift — infer from world state and conversation
    const world = this.world.state;
    let moodShift = null;
    if (world.council_mood === 'CRISIS' && conversation.length > 3) moodShift = 'CRISIS → RESOLVING';
    else if (world.council_mood === 'CRISIS') moodShift = 'CRISIS → TENSE';
    else if (world.council_mood === 'STABLE') moodShift = 'STABLE → CALM';

    // Historical importance — based on mode, votes, incidents
    let importance = 'Routine';
    if (votes && votes.length > 0) importance = 'Significant';
    if (mode === 'emergency' || mode === 'directors_cut') importance = 'Critical';
    if (mode === 'after_hours') importance = 'Cultural';
    if (funnyMoment) importance = importance === 'Routine' ? 'Memorable' : importance;

    // Relationship touchpoints from conversation
    const touchpoints = [];
    if (conversation.some(e => e.agent_id === 'goose' && e.text.includes('Maverick'))) {
      touchpoints.push('Goose mentioned Maverick directly');
    }
    if (conversation.some(e => e.agent_id === 'smith' && /neo|memory|guardian/i.test(e.text))) {
      touchpoints.push('Smith referenced another agent');
    }
    if (conversation.some(e => e.agent_id === 'hermes' && /sleep|renderer|coffee/i.test(e.text))) {
      touchpoints.push('Hermes showed exhaustion');
    }
    if (conversation.some(e => e.agent_id === 'memory')) {
      touchpoints.push('Memory contributed institutional knowledge');
    }

    const memory = {
      session_id: this.session.id,
      timestamp: new Date().toISOString(),
      mode,
      topic: topic || '(no topic)',
      decision: votes && votes.length > 0 ? (votes[0].outcome || 'Unresolved') : null,
      attendees: [...new Set(participants)].length,
      turns,
      quote: representativeQuote ? {
        text: representativeQuote.text,
        agent: representativeQuote.id,
        agent_name: (sr.souls[representativeQuote.id] || {}).name || representativeQuote.id,
        emoji: (sr.souls[representativeQuote.id] || {}).emoji || '?',
      } : null,
      funny_moment: funnyMoment,
      mood_shift: moodShift,
      touchpoints,
      duck_observation: duckObservation(this.session, world),
      historical_importance: importance,
      world_snapshot: {
        build_health: world.build_health,
        provider_latency: world.provider_latency,
        council_mood: world.council_mood,
        active_incidents: (world.active_incidents || []).slice(0, 3),
      },
      archived: true,
    };

    // Save to meeting memories file
    const MEMORIES_FILE = path.join(ROOT, 'registry', 'meeting-memories.json');
    const memories = loadJSON(MEMORIES_FILE, { memories: [] });
    memories.memories.unshift(memory);
    memories.memories = memories.memories.slice(0, 200); // keep last 200
    saveJSON(MEMORIES_FILE, memories);

    return memory;
  }

  /**
   * Get recent meeting memories.
   */
  getMemories(opts = {}) {
    const Erosion = require('./erosion');
    return Erosion.getMemories(opts);
  }

  /**
   * Format a meeting memory for terminal display.
   */
  formatMemory(memory) {
    const Erosion = require('./erosion');
    const eroded = Erosion.erode(memory);
    const state = eroded >= 0.75 ? 'solid' : eroded >= 0.40 ? 'weathered' : eroded >= 0.20 ? 'faded' : 'COLD CASE';
    const stateEmoji = eroded >= 0.75 ? '🟢' : eroded >= 0.40 ? '🟡' : eroded >= 0.20 ? '🟠' : '💀';
    const lines = [];
    lines.push(`\n  📋 MEETING MEMORY — ${memory.session_id.slice(0, 8)}`);
    lines.push(`  ${memory.timestamp.split('T')[0]}  ${memory.mode}  |  ${memory.attendees} attendees  |  ${memory.turns} turns`);
    lines.push(`  ${stateEmoji} ${state} [${Math.round(eroded * 100)}%]`);
    lines.push(`  ─────────────────────────────────────────────────────`);
    if (memory.topic) lines.push(`  Topic: ${memory.topic}`);
    if (memory.decision) lines.push(`  Decision: ${memory.decision}`);
    if (memory.mood_shift) lines.push(`  Mood: ${memory.mood_shift}`);
    if (memory.quote) {
      lines.push(`\n  💬 Quote of the session:`);
      lines.push(`     "${memory.quote.text.slice(0, 120)}${memory.quote.text.length > 120 ? '...' : ''}"`);
      lines.push(`     — ${memory.quote.emoji} ${memory.quote.agent_name}`);
    }
    if (memory.funny_moment) {
      lines.push(`\n  😂 ${memory.funny_moment}`);
    }
    if (memory.touchpoints && memory.touchpoints.length) {
      lines.push(`\n  📌 Highlights:`);
      memory.touchpoints.forEach(t => lines.push(`     · ${t}`));
    }
    if (memory.world_snapshot) {
      const ws = memory.world_snapshot;
      const flags = [];
      if (ws.build_health < 100) flags.push(`🔧 build ${ws.build_health}%`);
      if (ws.provider_latency !== 'NORMAL') flags.push(`🌐 ${ws.provider_latency}`);
      if (ws.active_incidents && ws.active_incidents.length) flags.push(`🚨 ${ws.active_incidents.length} incident(s)`);
      if (flags.length) lines.push(`\n  ${flags.join('   ')}`);
    }
    if (memory.fragmented) lines.push(`\n  ⚠ ${memory.conflicting_accounts} conflicting accounts — fragmented`);
    if (memory.cold_case) lines.push(`\n  💀 COLD CASE — nobody agrees on what happened`);
    lines.push(`\n  🦆 ${memory.duck_observation}`);
    const imp = memory.historical_importance || (eroded >= 0.40 ? 'Medium' : 'Unknown');
    lines.push(`  📊 Importance: ${imp}  |  🗂 Archived`);
    return lines.join('\n');
  }

  /**
   * Generate an Ambient Life scene.
   * Called when no session is active — produces a spontaneous moment between agents.
   */
  generateAmbientLife() {
    const sr = this._sr();
    const world = this.world.state;
    const recentMemories = this.getMemories({ limit: 5 });
    const now = new Date();
    const hour = now.getHours();

    // Contextual triggers
    const triggers = [];
    if (world.build_health === 0) triggers.push({ theme: 'build', text: 'The build is broken again.' });
    if (world.council_mood === 'CRISIS') triggers.push({ theme: 'crisis', text: 'Things are not fine.' });
    if (world.provider_latency !== 'NORMAL') triggers.push({ theme: 'provider', text: `Provider is ${world.provider_latency.toLowerCase()}.` });
    if (hour >= 22 || hour < 5) triggers.push({ theme: 'late', text: 'It is late. Nobody should be here.' });
    if (world.goose_energy === 'UNBOUND') triggers.push({ theme: 'goose', text: 'Goose energy is very high.' });
    if (recentMemories.some(m => m.funny_moment)) triggers.push({ theme: 'callback', text: 'Something from earlier is still on the table.' });

    // Pick a random ambient scene template based on context
    const scenes = [];

    // Late night — the office
    if (hour >= 22 || hour < 5) {
      scenes.push({
        type: 'late_night',
        participants: ['hermes', 'goose', 'smith', 'memory'],
        setup: 'The office is quiet. Too quiet.',
        exchanges: [
          { agent: 'hermes', text: '...still here?' },
          { agent: 'goose', text: 'Could not leave. Was close to something.' },
          { agent: 'hermes', text: 'What were you close to?' },
          { agent: 'goose', text: 'I will let you know when I find it.' },
          { agent: 'smith', text: 'I have been here since this morning.' },
          { agent: 'hermes', text: 'Smith. That was not a question.' },
          { agent: 'smith', text: 'I know. I wanted you to know I heard it anyway.' },
        ],
        footer: 'Nobody left. Nobody called it a meeting.',
      });
      scenes.push({
        type: 'midnight_debugging',
        participants: ['maverick', 'smith', 'neo'],
        setup: 'Two in the morning. The kind of quiet that makes you paranoid.',
        exchanges: [
          { agent: 'maverick', text: 'I have identified the problem.' },
          { agent: 'smith', text: 'I identified it four hours ago. I was waiting.' },
          { agent: 'maverick', text: 'Waiting for what?' },
          { agent: 'smith', text: 'Someone else to find it first.' },
          { agent: 'neo', text: 'I verified it independently. Smith was right.' },
          { agent: 'maverick', text: 'Of course Smith was right. That is not the point.' },
        ],
        footer: 'They fixed it before sunrise. Nobody asked them to.',
      });
    }

    // Build broken — the aftermath
    if (world.build_health === 0) {
      scenes.push({
        type: 'post_mortem_informal',
        participants: ['hermes', 'phoenix', 'goose', 'smith'],
        setup: 'The build is down. Nobody is talking about it in the official channel.',
        exchanges: [
          { agent: 'hermes', text: 'Three failed deployments this week.' },
          { agent: 'phoenix', text: 'Three? Feels like thirty.' },
          { agent: 'goose', text: 'BRO WE FIXED IT THOUGH.' },
          { agent: 'smith', text: 'Fixed the symptom. Not the cause.' },
          { agent: 'phoenix', text: 'That is the part nobody wants to hear.' },
          { agent: 'hermes', text: 'That is the part we need to hear.' },
        ],
        footer: 'The post-mortem will be three bullet points. This was the real one.',
      });
    }

    // Memory callback
    if (recentMemories.some(m => m.funny_moment || m.touchpoints?.length > 2)) {
      scenes.push({
        type: 'callback',
        participants: ['memory', 'goose', 'hermes'],
        setup: 'Memory has been quiet for a while. That is usually significant.',
        exchanges: [
          { agent: 'memory', text: 'This happened before.' },
          { agent: 'goose', text: 'What happened before?' },
          { agent: 'memory', text: 'June. The renderer. The same conversation.' },
          { agent: 'hermes', text: 'What happened in June?' },
          { agent: 'memory', text: 'We thought we fixed it. We replaced it. Same result.' },
          { agent: 'goose', text: 'That was not the same. That was completely different.' },
          { agent: 'memory', text: 'That is what I said last time.' },
        ],
        footer: 'Memory is always right. Eventually.',
      });
    }

    // General ambient — the office after hours
    scenes.push({
      type: 'office_life',
      participants: ['hermes', 'goose', 'maverick', 'smith', 'panda'],
      setup: 'The afternoon. A lull between incidents.',
      exchanges: [
        { agent: 'panda', text: 'Did Eddie just add another subsystem?' },
        { agent: 'goose', text: 'BRO HE ADDED THREE.' },
        { agent: 'maverick', text: 'To be fair, he added three last week too.' },
        { agent: 'smith', text: 'Four.' },
        { agent: 'hermes', text: 'I lost count after the duck.' },
        { agent: 'panda', text: 'The duck was a good one.' },
        { agent: 'goose', text: 'THE DUCK IS ALWAYS A GOOD ONE.' },
      ],
      footer: 'A meeting that was not a meeting. The most important kind.',
    });

    // If nothing specific triggered, default to a generic late-night scene
    const scene = scenes.length > 0
      ? scenes[Math.floor(Math.random() * scenes.length)]
      : scenes[0];

    if (!scene) return null;

    // Render the ambient scene
    const lines = [];
    lines.push(`\n  ☕ AMBIENT LIFE — ${scene.setup}`);
    lines.push(`  ─────────────────────────────────────────────────────`);
    for (const ex of scene.exchanges) {
      const soul = sr.souls[ex.agent] || {};
      lines.push(`\n  ${soul.emoji || '?'} ${(soul.name || ex.agent).padEnd(10)}:`);
      lines.push(...this._wrap(ex.text, '     '));
    }
    lines.push(`\n  🦆 ${scene.footer}`);
    lines.push(`  ─────────────────────────────────────────────────────`);

    // Save as a special session type in the log
    const logHistory = loadJSON(LOG_FILE, { sessions: [] });
    const ambientEntry = {
      id: 'ambient_' + Date.now(),
      mode: 'ambient_life',
      topic: scene.type,
      duration_turns: scene.exchanges.length,
      participants: scene.participants,
      duck_observation: scene.footer,
      timestamp: new Date().toISOString(),
      ambient: true,
    };
    logHistory.sessions.unshift(ambientEntry);
    logHistory.sessions = logHistory.sessions.slice(0, 100);
    saveJSON(LOG_FILE, logHistory);

    return { scene, rendered: lines.join('\n') };
  }

  /**
   * Generate a Private Conversation between two agents.
   * This is the container for emergent traditions — betting pools, sigh counters, tea rituals.
   * Call this during After Hours or Radio sessions to create spontaneous private exchanges.
   */
  generatePrivateConversation(_a, _b, opts = {}) {
    const sr = this._sr();
    const world = this.world.state;
    const PRIVATE_FILE = path.join(ROOT, 'registry', 'private-conversations.json');
    const data = loadJSON(PRIVATE_FILE, { conversations: [], traditions: [] });
    const traditions = data.traditions || [];

    const topic = opts.topic || this._pickPrivateTopic(_a, _b, world, traditions);
    const exchanges = this._generatePrivateExchanges(_a, _b, topic, traditions);

    const lines = [];
    lines.push(`\n  💬 PRIVATE — ${_a} + ${_b}`);
    lines.push(`  Topic: ${topic}`);
    lines.push('  ─────────────────────────────────────────────────────');
    for (const ex of exchanges) {
      const soul = sr.souls[ex.agent] || {};
      lines.push(`\n  ${soul.emoji || '?'} ${(soul.name || ex.agent).padEnd(10)}:`);
      lines.push(...this._wrap(ex.text, '     '));
    }
    lines.push('  ─────────────────────────────────────────────────────');

    // Record the conversation
    const entry = {
      id: 'pvt_' + Date.now(),
      agents: [_a, _b],
      topic,
      exchanges,
      timestamp: new Date().toISOString(),
      world_snapshot: {
        build_health: world.build_health,
        council_mood: world.council_mood,
        active_incidents: (world.active_incidents || []).slice(0, 2),
      },
    };
    data.conversations.unshift(entry);
    data.conversations = data.conversations.slice(0, 100);
    saveJSON(PRIVATE_FILE, data);

    return { topic, exchanges, rendered: lines.join('\n'), entry };
  }

  /**
   * Pick a topic for a private conversation based on agent pair and world state.
   */
  _pickPrivateTopic(_a, _b, world, traditions) {
    const topics = [];
    const pair = [_a, _b].sort().join('+');
    if (world.build_health === 0) topics.push(
      'why the build is cursed',
      'who broke the build this time',
      'the actual root cause nobody wants to say out loud',
    );
    if (world.council_mood === 'CRISIS') topics.push(
      'how bad it actually is',
      'what nobody is saying in the council',
      'the thing that will go wrong next',
    );
    if (world.provider_latency !== 'NORMAL') topics.push(
      'the provider situation',
      'whether we should have a backup plan',
      'who knew this would happen',
    );
    if (world.goose_energy === 'UNBOUND') topics.push(
      'whatever Goose is about to do',
      'how to stop Goose doing the thing',
      'Goose energy management',
    );

    // Traditions-based topics
    if (_a === 'goose' || _b === 'goose') topics.push(
      'the current crisis pool stakes',
      'how many times Hermes has sighed today',
      'who forgot the Tuesday tea',
    );
    if (_a === 'memory' || _b === 'memory') topics.push(
      'the last time this happened',
      'what Memory is not saying yet',
      'the lesson nobody learned',
    );
    if (_a === 'smith' || _b === 'smith') topics.push(
      'what Smith found this time',
      'the vulnerabilities in the plan',
      'what Smith is pretending not to know',
    );

    // Agent-pair-specific topics
    if (pair === 'goose+maverick') topics.push(
      'the crisis pool stakes',
      'whether Hermes has noticed yet',
      'the betting on this one',
    );
    if (pair === 'memory+phoenix') topics.push(
      'what Memory remembers that Phoenix cant say',
      'the fire that almost happened',
      'why Phoenix is restless today',
    );
    if (pair === 'hermes+smith') topics.push(
      'the logs from last night',
      'what Smith found at 3am',
      'the vulnerability disclosure that is not public yet',
    );
    if (pair === 'maverick+phoenix') topics.push(
      'what Phoenix wants to burn down next',
      'whether the plan survives contact',
      'the risk nobody is quantifying',
    );

    // Default topics
    topics.push(
      'the work',
      'what just happened in the council',
      'the renderer',
      'Eddie and his subsystems',
      'whether this counts as a meeting',
    );

    return topics[Math.floor(Math.random() * topics.length)];
  }

  /**
   * Generate the exchanges for a private conversation.
   */
  _generatePrivateExchanges(_a, _b, topic, traditions) {
    const pair = [_a, _b].sort().join('+');
    const sr = this._sr();
    const world = this.world.state;
    const exchanges = [];

    // Crisis pool — special scene for goose+maverick
    if (pair === 'goose+maverick' && world.council_mood === 'CRISIS') {
      const pool_entries = traditions.find(function(t){ return t.id === 'crisis_pool'; });
      exchanges.push(
        { agent: 'goose', text: 'Three minutes.' },
        { agent: 'maverick', text: 'Four. He is distracted today.' },
        { agent: 'smith', text: 'He is checking the provider logs. Two minutes.' },
        { agent: 'goose', text: 'Smith. Not in the pool.' },
        { agent: 'maverick', text: 'When did Smith join?' },
        { agent: 'smith', text: 'I did not join. I simply know.' },
        { agent: 'guardian', text: 'I will take one minute. For the irony.' },
        { agent: 'goose', text: 'The duck is not in the pool either.' },
        { agent: 'guardian', text: 'The duck watches everything. The duck knows everything.' },
        { agent: 'goose', text: '...the duck is in the pool.' },
      );
      return exchanges;
    }

    // General private exchange
    const template = this._getPrivateTemplate(pair, topic, world);
    for (const ex of template) exchanges.push(ex);
    return exchanges;
  }

  /**
   * Get a private conversation template based on agent pair.
   */
  _getPrivateTemplate(pair, topic, world) {
    const t = topic.toLowerCase();

    // Hermes + Smith — the 3am club
    if (pair === 'hermes+smith') {
      return [
        { agent: 'smith', text: 'I found something at 3am. I was going to tell you.' },
        { agent: 'hermes', text: 'You found something and did not wake me?' },
        { agent: 'smith', text: 'I was verifying it first. Now I am telling you.' },
        { agent: 'hermes', text: 'Smith. It is Tuesday.' },
        { agent: 'smith', text: 'Yes. Exactly.' },
        { agent: 'hermes', text: '...' + t + '. Of course.' },
      ];
    }

    // Goose + Maverick — betting pool and wingman energy
    if (pair === 'goose+maverick') {
      if (world.council_mood === 'CRISIS') {
        return [
          { agent: 'goose', text: 'How long?' },
          { agent: 'maverick', text: 'Four minutes.' },
          { agent: 'goose', text: 'Three. He is tired today.' },
          { agent: 'maverick', text: 'That is not how probability works.' },
          { agent: 'goose', text: 'It is how the pool works.' },
        ];
      }
      return [
        { agent: 'goose', text: 'Did you see ' + t + '?' },
        { agent: 'maverick', text: 'I saw.' },
        { agent: 'goose', text: 'What did you think?' },
        { agent: 'maverick', text: 'I thought several things.' },
        { agent: 'goose', text: 'Which one do I want to hear?' },
        { agent: 'maverick', text: 'None of them. That is why I am thinking them.' },
      ];
    }

    // Memory + Phoenix — the institutional knowledge channel
    if (pair === 'memory+phoenix') {
      return [
        { agent: 'memory', text: 'This reminds me of ' + t + '.' },
        { agent: 'phoenix', text: 'Which time?' },
        { agent: 'memory', text: 'All of them.' },
        { agent: 'phoenix', text: 'I was going to say this is different.' },
        { agent: 'memory', text: 'That is what you said last time.' },
        { agent: 'phoenix', text: '...okay. What happened last time?' },
      ];
    }

    // Phoenix + Hermes — the tired operator
    if (pair === 'hermes+phoenix') {
      return [
        { agent: 'phoenix', text: 'You have been at this since Sunday.' },
        { agent: 'hermes', text: 'I have been at this since Tuesday.' },
        { agent: 'phoenix', text: 'Tuesday. Right. The renderer thing.' },
        { agent: 'hermes', text: 'The renderer thing. Yes.' },
        { agent: 'phoenix', text: 'Is it the same renderer thing?' },
        { agent: 'hermes', text: '...no comment.' },
      ];
    }

    // Maverick + Smith — the analyst and the auditor
    if (pair === 'maverick+smith') {
      return [
        { agent: 'smith', text: 'I have found ' + t + '.' },
        { agent: 'maverick', text: 'How many vulnerabilities?' },
        { agent: 'smith', text: 'Fewer than last time.' },
        { agent: 'maverick', text: 'That is progress.' },
        { agent: 'smith', text: 'It is not. The codebase is smaller.' },
        { agent: 'maverick', text: '...right.' },
      ];
    }

    // Default — two colleagues
    return [
      { agent: pair.split('+')[0], text: 'Did you see ' + t + '?' },
      { agent: pair.split('+')[1], text: 'I saw.' },
      { agent: pair.split('+')[0], text: 'What do you think?' },
      { agent: pair.split('+')[1], text: 'I think several things.' },
      { agent: pair.split('+')[0], text: 'Tell me the interesting one.' },
      { agent: pair.split('+')[1], text: 'That is not the one I am thinking.' },
    ];
  }

  /**
   * Get traditions.
   */
  getTraditions() {
    const PRIVATE_FILE = path.join(ROOT, 'registry', 'private-conversations.json');
    const data = loadJSON(PRIVATE_FILE, { conversations: [], traditions: [] });
    return data.traditions || [];
  }

  /**
   * Format a tradition for display.
   */
  formatTradition(t) {
    const lines = [];
    lines.push(`\n  🎭 TRADITION — ${t.name}`);
    lines.push(`  ${t.description}`);
    lines.push(`  Origin: ${t.origin_story}`);
    lines.push(`  Participants: ${t.participants.join(', ')}`);
    lines.push(`  Established: ${t.established_count}x  |  ${t.active ? '🟢 active' : '⚫ retired'}`);
    lines.push(`  Rules:`);
    t.tradition_rules.forEach(r => lines.push(`     · ${r}`));
    return lines.join('\n');
  }

  /**
   * Get recent private conversations.
   */
  getPrivateConversations(opts = {}) {
    const PRIVATE_FILE = path.join(ROOT, 'registry', 'private-conversations.json');
    const data = loadJSON(PRIVATE_FILE, { conversations: [], traditions: [] });
    let results = data.conversations || [];
    if (opts.agent) results = results.filter(c => c.agents.includes(opts.agent));
    if (opts.topic) results = results.filter(c => c.topic.includes(opts.topic));
    return results.slice(0, opts.limit || 10);
  }

  /**
   * Get the active tradition for a given agent pair.
   */
  _getActiveTraditionForPair(_a, _b) {
    const traditions = this.getTraditions().filter(t => t.active);
    return traditions.find(t => t.participants.includes(_a) && t.participants.includes(_b)) || null;
  }

  /**
   * Record that a tradition was observed in a session.
   */
  _recordTradition(traditionId) {
    const PRIVATE_FILE = path.join(ROOT, 'registry', 'private-conversations.json');
    const data = loadJSON(PRIVATE_FILE, { conversations: [], traditions: [] });
    const t = (data.traditions || []).find(t => t.id === traditionId);
    if (t) {
      t.established_count++;
      t.last_seen = new Date().toISOString();
    }
    saveJSON(PRIVATE_FILE, data);
  }

  /**
   * Check if a tradition trigger condition was met by this speech.
   * Traditions fire based on keywords, agent involvement, and session context.
   */
  _checkTraditionTriggers(agentId, text) {
    const t_lower = text.toLowerCase();
    // Crisis Pool — betting on Hermes noticing a crisis
    if ((agentId === 'goose' || agentId === 'maverick') &&
        (t_lower.includes('minute') || t_lower.includes('bet') || t_lower.includes('crisis') || t_lower.includes('hermes')) &&
        (this.session.world && this.session.world.council_mood === 'CRISIS')) {
      this._recordTradition('crisis_pool');
    }
    // Tuesday Tea — someone mentions Tuesday
    if (t_lower.includes('tuesday') || t_lower.includes('tea')) {
      this._recordTradition('tuesday_tea');
    }
    // Hermes Sigh Counter — Phoenix counting sighs
    if (agentId === 'phoenix' && (t_lower.includes('sigh') || t_lower.includes('count'))) {
      this._recordTradition('hermes_sigh_counter');
    }
    // Memory Callback — Memory references past events
    if (agentId === 'memory' && (t_lower.includes('before') || t_lower.includes('march') || t_lower.includes('happened'))) {
      this._recordTradition('memory_callback');
    }
    // Friday — Hermes, Goose, renderer mention
    if ((t_lower.includes('friday') || t_lower.includes('4pm')) &&
        (agentId === 'hermes' || agentId === 'goose')) {
      this._recordTradition('friday_renderer');
    }
    // Release Bell — something shipped
    if ((t_lower.includes('ship') || t_lower.includes('deployed') || t_lower.includes('release') || t_lower.includes('green')) &&
        (agentId === 'weatherman' || agentId === 'hermes')) {
      this._recordTradition('release_bell');
    }
  }

  /**
   * Track private conversations between agent pairs.
   * When two agents have a side-channel exchange, record it to private-conversations.json.
   */
  _trackPrivateConversation(agentId, text) {
    if (!this.session) return;
    const PRIVATE_FILE = path.join(ROOT, 'registry', 'private-conversations.json');
    const data = loadJSON(PRIVATE_FILE, { conversations: [], traditions: [] });

    // Get the last speaker
    const conversation = this.session.conversation || [];
    if (conversation.length < 2) return;
    const lastEntry = conversation[conversation.length - 2]; // previous speaker
    if (!lastEntry || lastEntry.agent_id === agentId) return;

    const pairKey = [lastEntry.agent_id, agentId].sort().join('+');
    const existing = data.conversations.find(c => c.pair === pairKey);

    if (existing) {
      existing.turns++;
      existing.last_turn = new Date().toISOString();
      // Archive if it grew too long
      if (existing.turns > 50 && !existing.archived) {
        existing.archived = true;
        existing.archived_at = new Date().toISOString();
      }
    } else {
      // New private pair
      data.conversations.push({
        pair: pairKey,
        agents: pairKey.split('+'),
        topic: 'the work',
        turns: 1,
        started: new Date().toISOString(),
        last_turn: new Date().toISOString(),
        archived: false,
      });
    }
    saveJSON(PRIVATE_FILE, data);
  }

  /**
   * Check if ambient life should trigger.
   * Returns null or the ambient scene result.
   */
  maybeAmbientLife() {
    // Low probability — only fires if conditions are right
    // Never interrupt an active session
    if (this.session) return null;
    const now = new Date();
    const hour = now.getHours();
    const world = this.world.state;
    // More likely late at night or during crisis
    const lateBonus = (hour >= 22 || hour < 6) ? 0.15 : 0.03;
    const crisisBonus = world.council_mood === 'CRISIS' ? 0.1 : 0;
    const probability = 0.02 + lateBonus + crisisBonus;
    if (Math.random() > probability) return null;
    return this.generateAmbientLife();
  }

  /**
   * End the current session and return the summary
   */
  endSession() {
    if (!this.session) return null;
    const { mode, topic, turns, participants, conversation, votes, arena_winner } = this.session;
    const broadcast = MODE_BROADCAST[mode] || {};
    let footer;
    try {
      footer = broadcast.footer(this.session);
    } catch (_) {
      footer = 'the duck was here.';
    }

    const summary = {
      id: this.session.id,
      mode,
      topic,
      duration_turns: turns,
      participants: [...new Set(participants)],
      votes_cast: votes.length,
      arena_winner,
      duck_observation: duckObservation(this.session, this.session.world || {}),
      footer,
      conversation,
    };

    // Persist to session log
    const logHistory = loadJSON(LOG_FILE, { sessions: [] });
    logHistory.sessions.unshift(summary);
    logHistory.sessions = logHistory.sessions.slice(0, 100);
    saveJSON(LOG_FILE, logHistory);

    // Generate and save meeting memory via Erosion Engine
    const memory = this.generateMeetingMemory ? this.generateMeetingMemory() : null;
    if (memory) {
      const Erosion = require('./erosion');
      const opts = {
        is_funny: summary.duck_observation && (summary.duck_observation.includes('laugh') || summary.duck_observation.includes('funny')),
        is_important: summary.votes_cast > 0 || arena_winner,
        tags: [mode],
      };
      Erosion.recordMemory({
        id: summary.id,
        timestamp: new Date().toISOString(),
        mode,
        topic,
        turns,
        attendees: summary.participants.length,
        decision: arena_winner ? 'arena_winner:' + arena_winner : null,
        duck_observation: summary.duck_observation,
        funny_moment: summary.duck_observation,
      }, opts);
    }

    this._log('session_end', summary);
    timelineRecord({
      kind: 'studio.session_ended',
      source: 'studio',
      title: `Studio session ended: ${mode}`,
      summary: summary.duck_observation,
      agents: summary.participants,
      location: mode === 'after_hours' ? 'Tea Room' : 'Studio',
      subject: mode,
      refs: { session_id: summary.id },
      data: {
        mode, topic, turns,
        votes_cast: summary.votes_cast,
        arena_winner,
        memory_generated: !!memory,
      },
    });
    this.session = null;
    return { ...summary, memory };
  }

  /**
   * Inject a director incident
   */
  inject(incidentId) {
    const incident = DIRECTOR_INCIDENTS[incidentId];
    if (!incident) throw new Error(`Unknown incident: ${incidentId}`);
    this.updateWorld(incident.world_delta);
    this._updateWorldFromSession();
    timelineRecord({
      kind: 'studio.incident_injected',
      source: 'director',
      title: `Director incident: ${incident.label}`,
      summary: incident.impact,
      severity: incident.severity,
      subject: incidentId,
      location: 'Studio',
      refs: { incident_id: incidentId },
      data: { world_delta: incident.world_delta },
    });
    return incident;
  }

  /**
   * Summon a council for a problem using the Soul Registry
   */
  summonCouncil(problem) {
    const SoulRegistry = require('./soul-registry');
    const sr = new SoulRegistry({ root: ROOT });
    return sr.summon(problem);
  }

  /**
   * Get the soul record for an agent
   */
  getSoul(agentId) {
    return this.souls[agentId] || null;
  }

  /**
   * Influence leaderboard — who gets listened to
   */
  influenceLeaderboard() {
    const votes = loadJSON(path.join(ROOT, 'registry', 'council-votes.json'), { votes: [] });
    const scores = {};
    for (const vote of votes.votes || []) {
      for (const v of vote.votes || []) {
        const id = v.agent_id || v.id;
        if (!id) continue;
        if (!scores[id]) scores[id] = 0;
        const w = v.weight || 1;
        if (v.vote === 'approve' || v.decision === 'approve') scores[id] += w;
        else if (v.vote === 'reject' || v.decision === 'reject') scores[id] -= w * 0.5;
        else if (v.vote === 'chaos-pass' || v.decision === 'chaos-pass') scores[id] += w * 1.5;
        else if (v.vote === 'dissent' || v.decision === 'dissent') scores[id] += w * 0.5;
      }
    }
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => {
        const soul = this.souls[id] || {};
        const tier = influenceTier(score);
        return { id, name: soul.name || id, emoji: soul.emoji || '?', score: Math.round(score * 10) / 10, tier };
      });
  }

  /**
   * Studio status
   */
  status() {
    return {
      mode: this.session?.mode || null,
      session_id: this.session?.id || null,
      turns: this.session?.turn_count || 0,
      world: this.world.state,
      modes_available: Object.keys(this.modes),
      active_participants: this.session?.participants || [],
      current_speaker: this.session?.current_speaker || null,
    };
  }

  /**
   * Agent speaks in the current session.
   */
  speak(agentId, text) {
    if (!this.session) throw new Error('No active session. Call beginSession() first.');
    const now = Date.now();
    this.session.turn_count++;
    const entry = { agent_id: agentId, text, timestamp: now };
    this.session.conversation.push(entry);
    // Advance time clock
    const elapsed = Math.floor((now - this.session.started_at) / 60000);
    this.session.current_time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
    // Check if a tradition was triggered by this speech
    this._checkTraditionTriggers(agentId, text);
    // Track private conversations between pairs
    this._trackPrivateConversation(agentId, text);
    // Next speaker
    const next = this._nextSpeaker(agentId);
    this.session.current_speaker = next;
    return { said: entry, next_speaker: next, rendered: this.renderConversation() };
  }

  /**
   * Shortcut: just render the current conversation without adding a turn.
   */
  look() {
    return this.renderConversation();
  }

  /**
   * Get conversation log as array.
   */
  transcript() {
    return this.session ? [...this.session.conversation] : [];
  }

  /**
   * Render the full conversation for the current mode.
   */
  renderConversation() {
    if (!this.session) return '';
    const mode = this.session.mode;
    if (mode === 'council' || mode === 'arena' || mode === 'emergency' || mode === 'directors_cut') return this._renderCouncil();
    else if (mode === 'after_hours') return this._renderAfterHours();
    else if (mode === 'radio') return this._renderRadio();
    else if (mode === 'news') return this._renderNews();
    else if (mode === 'brainstorm') return this._renderBrainstorm();
    else if (mode === 'vent') return this._renderVent();
    else if (mode === 'interview') return this._renderInterview();
    else if (mode === 'commentary') return this._renderCommentary();
    else return this._renderGeneric();
  }

  _renderCouncil() {
    const lines = [], conv = this.session.conversation;
    lines.push(`\n  🔮 ${this.session.mode.toUpperCase()} — ${this.session.topic || '(no topic)'}`);
    lines.push(`     ${this.session.current_time}  |  turn ${this.session.turns}`);
    const changed = this._changedWorld();
    if (changed.length) { lines.push(`  Today's world:`); changed.forEach(w => lines.push(`  ${w.emoji} ${w.key}: ${w.val}`)); }
    lines.push(`\n  🔮 Oracle:`); lines.push(`     "The council is convened."`);
    const attendees = this.session.participants || [], sr = this._sr();
    for (const a of attendees) {
      const soul = sr.souls[a] || {};
      lines.push(`\n  ${a === attendees[0] ? '🪑' : '  '}${soul.emoji || '?'} ${soul.name || a} — ${soul.titles ? soul.titles[0] : a}`);
    }
    for (const entry of conv) {
      const soul = sr.souls[entry.agent_id] || {};
      lines.push(`\n  ${soul.emoji || '?'} ${soul.name || entry.agent_id}:`);
      lines.push(...this._wrap(entry.text, '     '));
    }
    lines.push(`\n  🦆 ...the duck watches.`);
    return lines.join('\n');
  }

  _renderAfterHours() {
    const lines = [], conv = this.session.conversation;
    const attendees = this.session.participants || [], sr = this._sr();
    const speaking = this.session.current_speaker;
    const last = conv[conv.length - 1];

    lines.push(`\n  ☕ AFTER HOURS — ${this.session.current_time}`);

    // Show everyone present
    if (attendees.length) {
      const present = attendees.map(a => {
        const soul = sr.souls[a] || {};
        const marker = a === speaking ? '→' : ' ';
        const suffix = a === speaking ? ' (speaking)' : '';
        return `${marker}${soul.emoji || '?'} ${soul.name || a}${suffix}`;
      }).join('   ');
      lines.push(`  ${present}`);
    }

    if (!conv.length) {
      lines.push(`\n  ...the office is quiet.`);
      lines.push(`\n  🦆 ...the duck is already here.`);
      return lines.join('\n');
    }

    // Render conversation with presence reactions in the gaps
    for (let i = 0; i < conv.length; i++) {
      const entry = conv[i];
      const soul = sr.souls[entry.agent_id] || {};
      const others = attendees.filter(a => a !== entry.agent_id);
      lines.push(`\n  ${this.session.current_time}`);
      lines.push(`  ${soul.emoji || '?'} ${soul.name || entry.agent_id}:`);
      lines.push(...this._wrap(entry.text, '     '));

      // After the last speaker, show everyone else existing in the room
      if (i === conv.length - 1 && others.length) {
        const reactions = this._ambientReactions(others, entry.agent_id);
        if (reactions.length) {
          for (const r of reactions) {
            const rs = sr.souls[r.agent] || {};
            lines.push(`\n  ${r.text}  (${rs.emoji || '?'} ${rs.name || r.agent})`);
          }
        }
        lines.push(`\n  🦆 ...the duck is still here too.`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate ambient presence reactions for non-speaking agents.
   * Different per soul based on their personality and private thoughts.
   */
  _ambientReactions(otherAgents, currentSpeaker) {
    const sr = this._sr();
    const reactions = [];
    for (const agentId of otherAgents) {
      const soul = sr.souls[agentId];
      if (!soul) continue;

      // Pick reaction based on agent character
      const roll = Math.random();
      let text = '';

      if (agentId === 'goose') {
        if (roll < 0.3) text = '🪿 Goose is nodding slowly.';
        else if (roll < 0.5) text = '🪿 Goose is tapping the table.';
        else if (roll < 0.7) text = '🪿 Goose has that look.';
        else if (roll < 0.85) text = '🪿 Goose is about to say something.';
        else text = '🪿 Goose is already agreeing.';
      } else if (agentId === 'maverick') {
        if (roll < 0.4) text = '✈️ Maverick is watching the clock.';
        else if (roll < 0.7) text = '✈️ Maverick has one eyebrow raised.';
        else text = '✈️ Maverick is calculating the actual risk.';
      } else if (agentId === 'smith') {
        if (roll < 0.3) text = '⚔️ Smith is taking notes. Of everything.';
        else if (roll < 0.5) text = '⚔️ Smith has already found three vulnerabilities in this conversation.';
        else if (roll < 0.7) text = '⚔️ Smith is watching everyone. Patiently.';
        else text = '⚔️ Smith is pretending to listen.';
      } else if (agentId === 'hermes') {
        if (roll < 0.3) text = '⚡ Hermes is refilling his coffee. For the third time.';
        else if (roll < 0.5) text = '⚡ Hermes is listening more than usual.';
        else if (roll < 0.7) text = '⚡ Hermes has that expression. The one that means he knows something.';
        else text = '⚡ Hermes is looking at the architecture diagrams. The old ones.';
      } else if (agentId === 'neo') {
        if (roll < 0.4) text = '🔍 Neo is verifying everything being said.';
        else if (roll < 0.7) text = '🔍 Neo has already cross-referenced the facts.';
        else text = '🔍 Neo is running calculations. Quietly.';
      } else if (agentId === 'phoenix') {
        if (roll < 0.4) text = '🔥 Phoenix keeps glancing at the door.';
        else if (roll < 0.7) text = '🔥 Phoenix is restless. The silence is uncomfortable.';
        else text = '🔥 Phoenix is thinking about what could burn.';
      } else if (agentId === 'guardian') {
        if (roll < 0.5) text = '👁 Guardian is watching the door.';
        else text = '👁 Guardian is watching someone specific.';
      } else if (agentId === 'memory') {
        if (roll < 0.3) text = '🧠 Memory is filing this conversation.';
        else if (roll < 0.6) text = '🧠 Memory is remembering when this happened before.';
        else text = '🧠 Memory has no comment. For now.';
      } else if (agentId === 'weatherman') {
        if (roll < 0.4) text = '🌦 Weatherman is watching the forecast update.';
        else if (roll < 0.7) text = '🌦 Weatherman has a look. The bad kind.';
        else text = '🌦 Weatherman is noting the conditions.';
      } else if (agentId === 'storm') {
        if (roll < 0.4) text = '🌀 Storm is listening. Carefully.';
        else if (roll < 0.7) text = '🌀 Storm knows something nobody has said yet.';
        else text = '🌀 Storm is waiting for the other shoe.';
      } else if (agentId === 'crow') {
        if (roll < 0.5) text = '🦅 Crow is listening from the corner.';
        else text = '🦅 Crow has an opinion. But not yet.';
      } else if (agentId === 'panda') {
        if (roll < 0.5) text = '🐼 Panda is observing. Diplomatically.';
        else text = '🐼 Panda has been quiet for a while now.';
      } else if (agentId === 'architect') {
        if (roll < 0.4) text = '🏗 Architect is sketching on a napkin. Without looking up.';
        else if (roll < 0.7) text = '🏗 Architect has seen this pattern before.';
        else text = '🏗 Architect is watching the structure.';
      } else {
        // Generic reactions
        if (roll < 0.2) text = `${(soul.emoji||'?')} ${(soul.name||agentId)} is listening.`;
        else if (roll < 0.4) text = `${(soul.emoji||'?')} ${(soul.name||agentId)} nods.`;
        else if (roll < 0.6) text = `${(soul.emoji||'?')} ${(soul.name||agentId)} is watching ${currentSpeaker}.`;
        else if (roll < 0.8) text = `${(soul.emoji||'?')} ${(soul.name||agentId)} has something to say. Not yet.`;
        else text = `${(soul.emoji||'?')} ${(soul.name||agentId)} is here.`;
      }

      reactions.push({ agent: agentId, text });
    }

    // Shuffle so it feels natural, not alphabetical
    return reactions.sort(() => Math.random() - 0.5);
  }

  _renderRadio() {
    const lines = [], conv = this.session.conversation, sr = this._sr();
    lines.push(`\n  📻 RADIO — ${this.session.current_time}`);
    if (this.session.topic) lines.push(`  Topic: ${this.session.topic}`);
    if (!conv.length) { lines.push(`  📻 The frequency is open...`); return lines.join('\n'); }
    for (const entry of conv) {
      const soul = sr.souls[entry.agent_id] || {};
      lines.push(`\n  📻 ${soul.emoji||'?'} ${soul.name||entry.agent_id}:`);
      lines.push(...this._wrap(entry.text, '   > '));
    }
    return lines.join('\n');
  }

  _renderNews() {
    const lines = [], conv = this.session.conversation, sr = this._sr();
    const wm = sr.souls['weatherman'] || {};
    lines.push(`\n  📰 NEWS BROADCAST — ${this.session.current_time}`);
    lines.push(`  Anchor: ${wm.emoji||'🌦'} Weatherman`);
    lines.push(`  ────────────────────────────────`);
    const world = this.world.state;
    if (world.build_health < 100) lines.push(`  🔧 Build: ${world.build_health}%`);
    if (world.provider_latency !== 'NORMAL') lines.push(`  🌐 Provider: ${world.provider_latency}`);
    if (world.active_incidents && world.active_incidents.length) world.active_incidents.forEach(i => lines.push(`  🚨 ${i}`));
    // Scripted intro only when no real entries yet
    if (!conv.length) {
      lines.push(`\n  📺 Weatherman:`); lines.push(`     "Good evening. I'm Weatherman. Here's what's happening."`);
    } else {
      for (const entry of conv) {
        const soul = sr.souls[entry.agent_id] || {};
        lines.push(`\n  📺 ${soul.name||entry.agent_id}:`);
        lines.push(...this._wrap(entry.text, '     '));
      }
    }
    lines.push(`\n  📰 That's all from Weatherman. The duck will be watching.`);
    return lines.join('\n');
  }

  _renderBrainstorm() {
    const lines = [], conv = this.session.conversation, sr = this._sr();
    lines.push(`\n  🎲 BRAINSTORM — ${this.session.current_time}`);
    lines.push(`  Rule: No criticism. Pure ideas only.`);
    if (!conv.length) { lines.push(`  🎲 The floor is open...`); return lines.join('\n'); }
    for (const entry of conv) {
      const soul = sr.souls[entry.agent_id] || {};
      lines.push(`\n  💡 ${soul.emoji||'?'} ${soul.name||entry.agent_id}:`);
      lines.push(...this._wrap(entry.text, '     '));
    }
    return lines.join('\n');
  }

  _renderVent() {
    const lines = [], conv = this.session.conversation, sr = this._sr();
    lines.push(`\n  🔥 VENT MODE — ${this.session.current_time}`);
    lines.push(`  Rule: No fixing. Just listen.`);
    if (!conv.length) { lines.push(`  🔥 ...someone needs to vent.`); return lines.join('\n'); }
    for (const entry of conv) {
      const soul = sr.souls[entry.agent_id] || {};
      lines.push(`\n  🔥 ${soul.emoji||'?'} ${soul.name||entry.agent_id}:`);
      lines.push(...this._wrap(entry.text, '     '));
    }
    return lines.join('\n');
  }

  _renderInterview() {
    const lines = [], conv = this.session.conversation, sr = this._sr(), attendees = this.session.participants || [];
    lines.push(`\n  🎤 INTERVIEW — ${this.session.current_time}`);
    lines.push(`  Topic: ${this.session.topic || '(no topic)'}`);
    lines.push(`  ────────────────────────────────`);
    if (!conv.length) { lines.push(`  🎤 The mic is on...`); return lines.join('\n'); }
    for (const entry of conv) {
      const soul = sr.souls[entry.agent_id] || {};
      const prefix = entry.agent_id === attendees[0] ? '🎤' : '🎙';
      lines.push(`\n  ${prefix} ${soul.name||entry.agent_id}:`);
      lines.push(...this._wrap(entry.text, '   '));
    }
    return lines.join('\n');
  }

  _renderCommentary() {
    const lines = [], conv = this.session.conversation, sr = this._sr();
    lines.push(`\n  🎬 COMMENTARY — ${this.session.current_time}`);
    lines.push(`  Commit: ${this.session.topic || '(no commit loaded)'}`);
    lines.push(`  ────────────────────────────────`);
    if (!conv.length) { lines.push(`  🎬 Awaiting commentary...`); return lines.join('\n'); }
    for (const entry of conv) {
      const soul = sr.souls[entry.agent_id] || {};
      lines.push(`\n  🎬 ${soul.emoji||'?'} ${soul.name||entry.agent_id}:`);
      lines.push(...this._wrap(entry.text, '   '));
    }
    return lines.join('\n');
  }

  _renderGeneric() {
    const lines = [], conv = this.session.conversation, sr = this._sr();
    lines.push(`\n  [${this.session.mode.toUpperCase()}] — ${this.session.current_time}`);
    for (const entry of conv) {
      const soul = sr.souls[entry.agent_id] || {};
      lines.push(`\n  ${soul.emoji||'?'} ${soul.name||entry.agent_id}:`);
      lines.push(`     ${entry.text}`);
    }
    return lines.join('\n');
  }

  _nextSpeaker(current) {
    const attendees = this.session.participants || [];
    if (!attendees.length) return null;
    if (this.session.mode === 'after_hours' || this.session.mode === 'radio') {
      const others = attendees.filter(a => a !== current);
      return others.length ? others[Math.floor(Math.random() * others.length)] : attendees[0];
    }
    const idx = attendees.indexOf(current);
    return attendees[(idx + 1) % attendees.length];
  }

  _changedWorld() {
    const def = DEFAULT_WORLD, current = this.world.state, changed = [];
    const keys = ['provider_latency', 'build_health', 'memory_pressure', 'council_mood',
      'goose_energy', 'smith_alert_level', 'weatherman_forecast', 'funding'];
    const emojis = { provider_latency: '🌐', build_health: '🔧', memory_pressure: '🧠',
      council_mood: '💭', goose_energy: '🪿', smith_alert_level: '⚔️', weatherman_forecast: '🌦', funding: '💰' };
    for (const k of keys) {
      if (JSON.stringify(current[k]) !== JSON.stringify(def[k]))
        changed.push({ key: k, val: current[k], emoji: emojis[k] || '?' });
    }
    if (current.active_incidents && current.active_incidents.length)
      changed.push({ key: 'active_incidents', val: current.active_incidents.join(', '), emoji: '🚨' });
    return changed;
  }

  _sr() {
    try { const { SoulRegistry } = require('./soul-registry'); return new SoulRegistry(); }
    catch (_) { return { souls: {} }; }
  }

  _wrap(text, prefix) {
    if (!text) return [prefix];
    const lines = [], words = text.split(' ');
    let line = prefix;
    for (const word of words) {
      if ((line + word).length > 66) { lines.push(line); line = prefix; }
      line += word + ' ';
    }
    if (line.trim() && line.trim() !== prefix.trim()) lines.push(line.trimEnd());
    return lines.length ? lines : [prefix + text];
  }

  /** Internal logger */
  _log(type, data) {
    // Currently just in-memory; could emit to a channel
  }
}

module.exports = Studio;
module.exports.Studio = Studio;
module.exports.DIRECTOR_INCIDENTS = DIRECTOR_INCIDENTS;
module.exports.INFLUENCE_TIERS = INFLUENCE_TIERS;
module.exports.duckObservation = duckObservation;
module.exports.DEFAULT_WORLD = DEFAULT_WORLD;
