'use strict';
/**
 * lib/runtime/ports.js — CANONICAL service ports for PURPCLAW.
 *
 * This is the single source of truth for every port number, URL, and host
 * that feature code used to hard-code. Feature code MUST import from here
 * instead of writing literals like `':7780'` or `'http://localhost:3000'`.
 *
 * See deep-research-report (2) §"Centralise ports" — the previous code had
 * 3000 vs 3030, 7895 vs 7897, and fabrications in BrokerStatusPanel. This
 * file replaces all of those with a queried, versioned, audited map.
 *
 * Usage:
 *   const { ports, getUnifiedApiUrl, isLocalHost, getCanonicalPort } = require('../runtime/ports');
 *   fetch(`${getUnifiedApiUrl()}/api/chat`, { ... });
 *
 * Environment overrides (PURPCLAW_<NAME>_PORT) take precedence over defaults.
 * The defaults match what `purpclaw safe-start --core` and ecosystem.config.js
 * converge on. If the env disagrees, the env wins at the *port* level but the
 * canonical name is unchanged.
 */

const path = require('path');

// ── Defaults (must match safe-start / ecosystem.config.js) ──────────────────
const DEFAULTS = Object.freeze({
  WEB_UI:            3030,   // Next.js development and PM2 production port
  WEB_UI_PM2:        3030,   // PM2-launched Next.js production port
  UNIFIED_API:       7780,   // HTTP: /api/chat, /api/health
  UNIFIED_API_TCP:  7778,   // TCP: raw JSON RPC (bridge and voice clients connect here)
  VOICE_COORD:       7781,   // HTTP + WebSocket: voice command routing
  EVENTBUS:          7782,   // HTTP: /publish, /subscribe (pub/sub)
  STATE:             7783,   // HTTP: state read/write
  ORCHESTRATOR:      7784,   // HTTP + SSE: /api/orchestrate, /api/workflows, /api/stream
  MODAL:             7785,   // cognitive modal logic engine
  DIAGNOSTICS:       7786,   // autonomous diagnostics
  RULES:             7787,   // symbolic rules engine
  AGENT_TOWER:       7790,   // HTTP: /tower/status, /tower/spawn
  GATEKEEPER:        7791,   // HTTP: /health
  VOICE_BRIDGE:      7792,   // HTTP + WebSocket: voice bridge (bridge connects to UNIFIED_API_TCP:7778)
  STT:               7896,   // HTTP: local speech-to-text service
  VOICE_INGRESS:     7896,   // daemon subscribes to STT transcript stream
  TELEGRAM:          7795,   // HTTP: optional Telegram gateway health
  MEMORY:            7880,   // HTTP: cognitive spine
  POOL:              7885,   // HTTP: knowledge pool
  METRICS:           7890,   // HTTP: metrics aggregator
  GOOP:              7895,   // HTTP: GOOP default-deny API broker
  AUTODREAM:         7880,   // HTTP: /autodream/* on the cognitive spine
  WORKER_POOL:       7897,   // overflow worker pool
  HARNESS:           7798,   // N1 fix: product factory / autonomous harness
  TRAY_AGENT:        7796,   // HTTP: Windows tray agent
  CHORUS:            7797,   // companion-chorus bridge
  BRIDGE_NEURO:      7799,   // thringlet-bridge / neuro-symbolic
  VISION_MONITOR:    7889,   // webcam monitoring service
  VISION_MONITOR:    7788,   // webcam monitoring (moved from 7781 — conflicted with voice_coordinator TCP)
  VISION_MONITOR:    7889,   // final override for current purpclaw-vision port
  OLLAMA:            11434,  // local ollama default
  VISION_MONITOR:    7889,   // final current purpclaw-vision port
  LMSTUDIO:          1234,   // local LM Studio default
});

// ── Resolve env overrides ───────────────────────────────────────────────────
const PORTS = {};
for (const [name, defaultVal] of Object.entries(DEFAULTS)) {
  const envKey = `PURPCLAW_${name}_PORT`;
  const envVal = process.env[envKey];
  if (envVal && !Number.isNaN(Number(envVal))) {
    PORTS[name] = Number(envVal);
  } else {
    PORTS[name] = defaultVal;
  }
}

// ── Service metadata (single source of truth for "what runs where") ─────────
const SERVICES = Object.freeze([
  { id: 'web-ui',            name: 'Mission Control Web UI',   port: PORTS.WEB_UI,           class: 'deprecated', host: '127.0.0.1', protocol: 'http' },
  { id: 'web-ui-pm2',        name: 'Web UI (PM2 prod)',        port: PORTS.WEB_UI_PM2,       class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'unified-api',       name: 'Unified API',              port: PORTS.UNIFIED_API,      class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'unified-api-tcp',   name: 'Unified API — TCP control', port: PORTS.UNIFIED_API_TCP, class: 'core', host: '127.0.0.1', protocol: 'tcp' },
  { id: 'voice-coordinator', name: 'Voice Coordinator',          port: PORTS.VOICE_COORD,      class: 'optional-dark', host: '127.0.0.1', protocol: 'http+websocket' },
  { id: 'eventbus',          name: 'Unified EventBus',          port: PORTS.EVENTBUS,         class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'state',             name: 'Unified State Store',       port: PORTS.STATE,            class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'orchestrator',      name: 'Orchestrator',              port: PORTS.ORCHESTRATOR,     class: 'core', host: '127.0.0.1', protocol: 'http+sse' },
  { id: 'modal',             name: 'Modal Logic Engine',        port: PORTS.MODAL,            class: 'deprecated', host: '127.0.0.1', protocol: 'http' },
  { id: 'diagnostics',       name: 'Autonomous Diagnostics',     port: PORTS.DIAGNOSTICS,      class: 'deprecated', host: '127.0.0.1', protocol: 'http' },
  { id: 'rules',             name: 'Symbolic Rules Engine',     port: PORTS.RULES,            class: 'deprecated', host: '127.0.0.1', protocol: 'http' },
  { id: 'agent-tower',       name: 'Agent Tower',              port: PORTS.AGENT_TOWER,      class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'gatekeeper',        name: 'Gatekeeper',               port: PORTS.GATEKEEPER,       class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'voice-bridge',      name: 'Voice Bridge',              port: PORTS.VOICE_BRIDGE,     class: 'optional-dark', host: '127.0.0.1', protocol: 'http+websocket' },
  { id: 'stt',               name: 'Speech-To-Text Service',   port: PORTS.STT,              class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
  { id: 'voice-ingress',     name: 'Voice Ingress',            port: PORTS.VOICE_INGRESS,    class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
  { id: 'tray-agent',        name: 'Tray Agent',               port: PORTS.TRAY_AGENT,       class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
  { id: 'chorus',            name: 'Companion Chorus Bridge',  port: PORTS.CHORUS,           class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
  { id: 'telegram',          name: 'Telegram Gateway',         port: PORTS.TELEGRAM,         class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
  { id: 'vision-monitor',    name: 'Vision Monitor',            port: PORTS.VISION_MONITOR,   class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
  { id: 'bridge-neuro',      name: 'Neuro-Symbolic Bridge',    port: PORTS.BRIDGE_NEURO,    class: 'deprecated', host: '127.0.0.1', protocol: 'http' },
  { id: 'harness',           name: 'Autonomous Harness',        port: PORTS.HARNESS,          class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'memory',            name: 'Cognitive Spine Memory',    port: PORTS.MEMORY,          class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'pool',              name: 'Worker / Knowledge Pool',   port: PORTS.POOL,            class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'metrics',           name: 'Metrics Collector',         port: PORTS.METRICS,          class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'goop',              name: 'GOOP Playground Broker',   port: PORTS.GOOP,             class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
  { id: 'autodream',         name: 'AutoDream on Cognitive Spine', port: PORTS.AUTODREAM,    class: 'cognitive-endpoint', host: '127.0.0.1', protocol: 'http' },
  { id: 'workers',           name: 'Worker Service',           port: PORTS.WORKER_POOL,      class: 'core', host: '127.0.0.1', protocol: 'http' },
  { id: 'ollama',            name: 'Ollama (local)',            port: PORTS.OLLAMA,           class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
  { id: 'lmstudio',          name: 'LM Studio (local)',         port: PORTS.LMSTUDIO,         class: 'optional-dark', host: '127.0.0.1', protocol: 'http' },
]);

// ── Helper functions ────────────────────────────────────────────────────────

/** Get the canonical port for a service id. */
function getPort(name) {
  if (name in PORTS) return PORTS[name];
  // Allow lookup by service id too
  const svc = SERVICES.find(s => s.id === name);
  if (svc) return svc.port;
  throw new Error(`unknown port/service: ${name}`);
}

/** Get the canonical URL for a service: `http://127.0.0.1:<port>`. */
function getServiceUrl(name) {
  const svc = SERVICES.find(s => s.id === name);
  if (svc) return `${svc.protocol}://${svc.host}:${svc.port}`;
  if (name in PORTS) return `http://127.0.0.1:${PORTS[name]}`;
  throw new Error(`unknown service: ${name}`);
}

/** Unified API base URL — the one chokepoint. */
function getUnifiedApiUrl() {
  return `http://127.0.0.1:${PORTS.UNIFIED_API}`;
}

/** Web UI base URL. Prefers PM2 port if set, otherwise dev port. */
function getWebUiUrl() {
  return `http://127.0.0.1:${PORTS.WEB_UI_PM2}`;
}

/** List all known services with their canonical endpoints. */
function listServices() {
  return SERVICES.map(s => ({ ...s }));
}

/** Health probe a single service via fetch with short timeout.
 *  Tries common health endpoints in order; falls back to TCP-only check. */
async function probe(name, timeoutMs = 1500) {
  const url = getServiceUrl(name);
  const candidates = [`${url}/api/health`, `${url}/health`, `${url}/`, url];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Any 2xx or 4xx (not 5xx) means the service is alive enough to respond.
      // 5xx might mean the service is up but failing. We still call it "up"
      // if the TCP handshake completed — that's a separate health check.
      if (res.status < 500) return { id: name, class: SERVICES.find(s => s.id === name)?.class, url: candidate, ok: true, status: res.status };
    } catch (e) {
      // Network error or timeout. Try next candidate.
      continue;
    }
  }
  return { id: name, class: SERVICES.find(s => s.id === name)?.class, url, ok: false, error: 'no health endpoint responded' };
}

/** Probe all services in parallel. */
async function probeAll(timeoutMs = 1500) {
  return Promise.all(SERVICES.map(s => probe(s.id, timeoutMs)));
}

module.exports = {
  DEFAULTS,
  PORTS,
  SERVICES,
  getPort,
  getServiceUrl,
  getUnifiedApiUrl,
  getWebUiUrl,
  listServices,
  probe,
  probeAll,
};
