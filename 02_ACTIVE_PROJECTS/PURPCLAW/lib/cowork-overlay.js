'use strict';

/**
 * PURPCLAW Co-Work Overlay
 * ========================
 * A translucent always-on HUD panel that sits on Eddie's desktop while he works.
 * Shows: active agent, current task, screen context summary, memory state,
 * recent decisions, and proactive alerts.
 *
 * Always-on companion — does NOT require focus, survives across sessions.
 *
 * Usage:
 *   node lib/cowork-overlay.js start   — launch the overlay
 *   node lib/cowork-overlay.js stop   — close it
 *   node lib/cowork-overlay.js push   — push a proactive alert
 *   node lib/cowork-overlay.js status — print current state
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

const PURP_DIR = path.resolve(__dirname, '..');
const OVERLAY_PORT = 7791;
const CONTEXT_FILE = path.join(PURP_DIR, 'agent_work', '.screen_context.json');
const STATE_FILE   = path.join(PURP_DIR, '.purpclaw', '.cowork_state.json');

// ── State ───────────────────────────────────────────────────────────────────

let state = {
  activeAgent: 'idle',
  currentTask: '',
  lastScreen: null,
  lastScreenTs: null,
  screenSummary: '',
  memoryUsage: 0,
  proactiveAlerts: [],
  mode: 'watching',
  uptime: Date.now(),
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    }
  } catch {}
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

function pushAlert(msg, type = 'info') {
  state.proactiveAlerts.unshift({ ts: Date.now(), msg, type });
  if (state.proactiveAlerts.length > 50) state.proactiveAlerts.length = 50;
  saveState();
  // Speak critical and action alerts aloud — info is silent unless voice_all enabled
  const voiceAll = (process.env.COWORK_VOICE_ALL === 'true');
  if (type === 'alert' || type === 'action' || voiceAll) {
    speakAlert(msg, type);
  }
}

// ── Voice (Kokoro TTS via gateway) ─────────────────────────────────────────

const TTS_HOST = process.env.TTS_HOST || '127.0.0.1';
const TTS_PORT = process.env.TTS_PORT || '7799';
const TTS_VOICE = process.env.COWORK_VOICE || 'af_heart';
const _ttsCooldown = new Map(); // msg → last-spoken timestamp

function speakAlert(text, type) {
  const key = text.substring(0, 60);
  const now = Date.now();
  const last = _ttsCooldown.get(key) || 0;
  if (now - last < 30_000) return; // debounce: don't repeat same message within 30s
  _ttsCooldown.set(key, now);

  // Voice selection: alert → deeper voice, action → neutral, info → light
  const voiceMap = { alert: 'am_george', action: 'af_bella', info: 'af_heart' };
  const voice = voiceMap[type] || TTS_VOICE;
  const truncated = text.substring(0, 200); // Kokoro handles ~200 chars well

  const body = JSON.stringify({ text: truncated, voice, blocking: false });
  const opts = {
    hostname: TTS_HOST, port: TTS_PORT, path: '/speak', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  const req = require('http').request(opts, (res) => {
    // Drain and ignore response — fire and forget
    res.on('data', () => {});
    res.on('end', () => {});
  });
  req.on('error', () => {}); // TTS failure never breaks alert flow
  req.write(body);
  req.end();
}

// ── Overlay HTML ────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function overlayHTML() {
  const uptime = Math.round((Date.now() - state.uptime) / 60000);
  const modeColors = { watching: '#7c6fa8', thinking: '#c4a55a', acting: '#6fa87c', idle: '#555' };
  const modeColor = modeColors[state.mode] || '#7c6fa8';

  const alerts = state.proactiveAlerts.map(a => {
    const age = Math.round((Date.now() - a.ts) / 1000);
    const icon = a.type === 'alert' ? '!' : a.type === 'action' ? '>' : 'o';
    return `<div class="alert alert-${a.type}">${icon} ${escHtml(a.msg)} <span class="age">${age}s</span></div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: rgba(8, 5, 16, 0.9);
  color: #c8b8e8;
  font-family: 'Segoe UI', Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  overflow: hidden;
  user-select: none;
}
#panel { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 320px; }
#titlebar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
#title { font-size: 12px; font-weight: bold; color: #a890d8; letter-spacing: 0.05em; }
#mode-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: ${modeColor}; box-shadow: 0 0 6px ${modeColor}; margin-left: 8px; margin-right: 4px;
}
#mode-label { font-size: 9px; color: ${modeColor}; text-transform: uppercase; letter-spacing: 0.1em; }
#close-btn { background: none; border: none; color: #5a4a7a; cursor: pointer; font-size: 14px; padding: 0 4px; }
#close-btn:hover { color: #a890d8; }
.segment { display: flex; flex-direction: column; gap: 1px; }
.label { font-size: 9px; color: #6a5a8a; text-transform: uppercase; letter-spacing: 0.08em; }
.value { color: #d4c4f0; font-size: 11px; }
.value.empty { color: #4a3a6a; font-style: italic; }
#agent-name { color: #9b7dd4; font-weight: bold; }
.divider { height: 1px; background: rgba(100, 80, 140, 0.2); margin: 2px 0; }
#alerts { display: flex; flex-direction: column; gap: 2px; }
.alert { padding: 3px 6px; border-radius: 3px; font-size: 10px; }
.alert-info { background: rgba(80, 60, 120, 0.4); color: #a8a0c8; }
.alert-alert { background: rgba(160, 60, 40, 0.5); color: #e8a898; border-left: 2px solid #c05040; }
.alert-action { background: rgba(60, 100, 70, 0.4); color: #a8d8b0; border-left: 2px solid #509060; }
.age { float: right; color: #5a4a7a; font-size: 9px; }

#footer { display: flex; justify-content: space-between; margin-top: 2px; }
#uptime { color: #4a3a6a; font-size: 9px; }
#mem-pct { color: #6a5a8a; font-size: 9px; }
#mem-bar { height: 2px; background: rgba(100,80,140,0.2); border-radius: 2px; overflow: hidden; margin-top: 1px; }
#mem-fill { height: 100%; background: linear-gradient(90deg, #6a4a9a, #a878d8); width: ${Math.min(100, state.memoryUsage || 0)}%; transition: width 1s; }
</style>
</head>
<body>
<div id="panel">
  <div id="titlebar">
    <div><span id="title">PURPCLAW</span><span id="mode-dot"></span><span id="mode-label">${state.mode}</span></div>
    <button id="close-btn" onclick="fetch('/close',{method:'POST'})">x</button>
  </div>

  <div class="segment">
    <span class="label">Agent</span>
    <span class="value" id="agent-name">${escHtml(state.activeAgent || 'idle')}</span>
  </div>

  <div class="segment">
    <span class="label">Task</span>
    <span class="value ${state.currentTask ? '' : 'empty'}" id="task-text">${state.currentTask || 'idle'}</span>
  </div>

  <div class="divider"></div>

  <div class="segment">
    <span class="label">Screen</span>
    <span class="value ${state.screenSummary ? '' : 'empty'}" id="screen-summary">${state.screenSummary || 'no capture'}</span>
  </div>

  <div id="mem-bar"><div id="mem-fill"></div></div>

  <div id="alerts">
    ${alerts || '<div class="alert alert-info">o watching for events...</div>'}
  </div>

  <div class="divider"></div>

  <div id="footer">
    <span id="uptime">up ${uptime}m</span>
    <span id="mem-pct">mem ${Math.round(state.memoryUsage || 0)}%</span>
    <button id="stop-btn" title="Stop TTS playback" style="background:none;border:none;color:#5a4a7a;cursor:pointer;font-size:11px;padding:0 2px;">&#9632;</button>
  </div>
</div>
<script>
const TTS_HOST = ${JSON.stringify(TTS_HOST)};
const TTS_PORT = ${JSON.stringify(TTS_PORT)};
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
async function refresh() {
  try {
    const r = await fetch('/state');
    const s = await r.json();
    document.getElementById('agent-name').textContent = s.activeAgent || 'idle';
    document.getElementById('task-text').textContent = s.currentTask || 'idle';
    document.getElementById('screen-summary').textContent = s.screenSummary || 'no capture';
    document.getElementById('mode-label').textContent = s.mode || 'watching';
    document.getElementById('mode-dot').style.background = { watching:'#7c6fa8', thinking:'#c4a55a', acting:'#6fa87c', idle:'#555' }[s.mode] || '#7c6fa8';
    document.getElementById('mem-fill').style.width = Math.min(100, s.memoryUsage || 0) + '%';
    document.getElementById('mem-pct').textContent = 'mem ' + Math.round(s.memoryUsage || 0) + '%';
    const age = Math.round((Date.now() - s.uptime) / 60000);
    document.getElementById('uptime').textContent = 'up ' + age + 'm';
    const al = (s.proactiveAlerts || []).map(a => {
      const icon = a.type === 'alert' ? '!' : a.type === 'action' ? '>' : 'o';
      const age2 = Math.round((Date.now() - a.ts) / 1000);
      return '<div class="alert alert-' + a.type + '">' + icon + ' ' + esc(a.msg) + ' <span class="age">' + age2 + 's</span></div>';
    }).join('');
    document.getElementById('alerts').innerHTML = al || '<div class="alert alert-info">o watching for events...</div>';
  } catch {}
  setTimeout(refresh, 2500);
}
refresh();
document.getElementById('close-btn').onclick = () => fetch('/close', {method:'POST'});
document.getElementById('stop-btn').onclick = async () => {
  try {
    await fetch('http://' + TTS_HOST + ':' + TTS_PORT + '/stop', {method:'POST'});
  } catch {}
};
</script>
</body>
</html>`;
}

// ── Overlay Window ──────────────────────────────────────────────────────────

let overlayProc = null;

function launchOverlayWindow() {
  if (process.platform !== 'win32') {
    console.log('[cowork] Windows required for overlay window. Use "watch" mode for headless.');
    return;
  }

  const psScript = `
Add-Type -AssemblyName System.Runtime.WindowsForms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = "PURPCLAW"
$form.BackColor = [System.Drawing.Color]::FromArgb(255,8,5,16)
$form.TransparencyKey = [System.Drawing.Color]::FromArgb(255,8,5,16)
$form.FormBorderStyle = 'None'
$form.Size = New-Object System.Drawing.Size(360, 320)
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Right - 380, 60)
$form.TopMost = $true
$form.ShowInTaskbar = $false
$web = New-Object System.Windows.Forms.WebBrowser
$web.Size = $form.ClientSize; $web.Dock = 'Fill'
$web.IsWebBrowserContextMenuEnabled = $false
$web.ScrollBarsEnabled = $false
$web.ScriptErrorsSuppressed = $true
$form.Controls.Add($web)
$form.Add_Shown({ $web.Navigate('http://localhost:${OVERLAY_PORT}/') })
[void][System.Windows.Forms.Application]::Run($form)
`;

  const psPath = path.join(os.tmpdir(), `purpclaw_overlay_${process.pid}.ps1`);
  fs.writeFileSync(psPath, '\ufeff' + psScript, 'utf8');

  try {
    overlayProc = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', psPath], {
      stdio: 'ignore', detached: true, windowsHide: true,
    });
    overlayProc.unref();
    console.log('[cowork] Overlay window launched.');
  } catch (e) {
    console.error('[cowork] Window launch failed:', e.message);
  }
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

function createServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${OVERLAY_PORT}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (u.pathname === '/state' && req.method === 'GET') {
      // Reload from disk so external writers (CLI, other processes) can update state
      loadState();
      // Refresh live fields from context file
      try {
        if (fs.existsSync(CONTEXT_FILE)) {
          const ctx = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
          if (ctx.screens?.[0]) {
            const sc = ctx.screens[0];
            state.screenSummary = sc.description
              ? sc.description.substring(0, 110)
              : (sc.objects?.length ? sc.objects.slice(0, 5).join(', ') : 'capture ok');
            state.lastScreenTs = ctx.ts;
          }
        }
      } catch {}
      const mem = process.memoryUsage();
      state.memoryUsage = Math.round((mem.heapUsed / mem.heapTotal) * 100);
      saveState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }

    if (u.pathname === '/push' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { msg, type } = JSON.parse(body);
          pushAlert(String(msg).substring(0, 200), type || 'info');
        } catch {}
        res.writeHead(200); res.end('ok');
      });
      return;
    }

    // Track active agent + task (POST /track { agent, task, type })
    // type: 'start' → set active agent/task; 'stop' → clear
    if (u.pathname === '/track' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { agent, task, type } = JSON.parse(body);
          if (type === 'stop') {
            state.activeAgent = 'idle';
            state.currentTask = '';
          } else {
            state.activeAgent = String(agent || 'agent').substring(0, 40);
            state.currentTask = String(task || '').substring(0, 120);
          }
          saveState();
        } catch {}
        res.writeHead(200); res.end('ok');
      });
      return;
    }

    if ((u.pathname === '/close' || u.pathname === '/minimize') && req.method === 'POST') {
      res.writeHead(200); res.end('ok');
      if (overlayProc) { try { overlayProc.kill(); } catch {} }
      overlayProc = null;
      if (observerTimer) { clearInterval(observerTimer); observerTimer = null; }
      // Destroy connections first, then exit — avoids calling close() on null
      const srv = _srv;
      _srv = null;
      if (srv) {
        // Abort all active connections so they don't keep process alive
        srv.close(() => setTimeout(() => process.exit(0), 200));
        srv.on('close', () => setTimeout(() => process.exit(0), 200));
        // Safety net
        setTimeout(() => process.exit(0), 1000);
      } else {
        process.exit(0);
      }
      return;
    }

    // Serve overlay HTML
    loadState();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(overlayHTML());
  });
}

// ── Screen Observer ─────────────────────────────────────────────────────────

let observerTimer = null;
let _srv = null;

async function captureScreen() {
  try {
    const look = require('./screen-look');
    const results = await look.look([1], { vision: true, yolo: true });
    if (results?.[0]) {
      const sc = results[0];
      state.screenSummary = sc.description
        ? sc.description.substring(0, 110)
        : (sc.objects?.length ? sc.objects.slice(0, 5).join(', ') : 'capture ok');
      state.lastScreenTs = new Date().toISOString();
    }
    const mem = process.memoryUsage();
    state.memoryUsage = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    saveState();
  } catch {}
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0] || 'start';

switch (cmd) {
  case 'start': {
    loadState();
    state.uptime = Date.now();
    _srv = createServer();
    _srv.listen(OVERLAY_PORT, '127.0.0.1', () => {
      console.log(`[cowork] Co-Work Mode active at http://localhost:${OVERLAY_PORT}/`);
    });
    // Screen observer every 30s
    captureScreen();
    observerTimer = setInterval(captureScreen, 30 * 1000);

    process.on('SIGINT', () => { clearInterval(observerTimer); _srv && _srv.close(); process.exit(0); });
    process.on('SIGTERM', () => { clearInterval(observerTimer); _srv && _srv.close(); process.exit(0); });

    launchOverlayWindow();
    break;
  }

  case 'stop': {
    try {
      execSync(`powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -like '*PURPCLAW*' } | Stop-Process -Force"`,
        { timeout: 5000, windowsHide: true });
    } catch {}
    console.log('[cowork] Overlay stopped.');
    break;
  }

  case 'push': {
    const raw = args.slice(1);
    const type = raw.includes('--alert') ? 'alert' : raw.includes('--action') ? 'action' : 'info';
    const msg = raw.filter(a => !a.startsWith('--')).join(' ') || 'alert from CLI';
    loadState();
    pushAlert(msg.substring(0, 200), type);
    console.log('[cowork] Alert pushed:', msg.substring(0, 80));
    break;
  }

  case 'status': {
    loadState();
    console.log(JSON.stringify(state, null, 2));
    break;
  }

  case 'watch': {
    // Headless — just screen capture, no window
    loadState();
    console.log('[cowork] Watch mode — capturing screen every 15s');
    captureScreen();
    observerTimer = setInterval(captureScreen, 15 * 1000);
    process.on('SIGINT', () => { clearInterval(observerTimer); process.exit(0); });
    break;
  }

  default:
    console.log('Usage: node cowork-overlay.js [start|stop|push <msg>|status|watch]');
}
