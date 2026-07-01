'use strict';

/**
 * PURPCLAW Spring Validator
 * -------------------------
 * Trust model for the whole Hivemind layer.
 *
 * Doctrine: PURPCLAW learns from verified experience, not recycled output.
 * Every promoted object gets provenance, spring rank, trust score and evidence.
 */

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { clamp, nowIso, uniq, safeString, slugify, hash, tokenize } = require('./util');

const SPRING_RANKS = Object.freeze({
  verified_execution: 1,
  successful_trace: 2,
  promoted_skill: 3,
  human_documentation: 4,
  external_knowledge: 5,
  llm_suggestion: 6,
  unverified_ai_output: 7,
  failed_execution: 8,
});

const RANK_LABELS = Object.freeze({
  1: 'Pure Spring',
  2: 'Fresh Spring',
  3: 'Filtered Spring',
  4: 'Spring Runoff',
  5: 'River Tributary',
  6: 'River Water',
  7: 'Stagnant River',
  8: 'Poisoned Well',
});

const DEFAULT_PRINCIPLES = [
  {
    id: 'principle-evidence-over-confidence',
    title: 'Evidence over confidence',
    statement: 'PURPCLAW does not optimise for sounding convincing. It optimises for earning trust through verified execution.',
    spring_rank: 1,
    trust_score: 1,
  },
  {
    id: 'principle-wisdom-must-be-earned',
    title: 'Wisdom must be earned',
    statement: 'Knowledge may be read. Operational wisdom must be earned through execution, measurement and verification.',
    spring_rank: 1,
    trust_score: 1,
  },
  {
    id: 'principle-smallest-useful-patch',
    title: 'Smallest useful patch first',
    statement: 'Prefer the smallest safe change that satisfies the task and produces evidence.',
    spring_rank: 1,
    trust_score: 0.98,
  },
];

const DEFAULT_DOCTRINE = [
  {
    doctrine_id: 'doctrine-never-promote-unverified-trace',
    title: 'Never promote unverified traces',
    statement: 'No trace becomes a skill, doctrine or trusted memory without evidence, provenance and a Spring trust score.',
    source: 'spring_doctrine_seed',
    origin: 'verified_execution',
    spring_rank: 1,
    trust_score: 1,
    evidence: ['architecture_seed', 'operator_accepted'],
  },
  {
    doctrine_id: 'doctrine-reality-above-model',
    title: 'Reality above the model',
    statement: 'Execution results, tests, tool outputs and user acceptance outrank model claims.',
    source: 'spring_doctrine_seed',
    origin: 'verified_execution',
    spring_rank: 1,
    trust_score: 1,
    evidence: ['architecture_seed', 'operator_accepted'],
  },
];

function rankLabel(rank) {
  return RANK_LABELS[Number(rank)] || 'Unknown Water';
}

function inferOrigin(record = {}) {
  if (record.origin) return record.origin;
  if (record.kind === 'doctrine') return 'promoted_skill';
  if (record.kind === 'skill' || record.skill_id) return 'promoted_skill';
  if (record.outcome === 'failed' || record.status === 'failed' || record.error) return 'failed_execution';
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  const gates = Array.isArray(record.gate_results) ? record.gate_results : [];
  const gateOk = gates.length && gates.every(g => g && (g.ok === true || g.status === 'not-applicable'));
  const executed = evidence.some(e => /test|gate|workflow_completed|runtime|tool_calls|result_present|mission_completed|agent_output/i.test(String(e)));
  if ((record.outcome === 'success' || record.status === 'completed') && (record.tests_passed === true || gateOk || executed)) return 'verified_execution';
  if (record.outcome === 'success' || record.status === 'completed') return 'successful_trace';
  if (/docs?|readme|manual|human/i.test(String(record.source || ''))) return 'human_documentation';
  if (/llm|model|assistant|suggestion/i.test(String(record.source || ''))) return 'llm_suggestion';
  return 'unverified_ai_output';
}

function verificationSignals(record = {}) {
  const signals = [];
  if (record.tests_passed === true) signals.push('tests_passed');
  if (record.tests_passed === false) signals.push('tests_failed');
  for (const ev of record.evidence || []) signals.push(String(ev));
  for (const gate of record.gate_results || []) {
    if (!gate) continue;
    if (gate.ok === true || gate.status === 'not-applicable') signals.push(`gate:${gate.gate || gate.name || 'unknown'}:pass`);
    else signals.push(`gate:${gate.gate || gate.name || 'unknown'}:fail`);
  }
  if (record.rollback) signals.push('rollback');
  if (record.destructive) signals.push('destructive');
  return uniq(signals);
}

function verificationScore(record = {}) {
  const signals = verificationSignals(record);
  let score = 0;
  if (signals.some(s => /tests_passed/.test(s))) score += 0.28;
  if (signals.some(s => /^gate:.*:pass/.test(s))) score += 0.22;
  if (signals.some(s => /workflow_completed|mission_completed|agent_output_present|result_present|runtime_success/.test(s))) score += 0.16;
  if (signals.some(s => /tool_calls|tool_call|command|output/.test(s))) score += 0.10;
  if (Array.isArray(record.source_trace_ids) && record.source_trace_ids.length > 1) score += 0.12;
  if (record.user_accepted || signals.some(s => /approval|accepted|operator_accepted/.test(s))) score += 0.12;
  if (signals.some(s => /tests_failed|rollback|destructive|fail/.test(s)) || record.error) score -= 0.35;
  return clamp(score, 0, 1);
}

function freshnessScore(iso) {
  const t = new Date(iso || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return 0.25;
  const days = Math.max(0, (Date.now() - t) / 86400000);
  return clamp(Math.pow(0.5, days / 90), 0.15, 1);
}

function repeatabilityScore(record = {}) {
  const success = Number(record.success_count || 0);
  const failure = Number(record.failure_count || 0);
  const sources = Array.isArray(record.source_trace_ids) ? record.source_trace_ids.length : 0;
  const repeated = Math.max(success, sources);
  const base = repeated <= 1 ? 0.20 : repeated < 3 ? 0.45 : repeated < 7 ? 0.72 : 0.95;
  const penalty = failure ? clamp(failure / Math.max(1, success + failure), 0, 0.65) : 0;
  return clamp(base - penalty);
}

function trustScore(record = {}) {
  if (Number.isFinite(Number(record.trust_score)) && (record.immutable || record.source === 'spring_doctrine_seed')) return clamp(Number(record.trust_score));
  const origin = inferOrigin(record);
  const rank = SPRING_RANKS[origin] || 7;
  const originBase = {
    1: 0.94,
    2: 0.82,
    3: 0.74,
    4: 0.62,
    5: 0.48,
    6: 0.28,
    7: 0.12,
    8: 0.04,
  }[rank] ?? 0.12;
  const verify = verificationScore(record);
  const repeat = repeatabilityScore(record);
  const fresh = freshnessScore(record.updated_at || record.ended_at || record.created_at);
  const confidence = Number.isFinite(Number(record.confidence)) ? clamp(record.confidence) : clamp(record.score ?? 0.5);
  const safetyPenalty = (record.rollback ? 0.22 : 0) + (record.destructive ? 0.28 : 0) + (record.error ? 0.18 : 0);
  let score = clamp(originBase * 0.38 + verify * 0.30 + repeat * 0.15 + fresh * 0.07 + confidence * 0.10 - safetyPenalty);
  const hasEvidence = Array.isArray(record.evidence) && record.evidence.length > 0;
  const ok = record.outcome === 'success' || record.status === 'completed' || record.tests_passed === true;
  if (!safetyPenalty && origin === 'verified_execution' && ok && (record.tests_passed === true || hasEvidence)) score = Math.max(score, 0.78);
  if (!safetyPenalty && origin === 'successful_trace' && ok && hasEvidence) score = Math.max(score, 0.72);
  return clamp(score);
}

function enrichRecord(record = {}, extra = {}) {
  const merged = { ...record, ...extra };
  const origin = inferOrigin(merged);
  const rank = SPRING_RANKS[origin] || 7;
  const signals = verificationSignals(merged);
  const score = trustScore(merged);
  return {
    schema: 'purpclaw.spring.provenance.v1',
    origin,
    spring_rank: rank,
    spring_label: rankLabel(rank),
    verification: signals,
    trust_score: Math.round(score * 1000) / 1000,
    repeatability: Math.round(repeatabilityScore(merged) * 1000) / 1000,
    freshness: Math.round(freshnessScore(merged.updated_at || merged.ended_at || merged.created_at) * 1000) / 1000,
    evaluated_at: nowIso(),
  };
}

function canPromote(record = {}, rules = {}) {
  const spring = record.spring && Number.isFinite(Number(record.spring.trust_score)) ? record.spring : enrichRecord(record);
  const minTrust = Number(rules.spring_min_trust ?? 0.72);
  const maxRank = Number(rules.max_promotable_spring_rank ?? 2);
  const blocked = [];
  if (spring.trust_score < minTrust) blocked.push(`trust_score ${spring.trust_score} < ${minTrust}`);
  if (spring.spring_rank > maxRank) blocked.push(`spring_rank ${spring.spring_rank} > ${maxRank}`);
  if (record.rollback) blocked.push('rollback');
  if (record.destructive) blocked.push('destructive');
  if (record.error) blocked.push('error_present');
  if (rules.require_evidence !== false && (!Array.isArray(record.evidence) || record.evidence.length === 0)) blocked.push('missing_evidence');
  return { ok: blocked.length === 0, blocked, spring };
}

function loadSpringIndex() {
  paths.ensureHivemindDirs();
  return paths.readJson(paths.SPRING_INDEX_FILE, defaultSpringIndex());
}

function defaultSpringIndex() {
  return {
    schema: 'purpclaw.spring.index.v1',
    doctrine: 'PURPCLAW learns from verified experience, not recycled output.',
    ranks: SPRING_RANKS,
    labels: RANK_LABELS,
    records: {},
    updated_at: nowIso(),
  };
}

function saveSpringIndex(index) {
  index.updated_at = nowIso();
  paths.writeJsonAtomic(paths.SPRING_INDEX_FILE, index);
  return index;
}

function indexRecord(id, record = {}) {
  if (!id) return null;
  const index = loadSpringIndex();
  const spring = record.spring || enrichRecord(record);
  index.records[id] = {
    id,
    type: record.kind || record.type || (record.skill_id ? 'skill' : record.run_id ? 'trace' : 'record'),
    title: record.title || record.task || record.statement || id,
    origin: spring.origin,
    spring_rank: spring.spring_rank,
    spring_label: spring.spring_label,
    trust_score: spring.trust_score,
    evidence_count: verificationSignals(record).length,
    source: record.source || null,
    updated_at: record.updated_at || record.ended_at || record.created_at || nowIso(),
  };
  saveSpringIndex(index);
  return index.records[id];
}

function seedPrinciples() {
  paths.ensureHivemindDirs();
  for (const p of DEFAULT_PRINCIPLES) {
    const file = path.join(paths.PRINCIPLES_DIR, `${p.id}.json`);
    if (!fs.existsSync(file)) paths.writeJsonAtomic(file, { schema: 'purpclaw.spring.principle.v1', ...p, created_at: nowIso(), updated_at: nowIso() });
  }
  for (const d of DEFAULT_DOCTRINE) saveDoctrine(d, { seedOnly: true });
}

function listPrinciples() {
  paths.ensureHivemindDirs();
  let files = [];
  try { files = fs.readdirSync(paths.PRINCIPLES_DIR).filter(f => f.endsWith('.json')); } catch { return []; }
  return files.map(f => paths.readJson(path.join(paths.PRINCIPLES_DIR, f), null)).filter(Boolean);
}

function doctrinePath(id) {
  return path.join(paths.DOCTRINE_DIR, `${slugify(id, 'doctrine')}.json`);
}

function saveDoctrine(doctrine = {}, options = {}) {
  paths.ensureHivemindDirs();
  const id = doctrine.doctrine_id || doctrine.id || `doctrine-${slugify(doctrine.title || doctrine.statement, 'rule')}-${hash(doctrine.statement || doctrine.title, 8)}`;
  const file = doctrinePath(id);
  if (options.seedOnly && fs.existsSync(file)) return paths.readJson(file, null);
  const spring = enrichRecord({
    ...doctrine,
    kind: 'doctrine',
    origin: doctrine.origin || 'promoted_skill',
    evidence: doctrine.evidence || doctrine.source_trace_ids || [],
    score: doctrine.score ?? doctrine.trust_score ?? 0.9,
    success_count: doctrine.success_count || (doctrine.source_trace_ids || []).length || 1,
  });
  const row = {
    schema: 'purpclaw.spring.doctrine.v1',
    doctrine_id: id,
    title: doctrine.title || id,
    statement: safeString(doctrine.statement || doctrine.description || doctrine.title || '', 1000),
    source: doctrine.source || 'hivemind',
    source_trace_ids: uniq(doctrine.source_trace_ids || []),
    evidence: uniq(doctrine.evidence || doctrine.source_trace_ids || []),
    spring,
    origin: spring.origin,
    spring_rank: spring.spring_rank,
    trust_score: spring.trust_score,
    confidence: doctrine.confidence ?? spring.trust_score,
    created_at: doctrine.created_at || nowIso(),
    updated_at: nowIso(),
    immutable: doctrine.immutable !== false,
  };
  paths.writeJsonAtomic(file, row);
  indexRecord(row.doctrine_id, { ...row, kind: 'doctrine' });
  return row;
}

function listDoctrines() {
  paths.ensureHivemindDirs();
  let files = [];
  try { files = fs.readdirSync(paths.DOCTRINE_DIR).filter(f => f.endsWith('.json')); } catch { return []; }
  return files.map(f => paths.readJson(path.join(paths.DOCTRINE_DIR, f), null)).filter(Boolean)
    .sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
}

function doctrineFromSkill(skill = {}) {
  const title = `Doctrine from ${skill.intent || 'workflow'}: ${skill.title || skill.skill_id}`;
  const keyTerms = tokenize(`${skill.title || ''} ${(skill.trigger_terms || []).join(' ')}`).slice(0, 8).join(', ');
  const statement = skill.steps && skill.steps.length
    ? `When handling ${keyTerms || skill.intent || 'this pattern'}, prefer the verified workflow: ${skill.steps.slice(0, 4).join(' -> ')}.`
    : `When handling ${keyTerms || skill.intent || 'this pattern'}, prefer verified execution over unverified model suggestions.`;
  return saveDoctrine({
    doctrine_id: `doctrine-${slugify(skill.skill_id || title, 'skill')}`.slice(0, 96),
    title,
    statement,
    source: 'hivemind_promotion',
    origin: 'verified_execution',
    source_trace_ids: skill.source_trace_ids || [],
    evidence: skill.source_trace_ids || [],
    score: skill.score || 0.9,
    success_count: skill.success_count || (skill.source_trace_ids || []).length || 1,
  });
}

function springStatus() {
  try { seedPrinciples(); } catch (_) {}
  const index = loadSpringIndex();
  const rows = Object.values(index.records || {});
  const byRank = {};
  for (const row of rows) byRank[row.spring_label || rankLabel(row.spring_rank)] = (byRank[row.spring_label || rankLabel(row.spring_rank)] || 0) + 1;
  const avgTrust = rows.length ? rows.reduce((s, r) => s + Number(r.trust_score || 0), 0) / rows.length : 0;
  return {
    ok: true,
    doctrine: index.doctrine,
    records: rows.length,
    average_trust_score: Math.round(avgTrust * 1000) / 1000,
    by_rank: byRank,
    principles: listPrinciples().length,
    doctrines: listDoctrines().length,
    top_records: rows.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0)).slice(0, 10),
  };
}

function formatSpringForAgent(extra = {}) {
  const doctrines = listDoctrines().slice(0, extra.limit || 5);
  const lines = [
    '## PURPCLAW Spring Doctrine',
    'Knowledge may be read. Operational wisdom must be earned through verified execution.',
    'Trust order: verified execution > successful traces > promoted skills > docs > external knowledge > LLM suggestions > unverified output.',
    'Runtime rule: prefer evidence, tests, tool output and user acceptance over plausible text.',
  ];
  if (doctrines.length) {
    lines.push('\nDoctrine:');
    for (const d of doctrines) lines.push(`- ${d.title}: ${d.statement} [trust ${Number(d.trust_score || 0).toFixed(2)}]`);
  }
  return lines.join('\n');
}

module.exports = {
  SPRING_RANKS,
  RANK_LABELS,
  rankLabel,
  inferOrigin,
  verificationSignals,
  verificationScore,
  repeatabilityScore,
  trustScore,
  enrichRecord,
  canPromote,
  loadSpringIndex,
  saveSpringIndex,
  indexRecord,
  seedPrinciples,
  listPrinciples,
  saveDoctrine,
  listDoctrines,
  doctrineFromSkill,
  springStatus,
  formatSpringForAgent,
  DEFAULT_PRINCIPLES,
  DEFAULT_DOCTRINE,
};
