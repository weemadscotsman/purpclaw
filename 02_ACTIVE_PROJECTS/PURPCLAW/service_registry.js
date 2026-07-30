'use strict';

const SERVICES = [
  { key: 'eventbus', name: 'EventBus', pm2: 'purpclaw-eventbus', group: 'core', port: 7782, healthPort: 7782, healthPath: '/health', required: true },
  { key: 'state', name: 'State Store', pm2: 'purpclaw-state', group: 'core', port: 7783, healthPort: 7783, healthPath: '/health', required: true },
  { key: 'api', name: 'Unified API', pm2: 'purpclaw-api', group: 'core', port: 7780, healthPort: 7780, healthPath: '/api/health', required: true },
  // healthPath was '/tower/status', which 404s on both 7790 and via the API on
  // 7780 — the handler at agent_tower.js:852 is unreachable behind an earlier
  // branch. Any monitor reading this registry therefore reported a healthy
  // tower as DOWN. '/api/health' is what the process actually serves (verified
  // 200 while the log shows "Agent Tower listening on port 7790", 35 agents).
  // statusPath left alone: fix the route or repoint it separately.
  { key: 'tower', name: 'Agent Tower', pm2: 'purpclaw-tower', group: 'core', port: 7790, healthPort: 7790, healthPath: '/api/health', statusPath: '/tower/status', required: true },
  { key: 'orchestrator', name: 'Orchestrator', pm2: 'purpclaw-orchestrator', group: 'core', port: 7784, healthPort: 7784, healthPath: '/api/health', required: true },
  { key: 'gatekeeper', name: 'Gatekeeper', pm2: 'purpclaw-gatekeeper', group: 'core', port: 7791, healthPort: 7791, healthPath: '/health', required: true },
  { key: 'metrics', name: 'Metrics Aggregator', pm2: 'purpclaw-metrics', group: 'core', port: 7890, healthPort: 7890, healthPath: '/health', required: true },
  { key: 'pool', name: 'Knowledge Pool', pm2: 'purpclaw-pool', group: 'core', port: 7885, healthPort: 7885, healthPath: '/health', required: true },
  { key: 'workers', name: 'Worker Service', pm2: 'purpclaw-workers', group: 'core', port: 7897, healthPort: 7897, healthPath: '/health', required: true, note: 'overflow worker lane for remote/local agent task dispatch' },
  { key: 'context-bus', name: 'Context Bus', pm2: 'purpclaw-context', group: 'core', port: 7881, healthPort: 7881, healthPath: '/health', required: true },
  { key: 'nextjs', name: 'Mission Control UI', pm2: 'purpclaw-nextjs', group: 'core', port: 3030, healthPort: 3030, healthPath: '/', required: true },

  { key: 'coordinator', name: 'Swarm Coordinator', pm2: 'purpclaw-coordinator', group: 'core', port: 7898, healthPort: 7898, healthPath: '/health', required: false, note: 'mission pipeline: decompose → tower dispatch → validate → synthesize' },

  { key: 'goop', name: 'GOOP Playground Broker', pm2: 'purpclaw-goop', group: 'goop', port: 7895, healthPort: 7895, healthPath: '/health', required: false, note: 'default-deny API broker behind the GOOP / Bridge surface' },

  { key: 'voice-coordinator', name: 'Voice Coordinator', pm2: 'purpclaw-voice', group: 'voice', port: 7781, healthPort: 8781, healthPath: '/health', required: false, note: 'optional; requires voice/Kokoro configuration' },
  { key: 'voice-bridge', name: 'Voice Bridge', pm2: 'purpclaw-bridge', group: 'voice', port: 7792, healthPort: 7792, healthPath: '/health', required: false, note: 'optional voice WebSocket bridge (health served on the same port)' },
  { key: 'stt', name: 'Speech-To-Text Service', pm2: 'purpclaw-stt', group: 'voice', port: 7896, healthPort: 7896, healthPath: '/health', required: false, note: 'optional local faster-whisper STT HTTP service' },
  { key: 'voice-ingress', name: 'Voice Ingress', pm2: 'purpclaw-voice-ingress', group: 'voice', port: null, healthPort: null, healthPath: null, required: false, note: 'STT transcript → orchestrator dispatch daemon (voice-first full-auto)' },
  { key: 'chorus', name: 'Companion Chorus', pm2: 'purpclaw-chorus', group: 'companions', port: null, healthPort: null, healthPath: null, required: false, note: 'optional companion reaction bridge' },
  { key: 'telegram', name: 'Telegram Gateway', pm2: 'purpclaw-telegram', group: 'companions', port: 7795, healthPort: 7795, healthPath: '/health', required: false, note: 'optional Telegram adapter; health is available even when token is not configured' },

  { key: 'vision', name: 'Vision Monitor', pm2: 'purpclaw-vision', group: 'vision', port: 7889, healthPort: 7889, healthPath: '/health', required: false, note: 'optional; camera/screen dependencies. Moved from 7881 to avoid clash with context-bus.' },
  { key: 'yolo', name: 'YOLO Service', pm2: 'purpclaw-yolo', group: 'vision', port: 7779, healthPort: 7779, healthPath: '/health', required: false, note: 'optional; model/Python dependencies' },

  { key: 'cognitive', name: 'Cognitive Spine', pm2: 'purpclaw-cognitive', group: 'cognitive', port: 7880, healthPort: 7880, healthPath: '/cognitive/health', required: false, note: 'single process: memory+rules+modal+neuro+diagnostics+autodream' },
  { key: 'avatar', name: 'Avatar Bridge', pm2: 'purpclaw-avatar', group: 'optional', port: 7777, healthPort: 7777, healthPath: '/health', required: false },

  { key: 'reasoning', name: 'Reasoning Loop', pm2: 'purpclaw-reasoning', group: 'optional', port: 7892, healthPort: 7892, healthPath: '/health', required: false, note: 'proactive heartbeat tick; opt-in via PURPCLAW_PROACTIVE=1' },

  { key: 'harness', name: 'Harness Service', pm2: 'purpclaw-harness', group: 'optional', port: 7798, healthPort: 7798, healthPath: '/health', required: false, note: 'productivity harness executor' },
  { key: 'thringlet', name: 'Thringlet Bridge', pm2: 'purpclaw-thringlet', group: 'optional', port: 7799, healthPort: 7799, healthPath: '/health', required: false, note: 'runtime→emotion translator' },

  // ── Observability ──────────────────────────────────────────────────────────
  { key: 'drift-watcher', name: 'Drift Watcher', pm2: 'purpclaw-drift-watcher', group: 'optional', port: null, healthPort: null, healthPath: null, required: false, note: 'auto-monitors registry/capability/doc drift, regenerates mechanical surfaces, flags the rest' },
];

const CORE_PM2_NAMES = SERVICES.filter(service => service.group === 'core').map(service => service.pm2);
const OPTIONAL_PM2_NAMES = SERVICES.filter(service => service.group !== 'core').map(service => service.pm2);

const LAUNCH_PROFILES = {
  minimal: [
    'purpclaw-eventbus',
    'purpclaw-state',
    'purpclaw-api',
    'purpclaw-tower',
    'purpclaw-orchestrator',
    'purpclaw-nextjs',
  ],
  harness: CORE_PM2_NAMES,
  voice: [
    'purpclaw-eventbus',
    'purpclaw-state',
    'purpclaw-api',
    'purpclaw-tower',
    'purpclaw-orchestrator',
    'purpclaw-nextjs',
    'purpclaw-voice',
    'purpclaw-bridge',
    'purpclaw-stt',
    'purpclaw-voice-ingress',
  ],
  vision: [
    'purpclaw-eventbus',
    'purpclaw-state',
    'purpclaw-api',
    'purpclaw-tower',
    'purpclaw-orchestrator',
    'purpclaw-nextjs',
    'purpclaw-yolo',
    'purpclaw-vision',
  ],
  cognitive: [
    'purpclaw-eventbus',
    'purpclaw-state',
    'purpclaw-api',
    'purpclaw-tower',
    'purpclaw-orchestrator',
    'purpclaw-nextjs',
    'purpclaw-cognitive',
  ],
  goop: [
    'purpclaw-goop',
  ],
};
LAUNCH_PROFILES.all = SERVICES.map(service => service.pm2);

function getServices(options = {}) {
  const includeUi = options.includeUi !== false;
  return SERVICES.filter(service => includeUi || service.key !== 'nextjs');
}

function getServicesByGroup(group) {
  return SERVICES.filter(service => service.group === group);
}

function getService(key) {
  return SERVICES.find(service => service.key === key || service.pm2 === key);
}

function getLaunchProfile(profile = 'harness') {
  return LAUNCH_PROFILES[profile] || [];
}

module.exports = {
  SERVICES,
  CORE_PM2_NAMES,
  OPTIONAL_PM2_NAMES,
  LAUNCH_PROFILES,
  getServices,
  getServicesByGroup,
  getService,
  getLaunchProfile
};
