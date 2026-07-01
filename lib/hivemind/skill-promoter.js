'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const traceRecorder = require('./trace-recorder');
const scorer = require('./skill-scorer');
const spring = require('./spring-validator');
const { slugify, hash, tokenize, uniq, nowIso, safeString, clamp } = require('./util');

function isEligible(trace, rules) {
  if (!trace) return false;
  if (rules.allow_partial !== true && trace.outcome !== 'success') return false;
  if (rules.reject_if_rollback && trace.rollback) return false;
  if (rules.reject_if_destructive && trace.destructive) return false;
  if (rules.require_tests_passed && trace.tests_passed === false) return false;
  if (rules.require_evidence && (!Array.isArray(trace.evidence) || trace.evidence.length === 0)) return false;
  if (Array.isArray(trace.files_touched) && trace.files_touched.length > (rules.max_files_touched || 16)) return false;
  if ((trace.score || scorer.traceScore(trace)) < (rules.min_score || 0.75)) return false;
  const verdict = spring.canPromote(trace, rules);
  return verdict.ok;
}

function traceSignature(trace) {
  const tokens = tokenize(`${trace.intent || ''} ${trace.job_type || ''} ${trace.task || ''}`);
  // Keep the signature intentionally coarse. A Hivemind that needs exact wording
  // to recognise a repeated workflow is not a Hivemind, it's a clipboard with delusions.
  const top = tokens.slice(0, 4).sort().join('-');
  const tools = (trace.tools_used || []).slice(0, 3).sort().join('-');
  return slugify(`${trace.intent || 'general'}-${trace.job_type || 'general'}-${top}-${tools}`, 'trace-pattern').slice(0, 80);
}

function clusterTraces(traces) {
  const groups = new Map();
  for (const trace of traces) {
    const sig = traceSignature(trace);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(trace);
  }
  return [...groups.entries()].map(([signature, traces]) => ({ signature, traces }));
}

function inferSteps(traces) {
  const tools = uniq(traces.flatMap(t => t.tools_used || [])).slice(0, 8);
  const files = uniq(traces.flatMap(t => t.files_touched || [])).slice(0, 8);
  const commands = uniq(traces.flatMap(t => t.commands || [])).slice(0, 5);
  const steps = [];
  if (files.length) steps.push(`Inspect likely files first: ${files.join(', ')}`);
  if (tools.length) steps.push(`Use proven tools: ${tools.join(', ')}`);
  if (commands.length) steps.push(`Run targeted commands/checks: ${commands.join(' && ')}`);
  steps.push('Make the smallest safe change that satisfies the task.');
  steps.push('Capture evidence: tool calls, output, tests or explicit verification.');
  return steps;
}

function inferTriggers(traces) {
  const tokenCounts = new Map();
  for (const t of traces) {
    for (const tok of tokenize(`${t.intent || ''} ${t.job_type || ''} ${t.task || ''} ${(t.files_touched || []).join(' ')}`)) {
      tokenCounts.set(tok, (tokenCounts.get(tok) || 0) + 1);
    }
  }
  return [...tokenCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tok]) => tok);
}

function createSkillFromCluster(cluster, rules) {
  const traces = cluster.traces;
  const titleTokens = inferTriggers(traces).slice(0, 5);
  const title = `Apply proven ${traces[0].intent || 'task'} workflow: ${titleTokens.join(' ') || cluster.signature}`;
  const successCount = traces.filter(t => t.outcome === 'success').length;
  const avgScore = traces.reduce((sum, t) => sum + (t.score || scorer.traceScore(t)), 0) / Math.max(1, traces.length);
  const idBase = slugify(title, 'hivemind-skill');
  const skillId = `${idBase}-${hash(cluster.signature, 8)}`.slice(0, 96);
  const now = nowIso();
  return {
    schema: 'purpclaw.hivemind.skill.v1',
    kind: 'skill',
    skill_id: skillId,
    title,
    description: `Promoted from ${traces.length} successful PURPCLAW trace(s).`,
    task_type: traces[0].job_type || 'general',
    intent: traces[0].intent || 'general',
    trigger_terms: inferTriggers(traces),
    steps: inferSteps(traces),
    avoid: [
      'Do not expand scope beyond the task without evidence.',
      'Do not rewrite unrelated files just because the model feels artistic.',
      'Do not skip verification when a cheap verification path exists.'
    ],
    source_trace_ids: traces.map(t => t.run_id),
    success_count: successCount,
    failure_count: 0,
    usage_count: 0,
    score: clamp(avgScore),
    spring: spring.enrichRecord({
      kind: 'skill',
      origin: 'verified_execution',
      evidence: traces.flatMap(t => t.evidence || []),
      source_trace_ids: traces.map(t => t.run_id),
      success_count: successCount,
      score: clamp(avgScore),
      created_at: now,
      updated_at: now
    }),
    created_at: now,
    updated_at: now,
    last_used_at: null,
    deprecated: false
  };
}

function createAntiSkillFromFailure(trace) {
  const triggers = tokenize(`${trace.intent || ''} ${trace.job_type || ''} ${trace.task || ''}`).slice(0, 12);
  const title = `Avoid failed ${trace.intent || 'workflow'} pattern: ${triggers.slice(0, 5).join(' ') || trace.run_id}`;
  const skillId = `anti-${slugify(title, 'failed-pattern')}-${hash(trace.run_id, 8)}`.slice(0, 96);
  const now = nowIso();
  return {
    schema: 'purpclaw.hivemind.skill.v1',
    kind: 'antiskill',
    skill_id: skillId,
    title,
    description: safeString(trace.error || trace.diff_summary || 'Failed run pattern.', 400),
    task_type: trace.job_type || 'general',
    intent: trace.intent || 'general',
    trigger_terms: triggers,
    steps: [],
    avoid: [
      safeString(trace.error || 'This route failed previously.', 300),
      'Use a different route, smaller scope, or more verification before repeating.'
    ],
    source_trace_ids: [trace.run_id],
    success_count: 0,
    failure_count: 1,
    usage_count: 0,
    score: 0.55,
    spring: spring.enrichRecord({
      kind: 'antiskill',
      origin: 'failed_execution',
      error: trace.error || trace.diff_summary || 'failed run',
      evidence: trace.evidence || [],
      source_trace_ids: [trace.run_id],
      failure_count: 1,
      created_at: now,
      updated_at: now
    }),
    created_at: now,
    updated_at: now,
    last_used_at: null,
    deprecated: false
  };
}

function saveSkill(skill) {
  paths.ensureHivemindDirs();
  const file = path.join(paths.SKILLS_DIR, `${skill.skill_id}.json`);
  const existing = paths.readJson(file, null);
  if (existing) {
    skill.source_trace_ids = uniq([...(existing.source_trace_ids || []), ...(skill.source_trace_ids || [])]);
    skill.success_count = Math.max(Number(existing.success_count || 0), Number(skill.success_count || 0));
    skill.failure_count = Math.max(Number(existing.failure_count || 0), Number(skill.failure_count || 0));
    skill.usage_count = Number(existing.usage_count || 0);
    skill.created_at = existing.created_at || skill.created_at;
    skill.last_used_at = existing.last_used_at || skill.last_used_at;
  }
  skill.spring = skill.spring || spring.enrichRecord(skill);
  skill.spring_rank = skill.spring.spring_rank;
  skill.trust_score = skill.spring.trust_score;
  skill.updated_at = nowIso();
  paths.writeJsonAtomic(file, skill);
  try { spring.indexRecord(skill.skill_id, skill); } catch (_) {}
  updateIndex();
  paths.appendJsonl(paths.EVENTS_FILE, { at: nowIso(), type: 'hivemind.skill.saved', skill_id: skill.skill_id, kind: skill.kind, score: skill.score });
  return skill;
}

function updateIndex() {
  paths.ensureHivemindDirs();
  const index = { schema: 'purpclaw.hivemind.index.v1', skills: {}, antiskills: {}, doctrines: {}, updated_at: nowIso() };
  let files = [];
  try { files = fs.readdirSync(paths.SKILLS_DIR).filter(f => f.endsWith('.json')); } catch {}
  for (const f of files) {
    const skill = paths.readJson(path.join(paths.SKILLS_DIR, f), null);
    if (!skill || !skill.skill_id) continue;
    const row = {
      path: path.join('.purpclaw', 'hivemind', 'skills', f).replace(/\\/g, '/'),
      title: skill.title,
      trigger_terms: skill.trigger_terms || [],
      score: skill.score || 0,
      trust_score: skill.trust_score ?? skill.spring?.trust_score ?? null,
      spring_rank: skill.spring_rank ?? skill.spring?.spring_rank ?? null,
      origin: skill.spring?.origin || skill.origin || null,
      last_used_at: skill.last_used_at || null,
      deprecated: !!skill.deprecated,
      updated_at: skill.updated_at || null
    };
    if (skill.kind === 'antiskill') index.antiskills[skill.skill_id] = row;
    else if (skill.kind === 'doctrine') index.doctrines[skill.skill_id] = row;
    else index.skills[skill.skill_id] = row;
  }
  paths.writeJsonAtomic(paths.INDEX_FILE, index);
  return index;
}

function promote(options = {}) {
  paths.ensureHivemindDirs();
  const rules = paths.readJson(paths.RULES_FILE, paths.defaultRules());
  const traces = traceRecorder.listTraces(options.limit || 1000);
  const eligible = traces.filter(t => isEligible(t, rules));
  const clusters = clusterTraces(eligible);
  const promoted = [];
  const doctrines = [];
  const dryRun = !!options.dryRun;

  for (const cluster of clusters) {
    if (cluster.traces.length >= (rules.min_success_count || 2)) {
      const skill = createSkillFromCluster(cluster, rules);
      const saved = dryRun ? skill : saveSkill(skill);
      promoted.push(saved);
      if (rules.spring_doctrine_enabled && cluster.traces.length >= (rules.doctrine_min_success_count || 7) && (saved.score || 0) >= (rules.doctrine_min_score || 0.93)) {
        const doctrine = spring.doctrineFromSkill(saved);
        doctrines.push(doctrine);
      }
    }
  }

  const antiskills = [];
  if (rules.antiskills) {
    for (const trace of traces.filter(t => t.outcome === 'failed' || t.error).slice(0, 100)) {
      if (trace.rollback || trace.destructive || trace.error) {
        const anti = createAntiSkillFromFailure(trace);
        antiskills.push(dryRun ? anti : saveSkill(anti));
      }
    }
  }

  if (!dryRun) updateIndex();
  paths.appendJsonl(paths.EVENTS_FILE, { at: nowIso(), type: 'hivemind.promote.finished', promoted: promoted.length, antiskills: antiskills.length, doctrines: doctrines.length, dryRun });
  return { promoted, antiskills, doctrines, eligible: eligible.length, traceCount: traces.length, dryRun };
}

function tryPromote(runId, options = {}) {
  const rules = paths.readJson(paths.RULES_FILE, paths.defaultRules());
  if (!rules.autoskill && !options.force) return { skipped: true, reason: 'autoskill disabled' };
  return promote({ limit: options.limit || 250, dryRun: false });
}

module.exports = { isEligible, clusterTraces, createSkillFromCluster, createAntiSkillFromFailure, saveSkill, updateIndex, promote, tryPromote };
