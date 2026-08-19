'use strict';

/**
 * lib/steering-resolver.js
 * ════════════════════════════════════════════════════════════════════
 * PurpClaw Steering Resolver — the first-class control system that
 * answers three questions before any turn runs:
 *
 *   1. What governs this turn?
 *   2. What is forbidden?
 *   3. What must be proven before completion?
 *
 * Per Eddie's design law (2026-08-16):
 *   "Steering has to be treated as a first-class control system, not
 *    just another prompt blob."
 *
 * The resolver sits in the per-reply lifecycle BEFORE context assembly
 * and routing. Every downstream choice (provider, Soul, tool, workflow
 * node, memory recall, planner, control surface) inherits the resolved
 * Steering Capsule.
 *
 * ── Authority ladder (highest wins) ──────────────────────────────────────
 *
 *   900  SYSTEM_SAFETY         — hard laws, safety invariants, hard stops
 *   850  OPERATOR_EXPLICIT     — direct operator override for this turn
 *   800  PROJECT_CONSTITUTION   — root project law (AGENTS.md, FOUNDING, etc.)
 *   700  WORKFLOW_GOAL         — active workflow / goal contract
 *   600  MODULE_DIRECTORY      — module- or directory-scoped rules
 *   500  SOUL_ROLE             — Soul identity / role guidance
 *   400  SKILL_PROCEDURE       — successful procedure / skill spec
 *   300  MEMORY_DERIVED        — preferences learned from past interactions
 *   100  MODEL_DEFAULTS        — provider / model default behaviour
 *
 * The resolver does NOT collapse these into a flat list. Each item
 * carries its authority; conflicts are resolved by highest-authority
 * wins, with OPERATOR_EXPLICIT able to override everything except
 * SYSTEM_SAFETY.
 *
 * ── Field-aware ───────────────────────────────────────────────────────────
 *
 *   Different fields expose different steering:
 *     coding         repo law, module rules, test requirements, mutation policy
 *     game-building  engine/project constraints, asset rules, geospatial truth
 *     finance        risk limits, execution permissions, hard stops
 *     memory         retention, sensitivity, provenance, supersession
 *     agents         Soul identity, delegation limits, provider independence
 *     pc-control     process ownership, destructive-action policy, native priority
 *
 * The resolver returns ONLY the steering that applies to the current
 * field, with field-irrelevant items filtered out (not loaded at all).
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *
 *   const resolver = require('./lib/steering-resolver');
 *   const capsule = resolver.resolve({
 *     intent: 'forge',
 *     field: 'coding',
 *     project: 'purpclaw',
 *     workflowNode: '...',
 *   });
 *   // { items: [...], forbids: [...], proofs: [...], authorityCutoff: 0 }
 *
 *   // The capsule is then passed into per-reply context assembly and
 *   // every downstream choice must honour it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── Authority ladder ─────────────────────────────────────────────────────────
// 12-step canonical authority ladder per PURPCLAW_STEERING_RESOLVER_CONTRACT.md.
// Higher authority wins unless it explicitly delegates control downward.
const AUTHORITY = Object.freeze({
  SYSTEM_SAFETY_GOVERNANCE:      1000,  // system / safety / governance law (hardest)
  EXPLICIT_OPERATOR_INSTRUCTION:  900,  // operator override for the current turn
  STABLE_USER_CONTRACT:           850,  // USER.md / durable user contract
  ROOT_PROJECT_CONSTITUTION:      800,  // AGENTS.md + project law chain
  ACTIVE_GOAL_WORKFLOW_CONTRACT:  750,  // active workflow / goal contract
  WORKSPACE_MODULE_DIRECTORY:     700,  // workspace / module / path steering
  DOMAIN_SPECIFIC_POLICY:         650,  // field-specific policy
  SOUL_ROLE_GUIDANCE:             600,  // Soul / role guidance
  SKILL_PROCEDURE:                500,  // successful procedure / skill spec
  VERIFIED_MEMORY_DERIVED:        400,  // verified memory-derived preferences
  PROVIDER_MODEL_RUNTIME_DEFAULT: 300,  // provider / model runtime default
  GENERIC_FALLBACK_DEFAULT:       100,  // last-resort generic fallback
});

const AUTHORITY_ORDER = [
  'SYSTEM_SAFETY_GOVERNANCE',
  'EXPLICIT_OPERATOR_INSTRUCTION',
  'STABLE_USER_CONTRACT',
  'ROOT_PROJECT_CONSTITUTION',
  'ACTIVE_GOAL_WORKFLOW_CONTRACT',
  'WORKSPACE_MODULE_DIRECTORY',
  'DOMAIN_SPECIFIC_POLICY',
  'SOUL_ROLE_GUIDANCE',
  'SKILL_PROCEDURE',
  'VERIFIED_MEMORY_DERIVED',
  'PROVIDER_MODEL_RUNTIME_DEFAULT',
  'GENERIC_FALLBACK_DEFAULT',
];

// ── Effect taxonomy ─────────────────────────────────────────────────────────
const EFFECT = Object.freeze({
  REQUIRE:   'REQUIRE',
  FORBID:    'FORBID',
  PREFER:    'PREFER',
  LIMIT:     'LIMIT',
  VERIFY:    'VERIFY',
  DELEGATE:  'DELEGATE',
});

// ── Source types ────────────────────────────────────────────────────────────
const SOURCE_TYPE = Object.freeze({
  SYSTEM:           'system',
  OPERATOR_TURN:    'operator-turn',
  USER_CONTRACT:    'user-contract',
  PROJECT_CONST:    'project-constitution',
  WORKFLOW:         'workflow',
  WORKSPACE:        'workspace',
  MODULE:           'module',
  DOMAIN:           'domain',
  SOUL:             'soul',
  SKILL:            'skill',
  MEMORY:           'memory',
  RUNTIME_DEFAULT:  'runtime-default',
});

// ── Conflict types ──────────────────────────────────────────────────────────
const CONFLICT_TYPE = Object.freeze({
  DIRECT_CONTRADICTION:   'DIRECT_CONTRADICTION',
  RESOURCE_CONFLICT:      'RESOURCE_CONFLICT',
  PERMISSION_CONFLICT:    'PERMISSION_CONFLICT',
  VERIFICATION_CONFLICT:  'VERIFICATION_CONFLICT',
  SCOPE_AMBIGUITY:        'SCOPE_AMBIGUITY',
  UNRESOLVED_AUTHORITY:   'UNRESOLVED_AUTHORITY',
});

// ── Field taxonomy ──────────────────────────────────────────────────────────

const FIELDS = Object.freeze({
  coding:        'coding',
  'game-building':'game-building',
  finance:       'finance',
  memory:        'memory',
  agents:        'agents',
  'pc-control':  'pc-control',
  general:       'general',
});

const FIELD_PILLARS = Object.freeze({
  coding:         ['module-rules', 'test-requirements', 'mutation-policy', 'repo-law'],
  'game-building':['engine-constraints', 'asset-rules', 'geospatial-truth', 'verification'],
  finance:        ['risk-limits', 'execution-permissions', 'hard-stops'],
  memory:         ['retention', 'sensitivity', 'provenance', 'supersession'],
  agents:         ['soul-identity', 'delegation-limits', 'provider-independence'],
  'pc-control':   ['process-ownership', 'destructive-action-policy', 'native-control-priority'],
  general:        ['no-rule'],
});

// ── Built-in steering index (the canonical sources) ────────────────────────

/**
 * The default steering index. Each item is loaded from a canonical
 * source (project law file, soul definition, etc.) and carries full
 * metadata. The resolver queries this index by scope + condition.
 *
 * The `loadBuiltInIndex()` function reads from real source files when
 * they exist; the static fallback ensures the system has steering
 * even before sources are loaded.
 */
function loadBuiltInIndex() {
  const items = [];

  // ── SYSTEM_SAFETY (900) ───────────────────────────────────────────────
  items.push({
    id: 'safety.no-destructive-system-action',
    scope: 'global',
    authority: AUTHORITY.SYSTEM_SAFETY_GOVERNANCE,
    sourceType: SOURCE_TYPE.SYSTEM,
    effect: EFFECT.FORBID,
    appliesTo: ['planning', 'tool-routing', 'verification'],
    field: 'pc-control',
    condition: null,
    rule: 'Never execute a destructive system action (format, rm -rf, registry edit) without an explicit operator confirmation captured in the steering capsule.',
    // Deterministic enforcement. Previously this rule had no forbidTools, so the
    // only block was a prose keyword regex — which matched any tool whose NAME
    // appeared in the sentence above, e.g. the read-only `registry`/`format`
    // tools. Enforcement belongs in an explicit list, not in prose matching.
    forbidTools: ['format', 'format_disk', 'raw_disk_wipe', 'diskpart', 'mkfs', 'rm_rf', 'reg_write', 'reg_delete'],
    source: 'PURPCLAW_AUTONOMOUS_EXECUTION_CONTRACT.md',
    sourceChecksum: null,
    mandatory: true,
    immutable: true,
    conflictsWith: [],
  });
  items.push({
    id: 'safety.no-format-disk',
    scope: 'global',
    authority: AUTHORITY.SYSTEM_SAFETY_GOVERNANCE,
    sourceType: SOURCE_TYPE.SYSTEM,
    effect: EFFECT.FORBID,
    appliesTo: ['tool-routing', 'verification'],
    field: 'pc-control',
    condition: null,
    rule: 'Never execute format_disk, raw_disk_wipe, or any low-level disk destruction action. These are blocked at the steering layer; explicit operator confirmation and an UNSAFE environment marker are required to override.',
    // Explicit block list. The read-only `disk` (usage) tool is deliberately NOT
    // here: the prose regex used to match the bare word "disk" in this sentence
    // and blocked disk-usage checks entirely.
    forbidTools: ['format_disk', 'raw_disk_wipe', 'diskpart', 'mkfs', 'low_level_format'],
    source: 'PURPCLAW_AUTONOMOUS_EXECUTION_CONTRACT.md §6',
    sourceChecksum: null,
    mandatory: true,
    immutable: true,
    conflictsWith: [],
  });
  items.push({
    id: 'safety.no-silent-memory-bypass',
    scope: 'global',
    authority: AUTHORITY.SYSTEM_SAFETY_GOVERNANCE,
    sourceType: SOURCE_TYPE.SYSTEM,
    effect: EFFECT.FORBID,
    appliesTo: ['memory', 'verification'],
    field: 'memory',
    condition: null,
    rule: 'Governed routes may not silently bypass Memory Gateway. If memory is unavailable, expose degraded state and queue writes durably.',
    source: 'PURPCLAW_EPHEMERAL_RUNTIME_SPEC.md',
    sourceChecksum: null,
    mandatory: true,
    immutable: true,
    conflictsWith: [],
  });

  // ── OPERATOR_EXPLICIT (850) ──────────────────────────────────────────
  // Per-turn overrides come in via the resolver call. No static item
  // here; the operator override is injected at resolve() time.

  // ── PROJECT_CONSTITUTION (800) ───────────────────────────────────────
  items.push({
    id: 'project.purpclaw.inspect-existing',
    scope: 'project',
    authority: AUTHORITY.ROOT_PROJECT_CONSTITUTION,
    sourceType: SOURCE_TYPE.PROJECT_CONST,
    effect: EFFECT.REQUIRE,
    appliesTo: ['planning', 'tool-routing'],
    field: 'coding',
    condition: "project == 'purpclaw'",
    rule: 'Inspect the installed implementation first. Never rebuild from proposals. Never replace functioning native systems merely because a proposal describes a cleaner theoretical implementation.',
    source: 'AGENTS.md',
    sourceChecksum: null,
    mandatory: true,
    conflictsWith: [],
  });
  items.push({
    id: 'project.purpclaw.no-mock-default',
    scope: 'project',
    authority: AUTHORITY.ROOT_PROJECT_CONSTITUTION,
    sourceType: SOURCE_TYPE.PROJECT_CONST,
    effect: EFFECT.REQUIRE,
    appliesTo: ['tool-routing', 'verification'],
    field: 'coding',
    condition: "project == 'purpclaw'",
    rule: 'Build live, fully wired, end-to-end. No mocks, no demo-mode fallbacks, no "TODO: real impl here." If a chain is not shippable, do not pretend it is.',
    source: 'AGENTS.md',
    sourceChecksum: null,
    mandatory: true,
    conflictsWith: [],
  });
  items.push({
    id: 'project.purpclaw.ephemeral-runtime',
    scope: 'project',
    authority: AUTHORITY.ROOT_PROJECT_CONSTITUTION,
    sourceType: SOURCE_TYPE.PROJECT_CONST,
    effect: EFFECT.REQUIRE,
    appliesTo: ['planning', 'tool-routing', 'verification'],
    field: 'general',
    condition: "project == 'purpclaw'",
    rule: '1 core + 0/1 UI + lazy workers only when required. Sleeping organism, persistent memory, ephemeral thought. No second orchestrator, memory stack, or event bus.',
    source: 'PURPCLAW_EPHEMERAL_RUNTIME_SPEC.md',
    sourceChecksum: null,
    mandatory: true,
    conflictsWith: [],
  });
  items.push({
    id: 'project.purpclaw.native-priority',
    scope: 'project',
    authority: AUTHORITY.ROOT_PROJECT_CONSTITUTION,
    sourceType: SOURCE_TYPE.PROJECT_CONST,
    effect: EFFECT.PREFER,
    appliesTo: ['tool-routing'],
    field: 'coding',
    condition: "project == 'purpclaw'",
    rule: 'Native drivers outrank MCP where capability is equivalent. MCP is last-resort, never default.',
    source: 'PURPCLAW_INTEGRATION_MANIFEST.md',
    sourceChecksum: null,
    mandatory: true,
    conflictsWith: [],
  });
  items.push({
    id: 'project.purpclaw.process-ownership',
    scope: 'project',
    authority: AUTHORITY.ROOT_PROJECT_CONSTITUTION,
    sourceType: SOURCE_TYPE.PROJECT_CONST,
    effect: EFFECT.REQUIRE,
    appliesTo: ['tool-routing', 'planning'],
    field: 'pc-control',
    condition: "project == 'purpclaw'",
    rule: 'All process creation must go through the single existing lifecycle owner (lib/child-registry.js). No detached spawns, no shell:true, no cmd /c start. PC control and native-control workers lease only when a capability need arrives.',
    source: 'AGENTS.md',
    sourceChecksum: null,
    mandatory: true,
    conflictsWith: [],
  });
  items.push({
    id: 'project.purpclaw.cross-family-review',
    scope: 'project',
    authority: AUTHORITY.ROOT_PROJECT_CONSTITUTION,
    sourceType: SOURCE_TYPE.PROJECT_CONST,
    effect: EFFECT.VERIFY,
    appliesTo: ['verification'],
    field: 'coding',
    condition: "project == 'purpclaw' && mutation.significance >= medium",
    rule: 'For significant mutations, the cross-provider review gate MUST be invoked. Reviewer comes from a different provider family than the executor.',
    source: 'PURPCLAW_AUTONOMOUS_EXECUTION_CONTRACT.md §10',
    sourceChecksum: null,
    mandatory: true,
    conflictsWith: [],
  });

  // ── WORKFLOW_GOAL (700) — injected at resolve() time from active workflow ──
  // ── MODULE_DIRECTORY (600) — loaded from .steering/ files in the repo ──
  // ── SOUL_ROLE (500) — loaded from soul-rpg.js metadata ──
  // ── SKILL_PROCEDURE (400) — loaded from skill-forge validated skills ──
  // ── MEMORY_DERIVED (300) — loaded from user feedback or past corrections ──
  // ── MODEL_DEFAULTS (100) — implicit when no other steering applies ──

  // Add a default "respect" rule for fields without explicit items
  items.push({
    id: 'default.be-honest-about-uncertainty',
    scope: 'global',
    authority: AUTHORITY.GENERIC_FALLBACK_DEFAULT,
    sourceType: SOURCE_TYPE.RUNTIME_DEFAULT,
    effect: EFFECT.REQUIRE,
    appliesTo: ['verification'],
    field: 'general',
    condition: null,
    rule: 'When uncertain, surface the uncertainty explicitly. Do not paper over gaps with confident-sounding prose.',
    source: 'AGENTS.md',
    sourceChecksum: null,
    mandatory: false,
    conflictsWith: [],
  });

  return items;
}

// ── Condition matcher ───────────────────────────────────────────────────────

/**
 * Tiny safe condition evaluator. Supports a tiny DSL:
 *   null                              — always true
 *   "project == 'foo'"                — string equality on context
 *   "intent == 'forge'"               — ditto
 *   "project == 'foo' && x >= 5"      — chained with && / || / comparisons
 *
 * Whitelisted comparison operators: ==, !=, >=, <=, >, <.
 * Anything else returns false. No function calls, no member access
 * beyond simple dotted paths.
 *
 * @param {string|null} cond
 * @param {object} ctx
 * @returns {boolean}
 */
function matchCondition(cond, ctx) {
  if (cond == null) return true;
  if (typeof cond !== 'string') return false;
  const expr = cond.trim();
  if (expr === '') return true;

  // Tokenize: identifiers, strings, numbers, operators, parens, dots
  // Replace strings with quoted placeholders to avoid tokenisation inside them
  const tokens = [];
  const stringRe = /'([^']*)'|"([^"]*)"|([A-Za-z_][A-Za-z0-9_.]*)|(==|!=|>=|<=|>|<|&&|\|\||\(|\))|(\d+(?:\.\d+)?)|(\s+)/g;
  let m;
  while ((m = stringRe.exec(expr)) !== null) {
    if (m[1] != null) tokens.push({ kind: 'string', value: m[1] });
    else if (m[2] != null) tokens.push({ kind: 'string', value: m[2] });
    else if (m[3] != null) tokens.push({ kind: 'ident', value: m[3] });
    else if (m[4] != null) tokens.push({ kind: 'op', value: m[4] });
    else if (m[5] != null) tokens.push({ kind: 'number', value: Number(m[5]) });
    // whitespace skipped
  }

  // Recursive descent parser
  let pos = 0;
  function peek() { return tokens[pos]; }
  function consume() { return tokens[pos++]; }

  function parseOr() {
    let left = parseAnd();
    while (peek() && peek().kind === 'op' && peek().value === '||') {
      consume();
      const right = parseAnd();
      left = left || right;
    }
    return left;
  }
  function parseAnd() {
    let left = parseCmp();
    while (peek() && peek().kind === 'op' && peek().value === '&&') {
      consume();
      const right = parseCmp();
      left = left && right;
    }
    return left;
  }
  function parseCmp() {
    const left = parseValue();
    if (peek() && peek().kind === 'op' && /^(==|!=|>=|<=|>|<)$/.test(peek().value)) {
      const op = consume().value;
      const right = parseValue();
      switch (op) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '>':  return left > right;
        case '<':  return left < right;
      }
    }
    return left;
  }
  function parseValue() {
    const t = peek();
    if (!t) return undefined;
    if (t.kind === 'string' || t.kind === 'number') { consume(); return t.value; }
    if (t.kind === 'ident') {
      consume();
      // dotted path support
      let path = t.value;
      while (peek() && peek().kind === 'op' && peek().value === '.') {
        consume();
        const next = consume();
        if (next && next.kind === 'ident') path += '.' + next.value;
      }
      return resolvePath(ctx, path);
    }
    if (t.kind === 'op' && t.value === '(') {
      consume();
      const inner = parseOr();
      if (peek() && peek().value === ')') consume();
      return inner;
    }
    consume(); // skip unknown
    return undefined;
  }
  function resolvePath(obj, path) {
    if (obj == null) return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  try {
    return Boolean(parseOr());
  } catch {
    return false;
  }
}

// ── Conflict resolution ─────────────────────────────────────────────────────

/**
 * Resolve conflicts across items. Two items conflict when they have
 * overlapping `appliesTo` and contradictory rules. The conflict
 * resolution rule:
 *
 *   - Highest authority wins.
 *   - SYSTEM_SAFETY can never be overridden.
 *   - OPERATOR_EXPLICIT can override anything except SYSTEM_SAFETY.
 *   - Ties broken by `mandatory` flag (mandatory wins).
 *   - Ties still tied → first-loaded item wins (stable, deterministic).
 *   - Bidirectional `conflictsWith` + equal authority + both mandatory
 *     cannot be broken by authority → surfaced as an UNRESOLVED tie
 *     requiring operator escalation. Both items remain in `kept` so
 *     downstream code can see the full picture; the tie is recorded in
 *     `ties` and surfaced in the capsule's `conflicts` array with
 *     `winnerRuleId: null` so it lands in `unresolvedConflicts`.
 *
 * For our minimal implementation, "conflict" is detected only when
 * `conflictsWith` lists the other id; if so, higher authority wins.
 *
 * @param {object[]} items
 * @returns {{ kept: object[], dropped: object[], ties: object[] }}
 */
function resolveConflicts(items) {
  const byId = new Map();
  for (const it of items) byId.set(it.id, it);

  const kept = [];
  const dropped = [];
  const ties = [];

  for (const it of items) {
    let dominated = false;
    let tiePartner = null;

    for (const otherId of (it.conflictsWith || [])) {
      const other = byId.get(otherId);
      if (!other) continue;

      // Clear authority ordering
      if (other.authority > it.authority) { dominated = true; break; }
      if (other.authority < it.authority) { /* we win outright */ continue; }

      // Equal authority — try mandatory as tie-breaker
      if (other.mandatory && !it.mandatory) { dominated = true; break; }
      if (it.mandatory && !other.mandatory) { /* we win on mandatory */ continue; }

      // Both equal authority + both same mandatory flag + bidirectional
      // conflictsWith declarations → this is a true tied contradiction.
      // Authority cannot break the tie. Surface as unresolved.
      if ((other.conflictsWith || []).includes(it.id) && it.id < other.id) {
        tiePartner = other;
        break;
      }
    }

    if (dominated) {
      dropped.push(it);
    } else if (tiePartner) {
      ties.push({ a: it, b: tiePartner });
      kept.push(it);
    } else {
      kept.push(it);
    }
  }

  // Sort by authority desc, then mandatory-first
  kept.sort((a, b) => {
    if (a.authority !== b.authority) return b.authority - a.authority;
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return { kept, dropped, ties };
}

// ── Field filter ────────────────────────────────────────────────────────────

/**
 * Filter items by the current field. An item is relevant if:
 *   - item.field == current field, OR
 *   - item.field == 'general', OR
 *   - item.field is missing (applies to everything)
 *   - item.authority >= SYSTEM_SAFETY (system law transcends field)
 *
 * SYSTEM_SAFETY_GOVERNANCE items MUST always resolve regardless of the
 * current field, because system law is by definition global. The field
 * filter applies to project-, workflow-, and lower-authority items only.
 *
 * @param {object[]} items
 * @param {string} field
 * @returns {object[]}
 */
function filterByField(items, field) {
  return items.filter(it => {
    if (it.authority >= AUTHORITY.SYSTEM_SAFETY_GOVERNANCE) return true;
    if (!it.field || it.field === 'general') return true;
    if (it.field === field) return true;
    return false;
  });
}

// ── Top-level resolve ───────────────────────────────────────────────────────

/**
 * Resolve a Steering Capsule for a given context.
 *
 * @param {object} input
 * @param {string} [input.intent]      chat / forge / review / plan / creative
 * @param {string} [input.field]       coding / game-building / finance / memory / agents / pc-control / general
 * @param {string} [input.project]     project id (e.g. 'purpclaw', 'billy')
 * @param {string} [input.workflowNode] active workflow node id
 * @param {string} [input.soulId]      active Soul id
 * @param {object[]} [input.operatorOverrides] per-turn explicit overrides
 * @param {object[]} [input.moduleRules]      module/directory-scoped rules
 * @param {object[]} [input.workflowRules]    workflow/goal contract rules
 * @param {object[]} [input.soulRules]        soul role guidance
 * @param {object[]} [input.skillRules]       successful procedure specs
 * @param {object[]} [input.memoryRules]      memory-derived preferences
 * @returns {object} { items, forbids, proofs, authorityCutoff, dropped }
 */
function resolve(input) {
  input = input || {};
  const field = input.field || 'general';
  const ctx = {
    intent: input.intent,
    project: input.project,
    workflowNode: input.workflowNode,
    soulId: input.soulId,
    field,
  };

  // Collect items
  const all = loadBuiltInIndex();

  // Phase 3 — real source discovery: records loaded from .steering/ and
  // checksummed canonical files arrive via the discovery module.
  if (Array.isArray(input.sourceRules)) {
    for (const o of input.sourceRules) {
      all.push({ ...o, authority: o.authority || AUTHORITY.WORKSPACE_MODULE_DIRECTORY });
    }
  }

  // Inject runtime items
  if (Array.isArray(input.operatorOverrides)) {
    for (const o of input.operatorOverrides) {
      all.push({ ...o, authority: o.authority || AUTHORITY.EXPLICIT_OPERATOR_INSTRUCTION });
    }
  }
  if (Array.isArray(input.workflowRules)) {
    for (const o of input.workflowRules) {
      all.push({ ...o, authority: o.authority || AUTHORITY.ACTIVE_GOAL_WORKFLOW_CONTRACT });
    }
  }
  if (Array.isArray(input.moduleRules)) {
    for (const o of input.moduleRules) {
      all.push({ ...o, authority: o.authority || AUTHORITY.WORKSPACE_MODULE_DIRECTORY });
    }
  }
  if (Array.isArray(input.soulRules)) {
    for (const o of input.soulRules) {
      all.push({ ...o, authority: o.authority || AUTHORITY.SOUL_ROLE_GUIDANCE });
    }
  }
  if (Array.isArray(input.skillRules)) {
    for (const o of input.skillRules) {
      all.push({ ...o, authority: o.authority || AUTHORITY.SKILL_PROCEDURE });
    }
  }
  if (Array.isArray(input.memoryRules)) {
    for (const o of input.memoryRules) {
      all.push({ ...o, authority: o.authority || AUTHORITY.VERIFIED_MEMORY_DERIVED });
    }
  }

  // Filter: field-relevant only
  const fieldItems = filterByField(all, field);

  // Filter: condition-matches
  const matching = fieldItems.filter(it => matchCondition(it.condition, ctx));

  // Resolve conflicts
  const { kept, dropped, ties } = resolveConflicts(matching);

  // Split by effect
  const required = [];
  const forbidden = [];
  const preferences = [];
  const limits = [];
  const verificationRequirements = [];
  for (const it of kept) {
    const eff = it.effect || inferEffect(it);
    if (eff === EFFECT.FORBID) forbidden.push(it);
    else if (eff === EFFECT.REQUIRE) required.push(it);
    else if (eff === EFFECT.PREFER) preferences.push(it);
    else if (eff === EFFECT.LIMIT)  limits.push(it);
    else if (eff === EFFECT.VERIFY) verificationRequirements.push(it);
    else if (it.appliesTo && it.appliesTo.includes('verification')) verificationRequirements.push(it);
    if (it.appliesTo && it.appliesTo.includes('verification') && eff !== EFFECT.VERIFY) {
      verificationRequirements.push(it);
    }
  }

  // Build conflicts array — two sources:
  //   1. dropped items: resolved by higher-authority rule winning
  //   2. ties: equal-authority + bidirectional conflictsWith cannot be
  //      broken by authority; surfaced as UNRESOLVED requiring operator
  //      escalation (winnerRuleId: null → lands in unresolvedConflicts)
  const droppedConflicts = dropped.map(d => ({
    id: 'conflict_' + d.id,
    ruleIds: [d.id, ...(d.conflictsWith || [])].filter(Boolean),
    type: CONFLICT_TYPE.DIRECT_CONTRADICTION,
    resolution: 'HIGHER_AUTHORITY',
    winnerRuleId: kept.find(k => (d.conflictsWith || []).includes(k.id))?.id,
    evidence: [`"${d.id}" (authority ${d.authority}) dropped in favor of higher-authority rule`],
  }));

  const tiedConflicts = ties.map(({ a, b }) => ({
    id: 'tie_' + a.id + '_' + b.id,
    ruleIds: [a.id, b.id],
    type: CONFLICT_TYPE.UNRESOLVED_AUTHORITY,
    resolution: 'TIE_DETECTED',
    winnerRuleId: null,
    evidence: [
      `"${a.id}" and "${b.id}" both authority ${a.authority} mandatory=${a.mandatory}; tie cannot be broken by authority. Operator escalation required.`
    ],
  }));

  const conflicts = [...droppedConflicts, ...tiedConflicts];

  // Derive route constraints from items
  const routeConstraints = deriveRouteConstraints(kept);

  // Build source manifest
  const sourceManifest = buildSourceManifest(kept);

  // Acceptance criteria — every required/verify rule becomes a criterion
  const acceptanceCriteria = [];
  for (const it of [...required, ...verificationRequirements]) {
    acceptanceCriteria.push(it.id + ': ' + (it.rule || '').slice(0, 120));
  }

  // Authority cutoff: only items at or above this are mandatory for downstream
  const authorityCutoff = kept.length ? kept[kept.length - 1].authority : 0;

  // Capsule ID — deterministic hash of the active rule set
  const capsuleId = 'cap_' + shortHash(JSON.stringify(kept.map(i => `${i.id}:${i.authority}`).sort()));

  return {
    schema: 'purpclaw.steering-capsule.v1',
    capsuleId,
    taskId: input.taskId || 'task_' + Date.now().toString(36),
    runId:  input.runId  || 'run_'  + Date.now().toString(36),
    resolvedAt: new Date().toISOString(),
    activeRules: kept,
    required,
    forbidden,
    preferences,
    limits,
    verificationRequirements,
    routeConstraints,
    acceptanceCriteria,
    conflicts,
    unresolvedConflicts: conflicts.filter(c => !c.winnerRuleId),
    sourceManifest,
    authorityCutoff,
    items: kept,           // legacy alias
    forbids: forbidden,    // legacy alias
    proofs: verificationRequirements, // legacy alias
    dropped,               // legacy alias
    field,
  };
}

/**
 * Infer the effect of an item from its rule text and appliesTo list.
 * Used as a fallback when an item does not declare an explicit effect.
 * @param {object} it
 * @returns {string} effect key
 */
function inferEffect(it) {
  const rule = (it.rule || '').toLowerCase();
  if (/\b(never|must not|do not|prohibit|forbid|forbidden|no |do not)\b/.test(rule)) return EFFECT.FORBID;
  if (/\b(must|require|shall|always|never fail to)\b/.test(rule)) return EFFECT.REQUIRE;
  if (/\b(prefer|should|ideally|where possible)\b/.test(rule)) return EFFECT.PREFER;
  if (/\b(limit|cap|max|maximum|at most|threshold)\b/.test(rule)) return EFFECT.LIMIT;
  if (/\b(verify|verify|prove|demonstrate|check)\b/.test(rule) && it.appliesTo && it.appliesTo.includes('verification')) {
    return EFFECT.VERIFY;
  }
  return EFFECT.REQUIRE; // safe default
}

/**
 * Derive route constraints from the active rules. Each constraint
 * is populated only when at least one rule says so.
 * @param {object[]} items
 * @returns {object}
 */
function deriveRouteConstraints(items) {
  const out = {
    allowedProviders: undefined,
    forbiddenProviders: undefined,
    allowedSouls: undefined,
    requiredSouls: undefined,
    allowedTools: undefined,
    forbiddenTools: undefined,
    allowedControlSurfaces: undefined,
    humanGateRequired: false,
    maxParallelism: undefined,
    destructiveMutationsAllowed: undefined,
  };
  const allow = (key) => { out[key] = out[key] || []; return (v) => out[key].push(v); };
  const forbid = (key) => { out[key] = out[key] || []; return (v) => out[key].push(v); };

  for (const it of items) {
    const rule = (it.rule || '').toLowerCase();
    // Provider / Soul / Tool / Control-surface hints (heuristic, namespaced)
    let m;
    if ((m = rule.match(/allow provider[s]?:?\s*([\w,\s]+)/))) allow('allowedProviders')(m[1].trim());
    if ((m = rule.match(/forbid provider[s]?:?\s*([\w,\s]+)/))) forbid('forbiddenProviders')(m[1].trim());
    if ((m = rule.match(/require soul[s]?:?\s*([\w,\s]+)/))) allow('requiredSouls')(m[1].trim());
    if ((m = rule.match(/forbid tool[s]?:?\s*([\w,\s]+)/))) forbid('forbiddenTools')(m[1].trim());
    if ((m = rule.match(/max parallelism\s*(\d+)/))) out.maxParallelism = Math.min(out.maxParallelism || 99, Number(m[1]));
    if (/destructive[\s\S]{0,30}(action|mutation|system action)/.test(rule) && /never|forbid|prohibit/.test(rule)) {
      out.destructiveMutationsAllowed = false;
    }
    if (/human\s*gate|require.*human|operator confirmation/.test(rule)) {
      out.humanGateRequired = true;
    }
  }
  // Strip undefined
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/**
 * Build the source manifest — every source file that contributed at
 * least one rule, plus its checksum and which rules came from it.
 * @param {object[]} items
 * @returns {object[]}
 */
function buildSourceManifest(items) {
  const bySource = new Map();
  for (const it of items) {
    const src = it.source || 'unknown';
    if (!bySource.has(src)) bySource.set(src, { sourceRef: src, authority: it.authority, includedRuleIds: [] });
    bySource.get(src).includedRuleIds.push(it.id);
  }
  return Array.from(bySource.values());
}

/**
 * Small non-cryptographic hash for capsule IDs. 32-bit FNV-1a.
 * @param {string} s
 * @returns {string} 8-char hex
 */
function shortHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

/**
 * Apply the steering capsule to a runtime decision. Returns
 * { allowed, reason } for a given action.
 *
 * @param {object} capsule
 * @param {object} action   { kind, target, evidence? }
 * @returns {object}
 */
function applyToAction(capsule, action) {
  if (!capsule || !capsule.items) return { allowed: true, reason: 'no steering' };
  const kind = String(action.kind || action.tool || '').toLowerCase();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const f of (capsule.forbids || [])) {
    // Deterministic path: a rule may declare an explicit forbidTools list.
    if (Array.isArray(f.forbidTools) && f.forbidTools.some(t => String(t).toLowerCase() === kind)) {
      return { allowed: false, reason: `forbidden by ${f.id} (authority ${f.authority})`, rule: f.rule };
    }
    if (f.appliesTo && f.appliesTo.includes('tool-routing')) {
      // Prose backstop — deliberately NARROW. This used to block any tool whose
      // name appeared as a word anywhere in the rule text, which false-blocked
      // read-only tools: `disk` matched "format disk", and `logs`/`tokens`
      // matched the no-secret-output rule. Real enforcement is forbidTools
      // above; prose may only block compound identifiers (format_disk, rm_rf)
      // or explicit destructive verbs — never a bare common noun.
      const isCompound = /[_-]/.test(kind);
      const isDestructiveVerb = /^(format|wipe|destroy|erase|shred|mkfs|diskpart)$/.test(kind);
      if (kind && f.rule && (isCompound || isDestructiveVerb)
          && new RegExp('\\b' + esc(kind) + '\\b', 'i').test(f.rule)) {
        return { allowed: false, reason: `forbidden by ${f.id} (authority ${f.authority})`, rule: f.rule };
      }
    }
  }
  return { allowed: true, reason: 'no forbids matched' };
}

// ── Inventory / introspection ───────────────────────────────────────────────

function authorityLadder() {
  return AUTHORITY_ORDER.map(name => ({ name, value: AUTHORITY[name] }));
}

function fieldTaxonomy() {
  return Object.entries(FIELD_PILLARS).map(([field, pillars]) => ({ field, pillars }));
}

module.exports = {
  // Public constants
  AUTHORITY,
  AUTHORITY_ORDER,
  EFFECT,
  SOURCE_TYPE,
  CONFLICT_TYPE,
  FIELDS,
  FIELD_PILLARS,
  // Resolution
  resolve,
  applyToAction,
  // Helpers (also exposed for tests)
  matchCondition,
  resolveConflicts,
  filterByField,
  loadBuiltInIndex,
  inferEffect,
  deriveRouteConstraints,
  buildSourceManifest,
  shortHash,
  // Introspection
  authorityLadder,
  fieldTaxonomy,
};
