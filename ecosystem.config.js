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

const XIAOZHI_MCP_URL = env.XIAOZHI_MCP_URL || 'wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg4MzkwOCwiYWdlbnRJZCI6MTY1NzQ1NiwiZW5kcG9pbnRJZCI6ImFnZW50XzE2NTc0NTYiLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc2MDEwODc0LCJleHAiOjE4MDc1Njg0NzR9.uf8jrgq6LuNSoVk-tm7i_h8iD9Fs2H46X9TKU6FfEqKLhG1tAYd_kmu1f3sDNebTQuoBgiGgfqv2IPBBXrTAzQ';
const KIMI_API_KEY = env.KIMI_API_KEY || '';

module.exports = {
  apps: [
    {
      name: 'purpclaw-eventbus',
      script: './unified_eventbus.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      autorestart: true
    },
    {
      name: 'purpclaw-state',
      script: './unified_state.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      autorestart: true
    },
    {
      name: 'purpclaw-api',
      script: './unified_api.js',
      env: {
        XIAOZHI_MCP_URL: XIAOZHI_MCP_URL,
        XIAOZHI_WS_URL: XIAOZHI_MCP_URL,
        KIMI_API_KEY: KIMI_API_KEY
      },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 10000,
      max_restarts: 10,
      autorestart: true
    },
    {
      name: 'purpclaw-tower',
      script: './agent_tower.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      autorestart: true
    },
    {
      name: 'purpclaw-voice',
      script: './voice_coordinator.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      autorestart: true
    },
    {
      name: 'purpclaw-bridge',
      script: './voice_bridge_7779.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      autorestart: true
    },
    {
      name: 'purpclaw-nextjs',
      script: './node_modules/next/dist/bin/next',
      args: 'dev -p 3000',
      cwd: './',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 15000,
      max_restarts: 5,
      autorestart: true
    },
    {
      name: 'purpclaw-gatekeeper',
      script: './gatekeeper.js',
      args: '--server',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      autorestart: true
    },
    {
      name: 'purpclaw-orchestrator',
      script: './orchestrator.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      autorestart: true
    },
    {
      name: 'purpclaw-chorus',
      script: './companion-chorus/bridge.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      autorestart: true
    }
  ]
};
