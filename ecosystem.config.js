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
      env: {
        PURPCLAW_MAX_ACTIVE_AGENTS: env.PURPCLAW_MAX_ACTIVE_AGENTS || '48',
        PURPCLAW_MAX_ACTIVE_PER_DIVISION: env.PURPCLAW_MAX_ACTIVE_PER_DIVISION || '8',
        PURPCLAW_SPAWN_COOLDOWN_MS: env.PURPCLAW_SPAWN_COOLDOWN_MS || '1000'
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
      name: 'purpclaw-nextjs',
      script: './node_modules/next/dist/bin/next',
      // dev mode is correct for a workshop with active edits — production `start`
      // requires `next build` first, and the workshop pace doesn't suit that.
      // If you ever ship: run `next build` then change this to 'start -p 3000'.
      args: 'dev -p 3000',
      cwd: './',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 15000,
      max_restarts: 2,
      restart_delay: 15000,
      max_memory: '256MB',
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
        PURPCLAW_WORKFLOW_RETRIES: env.PURPCLAW_WORKFLOW_RETRIES || '1'
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
      script: './companion-chorus/bridge.js',
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
    // ── Python services ────────────────────────────────────────────────────────
    {
      name: 'purpclaw-stt',
      script: './voice_stt.py',
      args: '--port 7896',
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
    {
      name: 'purpclaw-memory',
      script: './memory_matrix_v2.py',
      args: '--port 7880',
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
      name: 'purpclaw-bridge-ns',
      script: './neuro_symbolic_bridge.py',
      args: '--port 7884',
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
      name: 'purpclaw-modal',
      script: './modal_logic_engine.py',
      args: '--port 7785',
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
      name: 'purpclaw-diagnostics',
      script: './autonomous_diagnostics.py',
      args: '--port 7786',
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
      name: 'purpclaw-rules',
      script: './symbolic_rules_engine.py',
      args: '--port 7787',
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
      name: 'purpclaw-autodream',
      script: './autoDream.py',
      args: '--server',
      interpreter: PYTHON_BIN,
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 2,
      restart_delay: 30000,
      max_memory: '64MB',
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
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '128MB',
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
      max_restarts: 2,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    }
  ]
};
