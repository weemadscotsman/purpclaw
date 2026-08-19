// ═══════════════════════════════════════════════════════════════════════════
// PURPCLAW PM2 ECOSYSTEM
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠  WINDOWS SAFETY NOTE
// ─────────────────────
// Starting multiple services at once on Windows can trigger a cmd-window
// spawn cascade when any service crash-loops on launch — npx, cmd.exe, and
// the Python interpreter wrapper each can flash a window that doesn't
// respect `windowsHide: true` cleanly under crash conditions.
//
// On 2026-05-25 a 4-service simultaneous start caused exactly this and took
// out the operator's desktop. The fix:
//
//   USE `purpclaw safe-start` INSTEAD OF `pm2 start ecosystem.config.js`
//
// safe-start launches ONE service at a time, watches the restart count for
// a stabilisation window, aborts the batch if any service crashes, and
// refuses to start any service with >3 historical restarts.
//
// The defined-but-dark cluster (vision, voice, bridge, chorus, autodream,
// reasoning, stt, yolo, avatar) is the most failure-prone — always wake it
// with `purpclaw safe-start --dark`.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { PORTS } = require('./lib/runtime/ports'); // canonical port source — never hard-code below

const envFile = path.join(__dirname, '.env');
const env = {};
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const XIAOZHI_MCP_URL = env.XIAOZHI_MCP_URL;
const KIMI_API_KEY = env.KIMI_API_KEY || '';
const MINIMAX_API_KEY = env.MINIMAX_API_KEY || '';
const OPENCLAW_TOKEN = env.OPENCLAW_TOKEN;
const OPENCLAW_GATEWAY = env.OPENCLAW_GATEWAY || 'ws://127.0.0.1:18789';
const PYTHON_BIN = 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';

module.exports = {
  apps: [
    // ── Node.js services ──────────────────────────────────────────────────────
    {
      name: 'purpclaw-eventbus',
      script: './unified_eventbus.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-state',
      script: './unified_state.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-api',
      script: './unified_api.js',
      env: {
        XIAOZHI_MCP_URL: XIAOZHI_MCP_URL,
        XIAOZHI_WS_URL: XIAOZHI_MCP_URL,
        KIMI_API_KEY: KIMI_API_KEY,
        MINIMAX_API_KEY: MINIMAX_API_KEY,
        OPENAI_API_KEY: env.OPENAI_API_KEY || '',
        OPENAI_BASE_URL: env.OPENAI_BASE_URL || ''
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 10000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '256MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-tower',
      script: './agent_tower.js',
      cwd: __dirname,
      env: {
        PURPCLAW_MAX_ACTIVE_AGENTS: env.PURPCLAW_MAX_ACTIVE_AGENTS || '48',
        PURPCLAW_MAX_ACTIVE_PER_DIVISION: env.PURPCLAW_MAX_ACTIVE_PER_DIVISION || '8',
        PURPCLAW_SPAWN_COOLDOWN_MS: env.PURPCLAW_SPAWN_COOLDOWN_MS || '1000',
        LLM_PROVIDER: env.LLM_PROVIDER || 'minimax',
        LLM_API_KEY: env.LLM_API_KEY || '',
        LLM_MODEL: env.LLM_MODEL || 'MiniMax-M3',
        MINIMAX_API_KEY: MINIMAX_API_KEY,
        KIMI_API_KEY: KIMI_API_KEY,
        OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || '',
        PURPCLAW_RESERVE_MINIMAX: env.PURPCLAW_RESERVE_MINIMAX || '1',
        PURPCLAW_MINIMAX_ALLOWED_SCOPES: env.PURPCLAW_MINIMAX_ALLOWED_SCOPES || ''
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '128MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-voice',
      script: './voice_coordinator.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '128MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-bridge',
      script: './voice_bridge_7792.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-harness',
      script: './harness_service.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      // A2A Agent Gateway (:9119 from canonical registry) — agent-card,
      // /a2a JSON-RPC, /v1/runs, WS. Restored after the build replacement
      // dropped its entry; server lives in lib/agent-gateway-server.js.
      name: 'purpclaw-a2a',
      script: './agent_gateway_service.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 10000,
      max_restarts: 3,
      restart_delay: 10000,
      max_memory: '256MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-thringlet',
      script: './thringlet_bridge.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-nextjs',
      script: './node_modules/next/dist/bin/next',
      // dev mode is correct for a workshop with active edits — production `start`
      // requires `next build` first, and the workshop pace doesn't suit that.
      // If you ever ship: run `next build` then change 'dev' to 'start'.
      args: `dev -p ${PORTS.WEB_UI}`,
      cwd: './',
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 15000,
      max_restarts: 2,
      restart_delay: 15000,
      max_memory: '512MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-gatekeeper',
      script: './gatekeeper.js',
      args: '--server',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-orchestrator',
      script: './orchestrator.js',
      env: {
        PURPCLAW_MAX_QUEUE_DEPTH: env.PURPCLAW_MAX_QUEUE_DEPTH || '20',
        PURPCLAW_MAX_ACTIVE_WORKFLOWS: env.PURPCLAW_MAX_ACTIVE_WORKFLOWS || '3',
        PURPCLAW_WORKFLOW_RETRIES: env.PURPCLAW_WORKFLOW_RETRIES || '1',
        LLM_PROVIDER: env.LLM_PROVIDER || '',
        LLM_API_KEY: env.LLM_API_KEY || '',
        LLM_MODEL: env.LLM_MODEL || '',
        MINIMAX_API_KEY: MINIMAX_API_KEY,
        OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || ''
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '128MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-chorus',
      script: './apps/companion-chorus/bridge.js',
      env: {
        MINIMAX_API_KEY: MINIMAX_API_KEY,
        XIAOZHI_MCP_URL: XIAOZHI_MCP_URL,
        OPENCLAW_TOKEN: OPENCLAW_TOKEN,
        OPENCLAW_GATEWAY: OPENCLAW_GATEWAY
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-vision',
      script: './vision_monitor.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '128MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-metrics',
      script: './metrics_aggregator.js',
      args: '--port 7890',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-pool',
      script: './pool_service.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-context',
      script: './lib/context-bus.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-workers',
      script: './worker_service.js',
      env: {
        WORKER_PORT: env.WORKER_PORT || '7897',
        TOWER_PORT: env.TOWER_PORT || '7790',
        WORKER_MAX_CONCURRENT: env.WORKER_MAX_CONCURRENT || '4',
        WORKER_SECRET: env.WORKER_SECRET || '',   // set in .env to enable auth
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-reasoning',
      script: './lib/reasoning-loop.js',
      env: {
        PURPCLAW_PROACTIVE: env.PURPCLAW_PROACTIVE || '1',
        PURPCLAW_TICK_MS: env.PURPCLAW_TICK_MS || '30000',
        REASONING_PORT: env.REASONING_PORT || '7892',
        POOL_PORT: env.POOL_PORT || '7885',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 15000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    // ── Swarm coordinator (live /api/coordinate lane) ─────────────────────────
    {
      name: 'purpclaw-coordinator',
      script: './services/swarm/coordinator.js',
      env: {
        COORDINATOR_PORT: env.COORDINATOR_PORT || '7898',
        TOWER_PORT: env.TOWER_PORT || '7790',
        HARNESS_MAX_ATTEMPTS: env.HARNESS_MAX_ATTEMPTS || '2',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '128MB',
      autorestart: true,
      windowsHide: true
    },
    // ── Co-Work Mode (ambient layer: HUD overlay :7791, TTS :7799) ────────────
    {
      name: 'purpclaw-cowork-overlay',
      script: './lib/cowork-overlay.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '128MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-tts-gateway',
      script: './lib/tts/gateway.js',
      env: {
        PORT: '7799',
        KOKORO_SCRIPT: path.join(__dirname, 'lib', 'tts', 'kokoro_worker.py'),
        TTS_DEFAULT_VOICE: env.TTS_DEFAULT_VOICE || 'af_heart',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 15000,   // Kokoro ONNX worker cold init is ~90s; give it room to drain
      max_restarts: 2,
      restart_delay: 15000,
      max_memory: '256MB',
      autorestart: true,
      windowsHide: true
    },
    // ── Python services ────────────────────────────────────────────────────────
    {
      name: 'purpclaw-stt',
      script: './services/voice/stt.py',
      // stt.py reads STT_PORT from env, not argv
      args: '',
      interpreter: PYTHON_BIN,
      env: {
        STT_PORT   : env.STT_PORT    || '7896',
        STT_MODEL  : env.STT_MODEL   || 'base',
        STT_DEVICE : env.STT_DEVICE  || 'cpu',
        STT_COMPUTE: env.STT_COMPUTE || 'int8',
        STT_LANGUAGE: env.STT_LANGUAGE || '',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 15000,
      max_memory: '512MB',   // whisper model can be large
      autorestart: true,
      windowsHide: true
    },
    // ── Cognitive Spine (single process, replaces memory/modal/rules/neuro/diagnostics/autodream) ──
    {
      name: 'purpclaw-cognitive',
      // spine.py uses package-relative imports — run it as a module from the
      // repo root instead of as a bare script.
      script: PYTHON_BIN,
      args: '-m services.cognitive.spine --port 7880',
      cwd: __dirname,
      env: {
        // Force offline mode for the embedder so the HTTP server always
        // binds the port. The local cache may be missing the model, and
        // hitting HF on every restart looped the process to death.
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        PYTHONUNBUFFERED: '1',
        EMBEDDER_FALLBACK_OK: '1',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 10000,
      max_restarts: 10,
      restart_delay: 10000,
      max_memory_restart: '2G',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-yolo',
      script: './services/vision/yolo.py',
      // yolo.py hardcodes PORT 7779; argv is not parsed
      args: '',
      interpreter: PYTHON_BIN,
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '128MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-avatar',
      script: './services/gateway/simple_bridge.py',
      // simple_bridge.py hardcodes PORT 7777; argv is not parsed
      args: '',
      interpreter: PYTHON_BIN,
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    // ── Chat Gateways (no-op if env vars not set) ──
    {
      name: 'purpclaw-telegram',
      script: './lib/gateways/telegram.js',
      env: { TELEGRAM_BOT_TOKEN: '', PORT: '7795' },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '32MB',
      autorestart: true,
      windowsHide: true
    },
  ]
};
