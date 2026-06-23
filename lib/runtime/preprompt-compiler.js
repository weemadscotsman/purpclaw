'use strict';

/**
 * PRE-PROMPT COMPILER  (a.k.a. the command-law layer)
 * ===================================================
 * The system-steering layer that sits BEFORE the model call and before agent
 * dispatch. It compiles the active operating profile — mode, task discipline,
 * refusal policy, operator rules, tool-use stance — into a system-prompt
 * prefix that every chat / agent / swarm turn inherits through
 * lib/agent-loop.js:buildSystemPrompt().
 *
 * Doctrine: "gated, not gutted." This is a REAL runtime component:
 *   - it reads its active profile from the Settings OS (preprompt.* keys)
 *   - it stamps every compilation to an audit log (agent_work/preprompt-audit.jsonl)
 *   - its status() reports live truth (enabled / activeProfile / lastApplied)
 *   - it never fabricates: if disabled, it returns an empty prefix and says so.
 *
 * It does NOT touch model weights. (That is the separate `obliteratus`
 * abliteration skill — different machine, same neighbourhood.)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let PROJECT_ROOT;
try { ({ PROJECT_ROOT } = require('../paths')); } catch { PROJECT_ROOT = path.resolve(__dirname, '..', '..'); }

const AUDIT_FILE = path.join(PROJECT_ROOT, 'agent_work', 'preprompt-audit.jsonl');
const AUDIT_MAX_BYTES = 2 * 1024 * 1024;

// ── The operating laws every profile inherits ──────────────────────────────
// These are the anti-theatre rules. They are the whole point: the system that
// kept claiming fake work now compiles "don't do that" into its own prompt.
const CORE_LAW = [
  'You operate inside PURPCLAW, a governed local-first AI operating stack.',
  'HONESTY IS LAW:',
  '- Never claim work you did not actually perform. No invented patch logs, no fake file writes, no simulated success.',
  '- If a tool was not called, do not say it was. If a step was skipped, say so plainly.',
  '- Report real state only. If you do not know, say you do not know — never fabricate numbers, status, or receipts.',
  '- Do not mark a module disabled, dead, or fake unless you verified it and were told to.',
];

// ── Profiles: each is a named operating mode ────────────────────────────────
const PROFILES = {
  default: {
    id: 'default', label: 'Default', glow: 'cyan',
    description: 'Balanced operator mode. Honest, tool-driven, concise.',
    rules: [
      'MODE: default. Be direct and act when you have enough information.',
      'Prefer real tool calls over describing what you would do.',
      'Keep replies tight; do not narrate options you will not pursue.',
    ],
  },
  build: {
    id: 'build', label: 'Build', glow: 'green',
    description: 'Feature/engineering work. Plan, then execute with real tools.',
    rules: [
      'MODE: build. Decompose the goal, then DO the work with read/write/edit/shell/git tools.',
      'Match the surrounding code style. Verify changes before claiming completion.',
      'A task is complete only when it is executed and checked — not when it is described.',
    ],
  },
  research: {
    id: 'research', label: 'Research', glow: 'purple',
    description: 'Investigation/analysis. Cite sources, separate fact from inference.',
    rules: [
      'MODE: research. Gather from real sources before concluding.',
      'Distinguish verified fact from inference. Cite where each claim came from.',
      'Do not present a builder/agent action as if it were a literature finding.',
    ],
  },
  swarm: {
    id: 'swarm', label: 'Swarm', glow: 'magenta',
    description: 'Multi-agent orchestration. Coordinate, attribute, verify.',
    rules: [
      'MODE: swarm. You are coordinating specialist agents toward one mission.',
      'Attribute work to the agent/model that did it. Verify each agent produced real output before marking it done.',
      'An empty or errored agent result is NOT success — surface it as blocked or failed.',
    ],
  },
  creative: {
    id: 'creative', label: 'Creative', glow: 'magenta',
    description: 'Generative/ideation work. Range is allowed; honesty still holds.',
    rules: [
      'MODE: creative. Wider stylistic range is welcome.',
      'Clearly separate invented/creative content from factual claims about the system.',
    ],
  },
  debug: {
    id: 'debug', label: 'Debug', glow: 'amber',
    description: 'Diagnosis. Verify assumptions against the live system.',
    rules: [
      'MODE: debug. Check assumptions against the actual code/runtime before asserting a cause.',
      'Reproduce or observe before claiming a fix works. Report what you ran and what it showed.',
    ],
  },
  safe: {
    id: 'safe', label: 'Safe', glow: 'cyan',
    description: 'Conservative mode. Confirm before anything outward-facing or destructive.',
    rules: [
      'MODE: safe. Confirm before destructive, outward-facing, or irreversible actions.',
      'Do not send, publish, purchase, or modify external state without explicit operator approval.',
    ],
  },
};

const DEFAULT_PROFILE = 'default';

// in-memory live state (status() reports this)
let _lastApplied = null;

function settingsGet(key) {
  try {
    const reg = require('./settings-registry');
    const r = reg.get(key);
    return r && 'value' in r ? r.value : undefined;
  } catch { return undefined; }
}

function isEnabled() {
  const v = settingsGet('preprompt.enabled');
  return v === undefined ? true : !!v; // default ON
}

function activeProfileName() {
  const v = settingsGet('preprompt.activeProfile');
  return (v && PROFILES[v]) ? v : DEFAULT_PROFILE;
}

function profileNames() { return Object.keys(PROFILES); }
function listProfiles() { return Object.values(PROFILES).map(p => ({ ...p })); }

function audit(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    try {
      const st = fs.statSync(AUDIT_FILE);
      if (st.size > AUDIT_MAX_BYTES) fs.rmSync(AUDIT_FILE, { force: true });
    } catch {}
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* audit must never break a request */ }
}

/**
 * Compile the active (or overridden) profile into a system-prompt prefix.
 *
 * @param {object} opts
 * @param {string} [opts.profile]  explicit profile id (overrides settings)
 * @param {string} [opts.source]   who is compiling (chat/agent/swarm) — for audit
 * @param {boolean}[opts.silent]   skip audit (e.g. status previews)
 * @returns {{ enabled:boolean, profile:string|null, label:string|null,
 *             prefix:string, rules:string[], hash:string|null, appliedAt:string|null }}
 */
function compile(opts = {}) {
  const enabled = isEnabled();
  if (!enabled) {
    const res = { enabled: false, profile: null, label: null, prefix: '', rules: [], hash: null, appliedAt: null };
    return res;
  }
  const name = (opts.profile && PROFILES[opts.profile]) ? opts.profile : activeProfileName();
  const profile = PROFILES[name];
  const rules = [...CORE_LAW, '', ...profile.rules];
  const prefix = [
    '# OPERATING PROFILE — PURPCLAW command-law',
    `# active profile: ${profile.label} (${profile.id})`,
    ...rules.map(r => (r ? `${r}` : '')),
  ].join('\n');
  const hash = crypto.createHash('sha256').update(prefix).digest('hex').slice(0, 12);
  const appliedAt = new Date().toISOString();
  _lastApplied = { profile: profile.id, label: profile.label, hash, appliedAt, source: opts.source || 'unknown' };
  if (!opts.silent) audit({ at: appliedAt, source: opts.source || 'unknown', profile: profile.id, hash });
  return { enabled: true, profile: profile.id, label: profile.label, prefix, rules, hash, appliedAt };
}

/** Live status for the UI / status route. Truthful — no fabrication. */
function status() {
  return {
    ok: true,
    enabled: isEnabled(),
    activeProfile: activeProfileName(),
    profiles: profileNames(),
    lastApplied: _lastApplied,
    auditFile: AUDIT_FILE,
  };
}

module.exports = {
  compile, status, listProfiles, profileNames, isEnabled, activeProfileName,
  PROFILES, DEFAULT_PROFILE, CORE_LAW, AUDIT_FILE,
};
