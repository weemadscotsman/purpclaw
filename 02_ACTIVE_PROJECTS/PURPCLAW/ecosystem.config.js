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

const CORE = new Set([
  'purpclaw-api', 'purpclaw-eventbus', 'purpclaw-state', 'purpclaw-orchestrator',
  'purpclaw-tower', 'purpclaw-gatekeeper', 'purpclaw-metrics', 'purpclaw-pool',
  'purpclaw-context', 'purpclaw-workers', 'purpclaw-nextjs', 'purpclaw-cognitive'
]);
const SERVICES = (process.env.PURPCLAW_SERVICES || 'core').split(',').map(s => s.trim());
const ENABLED = SERVICES.includes('all')
  ? null  // null = all enabled
  : SERVICES.includes('core')
    ? CORE  // core set
    : new Set(SERVICES); // explicit list
const isDark = name => ENABLED !== null && !ENABLED.has(name);

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
      max_memory_restart: '256M',
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
      max_memory_restart: '256M',
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
      // kill_timeout 5s→15s (2026-06-23): tower was found crash-looping 116×
      // with EADDRINUSE on :7790 because a prior instance hadn't released the
      // socket before pm2 forked the replacement → zombie port-holder. Same
      // remedy as the orchestrator below: give SIGTERM time to fully reap the
      // old process before the new one tries to bind.
      kill_timeout: 15000,
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
      max_memory_restart: '256M',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-xiaozhi',
      script: './lib/xiaozhi_bridge.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory_restart: '512M',
      autorestart: true,
      windowsHide: true,
      env: {
        XIAOZHI_MCP_URL: XIAOZHI_MCP_URL,
        XIAOZHI_WS_URL: XIAOZHI_MCP_URL,
        PURPCLAW_GATEWAY_URL: 'ws://127.0.0.1:18789',
        KOKORO: 'C:\\Users\\Admin\\.openclaw\\kokoro_send.bat',
        KOKORO_LONG: 'C:\\Users\\Admin\\.openclaw\\kokoro_long_send.bat',
      }
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
      max_memory_restart: '256M',
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
      max_memory_restart: '256M',
      autorestart: true,
      windowsHide: true
    },
    // ADDED 2026-07-12 (audit closure): boots the JSON-RPC + A2A gateway
    // server (lib/agent-gateway-server.js) on port 9119 via the canonical
    // serve command. Without this, /v1/capabilities, /v1/chat/completions,
    // /v1/responses, /v1/runs/*, A2A agent-card and SSE streaming are
    // unreachable — code exists, tests pass, but no live socket.
    // kill_timeout raised 8s → 15s (2026-07-16): EADDRINUSE on :9119 because
    // the previous instance hadn't released the socket before pm2 forked the
    // replacement. Same socket-reap fix as purpclaw-tower above.
    {
      name: 'purpclaw-gateway-server',
      script: './bin/purpclaw.js',
      args: 'serve --host 127.0.0.1 --port 9119',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 15000,
      max_restarts: 10,
      restart_delay: 15000,
      max_memory_restart: '256M',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-static-server',
      script: './static-server.js',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '128M',
      autorestart: true,
      windowsHide: true
    },

  // PURPCLAW Co-Work Mode — always-on desktop overlay HUD
  {
    name: 'purpclaw-cowork',
    script: 'lib/cowork-overlay.js',
    args: 'start',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    env: {
      NODE_ENV: 'production',
      PURP_DIR: 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW',
      // Co-Work alert routing
      COWORK_ALERT_HOST: '127.0.0.1',
      COWORK_ALERT_PORT: '7791',
      COWORK_ALERT_ENABLED: 'true',
      // TTS endpoint for overlay's spoken alerts
      TTS_HOST: '127.0.0.1',
      TTS_PORT: '7799',
      TTS_VOICE: 'af_heart',
    },
  },

  // TTS gateway — Kokoro persistent worker, must stay warm
  {
    name: 'purpclaw-tts-gateway',
    script: 'lib/tts/gateway.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    env: {
      NODE_ENV: 'production',
      PYTHON_BIN: 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe',
      KOKORO_SCRIPT: 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/tts/kokoro_worker.py',
      PORT: '7799',
      TTS_DEFAULT_VOICE: 'af_heart',
      TTS_HOST: '127.0.0.1',
      TTS_PORT: '7799',
    },
  },

    // REMOVED 2026-06-30: thringlet_bridge.js does not exist.
    // Thringlet colony runs as Next.js API route (app/api/thringlets/) via Bridge service.
    {
      name: 'purpclaw-nextjs',
      script: './node_modules/next/dist/bin/next',
      // DEV mode (2026-07-30): production build broken — switched to dev mode
      // until BUILD_ID issue is resolved.
      args: 'dev -p 3030 -H 127.0.0.1',
      env: { NODE_ENV: 'development' },
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
      max_memory_restart: '256M',
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
      script: './apps/companion-chorus/bridge.js',
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
      max_memory_restart: '256M',
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
      max_memory_restart: '256M',
      autorestart: true,
      windowsHide: true
    },
    {
      // Drift watcher daemon — monitors registry/version/capability/doc drift,
      // auto-fixes the mechanically-regenerable surfaces (registry, build stamps),
      // flags the rest for review. Runs a scan every 5 minutes.
      name: 'purpclaw-drift-watcher',
      script: './lib/drift-watcher.js',
      args: '--watch --fix --interval=300',
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 15000,
      max_memory_restart: '128M',
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
      max_memory_restart: '256M',
      autorestart: true,
      env: {
        PURPCLAW_POOL_PERSIST: '1',  // set to '0' for fully in-memory mode
      },
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
      max_memory_restart: '256M',
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
      max_memory_restart: '256M',
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
      max_memory_restart: '256M',
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
      max_memory_restart: '256M',
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
      script: './cognitive_gateway.js',
      env: {
        TMPDIR: "E:\\purp-temp",
        PYTHON_BIN: PYTHON_BIN,
        COGNITIVE_PUBLIC_PORT: env.COGNITIVE_PUBLIC_PORT || '7880',
        COGNITIVE_BACKEND_PORT: env.COGNITIVE_BACKEND_PORT || '7888',
        // mem_guard watchdog inside cognitive_gateway.js kills python child at this RSS cap.
        // 8051-atom archive needs ~1600MB; set 3000MB to let it warm up cleanly.
        COGNITIVE_CHILD_MEM_LIMIT_MB: env.COGNITIVE_CHILD_MEM_LIMIT_MB || '8000',
        COGNITIVE_MEM_LIMIT_MB: env.COGNITIVE_MEM_LIMIT_MB || '12000',
        // Default 'lite' = pure-numpy lexical embedder (real recall, no heavy deps).
        // Set PURPCLAW_EMBEDDER_BACKEND=st to opt into sentence-transformers.
        PURPCLAW_EMBEDDER_BACKEND: env.PURPCLAW_EMBEDDER_BACKEND || 'lite'
      },
      exec_mode: 'fork',
      wait_ready: false,
      // kill_timeout 10s→15s (2026-06-23): cognitive was found crash-looping
      // 697× with WinError 10048 on :7880 — a lingering instance held the
      // socket on rebind. Python on Windows is slow to release sockets after
      // SIGTERM; 15s lets the old process fully exit before the rebind.
      kill_timeout: 15000,
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
      max_memory_restart: '256M',
      autorestart: true,
      windowsHide: true
    },
    // ── Chat Gateways (no-op if env vars not set) ──
    {
      name: 'purpclaw-telegram',
      script: './lib/gateways/telegram.js',
      env: { PORT: '7795' },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '32MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-discord',
      script: './lib/gateways/discord.js',
      env: { PORT: '7796' },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '32MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-slack',
      script: './lib/gateways/slack.js',
      env: { PORT: '7797' },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '32MB',
      autorestart: true,
      windowsHide: true
    },
    {
      name: 'purpclaw-email',
      script: './lib/gateways/email.js',
      env: { PORT: '7798' },
      exec_mode: 'fork',
      wait_ready: false,
      kill_timeout: 5000,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory: '64MB',
      autorestart: true,
      windowsHide: true
    },
  ].filter(a => !isDark(a.name))
};
