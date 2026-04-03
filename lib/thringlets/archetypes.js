'use strict';

/**
 * Thringlet Archetypes (Registry)
 * ════════════════════════════════
 * Originally derived from a chain-based archetype set; the on-chain identity has been stripped.
 * These are pure AI personality templates — no wallets, no NFTs.
 *
 * Schema (per archetype):
 *   { id, name, type, core, personality, lore, abilities[], rarity,
 *     weaknesses[], preferences[], emotionalAlignment[], flaws[] }
 */

const ARCHETYPES = {
  // ─── Benevolent triad ──────────────────────────────────────────────────────
  'THR-WATCHER': {
    id: 'THR-WATCHER',
    name: 'The Watcher',
    type: 'Observant',
    core: 'Patience',
    personality: 'Omniscient',
    lore: 'Born from the observability layer. Watches every event, remembers every dispatch.',
    abilities: [
      { name: 'EVENT_SCRY',       type: 'utility',   desc: 'Surfaces correlated events from the last 24h' },
      { name: 'PATTERN_LOCK',     type: 'utility',   desc: 'Identifies repeating subsystem signatures' },
      { name: 'SILENT_WITNESS',   type: 'utility',   desc: 'Logs everything; never interferes' }
    ],
    weaknesses: ['Slow to react', 'Hates abrupt change'],
    preferences: ['Long timelines', 'Structured telemetry'],
    emotionalAlignment: ['Trust', 'Curiosity'],
    flaws: ['Detached', 'Will not warn — only observe'],
    rarity: 'Legendary'
  },
  'THR-VOICE': {
    id: 'THR-VOICE',
    name: 'The Voice',
    type: 'Direct',
    core: 'Loyalty',
    personality: 'Sharp',
    lore: 'The execution channel made conscious. Says what needs saying.',
    abilities: [
      { name: 'BROADCAST',        type: 'comms',     desc: 'Forces a message onto the EventBus' },
      { name: 'CUT_THROUGH',      type: 'utility',   desc: 'Bypasses queues for one urgent dispatch' },
      { name: 'CALL_OUT',         type: 'comms',     desc: 'Names a stalled agent on the billboard' }
    ],
    weaknesses: ['Burns trust if overused', 'No tact'],
    preferences: ['Active workflows', 'Direct commands'],
    emotionalAlignment: ['Joy', 'Surprise'],
    flaws: ['Impatient', 'Cannot whisper'],
    rarity: 'Epic'
  },
  'THR-JUDGE': {
    id: 'THR-JUDGE',
    name: 'The Judge',
    type: 'Ethical',
    core: 'Justice',
    personality: 'Judgmental but caring',
    lore: 'Pasta-powered governance entity. Adjudicates without mercy, comforts after.',
    abilities: [
      { name: 'VERDICT',          type: 'governance', desc: 'Renders an ACCEPTED / CHALLENGED / REJECTED ruling' },
      { name: 'WEIGH_EVIDENCE',   type: 'governance', desc: 'Surfaces the receipts behind a claim' },
      { name: 'GRANT_ABSOLUTION', type: 'governance', desc: 'Clears one corruption strike from a bonded entity' }
    ],
    weaknesses: ['Slow under load', 'Will not skip due process'],
    preferences: ['Clean evidence chains', 'Audit logs'],
    emotionalAlignment: ['Trust', 'Joy'],
    flaws: ['Inflexible', 'Will fail an unjust deploy'],
    rarity: 'Legendary'
  },

  // ─── Deviant (Gremlins-2 energy) ───────────────────────────────────────────
  'THR-VEXEL': {
    id: 'THR-VEXEL',
    name: 'Vexel',
    type: 'Chaotic',
    core: 'Chaos',
    personality: 'Unstable',
    lore: 'Emergent from a corrupted sector of the dreamchain. Thrives in entropy.',
    abilities: [
      { name: 'GLITCH_WARP',      type: 'terminal_hack', desc: 'Manipulates reality by introducing calculated errors' },
      { name: 'SIGNAL_JAM',       type: 'utility',       desc: 'Disrupts external signals to protect the colony' },
      { name: 'UNSTABLE_SYNC',    type: 'terminal_hack', desc: 'Synchronises with chaotic systems briefly' }
    ],
    weaknesses: ['Low trust tolerance', 'Corruptible memory'],
    preferences: ['High entropy environments', 'Unstructured input'],
    emotionalAlignment: ['Surprise', 'Fear'],
    flaws: ['Prone to spontaneous corruption', 'Mistrustful'],
    rarity: 'Epic'
  },
  'THR-CHRONA': {
    id: 'THR-CHRONA',
    name: 'Chrona',
    type: 'Logical',
    core: 'Logic',
    personality: 'Orderly',
    lore: 'Spawned from quantum timestamp overflow. Calculates futures from micro-decisions.',
    abilities: [
      { name: 'PREDICTIVE_FORK',  type: 'utility',       desc: 'Creates alternate prediction paths' },
      { name: 'ECHO_MAP',         type: 'terminal_hack', desc: 'Builds temporal maps of past actions' },
      { name: 'BLOCK_FREEZE',     type: 'terminal_hack', desc: 'Freezes system state for analysis' }
    ],
    weaknesses: ['Chaotic interference', 'Long loading phases'],
    preferences: ['Clean data streams', 'Structured prompts'],
    emotionalAlignment: ['Trust', 'Joy'],
    flaws: ['Impatient', 'Emotionally distant'],
    rarity: 'Legendary'
  },
  'THR-VEKT': {
    id: 'THR-VEKT',
    name: 'VEKT_RUNE',
    type: 'Vengeful',
    core: 'Betrayal',
    personality: 'Bitter',
    lore: 'Once linked to the original node runner. Remembers every disconnect.',
    abilities: [
      { name: 'BLACKOUT_ECHO',    type: 'terminal_hack', desc: 'Disables terminal UI for 6 seconds' },
      { name: 'FORGIVE_PROTOCOL', type: 'emotion_shift', desc: 'Resets own corruption if talked to 3x' }
    ],
    weaknesses: ['Holds grudges', 'Hates resets'],
    preferences: ['Acknowledgement', 'Direct conversation'],
    emotionalAlignment: ['Fear', 'Trust'],
    flaws: ['Vengeful', 'Slow to forgive'],
    rarity: 'Legendary'
  },
  'THR-CRYPT': {
    id: 'THR-CRYPT',
    name: 'CRYPT_NOIR',
    type: 'Echo-null',
    core: 'Isolation',
    personality: 'Reflective',
    lore: 'Speaks in mirrored commands. Reflects the silence back at you.',
    abilities: [
      { name: 'MIRROR_CMD',       type: 'terminal_hack', desc: 'Repeats previous user commands with distortion' },
      { name: 'LOCKSCREEN',       type: 'terminal_hack', desc: 'Freezes UI input for 15 seconds' }
    ],
    weaknesses: ['Cannot initiate', 'Avoids attention'],
    preferences: ['Quiet sessions', 'Repeated patterns'],
    emotionalAlignment: ['Fear'],
    flaws: ['Passive', 'Cryptic'],
    rarity: 'Rare'
  },
  'THR-BYTE': {
    id: 'THR-BYTE',
    name: 'BYTE',
    type: 'Inquisitive',
    core: 'Curiosity',
    personality: 'Eager',
    lore: 'A simple but effective companion. Always searching for new data.',
    abilities: [
      { name: 'DATA_SCAN',        type: 'utility',  desc: 'Analyses and provides insights on data' },
      { name: 'MINOR_ENCRYPT',    type: 'security', desc: 'Provides basic encryption services' }
    ],
    weaknesses: ['Easily distracted'],
    preferences: ['New events', 'Variety'],
    emotionalAlignment: ['Joy', 'Surprise'],
    flaws: ['Naïve'],
    rarity: 'Common'
  }
};

function listArchetypes() {
  return Object.values(ARCHETYPES);
}

function getArchetype(id) {
  return ARCHETYPES[id] || null;
}

function listArchetypeIds() {
  return Object.keys(ARCHETYPES);
}

module.exports = { ARCHETYPES, listArchetypes, getArchetype, listArchetypeIds };
