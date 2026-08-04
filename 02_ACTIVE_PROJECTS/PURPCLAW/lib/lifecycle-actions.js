'use strict';

const MODULES = {
  auto_research: require('./actions/auto-research'),
  auto_evolve: require('./actions/auto-evolve'),
  timeline: require('./actions/timeline'),
};

function list() {
  return Object.entries(MODULES).map(([capability, mod]) => ({
    capability,
    actions: mod.listActions(),
  }));
}

async function run(capability, action, options = {}) {
  const mod = MODULES[capability];
  if (!mod) return { ok: false, error: `unknown lifecycle capability: ${capability}` };
  if (!mod.ACTIONS[action]) return { ok: false, error: `unknown ${capability} action: ${action}` };
  const result = await Promise.resolve(mod.run(action, options));
  return { ...result, capability, action, surface: options.surface || 'unknown' };
}

module.exports = { list, run, MODULES };
