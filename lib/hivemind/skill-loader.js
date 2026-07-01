'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { tokenize, overlapScore, decayMultiplier, clamp } = require('./util');
const scorer = require('./skill-scorer');
const spring = require('./spring-validator');

function listSkills(options = {}) {
  paths.ensureHivemindDirs();
  let files = [];
  try { files = fs.readdirSync(paths.SKILLS_DIR).filter(f => f.endsWith('.json')); } catch { return []; }
  const skills = files.map(f => paths.readJson(path.join(paths.SKILLS_DIR, f), null)).filter(Boolean);
  return skills
    .filter(s => options.includeDeprecated || !s.deprecated)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

function loadSkillsForTask(task, options = {}) {
  paths.ensureHivemindDirs();
  const rules = paths.readJson(paths.RULES_FILE, paths.defaultRules());
  const limit = Number(options.limit || rules.max_skills_loaded || 3);
  const qTokens = tokenize(`${task || ''} ${options.intent || ''} ${options.jobType || ''}`);
  const candidates = listSkills({ includeDeprecated: false }).filter(s => s.kind !== 'antiskill' && Number(s.spring_rank || s.spring?.spring_rank || 3) <= Number(rules.max_loadable_spring_rank || 5));
  const scored = [];

  for (const skill of candidates) {
    const triggerTokens = tokenize([skill.title, skill.description, ...(skill.trigger_terms || skill.trigger || [])].join(' '));
    const textOverlap = overlapScore(qTokens, triggerTokens);
    const intentBoost = options.intent && skill.intent === options.intent ? 0.20 : 0;
    const typeBoost = options.jobType && skill.task_type === options.jobType ? 0.15 : 0;
    const runtime = scorer.skillRuntimeScore(skill, rules);
    const trust = Number(skill.trust_score ?? skill.spring?.trust_score ?? 0.5);
    const springBoost = Number(skill.spring_rank || skill.spring?.spring_rank || 4) <= 2 ? 0.10 : 0;
    const recency = decayMultiplier(skill.last_used_at || skill.updated_at || skill.created_at, rules.decay_half_life_days || 45);
    const rank = clamp(textOverlap * 0.43 + runtime * 0.25 + trust * 0.17 + springBoost + intentBoost + typeBoost + recency * 0.08);
    if (rank > 0.05) scored.push({ ...skill, _rank: Math.round(rank * 1000) / 1000 });
  }

  scored.sort((a, b) => b._rank - a._rank || (b.score || 0) - (a.score || 0));
  return scored.slice(0, limit);
}

function loadAntiSkillsForTask(task, options = {}) {
  const qTokens = tokenize(`${task || ''} ${options.intent || ''}`);
  // Kind-aware threshold + failure_count boost (Batch 2 fix, 2026-06-29):
  // AntiSkills are queried by intent (their failure category), not by skill_id.
  // Their trigger_terms are usually 1-2 short failure-specific tokens, so the
  // overlap score against a single-token intent query is naturally low (e.g.
  // 1/12 = 0.083). The previous 0.05 threshold + 0.55 score multiplier produced
  // 0.046, filtering out every AntiSkill we just promoted.
  //
  // Fix:
  //   1. Lower kind-aware threshold to 0.02 for AntiSkills (skills keep 0.05).
  //   2. Boost score by failure_count: 1 failure = base, 2 = 1.5x, 4+ = 2.0x.
  //      Repeated failure patterns should surface louder — they have a stronger
  //      avoidance signal than one-off mistakes.
  return listSkills({ includeDeprecated: false })
    .filter(s => s.kind === 'antiskill')
    .map(skill => {
      const triggerTokens = tokenize([skill.title, skill.description, ...(skill.trigger_terms || skill.trigger || [])].join(' '));
      const overlap = overlapScore(qTokens, triggerTokens);
      const failureCount = Number(skill.failure_count || 0);
      // failure_count boost: log curve so 1 failure ≈ 1.0x, 4 failures ≈ 1.5x, 16 ≈ 2x
      const boost = 1 + Math.log2(Math.max(1, failureCount)) * 0.25;
      const baseScore = Number(skill.score || 0.5);
      return { ...skill, _rank: overlap * baseScore * boost };
    })
    .filter(s => s._rank > 0.02)
    .sort((a, b) => b._rank - a._rank)
    .slice(0, options.limit || 2);
}

function formatSkillsForAgent(skills = [], antiskills = []) {
  const lines = [];
  const springBlock = spring.formatSpringForAgent({ limit: 4 });
  if (springBlock) lines.push(springBlock);
  if (skills.length) {
    lines.push('\n## PURPCLAW Hivemind Skills');
    lines.push('Relevant successful workflows from previous runs. Use them as proven shortcuts, not blind law.');
    skills.forEach((skill, i) => {
      lines.push(`\n${i + 1}. ${skill.title || skill.skill_id}`);
      lines.push(`Score: ${Number(skill.score || 0).toFixed(2)}  Rank: ${Number(skill._rank || 0).toFixed(2)}  Spring: ${skill.spring?.spring_label || 'Filtered Spring'} / trust ${Number(skill.trust_score ?? skill.spring?.trust_score ?? 0).toFixed(2)}`);
      const steps = skill.steps || [];
      if (steps.length) lines.push('Steps:\n' + steps.slice(0, 8).map(s => `- ${s}`).join('\n'));
      const avoid = skill.avoid || [];
      if (avoid.length) lines.push('Avoid:\n' + avoid.slice(0, 5).map(s => `- ${s}`).join('\n'));
    });
  }
  if (antiskills.length) {
    lines.push('\n## PURPCLAW AntiSkills');
    lines.push('Previously observed traps. Do not repeat these mistakes. Tiny miracle: learning from pain.');
    antiskills.forEach((skill, i) => {
      lines.push(`\n${i + 1}. ${skill.title || skill.skill_id}`);
      const avoid = skill.avoid || skill.steps || [];
      if (avoid.length) lines.push(avoid.slice(0, 6).map(s => `- ${s}`).join('\n'));
    });
  }
  return lines.join('\n');
}

function listDoctrines() {
  return spring.listDoctrines();
}

function springStatus() {
  return spring.springStatus();
}


module.exports = { listSkills, loadSkillsForTask, loadAntiSkillsForTask, formatSkillsForAgent, listDoctrines, springStatus };
