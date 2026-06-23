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
const PURPCLAW_GATEWAY_TOKEN = env.PURPCLAW_GATEWAY_TOKEN || '';
const PURPCLAW_GATEWAY_URL = env.PURPCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
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
      max_restarts: 50,
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
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-api',
      script: './unified_api.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        XIAOZHI_MCP_URL: XIAOZHI_MCP_URL,
        XIAOZHI_WS_URL: XIAOZHI_MCP_URL,
        KIMI_API_KEY: KIMI_API_KEY,
        MINIMAX_API_KEY: MINIMAX_API_KEY,
        OPENAI_API_KEY: env.OPENAI_API_KEY || '',
        OPENAI_BASE_URL: env.OPENAI_BASE_URL || '',
        // Main chat brain = MiniMax-M3 via NVIDIA NIM. Without these the API
        // service fell back to llm-provider's default (minimax native /
        // MiniMax-M2.7) and hit api.minimax.io with a bad key → 401/402.
        // Mirrors the tower/orchestrator env blocks.
        LLM_PROVIDER: env.LLM_PROVIDER || 'nvidia',
        LLM_MODEL: env.LLM_MODEL || 'minimaxai/minimax-m3',
        LLM_API_KEY: env.LLM_API_KEY || '',
        NVIDIA_API_KEY: env.NVIDIA_API_KEY || env.LLM_API_KEY || ''
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 10000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '256MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-tower',
      script: './agent_tower.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        // Tower cap raised 48 → 100 to support Kimi K2.6 swarm fanout
        // (Kimi K2.6 natively supports up to 100 parallel agents).
        // Per-division cap raised 8 → 12 to keep one runaway lane from
        // saturating a single division.
        PURPCLAW_MAX_ACTIVE_AGENTS: env.PURPCLAW_MAX_ACTIVE_AGENTS || '100',
        PURPCLAW_MAX_ACTIVE_PER_DIVISION: env.PURPCLAW_MAX_ACTIVE_PER_DIVISION || '12',
        PURPCLAW_SPAWN_COOLDOWN_MS: env.PURPCLAW_SPAWN_COOLDOWN_MS || '1000',
        LLM_PROVIDER: env.LLM_PROVIDER || '',
        LLM_API_KEY: env.LLM_API_KEY || '',
        LLM_MODEL: env.LLM_MODEL || '',
        MINIMAX_API_KEY: MINIMAX_API_KEY,
        KIMI_API_KEY: KIMI_API_KEY,
        GLM_API_KEY: env.GLM_API_KEY || '',
        GLM_MODEL: env.GLM_MODEL || 'glm-4.6',
        // Swarm routing — Kimi K2.6 is the swarm coordinator (100-wide fanout).
        // Falls back to primary LLM_PROVIDER if not set.
        SWARM_PROVIDER: env.SWARM_PROVIDER || 'kimi',
        SWARM_MODEL: env.SWARM_MODEL || 'kimi-k2-6',
        SWARM_API_KEY: env.SWARM_API_KEY || KIMI_API_KEY,
        PURPCLAW_RESERVE_MINIMAX: env.PURPCLAW_RESERVE_MINIMAX || '',
        PURPCLAW_MINIMAX_ALLOWED_SCOPES: env.PURPCLAW_MINIMAX_ALLOWED_SCOPES || ''
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '1G',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-voice',
      script: './voice_coordinator.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '1G',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-bridge',
      script: './voice_bridge_7792.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-goop',
      script: './lib/goop-playground/goop-playground.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        GOOP_PORT: env.GOOP_PORT || '7895',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
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
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-thringlet',
      script: './thringlet_bridge.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-nextjs',
      script: './node_modules/next/dist/bin/next',
      // PROD mode (2026-06-09): dev mode ate 1GB RAM + froze Eddie's box. The
      // megapanel + react-force-graph-3d is too heavy for uncompiled dev. Build
      // first with `next build` (or `npm run build`), then this runs `start`
      // on port 3030. To go back to dev: revert args to 'dev -p 3030 -H 127.0.0.1'
      // and skip the build step.
      // BIND 127.0.0.1 ONLY (2026-06-22): default Next.js binds 0.0.0.0,
      // exposing /mission on 192.168.55.225 to anyone on the LAN. Violates
      // the local-only privacy policy. -H 127.0.0.1 keeps it on loopback.
      args: 'start -p 3030 -H 127.0.0.1',
      env: { NODE_ENV: 'production' },
      cwd: './',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 15000,
      max_restarts: 50,
      restart_delay: 15000,
      // 2026-06-22: was max_memory: '256MB' which made Next.js flap
      // under megapanel + react-force-graph-3d load. Raising to 1G
      // restart threshold keeps it on prod without killing the box.
      max_memory_restart: '1G',
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
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-orchestrator',
      script: './orchestrator.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        PURPCLAW_MAX_QUEUE_DEPTH: env.PURPCLAW_MAX_QUEUE_DEPTH || '20',
        PURPCLAW_MAX_ACTIVE_WORKFLOWS: env.PURPCLAW_MAX_ACTIVE_WORKFLOWS || '3',
        PURPCLAW_WORKFLOW_RETRIES: env.PURPCLAW_WORKFLOW_RETRIES || '1',
        LLM_PROVIDER: env.LLM_PROVIDER || '',
        LLM_API_KEY: env.LLM_API_KEY || '',
        LLM_MODEL: env.LLM_MODEL || '',
        MINIMAX_API_KEY: MINIMAX_API_KEY,
      },
      exec_mode: 'fork',
      wait_ready: false,
      // kill_timeout: give active workflows a chance to finish (Windows Node.js
      // doesn't always honour SIGTERM promptly — 30s avoids zombie port-holders).
      kill_timeout: 30000,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '1G',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-chorus',
      script: './companion-chorus/bridge.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        MINIMAX_API_KEY: MINIMAX_API_KEY,
        XIAOZHI_MCP_URL: XIAOZHI_MCP_URL,
        PURPCLAW_GATEWAY_TOKEN: PURPCLAW_GATEWAY_TOKEN,
        PURPCLAW_GATEWAY_URL: PURPCLAW_GATEWAY_URL
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
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
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '1G',
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
      max_restarts: 50,
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
      max_restarts: 50,
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
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-workers',
      script: './worker_service.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        WORKER_PORT: env.WORKER_PORT || '7897',
        TOWER_PORT: env.TOWER_PORT || '7790',
        WORKER_MAX_CONCURRENT: env.WORKER_MAX_CONCURRENT || '4',
        WORKER_SECRET: env.WORKER_SECRET || '',   // set in .env to enable auth
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-reasoning',
      script: './lib/reasoning-loop.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        PURPCLAW_PROACTIVE: env.PURPCLAW_PROACTIVE || '1',
        PURPCLAW_TICK_MS: env.PURPCLAW_TICK_MS || '30000',
        REASONING_PORT: env.REASONING_PORT || '7892',
        POOL_PORT: env.POOL_PORT || '7885',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 15000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-coordinator',
      script: './swarm_coordinator.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        COORDINATOR_PORT: env.COORDINATOR_PORT || '7898',
        TOWER_PORT: env.TOWER_PORT || '7790',
        // Mission git-worktree sandbox is disabled: it was flaky to create,
        // hung the tower spawn/await, and isolated output away from the live
        // tree. Missions now run live (the proven `ask`/direct-tower path).
        // Re-enable by setting PURPCLAW_MISSION_SANDBOX=1 once the worktree
        // path is repaired. (2026-06-18)
        PURPCLAW_MISSION_SANDBOX: env.PURPCLAW_MISSION_SANDBOX || '0',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 10000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '128MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-voice-ingress',
      script: './voice_ingress.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        STT_PORT: env.STT_PORT || '7896',
        ORCHESTRATOR_PORT: env.ORCHESTRATOR_PORT || '7784',
        EVENTBUS_PORT: env.EVENTBUS_PORT || '7782',
        VOICE_WAKE_WORD: env.VOICE_WAKE_WORD || '',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 15000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
    // ── Python services ────────────────────────────────────────────────────────
    {
      name: 'purpclaw-stt',
      script: './voice_stt.py',
      args: '--port 7896',
      interpreter: PYTHON_BIN,
      env: {
        TMPDIR: "E:\\purp-temp",
        STT_PORT   : env.STT_PORT    || '7896',
        STT_MODEL  : env.STT_MODEL   || 'base',
        STT_DEVICE : env.STT_DEVICE  || 'cpu',
        STT_COMPUTE: env.STT_COMPUTE || 'int8',
        STT_LANGUAGE: env.STT_LANGUAGE || '',
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 15000,
      max_memory: '512MB',   // whisper model can be large
      autorestart: true,
      windowsHide: true
    },
    // ── Cognitive Spine (single process, replaces memory/modal/rules/neuro/diagnostics/autodream) ──
    {
      name: 'purpclaw-cognitive',
      script: './cognitive_spine.py',
      args: '--port 7880',
      interpreter: PYTHON_BIN,
      env: {
        TMPDIR: "E:\\purp-temp",
        // Default 'lite' = pure-numpy lexical embedder (real recall, no heavy deps).
        // Set PURPCLAW_EMBEDDER_BACKEND=st to opt into sentence-transformers.
        PURPCLAW_EMBEDDER_BACKEND: env.PURPCLAW_EMBEDDER_BACKEND || 'lite'
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 10000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory_restart: '1G',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-yolo',
      script: './yolo_service.py',
      args: '--port 7779',
      interpreter: PYTHON_BIN,
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '1G',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-avatar',
      script: './simple_bridge.py',
      args: '--port 7777',
      interpreter: PYTHON_BIN,
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
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
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '32MB',
      autorestart: true,
      windowsHide: true
    },
  ]
};
