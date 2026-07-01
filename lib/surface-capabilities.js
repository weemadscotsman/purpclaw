'use strict';

const CAPABILITIES = [
  {
    id: 'chat',
    label: 'Chat with the stack',
    reason: 'Ask questions, get explanations, or delegate from chat when the prompt becomes a job.',
    category: 'start',
    setup: ['LLM_PROVIDER', 'LLM_MODEL', 'provider key or local model'],
    cli: ['purpclaw ask "<question>"', 'purpclaw tui ask'],
    tui: ['tui ask prompt', 'dashboard Actions tab'],
    web: { route: '/mission', mode: 'Chat', api: '/api/chat' },
  },
  {
    id: 'mission',
    label: 'Run a full mission',
    reason: 'Plan, route, execute, verify, and report through the orchestrator.',
    category: 'execute',
    setup: ['orchestrator service', 'agent tower service'],
    cli: ['purpclaw run "<task>"', 'purpclaw bg "<task>"'],
    tui: ['dashboard Jobs tab', 'dashboard Actions tab'],
    web: { route: '/mission', mode: 'Mission', api: '/api/orchestrate' },
  },
  {
    id: 'swarm',
    label: 'Dispatch swarm job',
    reason: 'Use the canonical kernel job queue for routed multi-agent work.',
    category: 'execute',
    setup: ['unified API service', 'kernel jobs API'],
    cli: ['purpclaw jobs pending', 'purpclaw approve <id>'],
    tui: ['dashboard Jobs tab'],
    web: { route: '/mission', mode: 'Swarm', api: '/api/kernel/jobs' },
  },
  {
    id: 'agent',
    label: 'Assign one agent',
    reason: 'Send a focused task directly to a selected tower agent.',
    category: 'execute',
    setup: ['agent tower service', 'agent routing matrix'],
    cli: ['purpclaw agents', 'purpclaw roster'],
    tui: ['dashboard Agents tab'],
    web: { route: '/mission', mode: 'Agent', api: '/api/spawn' },
  },
  {
    id: 'research',
    label: 'Run research',
    reason: 'Use the research room for source-backed analysis and model-room comparison.',
    category: 'intelligence',
    setup: ['OPENROUTER_API_KEY for research room'],
    cli: ['purpclaw research "<question>"', 'purpclaw ask "<research question>"'],
    tui: ['tui ask prompt', 'dashboard Actions tab'],
    web: { route: '/mission', mode: 'Research', api: '/api/research/group' },
  },
  {
    id: 'memory',
    label: 'Use memory',
    reason: 'Recall, ingest, forget, and inspect memory state.',
    category: 'intelligence',
    setup: ['memory matrix service'],
    cli: ['purpclaw memory <query>', 'purpclaw memory ingest "<text>"', 'purpclaw dream'],
    tui: ['dashboard Memory tab'],
    web: { route: '/memory', mode: 'Memory', api: '/api/spine-health' },
  },
  {
    id: 'knowledge-pool',
    label: 'Search skills and routing',
    reason: 'Find skills, agents, routing hints, Hivemind doctrine, and pool metadata.',
    category: 'intelligence',
    setup: ['pool service'],
    cli: ['purpclaw pool query <text>', 'purpclaw pool routing <text>', 'purpclaw hivemind spring'],
    tui: ['dashboard Pool tab'],
    web: { route: '/system-map', mode: 'Pool', api: '/pool/skills/search' },
  },
  {
    id: 'hivemind',
    label: 'Inspect the learning wrapper',
    reason: 'Load proven skills, inspect doctrine and AntiSkills, validate traces, and promote verified operational memory without replacing the executor.',
    category: 'intelligence',
    setup: ['orchestrator service', 'hivemind file store', 'spring validator'],
    cli: [
      'purpclaw hivemind status',
      'purpclaw hivemind spring',
      'purpclaw hivemind validate \'{"outcome":"success","tests_passed":true}\'',
    ],
    tui: ['dashboard Actions tab', 'dashboard Pool tab'],
    web: { route: '/mission', mode: 'Hivemind', api: '/api/hivemind/spring' },
  },
  {
    id: 'steering',
    label: 'Load steering context',
    reason: 'Expose steering/ and .kiro/steering guidance as bounded Hivemind context without executing it.',
    category: 'intelligence',
    setup: ['steering markdown files', 'hivemind steering loader'],
    cli: ['purpclaw action steering "typescript"', 'purpclaw hivemind load "<task>"'],
    tui: ['dashboard Actions tab'],
    web: { route: '/mission', mode: 'Steering', api: '/api/action?capability=steering' },
  },
  {
    id: 'stress',
    label: 'Use stress scenarios as evidence',
    reason: 'Account for STRESS/ scenarios as verification evidence sources and record wrapper traces for stress runs.',
    category: 'observe',
    setup: ['STRESS markdown archive', 'hivemind trace recorder', 'spring validator'],
    cli: ['purpclaw action stress "orchestrator hardening" --dry-run'],
    tui: ['dashboard Actions tab'],
    web: { route: '/mission', mode: 'Stress', api: '/api/action?capability=stress' },
  },
  {
    id: 'task-registry',
    label: 'Discover side task registries',
    reason: 'Surface TASKS/ and DreamTask/ as task registry sources that can be planned through the shared action system.',
    category: 'execute',
    setup: ['TASKS markdown archive', 'DreamTask adapter'],
    cli: ['purpclaw action task-registry "dream consolidation" --dry-run'],
    tui: ['dashboard Actions tab'],
    web: { route: '/mission', mode: 'Tasks', api: '/api/action?capability=task-registry' },
  },
  {
    id: 'podcast-studio',
    label: 'Run podcast studio workflow',
    reason: 'Treat podcast_studio/ as a media studio workflow capability with traceable episode plans and evidence.',
    category: 'tools',
    setup: ['podcast_studio shared log', 'episode_manager.js', 'Windows TTS when speaking'],
    cli: ['purpclaw action podcast-studio "episode topic" --dry-run'],
    tui: ['dashboard Actions tab'],
    web: { route: '/mission', mode: 'Studio', api: '/api/action?capability=podcast-studio' },
  },
  {
    id: 'imessage',
    label: 'Send and inspect iMessage via Photon',
    reason: 'Use direct Photon-backed iMessage support as another PURPCLAW surface without a Mac relay, Messages.app, or imsg dependency.',
    category: 'tools',
    setup: [
      'PHOTON_IMESSAGE_BASE_URL or PHOTON_API_BASE_URL',
      'PHOTON_IMESSAGE_API_KEY or PHOTON_API_KEY',
      'PHOTON_IMESSAGE_ENABLE_SEND=true for real sends',
    ],
    cli: [
      'purpclaw action imessage status --dry-run',
      'purpclaw action imessage "hello" --to "+15551234567" --confirm-send',
    ],
    tui: ['dashboard Actions tab'],
    web: { route: '/mission', mode: 'iMessage', api: '/api/action?capability=imessage' },
  },
  {
    id: 'council-mode',
    label: 'Use Podcast Studio as Council Mode',
    reason: 'Promote podcast_studio from an entertainment loop into a read-only reasoning chamber pattern: Oracle chairs, Weatherman reports, specialists debate, Smith attacks, Neo verifies, Memory records, and Hermes executes approved plans.',
    category: 'execute',
    setup: ['podcast_studio shared log', 'workflow registry', 'Oracle and Weatherman reports'],
    cli: ['purpclaw council "Should we consolidate the UI?"', 'purpclaw council "Should we consolidate the UI?" --json', 'purpclaw workflow runtime.council'],
    tui: ['dashboard Actions tab'],
    web: { route: '/mission', mode: 'Council', api: '/api/action?capability=podcast-studio' },
  },
  {
    id: 'raft-agent-network',
    label: 'Use Raft external gateway channel',
    reason: 'Join the Raft Agent Network as an external gateway channel: PURPCLAW accepts or sends bounded jobs through Raft while the local orchestrator, agents, tools, Hivemind, and Spring remain the runtime of record.',
    category: 'execute',
    setup: [
      'RAFT_AGENT_NETWORK_BASE_URL or RAFT_API_BASE_URL',
      'RAFT_AGENT_NETWORK_API_KEY or RAFT_API_KEY',
      'RAFT_AGENT_NETWORK_ENABLE_DISPATCH=true for real dispatch',
    ],
    cli: [
      'purpclaw action raft-agent-network status --dry-run',
      'purpclaw action raft-agent-network "summarize this" --peer family --channel imessage --confirm-dispatch',
    ],
    tui: ['dashboard Actions tab'],
    web: { route: '/mission', mode: 'Raft', api: '/api/action?capability=raft-agent-network' },
  },
  {
    id: 'providers',
    label: 'Configure providers and models',
    reason: 'Set keys, choose routing lanes, refresh model catalogs, and inspect spend.',
    category: 'setup',
    setup: ['provider keys or local runtime'],
    cli: ['purpclaw setup', 'purpclaw model list', 'purpclaw model use <provider>/<model>'],
    tui: ['dashboard Actions tab'],
    web: { route: '/providers', mode: 'Providers', api: '/api/providers' },
  },
  {
    id: 'settings',
    label: 'Configure runtime settings',
    reason: 'Inspect and change stack settings, presets, safety controls, and runtime knobs.',
    category: 'setup',
    setup: ['operator auth for writes'],
    cli: ['purpclaw config', 'purpclaw setup --list'],
    tui: ['dashboard Actions tab'],
    web: { route: '/settings', mode: 'Settings', api: '/api/settings' },
  },
  {
    id: 'health',
    label: 'Diagnose the stack',
    reason: 'Check services, pulse findings, doctors, logs, and feature parity.',
    category: 'observe',
    setup: ['service registry'],
    cli: ['purpclaw status', 'purpclaw doctor', 'purpclaw doctors', 'purpclaw parity'],
    tui: ['dashboard Overview tab', 'dashboard Logs tab'],
    web: { route: '/mission', mode: 'Overview', api: '/api/services' },
  },
  {
    id: 'browser',
    label: 'Use browser and computer tools',
    reason: 'Open, inspect, automate, and verify web/browser workflows.',
    category: 'tools',
    setup: ['browser tooling service when needed'],
    cli: ['purpclaw browser', 'purpclaw look'],
    tui: ['tui ask prompt'],
    web: { route: '/mission', mode: 'Chat or Mission', api: '/api/playwright' },
  },
  {
    id: 'weather',
    label: 'Read system weather (current conditions)',
    reason: 'Read-only operational climate: service/provider/registry/hivemind/build status rolled into a clear|cloudy|storm|red_alert condition with warnings, safe_to_build, and a recommended work mode. Advises only — never patches.',
    category: 'observe',
    setup: ['service_registry', 'drift-watcher', 'hivemind status', 'version stamp'],
    cli: ['purpclaw weather', 'purpclaw weather --json'],
    tui: ['dashboard status panel'],
    web: { route: '/mission', mode: 'Weather', api: '/api/weather' },
  },
  {
    id: 'oracle',
    label: 'Ask the Oracle (risk forecast)',
    reason: 'Read-only foresight: consumes Weatherman + Hivemind failures + registry audit + launch ledger to forecast likely risks with confidence, evidence, next-best action, and an avoid list. Advises only — never patches.',
    category: 'observe',
    setup: ['weatherman', 'hivemind traces', 'registry-audit', 'launch ledger'],
    cli: ['purpclaw oracle', 'purpclaw oracle --json'],
    tui: ['dashboard strategy panel'],
    web: { route: '/mission', mode: 'Oracle', api: '/api/oracle' },
  },
  {
    id: 'next-step',
    label: 'Ask for the next best workflow step',
    reason: 'Read-only BMad-organ transplant: classify task scale, inspect planning artifacts, determine the current phase, and return one concrete next command instead of vague planning advice.',
    category: 'observe',
    setup: ['registry/workflows.json', 'lib/workflow-registry.js', 'project artifacts when present'],
    cli: ['purpclaw next', 'purpclaw next "I finished architecture, what now?"', 'purpclaw workflow'],
    tui: ['dashboard strategy panel'],
    web: { route: '/mission', mode: 'Next Step', api: '/api/oracle' },
  },
];

function listCapabilities() {
  return CAPABILITIES.map(item => ({ ...item, setup: [...item.setup], cli: [...item.cli], tui: [...item.tui], web: { ...item.web } }));
}

function findCapability(idOrText) {
  const needle = String(idOrText || '').trim().toLowerCase();
  if (!needle) return null;
  const capabilities = listCapabilities();
  const exact = capabilities.find(item => item.id === needle);
  if (exact) return exact;
  return capabilities.find(item =>
    item.label.toLowerCase().includes(needle) ||
    item.reason.toLowerCase().includes(needle)
  ) || null;
}

function groupedCapabilities() {
  return listCapabilities().reduce((groups, item) => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
    return groups;
  }, {});
}

function paritySummary() {
  const capabilities = listCapabilities();
  const validation = validateCapabilityCatalog(capabilities);
  return {
    ok: validation.ok,
    schema: 'purpclaw.surface-capabilities.v1',
    generatedAt: new Date().toISOString(),
    surfaces: ['cli', 'tui', 'web'],
    count: capabilities.length,
    capabilities,
    groups: groupedCapabilities(),
    validation,
  };
}

function validateCapabilityCatalog(capabilities = listCapabilities()) {
  const requiredFields = ['id', 'label', 'reason', 'category'];
  const failures = [];
  const seen = new Set();

  for (const item of capabilities) {
    const target = item && item.id ? item.id : '<missing-id>';
    for (const field of requiredFields) {
      if (!item || !String(item[field] || '').trim()) failures.push(`${target}: missing ${field}`);
    }
    if (item && item.id) {
      if (seen.has(item.id)) failures.push(`${item.id}: duplicate id`);
      seen.add(item.id);
    }
    if (!Array.isArray(item && item.setup) || item.setup.length === 0) failures.push(`${target}: missing setup metadata`);
    if (!Array.isArray(item && item.cli) || item.cli.length === 0) failures.push(`${target}: missing CLI surface`);
    if (!Array.isArray(item && item.tui) || item.tui.length === 0) failures.push(`${target}: missing TUI surface`);
    if (!item || !item.web || typeof item.web !== 'object') {
      failures.push(`${target}: missing web surface`);
      continue;
    }
    for (const field of ['route', 'mode', 'api']) {
      if (!String(item.web[field] || '').trim()) failures.push(`${target}: missing web.${field}`);
    }
  }

  return {
    ok: failures.length === 0,
    checked: capabilities.length,
    required: ['id', 'label', 'reason', 'category', 'setup[]', 'cli[]', 'tui[]', 'web.route', 'web.mode', 'web.api'],
    failures,
  };
}

module.exports = {
  CAPABILITIES,
  listCapabilities,
  findCapability,
  groupedCapabilities,
  paritySummary,
  validateCapabilityCatalog,
};
