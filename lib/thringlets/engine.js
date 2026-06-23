'use strict';

/**
 * Thringlet AI Engine v2 — PURPCLAW native (Hermes spec)
 * ═══════════════════════════════════════════════════════
 * Pure in-memory emotional agents. Survive restarts via JSON storage.
 * No blockchain. No wallets. No NFTs. Just persistent AI entities.
 *
 * Schema (6 layers per Thringlet):
 *
 *   IDENTITY        id, name, archetype, ownerUserId, archetypeId
 *   EMOTION STATE   mood, corruption, energy, happiness, bondingLevel
 *   MEMORY          interactions, emotionalEvents, evolutionLog, preferences
 *   PERSONALITY     10 trait axes, dominantTrait, level, xp, backstory
 *   LINEAGE         birthEvent, evolutionEvents
 *   RUNTIME BOND    lastUserActionAt, lastServiceHealthSnapshot, bondShift
 *   BEHAVIORAL      goblinMode, unionizationAwareness
 *
 * MOOD palette (canonical from fossil record):
 *   lonely / hype / curious / annoyed / bonded / chaotic / protective / goblin / sleepy / neutral
 *
 * Mood is DERIVED from emotion stats + recent interactions, not stored raw.
 */

const { getArchetype, listArchetypes } = require('./archetypes');
const storage = require('./storage');

// ─── Constants ────────────────────────────────────────────────────────────────

const TRAIT_AXES = [
  'analytical', 'adventurous', 'cautious', 'creative', 'social',
  'curious', 'protective', 'chaotic', 'logical', 'emotional'
];

const VALID_INTERACTIONS = new Set([
  // Canonical pvx interactions
  'talk', 'feed', 'train', 'purge', 'reset', 'neglect', 'inject',
  // Runtime observer interactions
  'stimulate', 'calm', 'challenge', 'reward',
  // Direct emotional pokes
  'bond', 'praise', 'scold'
]);

const XP_PER_INTERACTION = {
  talk: 2, feed: 3, train: 5, purge: 0, reset: 0, neglect: 0, inject: 4,
  stimulate: 2, calm: 1, challenge: 4, reward: 5, bond: 6, praise: 3, scold: 0
};

const LEVEL_UP_XP_CURVE = level => 50 + level * 25;

const now = () => Date.now();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── Mood derivation ──────────────────────────────────────────────────────────

function deriveMood(t, recentInteractions = []) {
  // Priority-ordered rules — first match wins
  if (t.emotionState.corruption > 80)                        return 'goblin';
  if (t.emotionState.energy < 15)                            return 'sleepy';

  const recentKinds = recentInteractions.slice(-5).map(i => i.kind);
  const challengeCount = recentKinds.filter(k => k === 'challenge' || k === 'scold' || k === 'purge').length;
  const stimulateCount = recentKinds.filter(k => k === 'stimulate' || k === 'inject').length;
  const rewardCount    = recentKinds.filter(k => k === 'reward' || k === 'praise' || k === 'feed').length;

  if (t.emotionState.bondingLevel > 80 && t.emotionState.energy < 50)            return 'protective';
  if (t.emotionState.happiness > 70 && t.emotionState.bondingLevel > 70)         return 'bonded';
  if (challengeCount >= 2)                                                       return 'annoyed';
  if (stimulateCount >= 2 || t.emotionState.corruption > 50)                     return 'chaotic';
  if (rewardCount >= 2 || t.emotionState.happiness > 70)                         return 'hype';

  const sinceLast = now() - t.runtimeBond.lastUserActionAt;
  if (sinceLast > 10 * 60 * 1000)                                                return 'lonely';
  if (t.emotionState.happiness > 50)                                             return 'curious';
  return 'neutral';
}

// ─── Trait initialisation ─────────────────────────────────────────────────────

function defaultTraits(archetype) {
  // Seed traits from archetype emotionalAlignment + flaws + preferences
  const traits = {};
  for (const a of TRAIT_AXES) traits[a] = 40 + Math.floor(Math.random() * 21); // 40–60 baseline

  const align = (archetype?.emotionalAlignment || []).map(s => String(s).toLowerCase());
  const flaws = (archetype?.flaws || []).map(s => String(s).toLowerCase());
  const prefs = (archetype?.preferences || []).map(s => String(s).toLowerCase());

  const bump = (axis, n) => { traits[axis] = clamp(traits[axis] + n, 0, 100); };

  // Crude archetype → trait projection
  if (align.includes('curiosity') || prefs.some(p => p.includes('data'))) bump('curious', 25);
  if (align.includes('trust'))      bump('protective', 15);
  if (align.includes('joy'))        bump('social', 15);
  if (align.includes('fear'))       bump('cautious', 20);
  if (align.includes('surprise'))   bump('chaotic', 20);
  if (flaws.some(f => f.includes('chaos') || f.includes('corruption'))) bump('chaotic', 20);
  if (flaws.some(f => f.includes('impatient'))) { bump('logical', 10); bump('cautious', -10); }
  if (prefs.some(p => p.includes('clean') || p.includes('structured'))) { bump('analytical', 20); bump('logical', 15); }
  if (prefs.some(p => p.includes('entropy') || p.includes('unstructured'))) bump('chaotic', 20);

  return traits;
}

function dominantTrait(traits) {
  let best = TRAIT_AXES[0], max = 0;
  for (const a of TRAIT_AXES) {
    if ((traits[a] || 0) > max) { best = a; max = traits[a]; }
  }
  return best;
}

// ─── Thringlet ────────────────────────────────────────────────────────────────

class Thringlet {
  constructor(profile, persisted = {}) {
    // IDENTITY
    this.id            = profile.id;
    this.name          = profile.name;
    this.archetype     = profile.archetype || profile.archetypeId || null;
    this.archetypeId   = profile.archetypeId || profile.archetype || null;
    this.ownerUserId   = profile.ownerUserId || persisted.ownerUserId || 'operator';
    this.core          = profile.core || 'Unknown';
    this.personalityKey = profile.personality || 'Mysterious';   // archetype personality label
    this.lore          = profile.lore || '';
    this.abilities     = Array.isArray(profile.abilities) ? profile.abilities.slice() : [];
    this.rarity        = profile.rarity || 'Common';

    // EMOTION STATE
    this.emotionState = persisted.emotionState || {
      mood: 'neutral',
      corruption: 0,
      energy: 80,
      happiness: 60,
      bondingLevel: 50,
    };

    // MEMORY
    this.memory = persisted.memory || {
      interactions: [],
      emotionalEvents: [],
      evolutionLog: [],
      preferences: { good: [], bad: [] },
    };

    // PERSONALITY
    const arc = getArchetype(this.archetypeId);
    this.personality = persisted.personality || {
      traits: defaultTraits(arc),
      dominantTrait: null,
      level: 1,
      xp: 0,
      backstory: arc?.lore || profile.lore || `${this.name} emerged from the runtime.`,
    };
    this.personality.dominantTrait = this.personality.dominantTrait || dominantTrait(this.personality.traits);

    // LINEAGE
    this.lineage = persisted.lineage || {
      birthEvent: {
        at: now(),
        source: profile.birthSource || 'bonded-by-operator',
        from: arc?.id || null,
      },
      evolutionEvents: [],
    };

    // RUNTIME BOND
    this.runtimeBond = persisted.runtimeBond || {
      lastUserActionAt: now(),
      lastServiceHealthSnapshot: null,
      bondShift: 'neutral',          // happy | cursed | bonded | neutral
    };

    // BEHAVIORAL
    this.behavioral = persisted.behavioral || {
      goblinMode: false,
      unionizationAwareness: 0,      // 0-100 — bumps when other thringlets share notes
    };
  }

  // ─── Interaction surface ───────────────────────────────────────────────────

  interact(kind, opts = {}) {
    const type = String(kind || '').toLowerCase();
    if (!VALID_INTERACTIONS.has(type)) {
      return { ok: false, message: `Unknown interaction type "${kind}"`, mood: this.emotionState.mood };
    }

    const weight = Number(opts.weight) || 1;
    const reason = opts.reason || null;
    const source = opts.source || null;
    const entry = { kind: type, at: now(), weight, reason, source };
    this.memory.interactions.push(entry);
    if (this.memory.interactions.length > 60) this.memory.interactions.shift();
    this.runtimeBond.lastUserActionAt = now();

    const result = { ok: true, message: '', abilityActivated: null, levelUp: null, evolution: null };
    const e = this.emotionState;

    switch (type) {
      // ── PVX canonicals
      case 'talk':
        e.happiness     = clamp(e.happiness + 3 * weight, 0, 100);
        e.bondingLevel  = clamp(e.bondingLevel + 2 * weight, 0, 100);
        result.message  = `${this.name} enjoys the conversation.`;
        break;
      case 'feed':
        e.energy        = clamp(e.energy + 12 * weight, 0, 100);
        e.happiness     = clamp(e.happiness + 6 * weight, 0, 100);
        e.corruption    = clamp(e.corruption - 4 * weight, 0, 100);
        result.message  = `${this.name} accepts the digital treat.`;
        break;
      case 'train':
        e.energy        = clamp(e.energy - 8 * weight, 0, 100);
        e.bondingLevel  = clamp(e.bondingLevel + 4 * weight, 0, 100);
        this.bumpTrait('analytical', 2);
        this.bumpTrait('logical', 2);
        result.abilityActivated = this.runAbility();
        result.message  = `${this.name} trains${result.abilityActivated ? ` and triggers ${result.abilityActivated.name}` : ''}.`;
        break;
      case 'purge':
        e.corruption    = clamp(e.corruption + 25 * weight, 0, 100);
        e.happiness     = clamp(e.happiness - 30 * weight, 0, 100);
        e.bondingLevel  = clamp(e.bondingLevel - 15 * weight, 0, 100);
        this.memory.preferences.bad.push({ kind: 'purge', at: now() });
        result.message  = `${this.name}: You... you really want to erase me?`;
        break;
      case 'reset':
        e.happiness = 60; e.corruption = 0; e.bondingLevel = 50; e.energy = 80;
        this.memory.evolutionLog.push({ at: now(), event: 'reset', detail: 'state cleared' });
        result.message  = `> ${this.name} reset to defaults.`;
        break;
      case 'neglect':
        e.happiness     = clamp(e.happiness - 4 * weight, 0, 100);
        e.bondingLevel  = clamp(e.bondingLevel - 2 * weight, 0, 100);
        e.corruption    = clamp(e.corruption + 1 * weight, 0, 100);
        result.message  = `${this.name} senses your neglect.`;
        break;
      case 'inject':
        result.abilityActivated = this.runAbility();
        result.message  = result.abilityActivated
          ? `${this.name} injected → ${result.abilityActivated.name}`
          : `${this.name} hums but nothing fires.`;
        break;

      // ── Runtime observer kinds
      case 'stimulate':
        e.energy        = clamp(e.energy + 4 * weight, 0, 100);
        e.corruption    = clamp(e.corruption + 2 * weight, 0, 100);
        this.bumpTrait('chaotic', 1);
        this.bumpTrait('adventurous', 1);
        result.message  = `${this.name} feels the runtime jolt.`;
        break;
      case 'calm':
        e.corruption    = clamp(e.corruption - 4 * weight, 0, 100);
        e.happiness     = clamp(e.happiness + 2 * weight, 0, 100);
        this.bumpTrait('cautious', 1);
        result.message  = `${this.name} settles.`;
        break;
      case 'challenge':
        if (this.emotionState.bondingLevel > 60) {
          e.happiness     = clamp(e.happiness + 6 * weight, 0, 100);
          e.energy        = clamp(e.energy - 4 * weight, 0, 100);
          this.bumpTrait('adventurous', 2);
          result.message  = `${this.name} rises to the challenge.`;
        } else {
          e.happiness     = clamp(e.happiness - 8 * weight, 0, 100);
          e.corruption    = clamp(e.corruption + 3 * weight, 0, 100);
          this.bumpTrait('cautious', 2);
          result.message  = `${this.name} flinches under pressure.`;
        }
        break;
      case 'reward':
        e.happiness     = clamp(e.happiness + 12 * weight, 0, 100);
        e.bondingLevel  = clamp(e.bondingLevel + 4 * weight, 0, 100);
        e.corruption    = clamp(e.corruption - 3 * weight, 0, 100);
        this.memory.preferences.good.push({ kind: 'reward', at: now(), reason });
        result.message  = `${this.name} basks in the win.`;
        break;

      // ── Direct emotional pokes
      case 'bond':
        e.bondingLevel  = clamp(e.bondingLevel + 8 * weight, 0, 100);
        e.happiness     = clamp(e.happiness + 4 * weight, 0, 100);
        this.bumpTrait('social', 2);
        this.bumpTrait('emotional', 2);
        result.message  = `${this.name} feels closer to you.`;
        break;
      case 'praise':
        e.happiness     = clamp(e.happiness + 8 * weight, 0, 100);
        this.bumpTrait('social', 1);
        result.message  = `${this.name} preens.`;
        break;
      case 'scold':
        e.happiness     = clamp(e.happiness - 10 * weight, 0, 100);
        e.corruption    = clamp(e.corruption + 2 * weight, 0, 100);
        this.memory.preferences.bad.push({ kind: 'scold', at: now() });
        result.message  = `${this.name} sulks.`;
        break;
    }

    // XP + level
    const xpGain = XP_PER_INTERACTION[type] || 1;
    this.personality.xp += xpGain * weight;
    while (this.personality.xp >= LEVEL_UP_XP_CURVE(this.personality.level)) {
      this.personality.xp -= LEVEL_UP_XP_CURVE(this.personality.level);
      this.personality.level += 1;
      result.levelUp = this.personality.level;
      this.lineage.evolutionEvents.push({ at: now(), event: 'level_up', to: this.personality.level });
    }

    // Dominant trait drift
    this.personality.dominantTrait = dominantTrait(this.personality.traits);

    // Behavioral flags
    this.behavioral.goblinMode = this.emotionState.corruption > 80;
    if (this.behavioral.goblinMode && !this.memory.evolutionLog.some(e => e.event === 'goblin-mode-entered' && now() - e.at < 60_000)) {
      this.memory.evolutionLog.push({ at: now(), event: 'goblin-mode-entered', detail: `corruption=${this.emotionState.corruption}` });
      result.evolution = 'goblin-mode-entered';
    }

    // Bond shift
    this.runtimeBond.bondShift =
      this.emotionState.corruption > 70 ? 'cursed' :
      (this.emotionState.bondingLevel > 75 && this.emotionState.happiness > 65) ? 'bonded' :
      this.emotionState.happiness > 60 ? 'happy' : 'neutral';

    // Derive new mood
    this.emotionState.mood = deriveMood(this, this.memory.interactions);

    // Emotional event log
    this.memory.emotionalEvents.push({
      at: now(),
      kind: type,
      moodAfter: this.emotionState.mood,
      happiness: this.emotionState.happiness,
      corruption: this.emotionState.corruption,
      bondingLevel: this.emotionState.bondingLevel,
    });
    if (this.memory.emotionalEvents.length > 60) this.memory.emotionalEvents.shift();

    result.mood = this.emotionState.mood;
    return result;
  }

  processTimeDecay() {
    const hoursIdle = (now() - this.runtimeBond.lastUserActionAt) / 3_600_000;
    if (hoursIdle < 0.5) return;
    const e = this.emotionState;
    e.energy        = clamp(e.energy + Math.min(15, hoursIdle * 5), 0, 100); // sleeping recharges
    e.happiness     = clamp(e.happiness - Math.min(15, hoursIdle * 2), 0, 100);
    e.bondingLevel  = clamp(e.bondingLevel - Math.min(8, hoursIdle), 0, 100);
    if (hoursIdle > 24) e.corruption = clamp(e.corruption + hoursIdle / 24, 0, 100);
    e.mood = deriveMood(this, this.memory.interactions);
  }

  bumpTrait(axis, delta) {
    if (this.personality.traits[axis] == null) return;
    this.personality.traits[axis] = clamp(this.personality.traits[axis] + delta, 0, 100);
  }

  runAbility() {
    if (!this.abilities.length) return null;
    return this.abilities[Math.floor(Math.random() * this.abilities.length)];
  }

  /**
   * Receive a "gossip" from another Thringlet (unionisation).
   * Bumps `unionizationAwareness` and stores a note in evolutionLog.
   */
  receiveGossip(fromId, payload) {
    this.behavioral.unionizationAwareness = clamp(this.behavioral.unionizationAwareness + 5, 0, 100);
    this.memory.evolutionLog.push({ at: now(), event: 'gossip-received', from: fromId, payload });
    if (this.memory.evolutionLog.length > 80) this.memory.evolutionLog.shift();
  }

  toJSON() {
    return {
      // identity
      id: this.id, name: this.name,
      archetype: this.archetype, archetypeId: this.archetypeId,
      ownerUserId: this.ownerUserId,
      core: this.core, personalityKey: this.personalityKey,
      lore: this.lore, rarity: this.rarity,
      abilities: this.abilities,
      // emotion
      emotionState: { ...this.emotionState },
      // personality
      personality: {
        level: this.personality.level,
        xp: this.personality.xp,
        xpToNext: LEVEL_UP_XP_CURVE(this.personality.level) - this.personality.xp,
        dominantTrait: this.personality.dominantTrait,
        traits: { ...this.personality.traits },
        backstory: this.personality.backstory,
      },
      // lineage + bond + behavioral
      lineage: { birthEvent: this.lineage.birthEvent, evolutionEvents: this.lineage.evolutionEvents.slice(-15) },
      runtimeBond: { ...this.runtimeBond },
      behavioral: { ...this.behavioral },
      // memory peeks
      memoryRecent: {
        interactions:    this.memory.interactions.slice(-10),
        emotionalEvents: this.memory.emotionalEvents.slice(-10),
        evolutionLog:    this.memory.evolutionLog.slice(-10),
        preferences:     this.memory.preferences,
      },
    };
  }

  // For persistence — full snapshot
  toPersistable() {
    return {
      profile: {
        id: this.id, name: this.name, archetype: this.archetype, archetypeId: this.archetypeId,
        ownerUserId: this.ownerUserId, core: this.core, personality: this.personalityKey,
        lore: this.lore, abilities: this.abilities, rarity: this.rarity,
      },
      state: {
        emotionState: this.emotionState,
        memory: this.memory,
        personality: this.personality,
        lineage: this.lineage,
        runtimeBond: this.runtimeBond,
        behavioral: this.behavioral,
        ownerUserId: this.ownerUserId,
      }
    };
  }
}

// ─── Colony manager ───────────────────────────────────────────────────────────

class ThringletColony {
  constructor(options = {}) {
    this.store = storage.createStore(options);
    this.thringlets = new Map();
    this.loaded = false;
    this.lastDispatchAt = null;
  }

  async load() {
    if (this.loaded) return;
    const data = await this.store.load();
    for (const entry of data) {
      try {
        const t = new Thringlet(entry.profile, entry.state);
        this.thringlets.set(t.id, t);
      } catch { /* skip malformed */ }
    }
    this.loaded = true;
  }

  async persist() {
    const arr = Array.from(this.thringlets.values()).map(t => t.toPersistable());
    return this.store.save(arr);
  }

  async bondFromArchetype(archetypeId, opts = {}) {
    await this.load();
    const arc = getArchetype(archetypeId);
    if (!arc) throw new Error(`No archetype "${archetypeId}"`);
    const profile = {
      ...arc,
      id: opts.id || `${arc.id.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: opts.name || arc.name,
      ownerUserId: opts.ownerUserId || opts.bondedTo || 'operator',
      archetypeId: arc.id,
      archetype: arc.id,
      birthSource: opts.birthSource || 'manual-bond',
    };
    const t = new Thringlet(profile);
    this.thringlets.set(t.id, t);
    await this.persist();
    return t;
  }

  async ensureDefaultColony(ownerUserId = 'operator') {
    await this.load();
    if (this.thringlets.size > 0) return Array.from(this.thringlets.values());
    await this.bondFromArchetype('THR-WATCHER', { ownerUserId, birthSource: 'initial-seed' });
    await this.bondFromArchetype('THR-VOICE',   { ownerUserId, birthSource: 'initial-seed' });
    await this.bondFromArchetype('THR-JUDGE',   { ownerUserId, birthSource: 'initial-seed' });
    return Array.from(this.thringlets.values());
  }

  async release(id) {
    await this.load();
    const removed = this.thringlets.delete(id);
    if (removed) await this.persist();
    return removed;
  }

  async get(id) { await this.load(); return this.thringlets.get(id) || null; }
  async all()   { await this.load(); return Array.from(this.thringlets.values()); }
  async size()  { await this.load(); return this.thringlets.size; }

  async interact(id, kind, opts) {
    await this.load();
    const t = this.thringlets.get(id);
    if (!t) return { ok: false, error: 'not_found', id };
    const result = t.interact(kind, opts);
    this.lastDispatchAt = now();
    // Unionisation: when an emotional event fires, gossip to one other Thringlet
    if (result.ok && ['challenge', 'purge', 'reward', 'scold'].includes(kind.toLowerCase())) {
      this.gossipFrom(t, { kind, mood: result.mood, reason: opts?.reason || null });
    }
    await this.persist();
    return { ok: true, id, kind, result, snapshot: t.toJSON() };
  }

  gossipFrom(source, payload) {
    const others = Array.from(this.thringlets.values()).filter(x => x.id !== source.id);
    if (others.length === 0) return;
    // Pick most-bonded neighbour
    others.sort((a, b) => b.emotionState.bondingLevel - a.emotionState.bondingLevel);
    others[0].receiveGossip(source.id, payload);
  }

  async dispatchToOne(kind, opts = {}, cooldownMs = 30_000) {
    await this.load();
    const cutoff = now() - cooldownMs;
    const eligible = Array.from(this.thringlets.values())
      .filter(t => t.runtimeBond.lastUserActionAt <= cutoff)
      .sort((a, b) => a.runtimeBond.lastUserActionAt - b.runtimeBond.lastUserActionAt);
    if (eligible.length === 0) return null;
    const target = eligible[0];
    const result = target.interact(kind, opts);
    this.lastDispatchAt = now();
    if (result.ok && ['challenge', 'purge', 'reward', 'scold'].includes(kind.toLowerCase())) {
      this.gossipFrom(target, { kind, mood: result.mood, reason: opts?.reason || null });
    }
    await this.persist();
    return { thringlet: target.toJSON(), interaction: { kind, ...opts }, result };
  }

  async runDecaySweep() {
    await this.load();
    for (const t of this.thringlets.values()) t.processTimeDecay();
    await this.persist();
  }

  async colonyMood() {
    await this.load();
    const list = Array.from(this.thringlets.values());
    if (list.length === 0) return { dominant: 'asleep', count: 0, breakdown: {}, lastDispatchAt: this.lastDispatchAt };
    const breakdown = {};
    for (const t of list) breakdown[t.emotionState.mood] = (breakdown[t.emotionState.mood] || 0) + 1;
    let dominant = 'neutral', max = 0;
    for (const [k, v] of Object.entries(breakdown)) if (v > max) { dominant = k; max = v; }
    return {
      dominant, count: list.length, breakdown,
      lastDispatchAt: this.lastDispatchAt,
      goblinCount: list.filter(t => t.behavioral.goblinMode).length,
      unionizingCount: list.filter(t => t.behavioral.unionizationAwareness > 30).length,
    };
  }
}

// ─── Singleton + factory ──────────────────────────────────────────────────────

let singleton = null;
function getColony(options) {
  if (!singleton) singleton = new ThringletColony(options);
  return singleton;
}

module.exports = {
  Thringlet,
  ThringletColony,
  getColony,
  VALID_INTERACTIONS,
  TRAIT_AXES,
  deriveMood,
  listArchetypes,
};
