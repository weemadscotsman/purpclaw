'use strict';

const paths = require('./paths');
const traceRecorder = require('./trace-recorder');
const loader = require('./skill-loader');
const promoter = require('./skill-promoter');
const scorer = require('./skill-scorer');
const middleware = require('./hivemind-middleware');
const spring = require('./spring-validator');

function status() {
  paths.ensureHivemindDirs();
  try { spring.seedPrinciples(); } catch (_) {}
  const traces = traceRecorder.listTraces(100000);
  const skills = loader.listSkills({ includeDeprecated: true });
  const activeSkills = skills.filter(s => !s.deprecated && s.kind !== 'antiskill');
  const antiskills = skills.filter(s => !s.deprecated && s.kind === 'antiskill');
  const avgScore = activeSkills.length ? activeSkills.reduce((s, x) => s + Number(x.score || 0), 0) / activeSkills.length : 0;
  return {
    ok: true,
    storage: paths.HIVEMIND_DIR,
    traces: traces.length,
    skills: activeSkills.length,
    antiskills: antiskills.length,
    last_trace_at: traces[0]?.created_at || null,
    average_skill_score: Math.round(avgScore * 1000) / 1000,
    spring: spring.springStatus(),
    doctrines: spring.listDoctrines().length,
    top_skills: activeSkills.sort((a, b) => (b.trust_score || b.score || 0) - (a.trust_score || a.score || 0)).slice(0, 5).map(s => ({ skill_id: s.skill_id, title: s.title, score: s.score, trust_score: s.trust_score, spring_rank: s.spring_rank }))
  };
}

module.exports = {
  ...paths,
  ...traceRecorder,
  ...loader,
  ...promoter,
  ...scorer,
  ...middleware,
  ...spring,
  status,
  listTraces: traceRecorder.listTraces,
  listSkills: loader.listSkills,
};
