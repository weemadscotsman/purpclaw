'use strict';
/**
 * lib/steering-middleware.js — the single steering seam for the live turn
 * path (Phase 3).
 *
 * Both lib/agent-loop.js (loop-level gating + capsuleId event threading)
 * and lib/tool-runtime.js (action-boundary enforcement) call through here
 * so there is exactly one law with two enforcement points:
 *
 *   prompt sees the capsule   → advisory (model is told the rules)
 *   applyToAction at dispatch → enforcement (deterministic denial)
 *
 * Nothing in here may throw into the caller's turn — steering failure is
 * reported, never allowed to break the loop itself.
 */

const RESOLVER = require('./steering-resolver');
const SOURCES = require('./steering-sources');

/**
 * Resolve the steering capsule for a turn. Discovers real sources from
 * disk (AGENTS.md / USER.md / contracts / .steering/ records), injects
 * them at workspace authority, and enriches the source manifest with
 * checksums so the capsule proves which version of the law it saw.
 */
function resolveForTurn(input = {}) {
  const discovered = SOURCES.discover(input.rootDir);
  const capsule = RESOLVER.resolve({
    intent: input.intent || 'chat',
    field: input.field,
    project: input.project,
    workflowNode: input.workflowNode,
    soulId: input.soulId,
    taskId: input.taskId,
    runId: input.runId,
    operatorOverrides: input.operatorOverrides,
    sourceRules: discovered.items,
  });

  // Enrich the manifest with the discovered checksums.
  const ckByRef = new Map(discovered.sources.map(s => [s.sourceRef, s]));
  for (const entry of capsule.sourceManifest) {
    const found = ckByRef.get(entry.sourceRef);
    if (found) {
      entry.checksum = found.checksum || null;
      entry.present = !!found.present;
      entry.modifiedAt = found.modifiedAt || null;
    }
  }
  capsule.discoveryScope = discovered.scope;
  capsule.sourceIndex = discovered.sources;
  return capsule;
}

/**
 * Deterministic tool gate. Returns a failure object when the capsule
 * forbids this action, or null when the action may proceed.
 */
function gateTool(capsule, tool, args = {}) {
  if (!capsule) return null;
  const verdict = RESOLVER.applyToAction(capsule, {
    kind: tool,
    tool,
    target: args.path || args.target || args.file || null,
  });
  if (verdict.allowed) return null;
  return {
    ok: false,
    error: `steering denial: ${verdict.reason}${verdict.rule ? ' — ' + verdict.rule : ''}`,
    code: 'STEERING_DENIED',
    capsuleId: capsule.capsuleId,
    retryable: false,
  };
}

/**
 * Completion gate: a task may not reach DONE while the capsule carries
 * unresolved conflicts (operator escalation required).
 */
function completionBlocked(capsule) {
  if (!capsule || !Array.isArray(capsule.unresolvedConflicts)) return null;
  if (capsule.unresolvedConflicts.length === 0) return null;
  return capsule.unresolvedConflicts.map(c => ({
    id: c.id,
    ruleIds: c.ruleIds,
    evidence: c.evidence,
  }));
}

/**
 * Compact advisory text for the system prompt. The model SEES the law;
 * applyToAction still ENFORCES it. Prompt text is never the boundary.
 */
function preamble(capsule, maxRules = 8) {
  if (!capsule) return '';
  const lines = ['# Steering (executable law for this turn — violations are hard-blocked at the tool boundary)'];
  const forbids = (capsule.forbids || []).slice(0, maxRules);
  if (forbids.length) {
    lines.push('Forbidden:');
    for (const f of forbids) lines.push(`- ${f.rule}`);
  }
  const required = (capsule.required || []).slice(0, maxRules);
  if (required.length) {
    lines.push('Required:');
    for (const r of required) lines.push(`- ${r.rule}`);
  }
  if (capsule.unresolvedConflicts?.length) {
    lines.push(`UNRESOLVED STEERING CONFLICTS (${capsule.unresolvedConflicts.length}): completion is blocked until the operator resolves: ${capsule.unresolvedConflicts.map(c => c.ruleIds.join('+')).join(', ')}`);
  }
  return lines.join('\n');
}

module.exports = { resolveForTurn, gateTool, completionBlocked, preamble };
