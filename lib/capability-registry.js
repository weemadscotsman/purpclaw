// ═══════════════════════════════════════════════════════════════════════════
// CAPABILITY REGISTRY — Standby Runtime Architecture
// ═══════════════════════════════════════════════════════════════════════════
//
// Every service in PURPCLAW is registered here with metadata.
// The supervisor reads this to know:
//   - what capabilities exist
//   - how to start them
//   - what ports they use
//   - what dependencies they have
//   - how long to keep them warm after use
//
// Services do NOT run until a job requires them.
// ═══════════════════════════════════════════════════════════════════════════

const CAPABILITIES = {

  // ─── CORE (always-on) ────────────────────────────────────────────────────
  // These start with the supervisor. Never put them in standby.

  eventbus: {
    name: 'purpclaw-eventbus',
    type: 'core',
    script: './unified_eventbus.js',
    mode: 'node',           // node.js service
    port: 7782,
    healthCheck: '/health',
    dependencies: [],
    startupDelay: 0,
    idleTimeout: 0,         // never unload
    memory: '64MB',
    description: 'Event bus — all services communicate via this'
  },

  state: {
    name: 'purpclaw-state',
    type: 'core',
    script: './unified_state.js',
    mode: 'node',
    port: 7783,
    healthCheck: '/health',
    dependencies: [],
    startupDelay: 0,
    idleTimeout: 0,
    memory: '64MB',
    description: 'State store — remembers system status'
  },

  supervisor: {
    name: 'purpclaw-supervisor',
    type: 'core',
    // The supervisor IS the process, not a separate script
    mode: 'embedded',
    port: null,
    healthCheck: null,
    dependencies: ['eventbus', 'state'],
    startupDelay: 0,
    idleTimeout: 0,
    memory: '32MB',
    description: 'Controls everything — the always-on brain'
  },

  // ─── STANDBY SERVICES ────────────────────────────────────────────────────
  // These register on boot but do NOT run until a job needs them.

  api: {
    name: 'purpclaw-api',
    type: 'standby',
    script: './unified_api.js',
    mode: 'node',
    port: 7780,
    healthCheck: '/api/health',
    dependencies: ['eventbus', 'state'],
    startupDelay: 500,
    idleTimeout: 300000,   // 5 min warm after job done
    memory: '256MB',
    description: 'Unified API — receives and routes HTTP jobs'
  },

  tower: {
    name: 'purpclaw-tower',
    type: 'standby',
    script: './agent_tower.js',
    mode: 'node',
    port: 7790,
    healthCheck: '/tower/status',
    dependencies: ['eventbus', 'state'],
    startupDelay: 1000,
    idleTimeout: 600000,   // 10 min — agents take time
    memory: '128MB',
    description: 'Agent tower — spawns 44 swarm agents'
  },

  orchestrator: {
    name: 'purpclaw-orchestrator',
    type: 'standby',
    script: './orchestrator.js',
    mode: 'node',
    port: 7784,
    healthCheck: '/health',
    dependencies: ['eventbus', 'state', 'api'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '128MB',
    description: 'Workflow orchestrator — coordinates multi-step jobs'
  },

  gatekeeper: {
    name: 'purpclaw-gatekeeper',
    type: 'standby',
    script: './gatekeeper.js',
    mode: 'node',
    port: 7791,
    healthCheck: '/health',
    dependencies: ['eventbus', 'state'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '64MB',
    description: 'Auth and rate limiting gate'
  },

  coordinator: {
    name: 'purpclaw-coordinator',
    type: 'standby',
    script: './swarm_coordinator.js',
    mode: 'node',
    port: 7898,
    healthCheck: null,
    dependencies: ['eventbus', 'tower'],
    startupDelay: 1000,
    idleTimeout: 600000,
    memory: '128MB',
    description: 'Swarm coordinator — manages multi-agent workflows'
  },

  // ── Python services ───────────────────────────────────────────────────

  memory: {
    name: 'purpclaw-memory',
    type: 'standby',
    script: './memory_matrix_v2.py',
    args: '--port 7880',
    mode: 'python',
    port: 7880,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 2000,
    idleTimeout: 300000,
    memory: '128MB',
    description: 'Memory matrix — vector store and recall'
  },

  bridge_ns: {
    name: 'purpclaw-bridge-ns',
    type: 'standby',
    script: './neuro_symbolic_bridge.py',
    args: '--port 7884',
    mode: 'python',
    port: 7884,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 1000,
    idleTimeout: 300000,
    memory: '128MB',
    description: 'Neuro-symbolic bridge — Thringlet integration'
  },

  modal: {
    name: 'purpclaw-modal',
    type: 'standby',
    script: './modal_logic_engine.py',
    args: '--port 7785',
    mode: 'python',
    port: 7785,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '128MB',
    description: 'Modal logic engine — rule-based reasoning'
  },

  diagnostics: {
    name: 'purpclaw-diagnostics',
    type: 'standby',
    script: './autonomous_diagnostics.py',
    args: '--port 7786',
    mode: 'python',
    port: 7786,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '128MB',
    description: 'Self-diagnostics — health checks and recovery'
  },

  rules: {
    name: 'purpclaw-rules',
    type: 'standby',
    script: './symbolic_rules_engine.py',
    args: '--port 7787',
    mode: 'python',
    port: 7787,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '128MB',
    description: 'Symbolic rules engine — policy enforcement'
  },

  stt: {
    name: 'purpclaw-stt',
    type: 'standby',
    script: './voice_stt.py',
    args: '--port 7896',
    mode: 'python',
    port: 7896,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 3000,   // whisper model load is slow
    idleTimeout: 180000,   // 3 min — voice jobs are quick
    memory: '512MB',
    description: 'Speech-to-text — Whisper-based STT'
  },

  yolo: {
    name: 'purpclaw-yolo',
    type: 'standby',
    script: './yolo_service.py',
    args: '--port 7779',
    mode: 'python',
    port: 7779,
    healthCheck: '/health',
    dependencies: [],
    startupDelay: 2000,
    idleTimeout: 180000,
    memory: '128MB',
    description: 'YOLO vision — object detection for screen reading'
  },

  autodream: {
    name: 'purpclaw-cognitive-autodream',
    type: 'standby',
    script: './cognitive_spine.py',
    args: '--port 7880',
    mode: 'python',
    port: 7880,
    healthCheck: '/autodream/status',
    dependencies: ['cognitive'],
    startupDelay: 1000,
    idleTimeout: 600000,
    memory: '1G',
    description: 'Autodream — generative vision system'
  },

  reasoning: {
    name: 'purpclaw-reasoning',
    type: 'standby',
    script: './lib/reasoning-loop.js',
    mode: 'node',
    port: 7892,
    healthCheck: null,
    dependencies: ['eventbus', 'pool'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '64MB',
    description: 'Proactive reasoning loop — background analysis'
  },

  // ── UI Services ───────────────────────────────────────────────────────

  nextjs: {
    name: 'purpclaw-nextjs',
    type: 'standby',
    script: './node_modules/next/dist/bin/next',
    args: 'dev -p 3000',
    mode: 'node',
    port: 3000,
    healthCheck: '/',
    dependencies: [],
    startupDelay: 5000,    // Next.js is heavy
    idleTimeout: 600000,   // 10 min — UI might be used again
    memory: '256MB',
    description: 'Mission Control UI — Next.js dashboard'
  },

  no_spaghett: {
    name: 'purpclaw-no-spaghett',
    type: 'standby',
    script: './node_modules/next/dist/bin/next',
    args: 'dev -p 7797 -H 127.0.0.1',
    cwd: './no-spaghett',
    mode: 'node',
    port: 7797,
    healthCheck: '/',
    dependencies: [],
    startupDelay: 3000,
    idleTimeout: 300000,
    memory: '384MB',
    description: 'No Spaghett — code quality auditor'
  },

  // ── Companion/Media ──────────────────────────────────────────────────

  chorus: {
    name: 'purpclaw-chorus',
    type: 'standby',
    script: './companion-chorus/bridge.js',
    mode: 'node',
    port: null,
    healthCheck: null,
    dependencies: ['eventbus', 'voice'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '64MB',
    description: 'Companion chorus — animal companion reactions'
  },

  voice: {
    name: 'purpclaw-voice',
    type: 'standby',
    script: './voice_coordinator.js',
    mode: 'node',
    port: null,
    healthCheck: null,
    dependencies: ['eventbus'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '128MB',
    description: 'Voice coordinator — TTS/STT orchestration'
  },

  bridge_voice: {
    name: 'purpclaw-bridge',
    type: 'standby',
    script: './voice_bridge_7792.js',
    mode: 'node',
    port: 7792,
    healthCheck: '/health',
    dependencies: ['eventbus', 'voice'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '64MB',
    description: 'Voice bridge — xiaozhi integration'
  },

  vision: {
    name: 'purpclaw-vision',
    type: 'standby',
    script: './vision_monitor.js',
    mode: 'node',
    port: null,
    healthCheck: null,
    dependencies: ['eventbus', 'yolo'],
    startupDelay: 500,
    idleTimeout: 180000,
    memory: '128MB',
    description: 'Vision monitor — screen observation for avatar'
  },

  // ── Data/Worker Services ──────────────────────────────────────────────

  pool: {
    name: 'purpclaw-pool',
    type: 'standby',
    script: './pool_service.js',
    mode: 'node',
    port: 7885,
    healthCheck: '/health',
    dependencies: ['eventbus', 'state'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '64MB',
    description: 'Knowledge pool — skill index and retrieval'
  },

  context: {
    name: 'purpclaw-context',
    type: 'standby',
    script: './lib/context-bus.js',
    mode: 'node',
    port: 7881,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '64MB',
    description: 'Context bus — cross-service context sharing'
  },

  metrics: {
    name: 'purpclaw-metrics',
    type: 'standby',
    script: './metrics_aggregator.js',
    args: '--port 7890',
    mode: 'node',
    port: 7890,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '64MB',
    description: 'Metrics aggregator — system telemetry'
  },

  workers: {
    name: 'purpclaw-workers',
    type: 'standby',
    script: './worker_service.js',
    mode: 'node',
    port: 7897,
    healthCheck: '/health',
    dependencies: ['eventbus', 'tower'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '64MB',
    description: 'Worker pool — overflow lane for heavy jobs'
  },

  harness: {
    name: 'purpclaw-harness',
    type: 'standby',
    script: './harness_service.js',
    mode: 'node',
    port: 7798,
    healthCheck: '/health',
    dependencies: ['eventbus'],
    startupDelay: 500,
    idleTimeout: 600000,
    memory: '256MB',
    description: 'AI harness — LLM orchestration for agents'
  },

  thringlet_bridge: {
    name: 'purpclaw-thringlet-bridge',
    type: 'standby',
    script: './thringlet_bridge.js',
    mode: 'node',
    port: 7799,
    healthCheck: null,
    dependencies: ['eventbus', 'bridge_ns'],
    startupDelay: 500,
    idleTimeout: 300000,
    memory: '96MB',
    description: 'Thringlet bridge — PVX blockchain Thringlet integration'
  },

  // ── Terminal Fly ──────────────────────────────────────────────────────
  // Always-on because it needs to respond to git/test events immediately

  fly: {
    name: 'purpclaw-fly',
    type: 'core',          // special case — needs immediate reaction
    script: './terminal-fly.js',
    mode: 'node',
    port: null,
    healthCheck: null,
    dependencies: [],
    startupDelay: 0,
    idleTimeout: 0,
    memory: '32MB',
    description: 'Terminal fly — watches git, tests, PR events in real time'
  }

};

// ═══════════════════════════════════════════════════════════════════════════
// Capability metadata helpers
// ═══════════════════════════════════════════════════════════════════════════

function getCapability(capId) {
  return CAPABILITIES[capId] || null;
}

function getStandbyCapabilities() {
  return Object.entries(CAPABILITIES)
    .filter(([, cap]) => cap.type === 'standby')
    .map(([id, cap]) => ({ id, ...cap }));
}

function getCoreCapabilities() {
  return Object.entries(CAPABILITIES)
    .filter(([, cap]) => cap.type === 'core')
    .map(([id, cap]) => ({ id, ...cap }));
}

function getAllCapabilityIds() {
  return Object.keys(CAPABILITIES);
}

function getCapabilitiesByDependency(depId) {
  return Object.entries(CAPABILITIES)
    .filter(([, cap]) => cap.dependencies.includes(depId))
    .map(([id]) => id);
}

// Resolve dependencies recursively (for starting groups)
function resolveDependencies(capId, visited = new Set()) {
  const cap = CAPABILITIES[capId];
  if (!cap) return [];
  if (visited.has(capId)) return []; // cycle guard
  visited.add(capId);

  let deps = [...cap.dependencies];
  for (const dep of cap.dependencies) {
    deps = deps.concat(resolveDependencies(dep, visited));
  }
  return [...new Set(deps)];
}

module.exports = {
  CAPABILITIES,
  getCapability,
  getStandbyCapabilities,
  getCoreCapabilities,
  getAllCapabilityIds,
  getCapabilitiesByDependency,
  resolveDependencies
};
