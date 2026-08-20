'use strict';
/**
 * lib/mission-envelope.js — the mission execution contract.
 *
 * One tiny bar in the composer describes how the whole OS should handle the
 * next instruction. This module is that contract, normalised once and shared
 * verbatim by every surface (Web / CLI / TUI / Desktop / Mobile). A surface
 * that cannot render a control still sends a valid envelope, because every
 * field has a default here rather than in the UI.
 *
 * The rule that makes this real rather than decorative:
 *
 *   ACCESS IS ENFORCEMENT, EVERYTHING ELSE IS INTENT.
 *
 * `access` resolves to a permission profile that the tool dispatcher checks
 * deterministically before a call runs. Mode, agents, speed and intelligence
 * shape the prompt — a model can ignore them. It cannot ignore the profile.
 *
 * `memory` is a RECALL SCOPE for this mission, never an off-switch for the
 * seven-layer spine. The engine stays alive at every level; the scope decides
 * how far recall is allowed to reach. 'off' means "don't reach outside this
 * turn", not "amnesia".
 */

// Composer value → canonical permission profile in lib/permission-manager.js.
// These are the four rungs of the human-supervision dial.
const ACCESS = Object.freeze({
  'read-only':     { profile: 'workspace-read-only', label: 'Read Only',     rank: 0 },
  'review':        { profile: 'standard',            label: 'Review',        rank: 1 },
  'agent-actions': { profile: 'trusted',             label: 'Agent Actions', rank: 2 },
  'full-system':   { profile: 'dangerous',           label: 'Full System',   rank: 3 },
});

const MODES   = ['chat', 'plan', 'execute', 'swarm'];
// Recall reach, not an on/off switch for the spine.
const MEMORY  = ['off', 'session', 'project', 'persistent'];
const SPEEDS  = ['fast', 'balanced', 'deep'];
const INTEL   = ['low', 'medium', 'high', 'extreme'];
const PROVIDERS = ['auto', 'openai', 'claude', 'gemini', 'deepseek', 'kimi', 'qwen', 'local'];

// Which memory layers each scope may read. The spine always WRITES; scope
// only bounds recall — that is the distinction the composer must not blur.
const MEMORY_REACH = Object.freeze({
  off:        { layers: [], crossSession: false, crossProject: false },
  session:    { layers: ['episodic'], crossSession: false, crossProject: false },
  project:    { layers: ['episodic', 'semantic', 'procedural'], crossSession: true, crossProject: false },
  persistent: { layers: ['episodic', 'semantic', 'procedural', 'symbolic', 'temporal', 'counterfactual', 'affective'], crossSession: true, crossProject: true },
});

const slug = (v) => String(v ?? '').toLowerCase().trim().replace(/[\s_]+/g, '-');
const pick = (v, allowed, dflt) => (allowed.includes(slug(v)) ? slug(v) : dflt);
const arr  = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);

/**
 * Normalise anything a surface sends into a complete, valid envelope.
 * Never throws — an unknown value falls back to its safe default, because a
 * malformed envelope must not become an excuse to run with more privilege.
 */
function normalize(input = {}) {
  const e = input.envelope || input;
  // Accept both composer casing ("Full System") and wire casing ("full-system").
  const access = ACCESS[pick(e.access, Object.keys(ACCESS), 'review')] ? pick(e.access, Object.keys(ACCESS), 'review') : 'review';
  return {
    mode:         pick(e.mode, MODES, 'chat'),
    agents:       arr(e.agents),
    provider:     pick(e.provider, PROVIDERS, 'auto'),
    speed:        pick(e.speed, SPEEDS, 'balanced'),
    intelligence: pick(e.intelligence, INTEL, 'medium'),
    memory:       pick(e.memory, MEMORY, 'project'),
    workspace:    e.workspace ? String(e.workspace) : 'current-folder',
    chips:        arr(e.chips),
    attachments:  arr(e.attachments),
    context:      arr(e.context),
    access,
  };
}

/** The profile the tool dispatcher must enforce for this envelope. */
function permissionProfile(env) {
  return ACCESS[normalize(env).access].profile;
}

/** How far recall may reach for this mission. */
function memoryReach(env) {
  return MEMORY_REACH[normalize(env).memory];
}

/**
 * Advisory block appended to the system prompt. Intent only — it tells the
 * model what the operator chose; the dispatcher is what makes it true.
 */
function toPromptBlock(env) {
  const n = normalize(env);
  const a = ACCESS[n.access];
  return [
    '# Mission envelope (operator-selected, this turn)',
    `Mode: ${n.mode}  ·  Speed: ${n.speed}  ·  Intelligence: ${n.intelligence}`,
    `Provider: ${n.provider}  ·  Workspace: ${n.workspace}  ·  Memory scope: ${n.memory}`,
    n.agents.length ? `Agents enabled: ${n.agents.join(', ')}` : 'Agents enabled: none',
    n.chips.length ? `Quick actions: ${n.chips.join(', ')}` : '',
    `Access level: ${a.label} (enforced as permission profile "${a.profile}")`,
    '',
    'ENABLING IS NOT INSTRUCTING. These selections GRANT capability; they do',
    'not ask you to use it. If the user says "hi", say hi — do not spawn a',
    'swarm because Swarm mode is available. Use the least capability the',
    'request actually needs.',
    n.mode === 'plan' ? 'Plan mode: produce a plan. Do not execute changes.' : '',
    n.access === 'read-only' ? 'Read Only: every mutating tool WILL be refused. Do not attempt one.' : '',
  ].filter(Boolean).join('\n');
}

module.exports = {
  normalize, permissionProfile, memoryReach, toPromptBlock,
  ACCESS, MODES, MEMORY, SPEEDS, INTEL, PROVIDERS, MEMORY_REACH,
};
