'use strict';

const { clamp, decayMultiplier } = require('./util');
const paths = require('./paths');

function gatePassRate(trace) {
  const gates = Array.isArray(trace.gate_results) ? trace.gate_results : [];
  if (!gates.length) return trace.tests_passed === true ? 1 : 0.5;
  const passed = gates.filter(g => g && (g.ok === true || g.status === 'not-applicable')).length;
  return passed / gates.length;
}

function traceScore(trace) {
  const success = trace.outcome === 'success' || trace.status === 'completed' ? 1 : 0;
  const tests = trace.tests_passed === true ? 1 : trace.tests_passed === false ? 0 : 0.55;
  const gates = gatePassRate(trace);
  const evidence = Array.isArray(trace.evidence) && trace.evidence.length > 0 ? 1 : 0;
  const files = Array.isArray(trace.files_touched) ? trace.files_touched.length : 0;
  const lowChurn = files <= 3 ? 1 : files <= 8 ? 0.75 : files <= 16 ? 0.45 : 0;
  const noRollback = trace.rollback ? 0 : 1;
  const safe = trace.destructive ? 0 : 1;

  const base = clamp(
    success * 0.30 +
    tests * 0.15 +
    gates * 0.15 +
    evidence * 0.15 +
    lowChurn * 0.10 +
    noRollback * 0.10 +
    safe * 0.05
  );
  const trust = Number.isFinite(Number(trace.trust_score)) ? clamp(Number(trace.trust_score)) : null;
  return trust === null ? base : clamp(base * 0.85 + trust * 0.15);
}

function skillRuntimeScore(skill, rules = null) {
  rules = rules || paths.readJson(paths.RULES_FILE, paths.defaultRules());
  const base = clamp(skill.score ?? 0);
  const successCount = Number(skill.success_count || 0);
  const failureCount = Number(skill.failure_count || 0);
  const total = Math.max(1, successCount + failureCount);
  const successRate = successCount / total;
  const decay = decayMultiplier(skill.last_used_at || skill.updated_at || skill.created_at, rules.decay_half_life_days || 45);
  const useBoost = clamp(Math.log10(1 + successCount) / 2, 0, 0.25);
  const penalty = clamp(failureCount / Math.max(1, total), 0, 0.6);
  return clamp((base * 0.60 + successRate * 0.30 + useBoost) * decay - penalty);
}

function updateSkillOutcome(skill, outcome) {
  const ok = outcome && (outcome.outcome === 'success' || outcome.success === true);
  skill.usage_count = Number(skill.usage_count || 0) + 1;
  skill.last_used_at = new Date().toISOString();
  if (ok) skill.success_count = Number(skill.success_count || 0) + 1;
  else skill.failure_count = Number(skill.failure_count || 0) + 1;
  skill.score = skillRuntimeScore(skill);
  skill.updated_at = new Date().toISOString();
  return skill;
}

module.exports = { traceScore, skillRuntimeScore, updateSkillOutcome };
