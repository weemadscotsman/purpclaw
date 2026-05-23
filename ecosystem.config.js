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

const XIAOZHI_MCP_URL = env.XIAOZHI_MCP_URL; // MUST be set in .env - no fallback
const KIMI_API_KEY = env.KIMI_API_KEY || '';
const MINIMAX_API_KEY = env.MINIMAX_API_KEY || '';
const OPENCLAW_TOKEN = env.OPENCLAW_TOKEN; // MUST be set in .env - no fallback
const OPENCLAW_GATEWAY = env.OPENCLAW_GATEWAY || 'ws://127.0.0.1:18789';
const PYTHON_BIN = env.PYTHON_BIN || 'python';

module.exports = {
  apps: [
    // ── Node.js services (wrapped with run_node.js to suppress CMD windows) ──
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
        // Tuned for MiniMax Plus plan: 1-2 concurrent OpenClaw agents, 4500 req / 5h
        PURPCLAW_MAX_ACTIVE_AGENTS: env.PURPCLAW_MAX_ACTIVE_AGENTS || '2',
        PURPCLAW_MAX_ACTIVE_PER_DIVISION: env.PURPCLAW_MAX_ACTIVE_PER_DIVISION || '1',
        PURPCLAW_SPAWN_COOLDOWN_MS: env.PURPCLAW_SPAWN_COOLDOWN_MS || '4000'
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
      args: 'start -p 3000',
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
    // ── Python services (wrapped with run_py.js → pythonw.exe = no console window) ──
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
