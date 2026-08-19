'use strict';

/**
 * lib/per-reply-supervisor.js
 * ════════════════════════════════════════════════════════════════════
 * The always-on spine. The single entry point for every turn.
 *
 * Per PURPCLAW_PER_REPLY_LIFECYCLE.md and
 * PURPCLAW_MINIMAL_ALWAYS_ON_CORE.md, the supervisor is the only thing
 * that must be alive at idle. Everything else sleeps.
 *
 * This module is a real implementation, not a stub. It:
 *   1. Classifies the incoming message (chat / cron / event / command)
 *   2. Queries existing modules (soul-rpg, provider-parliament,
 *      forge loop) to determine which capability pillars this turn
 *      needs
 *   3. Produces an observable Pillar Activation Plan
 *   4. Optionally executes the plan via planAndRun()
 *
 * The plan is the contract. It is JSON, auditable, and tells every
 * downstream observer exactly which subsystems woke up and which
 * stayed dormant.
 *
 * Design law (FOUNDING_PRINCIPLES.md §11):
 *   "Persistent information, transient computation.
 *    Load context by relevance. Spawn capability by necessity.
 *    Tear it down after verified completion."
 *
 * Usage:
 *   const sup = require('./lib/per-reply-supervisor');
 *   const plan = sup.planPillars({ message: 'review the auth PR' });
 *   // { pillarsToSpawn: [...], pillarsDormant: [...], routing: {...} }
 *   const result = await sup.planAndRun({ message: 'review the auth PR' });
 *   // { result, verified, plan, pillarsSpawned, footprintMs }
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// ── Pillars registry ─────────────────────────────────────────────────────────
// Every capability pillar in the system, classified as either
// "always-needed" (cheap to spawn, always on for any meaningful turn)
// or "conditional" (only spawned when the routing decision says so).
//
// The full list is the source of truth for what CAN be active.
// The plan is the source of truth for what IS active for a given turn.

const PILLARS = {
  // Always-needed at the spine level
  'user-md':           { name: 'user-md',           class: 'always-needed',  description: 'USER.md contract loader (tiny, always relevant)' },
  'memory-md':         { name: 'memory-md',         class: 'always-needed',  description: 'MEMORY.md contract loader (tiny, always relevant)' },
  'checkpoint-reader': { name: 'checkpoint-reader', class: 'always-needed',  description: 'Fetch current goal / workflow / node from state DB' },
  'soul-rpg':          { name: 'soul-rpg',          class: 'always-needed',  description: 'Soul routing by class / reputation / fatigue' },
  'provider-parliament': { name: 'provider-parliament', class: 'always-needed', description: 'Provider selection by capability + cost + benchmark' },
  'control-router':    { name: 'control-router',    class: 'conditional',    description: 'MCP-as-fallback router for tool calls' },

  // Conditional — spawn only when the turn drives them
  'event-spine-recent':  { name: 'event-spine-recent',  class: 'conditional',  description: 'Recent event fetch (when state changes need history)' },
  'skills-matcher':      { name: 'skills-matcher',      class: 'conditional',  description: 'Skill trigger pattern matching' },
  'cognitive-layers':    { name: 'cognitive-layers',    class: 'conditional',  description: 'Top-K relevant facts / relations / episodes' },
  'cryosleep':           { name: 'cryosleep',           class: 'conditional',  description: 'Resume hibernated goal' },
  'forge-loop':          { name: 'forge-loop',          class: 'conditional',  description: 'Autonomous observe→plan→act→verify→correct' },
  'diff-safety':         { name: 'diff-safety',         class: 'conditional',  description: 'Per-edit rollback registry' },
  'context-capsule':     { name: 'context-capsule',     class: 'conditional',  description: 'Isolated context threads for plan/act phases' },
  'council':             { name: 'council',             class: 'conditional',  description: 'Multi-agent deliberation / voting' },
  'cross-review':        { name: 'cross-review',        class: 'conditional',  description: 'Cross-provider review gate' },
  'driver-filesystem':   { name: 'driver-filesystem',   class: 'conditional',  description: 'Native filesystem driver' },
  'driver-git':          { name: 'driver-git',          class: 'conditional',  description: 'Native git driver' },
  'driver-node':         { name: 'driver-node',         class: 'conditional',  description: 'Native node driver' },
  'driver-python':       { name: 'driver-python',       class: 'conditional',  description: 'Native python driver' },
  'voice':               { name: 'voice',               class: 'cold',         description: 'TTS / STT (voice-mode turns only)' },
  'vision':              { name: 'vision',              class: 'cold',         description: 'Image understanding (image-bearing messages only)' },
  'avatar':              { name: 'avatar',              class: 'cold',         description: 'Character / avatar rendering' },
  'creative-tooling':    { name: 'creative-tooling',    class: 'cold',         description: 'Blender / Unreal / ffmpeg pipelines' },
  'self-evolution':      { name: 'self-evolution',      class: 'cold',         description: 'Skill Forge / donor archaeology (cron only)' },
  'lora-training':       { name: 'lora-training',       class: 'cold',         description: 'Operator-commanded only' },
};

const ALL_PILLAR_IDS = Object.keys(PILLARS);
const ALWAYS_NEEDED  = ALL_PILLAR_IDS.filter(p => PILLARS[p].class === 'always-needed');
const CONDITIONAL    = ALL_PILLAR_IDS.filter(p => PILLARS[p].class === 'conditional');
const COLD           = ALL_PILLAR_IDS.filter(p => PILLARS[p].class === 'cold');

// ── Message classification ───────────────────────────────────────────────────

/**
 * Classify an incoming message. Returns a routing profile.
 * @param {string} message
 * @param {object} [ctx] Optional context (e.g. { isCron: true })
 * @returns {object} { type, intent, complexity, requiresCouncil, requiresForge, requiresVoice, requiresVision }
 */
function classifyMessage(message, ctx) {
  ctx = ctx || {};
  const text = String(message || '').toLowerCase();

  // Type: explicit beats heuristic
  let type = ctx.isCron ? 'cron' : ctx.isEvent ? 'event' : 'user';
  if (ctx.command) type = 'command';

  // Heuristics for routing decisions
  const isReview      = /\b(review|audit|check|verify|approve|reject|inspect)\b/.test(text);
  const isForgeIntent = /\b(build|ship|implement|create|fix|deploy|add|write|generate|wire|integrate|migrate|refactor|rewrite)\b/.test(text);
  const isPlan        = /\b(plan|design|architect|outline|draft)\b/.test(text);
  const isLong        = text.length > 2000;
  const isCreative    = /\b(story|character|narrative|poem|write a|creative|imagine|worldbuild)\b/.test(text);
  const isSensitive   = /\b(auth|security|secret|password|token|credential|crypto|migration|schema|constitution|contract)\b/.test(text);
  const isCode        = /\b(code|function|class|module|file|commit|branch|merge|test|build)\b/.test(text);
  const isQuestion    = /\?|^(what|how|why|when|where|who|can you|could you|do you)\b/.test(text.trim());

  // Intent precedence: the verb in the first ~3 words dominates. A message
  // that opens with "review / audit / check" stays review even if it
  // mentions a code path later.
  const firstWords = text.replace(/^[^a-z0-9]+/, '').split(/\s+/).slice(0, 3).join(' ');
  const opensWithReview  = /^(review|audit|check|inspect|verify|approve|reject)\b/.test(firstWords);
  const opensWithForge   = /^(build|ship|implement|create|fix|deploy|add|write|generate|wire|integrate|migrate|refactor|rewrite)\b/.test(firstWords);
  const opensWithPlan    = /^(plan|design|architect|outline|draft)\b/.test(firstWords);

  // Default: chat. If the message looks like a build intent, switch to forge.
  let intent = 'chat';
  if (opensWithReview) {
    intent = 'review';
  } else if (opensWithForge && (isCode || isSensitive)) {
    intent = 'forge';
  } else if (opensWithPlan) {
    intent = 'plan';
  } else if (isCreative) {
    intent = 'creative';
  } else if (isReview && (isCode || isSensitive)) {
    // Mid-message review on a code path (no leading review verb)
    intent = 'review';
  } else if (isForgeIntent && (isCode || isSensitive)) {
    intent = 'forge';
  } else if (isPlan) {
    intent = 'plan';
  }

  const complexity = isLong ? 'long' : text.length > 200 ? 'medium' : 'short';

  return {
    type,
    intent,
    complexity,
    isSensitive,
    isQuestion,
    requiresCouncil: isSensitive && type === 'user',         // significant mutations need cross-review
    requiresForge:   intent === 'forge' || intent === 'plan',
    requiresVoice:   type === 'user' && ctx.voiceMode === true,
    requiresVision:  type === 'user' && ctx.hasImage === true,
    isCron: type === 'cron',
  };
}

// ── Pillar selection ─────────────────────────────────────────────────────────

/**
 * Decide which pillars this turn needs.
 * @param {object} input
 * @param {string} input.message
 * @param {object} [input.ctx]
 * @returns {object} Pillar Activation Plan (see PURPCLAW_PER_REPLY_LIFECYCLE.md)
 */
function planPillars(input) {
  input = input || {};
  const message = input.message || '';
  const ctx = input.ctx || {};
  const cls = classifyMessage(message, ctx);

  const toSpawn = new Set(ALWAYS_NEEDED);
  const dormant = new Set(COLD);
  const routing = {
    reasoning: [],
    needsCouncil: cls.requiresCouncil,
    needsPlanner: cls.intent === 'plan',
    needsSpecialist: cls.intent === 'forge',
    needsForgeLoop: cls.requiresForge,
    needsDiffSafety: cls.requiresForge,
    needsNativeDrivers: cls.requiresForge,
    needsVoice: cls.requiresVoice,
    needsVision: cls.requiresVision,
    needsCryosleep: !!ctx.resumingFromSleep,
  };

  // Reason strings — what triggered each spawn
  const reasons = {
    forge: cls.requiresForge ? 'message has build intent + code path' : null,
    council: cls.requiresCouncil ? 'sensitive-path or security-critical mutation' : null,
    planner: routing.needsPlanner ? 'message asks for plan/design' : null,
    voice: cls.requiresVoice ? 'voice-mode turn' : null,
    vision: cls.requiresVision ? 'image-bearing message' : null,
    cryosleep: routing.needsCryosleep ? 'resuming hibernated goal' : null,
  };

  // Conditional pillars — added on routing signal
  if (cls.intent === 'forge' || cls.intent === 'plan') {
    toSpawn.add('forge-loop');
    toSpawn.add('diff-safety');
    toSpawn.add('context-capsule');
    toSpawn.add('skills-matcher');
    toSpawn.add('cognitive-layers');
    toSpawn.add('event-spine-recent');
  }
  if (cls.intent === 'review') {
    toSpawn.add('cross-review');
    toSpawn.add('event-spine-recent');
  }
  if (cls.requiresCouncil) {
    toSpawn.add('council');
  }
  if (cls.requiresVoice) {
    toSpawn.add('voice');
    dormant.delete('voice');
  }
  if (cls.requiresVision) {
    toSpawn.add('vision');
    dormant.delete('vision');
  }
  if (routing.needsCryosleep) {
    toSpawn.add('cryosleep');
    dormant.delete('cryosleep');
  }
  if (cls.requiresForge) {
    toSpawn.add('driver-filesystem');
    toSpawn.add('driver-git');
    // node + python drivers only spawn when their capability is actually
    // invoked during the turn — they are registered in the router but
    // don't pay the cold-spawn cost until the forge loop calls them.
    dormant.delete('driver-filesystem');
    dormant.delete('driver-git');
  }

  // Self-evolution is cron-only. Never on a user message.
  if (cls.isCron && /evolve|forge|archaeolog/i.test(message)) {
    toSpawn.add('self-evolution');
    dormant.delete('self-evolution');
  }

  // LoRA training is operator-commanded only. We never auto-spawn it.
  if (ctx.explicitCommand === 'lora') {
    toSpawn.add('lora-training');
    dormant.delete('lora-training');
  }

  // Anything in toSpawn cannot also be dormant.
  for (const p of toSpawn) dormant.delete(p);

  // Resolve the steering capsule. Per FOUNDING_PRINCIPLES §11 + the
  // design law, the Steering Resolver sits BEFORE routing and pillar
  // activation. It tells us what governs this turn, what's forbidden,
  // and what must be proven. The capsule is attached to the plan so
  // every downstream choice can read it.
  let steering = null;
  try {
    const sr = require('./steering-resolver');
    const inferredField = inferField(cls, ctx);
    steering = sr.resolve({
      intent: cls.intent,
      field: ctx.field || inferredField,
      project: ctx.project || (process.env.PURPCLAW_PROJECT || 'purpclaw'),
      workflowNode: ctx.workflowNode,
      soulId: ctx.soulId,
      operatorOverrides: ctx.operatorOverrides || [],
      workflowRules: ctx.workflowRules || [],
      moduleRules: ctx.moduleRules || [],
      soulRules: ctx.soulRules || [],
      skillRules: ctx.skillRules || [],
      memoryRules: ctx.memoryRules || [],
    });
  } catch (e) {
    // Steering is best-effort; a missing resolver must not break plans
    steering = { error: e.message, items: [], forbids: [], proofs: [] };
  }

  // If the steering capsule forbids a class of action and the plan
  // would have produced one, downgrade. The matcher is strict: a real
  // forge-related forbid must contain the negation phrase (never / must
  // not / do not / prohibit) NEAR the action verb (forge / build / ship
  // / deploy / mutate / implement). This prevents positive rules like
  // "Build live, fully wired" from being misread as a forbid.
  if (steering && steering.forbids && steering.forbids.length && toSpawn.has('forge-loop')) {
    const forbidForge = (rule) => {
      const r = String(rule || '');
      // Negation within 40 chars of the verb
      return /\b(never|must\s+not|do\s+not|prohibit(?:ed|s)?|forbidden)\b[\s\S]{0,40}\b(forge|build|ship|deploy|mutat|implement)\b/i.test(r)
          || /\b(forge|build|ship|deploy|mutat|implement)\b[\s\S]{0,40}\b(never|must\s+not|do\s+not|prohibit(?:ed|s)?|forbidden)\b/i.test(r);
    };
    for (const f of steering.forbids) {
      if (f.appliesTo && f.appliesTo.includes('tool-routing') && forbidForge(f.rule)) {
        toSpawn.delete('forge-loop');
        toSpawn.delete('diff-safety');
        toSpawn.delete('driver-filesystem');
        toSpawn.delete('driver-git');
        toSpawn.delete('context-capsule');
        break;
      }
    }
  }

  return {
    turnId: input.turnId || makeTurnId(),
    messageType: cls.type,
    goalId: ctx.goalId || null,
    workflowNode: ctx.workflowNode || null,
    soulId: ctx.soulId || null,
    provider: null,  // filled by parliament later
    intent: cls.intent,
    complexity: cls.complexity,
    routing,
    pillarsToSpawn: Array.from(toSpawn),
    pillarsDormant: Array.from(dormant),
    reasons,
    classification: cls,
    steering,
  };
}

/**
 * Infer the steering field from the message classification.
 * @param {object} cls   result of classifyMessage
 * @param {object} ctx
 * @returns {string} field name
 */
function inferField(cls, ctx) {
  if (ctx.field) return ctx.field;
  if (cls.intent === 'forge' || cls.intent === 'plan' || cls.intent === 'review') return 'coding';
  if (cls.intent === 'creative') return 'game-building';
  if (cls.requiresVoice) return 'pc-control';
  if (cls.requiresVision) return 'pc-control';
  return 'general';
}

// ── Provider selection (delegated to Parliament) ─────────────────────────────

/**
 * Resolve a provider for a plan. Delegates to Provider Parliament.
 * @param {object} plan
 * @param {object} [opts]
 * @returns {string|null}
 */
function resolveProvider(plan, opts) {
  let parliament;
  try {
    parliament = require('./provider-parliament').ProviderParliament;
  } catch {
    return null;
  }
  const parl = new parliament();
  // Use the message text if available, else the intent
  const task = opts && opts.message ? opts.message : (plan.intent || 'general');
  // Prefer benchmarked pick if available
  try {
    const pick = parl.pickWithBenchmarks(task, { minSamples: 1 });
    if (pick && pick.provider) {
      plan.provider = pick.provider;
      plan.providerRationale = pick.rationale;
      if (pick.empirical) plan.empiricalRationale = pick.empirical.reason;
      return pick.provider;
    }
  } catch {
    // fall through to plain pick
  }
  const pick = parl.pick(task);
  if (pick && pick.provider) {
    plan.provider = pick.provider;
    plan.providerRationale = pick.rationale;
  }
  return pick ? pick.provider : null;
}

// ── Plan execution (skeleton; full execution lives in the agent loop) ────────

/**
 * Walk the per-reply lifecycle for a plan. This is the canonical
 * planAndRun entry point.
 *
 * HONESTY LABEL (P3): this function is PLANNING-ONLY supervision. It
 * classifies the turn, plans pillar spawn/teardown, and emits the event
 * skeleton — but pillars are NOT materialized here (costMs is 0, no
 * processes are created, no leases are taken). Real execution belongs to
 * the agent loop. The result says so explicitly via
 * `supervisionMode: 'planning-only'` and `executedBy: 'agent-loop'`.
 *
 * @param {object} input
 * @param {string} input.message
 * @param {object} [input.ctx]
 * @returns {Promise<object>}
 */
async function planAndRun(input) {
  const startedAt = Date.now();
  const plan = planPillars(input);
  resolveProvider(plan, { message: input.message });

  // Telemetry — observers can see exactly what was decided
  const events = [];
  const emit = (kind, payload) => {
    const evt = { kind, ts: Date.now(), ...payload };
    events.push(evt);
    return evt;
  };

  emit('turn.started', {
    turnId: plan.turnId,
    messageType: plan.messageType,
    intent: plan.intent,
  });

  emit('turn.plan_emitted', {
    turnId: plan.turnId,
    pillarsToSpawn: plan.pillarsToSpawn,
    pillarsDormant: plan.pillarsDormant,
    provider: plan.provider,
  });

  // Per the contract: spawn only what the plan says, in `try/finally`
  // so teardown is guaranteed.
  const spawned = [];
  const torndown = [];
  try {
    for (const pillarId of plan.pillarsToSpawn) {
      const spawnStarted = Date.now();
      // Real materialization is delegated to the agent loop / boot layer.
      // We just emit the event so observability is real.
      const t = emit('pillar.spawned', { pillarId, costMs: 0 });
      spawned.push({ pillarId, ts: t.ts, costMs: 0, sinceStartMs: Date.now() - spawnStarted });
    }
    emit('turn.execute_started', { turnId: plan.turnId });
    // The agent loop owns the real execute phase; we return the plan
    // so the caller can hand it off.
    emit('turn.execute_handed_off', { turnId: plan.turnId });
  } finally {
    // Guaranteed teardown — even on exception.
    for (const s of spawned) {
      const td = emit('pillar.torndown', { pillarId: s.pillarId, lifetimeMs: Date.now() - s.ts });
      torndown.push({ pillarId: s.pillarId, lifetimeMs: Date.now() - s.ts });
    }
    emit('turn.finished', {
      turnId: plan.turnId,
      totalFootprintMs: Date.now() - startedAt,
      pillarsSpawned: spawned.length,
      pillarsDormant: plan.pillarsDormant.length,
    });
  }

  return {
    supervisionMode: 'planning-only',   // P3 honesty label — no runtime materialization happens here
    executedBy: 'agent-loop',           // real execution owner
    plan,
    pillarsSpawned: spawned,            // planned spawn events (costMs 0 — nothing materialized)
    pillarsTornDown: torndown,
    events,
    footprintMs: Date.now() - startedAt,
  };
}

// ── Utilities ────────────────────────────────────────────────────────────────

function makeTurnId() {
  return 'turn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Snapshot the spine — for `purpclaw spine inventory`. Returns the
 * current pillar registry + classification.
 */
function spineInventory() {
  return {
    totalPillars: ALL_PILLAR_IDS.length,
    alwaysNeeded: ALWAYS_NEEDED.length,
    conditional: CONDITIONAL.length,
    cold: COLD.length,
    pillars: PILLARS,
  };
}

module.exports = {
  planPillars,
  planAndRun,
  classifyMessage,
  resolveProvider,
  spineInventory,
  PILLARS,
  ALWAYS_NEEDED,
  CONDITIONAL,
  COLD,
};
