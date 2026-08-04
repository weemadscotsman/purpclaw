'use strict';

/**
 * agent-health — per-agent health check (criterion #9 of the agent standard).
 *
 * An agent is HEALTHY only if it can actually be dispatched right now:
 *   - it exists in the canonical registry (unique id)
 *   - it has a callable executor (spawnable via agent_tower.js)
 *   - its model binding resolves (routing returns a non-empty model)
 *   - it has a division/lane and a role
 *
 * These are real, checkable facts read from source at call time — not a
 * hardcoded "green". If a check fails, the agent is not healthy, full stop.
 *
 *   const { checkAgent, checkAll } = require('./lib/agent-health');
 *   checkAgent('robot'); // { key, healthy, checks: {...}, failed: [...] }
 */

const path = require('path');
const fs = require('fs');
const { listAgents } = require('./agent-registry');

const ROOT = path.resolve(__dirname, '..');

function modelFor(name) {
  try { return eval('require')(path.join(ROOT, 'agent_routing_matrix.js')).modelForAgent(name) || ''; }
  catch { return ''; }
}

function capabilityToolNames(a) {
  return (a.sources || [])
    .filter(s => /^tool:/.test(String(s)))
    .map(s => String(s).replace(/^tool:/, ''));
}

function hasCapabilityTool(a) {
  const names = capabilityToolNames(a);
  if (!names.length) return false;
  try {
    const tools = require('./tools');
    return names.some(name => typeof tools.has === 'function' && tools.has(name));
  } catch {
    return false;
  }
}

function hasPersonaExecutor(a) {
  if (a.type !== 'persona') return false;
  try {
    const { personaRegistryEntries } = require('./agent-personas');
    const personas = personaRegistryEntries();
    const file = a.file || (a.sources || []).find(s => /^agents[\\/].+\.md$/.test(String(s)));
    const fileExists = file ? fs.existsSync(path.join(ROOT, file)) : false;
    return fileExists && Boolean(personas[a.key]);
  } catch {
    return false;
  }
}

function hasExecutor(a) {
  if (a.type === 'capability') return hasCapabilityTool(a);
  if (a.type === 'persona') return hasPersonaExecutor(a);
  return (a.sources || []).some(s => /agent_tower\.js$/.test(s)) || a.type === 'tower';
}

/** Health-check one agent by key or name. Returns a structured verdict. */
function checkAgent(idOrKey) {
  const key = String(idOrKey || '').toLowerCase();
  const agent = listAgents().find(a => a.key === key || String(a.name || '').toLowerCase() === key);
  if (!agent) {
    return { key, healthy: false, checks: { registered: false }, failed: ['registered'], at: new Date().toISOString() };
  }
  const model = agent.model || modelFor(agent.key);
  const toolBacked = agent.type === 'capability' && hasCapabilityTool(agent);
  const checks = {
    registered: true,
    executor: hasExecutor(agent),
    model_resolves: toolBacked || Boolean(model),
    has_division: Boolean(agent.division && agent.division !== 'UNASSIGNED'),
    has_role: Boolean(agent.role),
  };
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return { key: agent.key, name: agent.name, healthy: failed.length === 0, checks, failed, model: model || null, at: new Date().toISOString() };
}

/** Health-check the whole roster. Returns { total, healthy, unhealthy, results }. */
function checkAll() {
  const results = listAgents().map(a => checkAgent(a.key));
  const healthy = results.filter(r => r.healthy).length;
  return { total: results.length, healthy, unhealthy: results.length - healthy, results };
}

module.exports = { checkAgent, checkAll };

// CLI: node lib/agent-health.js [agentKey]
if (require.main === module) {
  const arg = process.argv[2];
  const out = arg ? checkAgent(arg) : (({ total, healthy, unhealthy }) => ({ total, healthy, unhealthy }))(checkAll());
  console.log(JSON.stringify(out, null, 2));
}
