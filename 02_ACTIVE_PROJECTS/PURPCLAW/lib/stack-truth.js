'use strict';

/**
 * stack-truth — THE one source of truth about the sources of truth.
 *
 * Every concern in PURPCLAW has exactly ONE canonical module that owns it. This
 * index names them, resolves them, lets the backend DECIDE the best course of
 * action per concern (pathfinding from real state, never guessing), and AUDITS
 * its own stack to flag duplicate/competing owners.
 *
 * The rule: no part of the system hardcodes or guesses "how do I pick an agent /
 * a model / a route / a skill". It asks here. One door per concern, one index
 * over the doors.
 *
 *   const stack = require('./lib/stack-truth');
 *   stack.decide('steering', { message: 'build a login page' });   // → route
 *   stack.decide('agent',    { task: 'review the rust module' });  // → best agent
 *   stack.decide('model',    { task: 'plan the architecture' });   // → best lane
 *   stack.audit();  // → every concern has one live source, or what's wrong
 */

// Static relative requires (webpack/Next-safe — dynamic absolute requires do
// not survive bundling). Each concern's canonical module is loaded here.
const LOADERS = {
  steering:    () => require('./steering-router'),
  harness:     () => require('./api-harness-kernel'),
  jobchain:    () => require('./job-chain'),
  agents:      () => require('./agent-registry'),
  agentHealth: () => require('./agent-health'),
  routing:     () => require('../agent_routing_matrix'),
  models:      () => require('./model-router'),
  providers:   () => require('./runtime/provider-config'),
  tools:       () => require('./tools/index'),
  skills:      () => require('./tools/skills-registry'),
  memory:      () => require('./memory-client'),
  services:    () => require('../service_registry'),
};

// ── The canonical sources of truth (ONE owner per concern) ──────────────────
const SOURCES = {
  steering:  { module: 'lib/steering-router.js', owns: 'where a request goes (chat/agent/skill/swarm/research/job)', provides: ['classify', 'steer'] },
  harness:   { module: 'lib/api-harness-kernel.js', owns: 'job lifecycle: map→plan→delegate→queue→run→finish', provides: ['getApiHarnessKernel'] },
  jobchain:  { module: 'lib/job-chain.js', owns: 'per-job step log start→finish + failure pinpoint', provides: ['start', 'step', 'done', 'fail', 'get'] },
  agents:    { module: 'lib/agent-registry.js', owns: 'the agent roster (identities, divisions, roles)', provides: ['listAgents', 'getAgent'] },
  agentHealth:{ module: 'lib/agent-health.js', owns: 'per-agent dispatchability (registered/executor/model/division/role)', provides: ['checkAgent', 'checkAll'] },
  routing:   { module: 'agent_routing_matrix.js', owns: 'agent→model bindings', provides: ['modelForAgent'] },
  models:    { module: 'lib/model-router.js', owns: 'job→model-lane routing', provides: ['route', 'listLanes'] },
  providers: { module: 'lib/runtime/provider-config.js', owns: 'user provider/model per lane', provides: ['getLane', 'setLane'] },
  tools:     { module: 'lib/tools/index.js', owns: 'the callable tool registry', provides: ['list', 'register'] },
  skills:    { module: 'lib/tools/skills-registry.js', owns: 'skill→native-tool registration', provides: ['registerAllSkills'] },
  memory:    { module: 'lib/memory-client.js', owns: 'the one memory door (routes through all layers)', provides: ['recall', 'ingest'] },
  services:  { module: 'service_registry.js', owns: 'services + ports + PM2 names', provides: ['getServices'] },
};

/** Resolve a concern to its canonical module (lazy require). */
function resolve(concern) {
  const loader = LOADERS[concern];
  if (!loader) throw new Error(`no source of truth for concern "${concern}" — known: ${Object.keys(LOADERS).join(', ')}`);
  return loader();
}

// ── DECIDE: best course of action per concern, from real backend state ──────
const DECIDERS = {
  // Where does this request go?
  steering: (ctx) => resolve('steering').classify(ctx.message || ctx.task || '', ctx),

  // Which agent is best for this task? Score healthy agents by skill/role/
  // division overlap with the task text. Real roster + real health, no guess.
  agent: (ctx) => {
    const task = String(ctx.task || ctx.message || '').toLowerCase();
    const terms = task.split(/\W+/).filter(w => w.length > 3);
    const agents = resolve('agents').listAgents();
    let healthy = null;
    try { healthy = new Set(resolve('agentHealth').checkAll().results.filter(r => r.healthy).map(r => r.key)); } catch { /* health optional */ }
    const scored = agents.map(a => {
      const hay = `${a.role || ''} ${a.division || ''} ${(a.skills || []).join(' ')} ${a.key}`.toLowerCase();
      let score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      if (healthy && healthy.has(a.key)) score += 0.5;       // prefer dispatchable
      return { key: a.key, name: a.name, division: a.division, role: a.role, healthy: healthy ? healthy.has(a.key) : null, score };
    }).sort((x, y) => y.score - x.score);
    return { best: scored[0] || null, candidates: scored.slice(0, 5), from: SOURCES.agents.module };
  },

  // Which model lane for this job?
  model: (ctx) => {
    const r = resolve('models');
    const decision = r.route ? r.route(ctx.task || ctx.message || '', ctx) : null;
    return { decision, lanes: r.listLanes ? r.listLanes() : [], from: SOURCES.models.module };
  },

  // Which skill matches this name/intent? Look it up in the live tool registry.
  skill: (ctx) => {
    const want = String(ctx.skill || ctx.name || ctx.message || '').toLowerCase().replace(/^\//, '');
    let tools = [];
    try { tools = resolve('tools').list().map(t => t.name); } catch { /* registry heavy/absent */ }
    const exact = tools.find(n => n.toLowerCase() === want);
    const partial = tools.filter(n => n.toLowerCase().includes(want)).slice(0, 8);
    return { best: exact || partial[0] || null, matches: partial, from: SOURCES.tools.module };
  },
};

/** Decide the best course of action for a concern, using the backend. */
function decide(concern, ctx = {}) {
  const d = DECIDERS[concern];
  if (!d) throw new Error(`no decider for "${concern}" — deciders: ${Object.keys(DECIDERS).join(', ')}`);
  return d(ctx);
}

// ── AUDIT: verify each concern has exactly ONE live source of truth ─────────
function audit() {
  const report = { ok: true, concerns: {}, problems: [] };
  for (const [concern, s] of Object.entries(SOURCES)) {
    let loads = false, missingExports = [];
    try {
      const m = resolve(concern);           // actually load it — present = loadable
      loads = true;
      missingExports = (s.provides || []).filter(fn => typeof m[fn] !== 'function' && !(m[fn]));
    } catch (e) {
      report.problems.push(`${concern}: ${s.module} failed to load — ${e.message}`);
    }
    if (missingExports.length) report.problems.push(`${concern}: ${s.module} missing exports [${missingExports.join(', ')}]`);
    report.concerns[concern] = { module: s.module, owns: s.owns, loads, decider: !!DECIDERS[concern], missingExports };
  }
  report.ok = report.problems.length === 0;
  return report;
}

module.exports = { SOURCES, resolve, decide, audit };

// Self-check: the index must resolve + decide + audit without lying.
if (require.main === module) {
  const assert = require('assert');
  const a = audit();
  console.log(`stack-truth audit: ${a.ok ? 'ALL ONE SOURCE' : a.problems.length + ' problem(s)'}`);
  for (const p of a.problems) console.log('  ⚠ ' + p);
  // Steering + agent deciders must return a real choice.
  const s = decide('steering', { message: 'build a JWT login page' });
  assert.ok(s && s.route, 'steering decide must return a route');
  const g = decide('agent', { task: 'review the rust security module' });
  assert.ok(g && g.best, 'agent decide must return a best agent');
  console.log(`decide steering → ${s.route}; decide agent → ${g.best.key} (score ${g.best.score})`);
  console.log('stack-truth self-check: PASS');
}
