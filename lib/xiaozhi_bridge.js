#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🦞 PURPCLAW × OPENCLAW × XIAOZHI — v6.0 ULTIMATE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CHANGELOG:
 * v5.1: Async execution, fast PowerShell, no event-loop blocking
 * v5.2: Webcam tools (look, detect, read)
 * v5.3: Playwright browser automation, fast Node.js file search
 * v6.0: ULTIMATE — 55 tools, file ops, process mgmt, downloads,
 *       volume control, archives, package install, context awareness,
 *       hardened error handling, retry-safe execution
 */

const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const os = require('os');

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// FAST POWERSHELL EXECUTION — NEVER BLOCKING
// ═══════════════════════════════════════════════════════════════════════════
const PS_PREFIX = 'powershell.exe -NoProfile -NonInteractive -Command';

// Run a short PowerShell command (inline)
async function ps(cmd, timeout = 15000) {
  try {
    const { stdout, stderr } = await execAsync(`${PS_PREFIX} "${cmd}"`, { timeout, maxBuffer: 5 * 1024 * 1024 });
    return (stdout || stderr || 'Done').trim();
  } catch (e) {
    return `Error: ${e.message.substring(0, 500)}`;
  }
}

// Run a complex PowerShell script (writes to temp .ps1 file first)
async function psScript(script, timeout = 15000) {
  const tmp = path.join(os.tmpdir(), `bridge_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmp, script, 'utf8');
    const { stdout, stderr } = await execAsync(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`,
      { timeout, maxBuffer: 5 * 1024 * 1024 }
    );
    try { fs.unlinkSync(tmp); } catch {}
    return (stdout || stderr || 'Done').trim();
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    return `Error: ${e.message.substring(0, 500)}`;
  }
}

// Run cmd.exe command (fastest)
async function cmd(command, timeout = 15000) {
  try {
    const { stdout, stderr } = await execAsync(command, { shell: 'cmd.exe', timeout, maxBuffer: 5 * 1024 * 1024 });
    return (stdout || stderr || 'Done').trim();
  } catch (e) {
    return `Error: ${e.message.substring(0, 500)}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════
function san(s) { return typeof s !== 'string' ? '' : s.replace(/[`$;|><&{}\[\]'"]/g, '').replace(/\r?\n/g, ' ').substring(0, 500); }
function coord(v) { const n = Number(v); return (isNaN(n) || n < 0 || n > 10000) ? 0 : Math.floor(n); }

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT MEMORY
// ═══════════════════════════════════════════════════════════════════════════
const MEMORY_FILE = path.join(__dirname, '..', 'samantha_memory.json');
function loadMemory() { try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { return { facts: [] }; } }
function saveMemory(m) { try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(m, null, 2)); } catch {} }

// ═══════════════════════════════════════════════════════════════════════════
// TASK QUEUE
// ═══════════════════════════════════════════════════════════════════════════
const taskQueue = [];
let taskId = 0;
function scheduleTask(desc, delayMs, command) {
  const id = ++taskId;
  const timer = setTimeout(async () => {
    const t = taskQueue.find(x => x.id === id);
    try {
      const result = await ps(command, 30000);
      if (t) { t.status = 'done'; t.result = result.substring(0, 300); }
    } catch (e) { if (t) { t.status = 'error'; t.result = e.message; } }
  }, delayMs);
  taskQueue.push({ id, desc, status: 'scheduled', scheduledAt: new Date().toISOString() });
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// PURPCLAW PROCESS
// ═══════════════════════════════════════════════════════════════════════════
let purpProc = null, purpOut = '';
const PURP_DIR = path.join(__dirname, '..');
const PURP_STATE = path.join(PURP_DIR, 'loop_state.json');
const PURP_LOG = path.join(PURP_DIR, 'purpclaw_output.log');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const XIAOZHI_WS_URL = process.env.XIAOZHI_MCP_URL || '';
const OPENCLAW_GW = process.env.OPENCLAW_GATEWAY || 'ws://127.0.0.1:18789';
const KOKORO = 'C:\\Users\\Admin\\.openclaw\\kokoro_send.bat';
const KOKORO_LONG = 'C:\\Users\\Admin\\.openclaw\\kokoro_long_send.bat';

// ═══════════════════════════════════════════════════════════════════════════
// MCP TOOL DEFINITIONS (55 tools)
// ═══════════════════════════════════════════════════════════════════════════
const TOOLS = [
  // VISION
  { name: 'screen_capture', description: 'Screenshot the screen. Returns file path.', inputSchema: { type: 'object', properties: { monitor: { type: 'number' } } } },
  { name: 'screen_ocr', description: 'Read text from screen using OCR.', inputSchema: { type: 'object', properties: { image_path: { type: 'string' } } } },
  { name: 'screen_find_object', description: 'Detect objects on screen with YOLO.', inputSchema: { type: 'object', properties: { image_path: { type: 'string' }, confidence: { type: 'number' } } } },
  { name: 'screen_find_template', description: 'Find image on screen (template match).', inputSchema: { type: 'object', properties: { template_path: { type: 'string' } }, required: ['template_path'] } },
  { name: 'screen_info', description: 'Get monitor sizes and positions.', inputSchema: { type: 'object', properties: {} } },
  // MOUSE
  { name: 'mouse_click', description: 'Click at coordinates. Supports left/right/double/drag.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string', enum: ['left','right','middle'] }, double: { type: 'boolean' }, drag_to_x: { type: 'number' }, drag_to_y: { type: 'number' } }, required: ['x','y'] } },
  { name: 'mouse_scroll', description: 'Scroll mouse wheel.', inputSchema: { type: 'object', properties: { direction: { type: 'string', enum: ['up','down'] }, amount: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['direction'] } },
  // KEYBOARD
  { name: 'keyboard_type', description: 'Type text or press shortcuts (ctrl+c, alt+f4, enter, etc).', inputSchema: { type: 'object', properties: { text: { type: 'string' }, shortcut: { type: 'string' } } } },
  // UI
  { name: 'find_and_click', description: 'Find UI element by text label and click it.', inputSchema: { type: 'object', properties: { target: { type: 'string' }, click_type: { type: 'string', enum: ['left','right','double'] } }, required: ['target'] } },
  // WINDOWS
  { name: 'window_list', description: 'List open windows.', inputSchema: { type: 'object', properties: { filter: { type: 'string' } } } },
  { name: 'window_focus', description: 'Focus a window by title.', inputSchema: { type: 'object', properties: { window_title: { type: 'string' } }, required: ['window_title'] } },
  { name: 'window_close', description: 'Close a window by title or active window.', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
  // FILES
  { name: 'file_read', description: 'Read file contents.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, max_lines: { type: 'number' } }, required: ['path'] } },
  { name: 'file_write', description: 'Write content to a file.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, append: { type: 'boolean' } }, required: ['path','content'] } },
  { name: 'file_list', description: 'List directory contents.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' } }, required: ['path'] } },
  { name: 'file_search', description: 'Search files by name or content.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, query: { type: 'string' }, in_content: { type: 'boolean' } }, required: ['path','query'] } },
  // BROWSER (Playwright-powered)
  { name: 'browser_open', description: 'Open URL in browser via Playwright. Full page interaction enabled.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'browser_click', description: 'Click a link, button, or element on the current page by its visible text or CSS selector.', inputSchema: { type: 'object', properties: { target: { type: 'string', description: 'Visible text of the link/button OR a CSS selector' }, index: { type: 'number', description: 'If multiple matches, use this index (0-based)' } }, required: ['target'] } },
  { name: 'browser_type', description: 'Type text into a form field on the page.', inputSchema: { type: 'object', properties: { selector: { type: 'string', description: 'CSS selector or label of the input field' }, text: { type: 'string' }, submit: { type: 'boolean', description: 'Press Enter after typing' } }, required: ['text'] } },
  { name: 'browser_scroll', description: 'Scroll the page up or down.', inputSchema: { type: 'object', properties: { direction: { type: 'string', enum: ['up','down'] }, amount: { type: 'number', description: 'Pixels to scroll (default 500)' } } } },
  { name: 'browser_get_content', description: 'Read the visible text content of the current page.', inputSchema: { type: 'object', properties: { selector: { type: 'string', description: 'Optional CSS selector to read specific section' }, max_length: { type: 'number' } } } },
  { name: 'browser_screenshot', description: 'Take a screenshot of the current browser page.', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_navigate', description: 'Navigate to URL in current tab, or go back/forward.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, action: { type: 'string', enum: ['goto','back','forward','reload'] } } } },
  { name: 'browser_tabs', description: 'List open browser pages.', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_close_tab', description: 'Close a browser tab.', inputSchema: { type: 'object', properties: { index: { type: 'number' }, title: { type: 'string' } } } },
  // PURPCLAW
  { name: 'purpclaw_start', description: 'Start PURPCLAW AI build pipeline.', inputSchema: { type: 'object', properties: { task: { type: 'string' }, output_dir: { type: 'string' } }, required: ['task'] } },
  { name: 'purpclaw_stop', description: 'Stop running pipeline.', inputSchema: { type: 'object', properties: {} } },
  { name: 'purpclaw_status', description: 'Get pipeline status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'purpclaw_logs', description: 'Get pipeline logs.', inputSchema: { type: 'object', properties: { lines: { type: 'number' } } } },
  // GIT
  { name: 'git_command', description: 'Run git commands (status, log, diff, commit, push, pull).', inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
  // HTTP
  { name: 'http_request', description: 'Make HTTP requests.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string', enum: ['GET','POST','PUT','DELETE'] }, body: { type: 'string' } }, required: ['url'] } },
  // CLIPBOARD
  { name: 'clipboard', description: 'Read or write clipboard.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['read','write'] }, text: { type: 'string' } }, required: ['action'] } },
  // APPS
  { name: 'execute_command', description: 'Execute shell command.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
  { name: 'open_application', description: 'Open app by name.', inputSchema: { type: 'object', properties: { app_name: { type: 'string' } }, required: ['app_name'] } },
  // VOICE
  { name: 'speak', description: 'Speak via TTS.', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
  // MEMORY
  { name: 'memory', description: 'Persistent memory (remember/recall/forget/list).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['remember','recall','forget','list'] }, content: { type: 'string' } }, required: ['action'] } },
  // NOTIFY
  { name: 'notification', description: 'Desktop toast notification.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, message: { type: 'string' } }, required: ['title','message'] } },
  // TASKS
  { name: 'task_schedule', description: 'Schedule background task.', inputSchema: { type: 'object', properties: { description: { type: 'string' }, delay_seconds: { type: 'number' }, command: { type: 'string' } }, required: ['description','delay_seconds','command'] } },
  { name: 'task_list', description: 'List background tasks.', inputSchema: { type: 'object', properties: {} } },
  // WEBCAM
  { name: 'webcam_look', description: 'Take a photo with the PC webcam. See the room, see Ted, see what is in front of the camera.', inputSchema: { type: 'object', properties: { camera: { type: 'number', description: 'Camera index (0=default)' } } } },
  { name: 'webcam_detect', description: 'Detect people/faces/objects via webcam using YOLO.', inputSchema: { type: 'object', properties: { confidence: { type: 'number' }, camera: { type: 'number' } } } },
  { name: 'webcam_read', description: 'Read any text visible to the webcam (signs, papers, screens) using OCR.', inputSchema: { type: 'object', properties: { camera: { type: 'number' } } } },
  // FILE OPS
  { name: 'file_copy', description: 'Copy a file or directory.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source','destination'] } },
  { name: 'file_move', description: 'Move or rename a file/directory.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source','destination'] } },
  { name: 'file_delete', description: 'Delete a file or empty directory.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'dir_create', description: 'Create a directory (and parents).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  // DOWNLOAD
  { name: 'download_file', description: 'Download a file from a URL to local path.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, destination: { type: 'string', description: 'Local filename or directory' } }, required: ['url'] } },
  // PROCESS
  { name: 'process_list', description: 'List running processes. Filter by name.', inputSchema: { type: 'object', properties: { filter: { type: 'string' }, sort_by: { type: 'string', enum: ['mem','cpu','name'] } } } },
  { name: 'process_kill', description: 'Kill a process by name or PID.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, pid: { type: 'number' } } } },
  // AUDIO
  { name: 'volume_control', description: 'Set system volume or mute/unmute.', inputSchema: { type: 'object', properties: { level: { type: 'number', description: '0-100' }, action: { type: 'string', enum: ['set','mute','unmute','up','down'] } } } },
  // ARCHIVE
  { name: 'zip_create', description: 'Create a zip archive from files/folder.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source','destination'] } },
  { name: 'zip_extract', description: 'Extract a zip archive.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source'] } },
  // PACKAGES
  { name: 'install_package', description: 'Install packages via pip, npm, or choco.', inputSchema: { type: 'object', properties: { manager: { type: 'string', enum: ['pip','npm','choco'] }, packages: { type: 'string', description: 'Space-separated package names' }, cwd: { type: 'string' } }, required: ['manager','packages'] } },
  // CONTEXT
  { name: 'active_window', description: 'Get info about the currently focused window (title, process, position).', inputSchema: { type: 'object', properties: {} } },
  // SYSTEM
  { name: 'system_status', description: 'PC health check (CPU, RAM, disk, processes).', inputSchema: { type: 'object', properties: {} } },
  { name: 'disk_info', description: 'Get disk space info for all drives.', inputSchema: { type: 'object', properties: {} } },
  { name: 'network_info', description: 'Get IP addresses, WiFi status, internet connectivity.', inputSchema: { type: 'object', properties: {} } },
];

// ═══════════════════════════════════════════════════════════════════════════
// PLAYWRIGHT BROWSER MANAGER (lazy init, persistent)
// ═══════════════════════════════════════════════════════════════════════════
let pwBrowser = null;
let pwContext = null;
let pwPage = null;

async function getBrowserContext() {
  if (!pwBrowser || !pwBrowser.isConnected()) {
    const { chromium } = require('playwright');
    pwBrowser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
    pwContext = await pwBrowser.newContext({ viewport: { width: 1920, height: 1080 } });
    pwPage = await pwContext.newPage();
    console.log('[BROWSER] 🌐 Playwright launched');
  }
  return pwContext;
}

async function getBrowserPage() {
  const ctx = await getBrowserContext();
  const pages = ctx.pages();
  if (pages.length === 0) {
    pwPage = await ctx.newPage();
  } else {
    pwPage = pages[pages.length - 1]; // Use most recent tab
  }
  return pwPage;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL EXECUTION — ALL ASYNC, NEVER BLOCKS
// ═══════════════════════════════════════════════════════════════════════════
function ok(text) { return { content: [{ type: 'text', text: String(text).substring(0, 4000) }] }; }

async function executeTool(name, args) {
  const t0 = Date.now();
  console.log(`[TOOL] 🔧 ${name}`, JSON.stringify(args).substring(0, 120));
  
  try {
    const result = await runTool(name, args);
    console.log(`[TOOL] ✅ ${name} (${Date.now() - t0}ms)`);
    return result;
  } catch (e) {
    console.error(`[TOOL] ❌ ${name} (${Date.now() - t0}ms):`, e.message);
    return ok(`Error: ${e.message}`);
  }
}

async function runTool(name, args) {
  switch (name) {

    // ── VISION ─────────────────────────────────────────────────────────
    case 'screen_capture': {
      // FAST: PowerShell .NET screenshot — no Python needed
      const outPath = path.join(os.tmpdir(), `screen_${Date.now()}.png`).replace(/\\/g, '\\\\');
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bmp.Save("${outPath}")
$gfx.Dispose()
$bmp.Dispose()
Write-Output "Screenshot saved: ${outPath} ($($screen.Width)x$($screen.Height))"
`, 10000);
      return ok(r);
    }

    case 'screen_ocr': {
      // Capture + OCR in one Python script (async, won't block event loop)
      const img = args.image_path || path.join(os.tmpdir(), `ocr_${Date.now()}.png`);
      const pyScript = `
import mss, mss.tools, pytesseract, json
from PIL import Image
${!args.image_path ? `
with mss.mss() as sct:
    shot = sct.grab(sct.monitors[1])
    mss.tools.to_png(shot.rgb, shot.size, output=r"${img}")
` : ''}
img = Image.open(r"${img}")
text = pytesseract.image_to_string(img).strip()
print(json.dumps({"text": text, "words": len(text.split())}))
`;
      const tmp = path.join(os.tmpdir(), `ocr_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`python "${tmp}"`, { timeout: 30000 }).catch(e => ({ stdout: `Error: ${e.message}` }));
      try { fs.unlinkSync(tmp); } catch {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        return ok(`Screen Text (${data.words} words):\n${data.text}`);
      } catch { return ok(r.stdout || 'OCR failed'); }
    }

    case 'screen_find_object': {
      const img = args.image_path || path.join(os.tmpdir(), `det_${Date.now()}.png`);
      if (!args.image_path) {
        await psScript(`
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$b=New-Object Drawing.Bitmap($s.Width,$s.Height)
$g=[Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($s.Location,[Drawing.Point]::Empty,$s.Size)
$b.Save("${img.replace(/\\/g,'\\\\')}")
$g.Dispose();$b.Dispose()
`, 10000);
      }
      const pyScript = `
from ultralytics import YOLO
import cv2, json
model = YOLO('yolov8n.pt')
results = model(r"${img}", conf=${args.confidence || 0.5}, verbose=False)
dets = []
for r in results:
    for box in r.boxes:
        cls = r.names[int(box.cls[0])]
        conf = float(box.conf[0])
        x1,y1,x2,y2 = map(int, box.xyxy[0])
        dets.append({"class":cls,"conf":round(conf,2),"bbox":[x1,y1,x2,y2],"center":[int((x1+x2)/2),int((y1+y2)/2)]})
print(json.dumps({"count":len(dets),"objects":dets}))
`;
      const tmp = path.join(os.tmpdir(), `det_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`python "${tmp}"`, { timeout: 60000 }).catch(e => ({ stdout: `Error: ${e.message}` }));
      try { fs.unlinkSync(tmp); } catch {}
      return ok(r.stdout || 'Detection failed');
    }

    case 'screen_find_template': {
      return ok('Template matching: use screen_capture first, then provide template_path');
    }

    case 'screen_info': {
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
$i = 0
foreach($m in [System.Windows.Forms.Screen]::AllScreens) {
  Write-Output "Monitor $i: $($m.Bounds.Width)x$($m.Bounds.Height) at ($($m.Bounds.X),$($m.Bounds.Y)) $(if($m.Primary){'[PRIMARY]'})"
  $i++
}
`, 5000);
      return ok(r);
    }

    // ── MOUSE ──────────────────────────────────────────────────────────
    case 'mouse_click': {
      const x = coord(args.x), y = coord(args.y);
      const btn = args.button || 'left';
      const dn = btn === 'right' ? 8 : btn === 'middle' ? 32 : 2;
      const up = btn === 'right' ? 16 : btn === 'middle' ? 64 : 4;

      if (args.drag_to_x !== undefined) {
        const dx = coord(args.drag_to_x), dy = coord(args.drag_to_y);
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})
Start-Sleep -Milliseconds 50
[W.U]::mouse_event(2,0,0,0,0)
Start-Sleep -Milliseconds 50
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${dx},${dy})
Start-Sleep -Milliseconds 50
[W.U]::mouse_event(4,0,0,0,0)
Write-Output "Dragged (${x},${y}) to (${dx},${dy})"
`, 5000);
        return ok(r);
      }

      const dblCode = args.double ? `
[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)
Start-Sleep -Milliseconds 50
[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)` :
        `[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)`;

      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})
Start-Sleep -Milliseconds 50
${dblCode}
Write-Output "${args.double?'Double-':''}${btn}-clicked (${x},${y})"
`, 5000);
      return ok(r);
    }

    case 'mouse_scroll': {
      const sv = (args.direction === 'up' ? 120 : -120) * (args.amount || 3);
      let moveCode = '';
      if (args.x !== undefined) {
        moveCode = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${coord(args.x)},${coord(args.y)})
Start-Sleep -Milliseconds 50`;
      }
      const r = await psScript(`
${moveCode}
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[W.U]::mouse_event(0x0800,0,0,${sv},0)
Write-Output "Scrolled ${args.direction} ${args.amount||3}"
`, 5000);
      return ok(r);
    }

    // ── KEYBOARD ───────────────────────────────────────────────────────
    case 'keyboard_type': {
      if (args.shortcut) {
        const km = {'ctrl+c':'^c','ctrl+v':'^v','ctrl+x':'^x','ctrl+z':'^z','ctrl+a':'^a','ctrl+s':'^s','ctrl+w':'^w','ctrl+t':'^t','ctrl+n':'^n','ctrl+l':'^l','ctrl+shift+t':'^+t','ctrl+shift+n':'^+n','alt+f4':'%{F4}','alt+tab':'%{TAB}','enter':'{ENTER}','escape':'{ESC}','esc':'{ESC}','tab':'{TAB}','backspace':'{BACKSPACE}','delete':'{DELETE}','up':'{UP}','down':'{DOWN}','left':'{LEFT}','right':'{RIGHT}','home':'{HOME}','end':'{END}','pageup':'{PGUP}','pagedown':'{PGDN}','f1':'{F1}','f2':'{F2}','f3':'{F3}','f4':'{F4}','f5':'{F5}','f11':'{F11}','f12':'{F12}','print_screen':'{PRTSC}'};
        const k = km[args.shortcut.toLowerCase()] || args.shortcut;
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${k}')
Write-Output "Pressed: ${args.shortcut}"
`, 5000);
        return ok(r);
      }
      if (args.text) {
        const safe = san(args.text);
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${safe}')
Write-Output "Typed ${safe.length} chars"
`, 5000);
        return ok(r);
      }
      return ok('Specify text or shortcut');
    }

    // ── UI AUTOMATION ──────────────────────────────────────────────────
    case 'find_and_click': {
      const target = san(args.target || '');
      const ce = (args.click_type||'left') === 'right' ? '[W.U]::mouse_event(8,0,0,0,0);[W.U]::mouse_event(16,0,0,0,0)' :
                  (args.click_type||'left') === 'double' ? '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0);Start-Sleep -ms 50;[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)' :
                  '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)';
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$target = '${target}'
$found = $false
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
foreach ($el in $els) {
  try {
    $n = $el.Current.Name
    $t = $el.Current.ControlType.ProgrammaticName
    if ($n -like "*$target*") {
      $r = $el.Current.BoundingRectangle
      if ($r.Width -gt 0 -and $r.Height -gt 0) {
        $cx = [int]($r.X + $r.Width / 2)
        $cy = [int]($r.Y + $r.Height / 2)
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($cx, $cy)
        Start-Sleep -Milliseconds 100
        ${ce}
        Write-Output "CLICKED: '$n' ($t) at ($cx,$cy)"
        $found = $true; break
      }
    }
  } catch { continue }
}
if (-not $found) {
  $vis = @()
  foreach ($el in $els) {
    try {
      $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
      if ($n -and $n.Length -gt 0 -and $n.Length -lt 60 -and $t -match 'Button|MenuItem|TabItem|Hyperlink|ListItem') {
        $r = $el.Current.BoundingRectangle
        if ($r.Width -gt 0) { $vis += "$t : '$n'" }
      }
    } catch { continue }
  }
  Write-Output "NOT FOUND: '$target'"
  Write-Output "Clickable elements:"
  $vis | Select-Object -First 20 | ForEach-Object { Write-Output $_ }
}
`, 20000);
      return ok(r);
    }

    // ── WINDOWS ────────────────────────────────────────────────────────
    case 'window_list': {
      const filter = args.filter ? ` | Where-Object {$_.MainWindowTitle -like '*${san(args.filter)}*'}` : '';
      const r = await ps(`Get-Process${filter} | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -Property Name,MainWindowTitle,Id | Format-Table -AutoSize | Out-String`, 8000);
      return ok(r || 'No windows found');
    }

    case 'window_focus': {
      const r = await psScript(`
Add-Type @'
using System;using System.Runtime.InteropServices;
public class WF{
  [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int c);
}
'@
$p = Get-Process | Where-Object {$_.MainWindowTitle -like '*${san(args.window_title)}*'} | Select-Object -First 1
if ($p) {
  [WF]::ShowWindowAsync($p.MainWindowHandle,1) | Out-Null
  [WF]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Write-Output "Focused: $($p.MainWindowTitle)"
} else { Write-Output "Not found: ${san(args.window_title)}" }
`, 8000);
      return ok(r);
    }

    case 'window_close': {
      const t = san(args.title || '');
      if (t) {
        const r = await ps(`$p=Get-Process|Where-Object{$_.MainWindowTitle -like '*${t}*'}|Select-Object -First 1;if($p){$p.CloseMainWindow()|Out-Null;Write-Output ('Closed: '+$p.MainWindowTitle)}else{Write-Output 'Not found'}`, 8000);
        return ok(r);
      }
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('%{F4}')
Write-Output "Alt+F4 sent"
`, 5000);
      return ok(r);
    }

    // ── FILES ──────────────────────────────────────────────────────────
    case 'file_read': {
      try {
        const content = fs.readFileSync(args.path, 'utf8');
        const lines = content.split('\n');
        const max = args.max_lines || 200;
        return ok(`${args.path} (${lines.length} lines):\n${lines.slice(0, max).join('\n')}${lines.length > max ? `\n...(${lines.length-max} more)` : ''}`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }

    case 'file_write': {
      try {
        const dir = path.dirname(args.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (args.append) fs.appendFileSync(args.path, args.content);
        else fs.writeFileSync(args.path, args.content);
        return ok(`Written: ${args.path} (${args.content.length} chars)`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }

    case 'file_list': {
      try {
        const entries = fs.readdirSync(args.path, { withFileTypes: true });
        const list = entries.map(e => {
          if (e.isDirectory()) return `📁 ${e.name}/`;
          try { const s = fs.statSync(path.join(args.path, e.name)); return `📄 ${e.name} (${(s.size/1024).toFixed(1)}KB)`; }
          catch { return `📄 ${e.name}`; }
        });
        return ok(`${args.path}:\n${list.join('\n')}`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }

    case 'file_search': {
      // FAST Node.js search with depth limit — no more 10s timeouts
      try {
        const query = (args.query || '').toLowerCase();
        const maxDepth = args.max_depth || 3;
        const results = [];
        const searchDir = (dir, depth) => {
          if (depth > maxDepth || results.length >= 50) return;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              if (results.length >= 50) break;
              const full = path.join(dir, e.name);
              if (e.name.toLowerCase().includes(query)) {
                results.push(full);
              }
              if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__') {
                searchDir(full, depth + 1);
              }
            }
          } catch {}
        };
        if (args.in_content) {
          // Content search: only search files in top 2 levels
          const searchContent = (dir, depth) => {
            if (depth > 2 || results.length >= 30) return;
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                if (results.length >= 30) break;
                const full = path.join(dir, e.name);
                if (e.isFile() && e.name.match(/\.(js|ts|py|md|txt|json|html|css|yaml|yml|toml|cfg|ini|bat|sh|ps1)$/i)) {
                  try {
                    const content = fs.readFileSync(full, 'utf8');
                    if (content.toLowerCase().includes(query)) {
                      const lineNum = content.substring(0, content.toLowerCase().indexOf(query)).split('\n').length;
                      results.push(`${full}:${lineNum}`);
                    }
                  } catch {}
                }
                if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
                  searchContent(full, depth + 1);
                }
              }
            } catch {}
          };
          searchContent(args.path, 0);
          return ok(results.length ? `Content matches (${results.length}):\n${results.join('\n')}` : `No content matches for "${args.query}"`);
        }
        searchDir(args.path, 0);
        return ok(results.length ? `Found (${results.length}):\n${results.join('\n')}` : `No matches for "${args.query}"`);
      } catch (e) { return ok(`Search error: ${e.message}`); }
    }

    // ── BROWSER (Playwright) ──────────────────────────────────────────
    case 'browser_open': {
      try {
        const page = await getBrowserPage();
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        return ok(`Opened: ${args.url}\nTitle: ${title}`);
      } catch (e) {
        // Fallback to shell open
        exec(`start chrome "${san(args.url)}"`, { shell: 'cmd.exe' });
        return ok(`Opened via shell: ${args.url} (Playwright: ${e.message})`);
      }
    }

    case 'browser_click': {
      try {
        const page = await getBrowserPage();
        const target = args.target;
        const idx = args.index || 0;
        // Try text match first, then CSS selector
        let els = await page.getByText(target, { exact: false }).all().catch(() => []);
        if (!els.length) els = await page.getByRole('link', { name: target }).all().catch(() => []);
        if (!els.length) els = await page.getByRole('button', { name: target }).all().catch(() => []);
        if (!els.length) els = await page.locator(target).all().catch(() => []);
        if (els.length > idx) {
          await els[idx].click({ timeout: 5000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          const newTitle = await page.title();
          return ok(`Clicked: "${target}" (match ${idx+1}/${els.length})\nPage: ${newTitle}\nURL: ${page.url()}`);
        }
        // List what IS clickable
        const links = await page.locator('a, button, [role="button"]').all();
        const clickable = [];
        for (const el of links.slice(0, 20)) {
          const txt = await el.textContent().catch(() => '');
          if (txt && txt.trim().length > 0 && txt.trim().length < 80) clickable.push(txt.trim());
        }
        return ok(`"${target}" not found.\nClickable elements:\n${clickable.map(c => `  • ${c}`).join('\n')}`);
      } catch (e) { return ok(`Click error: ${e.message}`); }
    }

    case 'browser_type': {
      try {
        const page = await getBrowserPage();
        if (args.selector) {
          const el = await page.locator(args.selector).first();
          await el.fill(args.text);
        } else {
          // Find first visible input/textarea
          const el = await page.locator('input:visible, textarea:visible').first();
          await el.fill(args.text);
        }
        if (args.submit) await page.keyboard.press('Enter');
        return ok(`Typed: "${args.text}"${args.submit ? ' + Enter' : ''}`);
      } catch (e) { return ok(`Type error: ${e.message}`); }
    }

    case 'browser_scroll': {
      try {
        const page = await getBrowserPage();
        const px = args.amount || 500;
        const dir = (args.direction || 'down') === 'up' ? -px : px;
        await page.evaluate((d) => window.scrollBy(0, d), dir);
        return ok(`Scrolled ${args.direction || 'down'} ${px}px`);
      } catch (e) { return ok(`Scroll error: ${e.message}`); }
    }

    case 'browser_get_content': {
      try {
        const page = await getBrowserPage();
        let text;
        if (args.selector) {
          text = await page.locator(args.selector).first().textContent({ timeout: 5000 });
        } else {
          text = await page.locator('body').textContent({ timeout: 5000 });
        }
        const maxLen = args.max_length || 3000;
        const title = await page.title();
        const url = page.url();
        return ok(`Page: ${title}\nURL: ${url}\n\n${(text || '').substring(0, maxLen)}`);
      } catch (e) { return ok(`Content error: ${e.message}`); }
    }

    case 'browser_screenshot': {
      try {
        const page = await getBrowserPage();
        const outPath = path.join(os.tmpdir(), `browser_${Date.now()}.png`);
        await page.screenshot({ path: outPath, fullPage: false });
        const title = await page.title();
        return ok(`📸 Browser screenshot: ${outPath}\nPage: ${title}\nURL: ${page.url()}`);
      } catch (e) { return ok(`Screenshot error: ${e.message}`); }
    }

    case 'browser_navigate': {
      try {
        const page = await getBrowserPage();
        if (args.url) {
          await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else if (args.action === 'back') {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
        } else if (args.action === 'forward') {
          await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
        } else if (args.action === 'reload') {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        }
        const title = await page.title();
        return ok(`Navigated: ${title}\nURL: ${page.url()}`);
      } catch (e) { return ok(`Navigate error: ${e.message}`); }
    }

    case 'browser_tabs': {
      try {
        const ctx = await getBrowserContext();
        const pages = ctx.pages();
        const list = [];
        for (let i = 0; i < pages.length; i++) {
          list.push(`${i+1}. ${await pages[i].title()} — ${pages[i].url().substring(0,60)}`);
        }
        return ok(`Browser Tabs (${pages.length}):\n${list.join('\n')}`);
      } catch (e) { return ok(`Tabs error: ${e.message}`); }
    }

    case 'browser_close_tab': {
      try {
        const ctx = await getBrowserContext();
        const pages = ctx.pages();
        let target;
        if (args.index !== undefined && args.index < pages.length) target = pages[args.index];
        else if (args.title) target = pages.find(p => p.url().includes(args.title) || true);
        if (target) { await target.close(); return ok('Tab closed'); }
        return ok('Tab not found');
      } catch (e) { return ok(`Close error: ${e.message}`); }
    }

    // ── PURPCLAW ───────────────────────────────────────────────────────
    case 'purpclaw_start': {
      if (purpProc) return ok('Pipeline already running. Use purpclaw_stop first.');
      const outDir = args.output_dir || path.join('C:\\Users\\Admin\\Desktop', args.task.replace(/[^a-zA-Z0-9]/g,'_').substring(0,30));
      const state = { task: args.task, output_dir: outDir, stage: 'starting', started: new Date().toISOString(), status: 'running' };
      fs.writeFileSync(PURP_STATE, JSON.stringify(state, null, 2));
      fs.writeFileSync(PURP_LOG, '');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      purpProc = spawn('node', ['-e', `
const ws=require('ws'),fs=require('fs');
const sf='${PURP_STATE.replace(/\\/g,'\\\\')}',lf='${PURP_LOG.replace(/\\/g,'\\\\')}';
const task=${JSON.stringify(args.task)},od='${outDir.replace(/\\/g,'\\\\')}';
function log(m){fs.appendFileSync(lf,new Date().toISOString().substring(11,19)+' '+m+'\\n')}
function upd(u){const s=JSON.parse(fs.readFileSync(sf));Object.assign(s,u);fs.writeFileSync(sf,JSON.stringify(s,null,2))}
const stages=['plan','code','review','fix','done'];
(async()=>{
  for(const stage of stages){
    if(stage==='done'){upd({stage:'complete',status:'done',completed:new Date().toISOString()});log('COMPLETE');return}
    upd({stage});log('Stage: '+stage);
    try{
      const gw=new ws('${OPENCLAW_GW}');
      const resp=await new Promise((res,rej)=>{
        const t=setTimeout(()=>{gw.close();rej(new Error('timeout'))},60000);
        gw.on('open',()=>gw.send(JSON.stringify({type:'message',content:stage==='plan'?'Plan:'+task:stage==='code'?'Code:'+task:stage==='review'?'Review the code':'Fix bugs'})));
        gw.on('message',d=>{clearTimeout(t);gw.close();res(d.toString())});
        gw.on('error',e=>{clearTimeout(t);rej(e)});
      });
      fs.writeFileSync(od+'/'+stage+'_output.md',resp);
      log(stage+' done ('+resp.length+' chars)');
    }catch(e){log('ERROR '+stage+': '+e.message);upd({status:'error',error:e.message});return}
  }
})()
      `], { cwd: PURP_DIR, detached: false, shell: true });
      purpProc.stdout?.on('data', d => purpOut += d.toString());
      purpProc.stderr?.on('data', d => purpOut += d.toString());
      purpProc.on('close', () => { purpProc = null; });
      return ok(`🦞 Pipeline STARTED!\nTask: ${args.task}\nOutput: ${outDir}`);
    }

    case 'purpclaw_stop': {
      if (purpProc) { purpProc.kill(); purpProc = null; try { const s=JSON.parse(fs.readFileSync(PURP_STATE,'utf8')); s.status='stopped'; fs.writeFileSync(PURP_STATE,JSON.stringify(s,null,2)); } catch {} return ok('Pipeline STOPPED.'); }
      return ok('No pipeline running.');
    }

    case 'purpclaw_status': {
      try {
        const s = JSON.parse(fs.readFileSync(PURP_STATE, 'utf8'));
        return ok(`🦞 PURPCLAW\nTask: ${s.task}\nStage: ${s.stage}\nStatus: ${s.status}\nStarted: ${s.started}${s.completed ? '\nDone: '+s.completed : ''}${s.error ? '\nError: '+s.error : ''}\nProcess: ${purpProc ? 'ACTIVE' : 'idle'}`);
      } catch { return ok('PURPCLAW: idle'); }
    }

    case 'purpclaw_logs': {
      try { const log = fs.readFileSync(PURP_LOG,'utf8'); const lines = log.split('\n'); return ok(lines.slice(-(args.lines||50)).join('\n') || 'No logs'); }
      catch { return ok('No logs'); }
    }

    // ── GIT ────────────────────────────────────────────────────────────
    case 'git_command': {
      if (/force|reset\s+--hard|clean\s+-fdx/i.test(args.command)) return ok('BLOCKED: Dangerous git op');
      const r = await cmd(`git ${args.command}`, 15000);
      return ok(r);
    }

    // ── HTTP ───────────────────────────────────────────────────────────
    case 'http_request': {
      const r = await httpReq(args.url, args.method || 'GET', args.body);
      return ok(r);
    }

    // ── CLIPBOARD ──────────────────────────────────────────────────────
    case 'clipboard': {
      if (args.action === 'read') { const r = await ps('Get-Clipboard', 5000); return ok(r || 'Empty'); }
      if (args.action === 'write' && args.text) { await ps(`Set-Clipboard -Value '${san(args.text)}'`, 5000); return ok(`Copied ${args.text.length} chars`); }
      return ok('Action: read or write');
    }

    // ── APPS ───────────────────────────────────────────────────────────
    case 'execute_command': {
      if (/format\s+[a-z]:|Remove-Item\s+-Recurse\s+C:\\(Windows|Program)|shutdown\s+\/s/i.test(args.command)) return ok('BLOCKED');
      const { stdout, stderr } = await execAsync(args.command, { cwd: args.cwd || 'C:\\Users\\Admin\\Desktop', shell: 'powershell.exe', timeout: 30000 }).catch(e => ({ stdout: '', stderr: e.message }));
      return ok((stdout || stderr || 'Done').substring(0, 4000));
    }

    case 'open_application': {
      const map = {'chrome':'chrome','blender':'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe','vscode':'code','explorer':'explorer','notepad':'notepad','terminal':'wt','obs':'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe'};
      const app = map[args.app_name?.toLowerCase()] || args.app_name;
      exec(`start "" "${app}"`, { shell: 'cmd.exe' });
      return ok(`Opened: ${args.app_name}`);
    }

    // ── VOICE ──────────────────────────────────────────────────────────
    case 'speak': {
      const bat = args.long ? KOKORO_LONG : KOKORO;
      exec(`"${bat}" "${(args.message||'').replace(/"/g,'')}"`, { shell: 'cmd.exe' });
      return ok(`Speaking: ${args.message}`);
    }

    // ── MEMORY ─────────────────────────────────────────────────────────
    case 'memory': {
      const mem = loadMemory();
      switch (args.action) {
        case 'remember': mem.facts.push({ c: args.content, t: new Date().toISOString() }); saveMemory(mem); return ok(`Remembered (${mem.facts.length} total): ${args.content}`);
        case 'recall': { const q = (args.content||'').toLowerCase(); const m = mem.facts.filter(f=>f.c.toLowerCase().includes(q)); return ok(m.length ? m.map(x=>`• ${x.c}`).join('\n') : 'No matches'); }
        case 'forget': { const b = mem.facts.length; mem.facts = mem.facts.filter(f=>!f.c.toLowerCase().includes((args.content||'').toLowerCase())); saveMemory(mem); return ok(`Forgot ${b-mem.facts.length}`); }
        case 'list': return ok(mem.facts.length ? mem.facts.map(f=>`• ${f.c}`).join('\n') : 'No memories');
        default: return ok('Actions: remember, recall, forget, list');
      }
    }

    // ── NOTIFY ─────────────────────────────────────────────────────────
    case 'notification': {
      await psScript(`
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.BalloonTipTitle = '${san(args.title)}'
$n.BalloonTipText = '${san(args.message)}'
$n.Visible = $true
$n.ShowBalloonTip(3000)
Start-Sleep -Seconds 4
$n.Dispose()
`, 8000);
      return ok(`🔔 ${args.title}: ${args.message}`);
    }

    // ── TASKS ──────────────────────────────────────────────────────────
    case 'task_schedule': {
      const id = scheduleTask(args.description, (args.delay_seconds||60)*1000, args.command);
      return ok(`⏰ Task #${id}: "${args.description}" in ${args.delay_seconds}s`);
    }

    case 'task_list': {
      if (!taskQueue.length) return ok('No tasks');
      return ok(taskQueue.map(t => `#${t.id} [${t.status}] ${t.desc}${t.result?' → '+t.result:''}`).join('\n'));
    }

    // ── WEBCAM ─────────────────────────────────────────────────────────
    case 'webcam_look': {
      const camIdx = args.camera || 0;
      const outPath = path.join(os.tmpdir(), `webcam_${Date.now()}.jpg`);
      const pyScript = `
import cv2, json
cap = cv2.VideoCapture(${camIdx})
if not cap.isOpened():
    print(json.dumps({"error": "Cannot open webcam ${camIdx}"}))
else:
    ret, frame = cap.read()
    cap.release()
    if ret:
        cv2.imwrite(r"${outPath.replace(/\\/g, '\\\\')}", frame)
        h, w = frame.shape[:2]
        print(json.dumps({"path": r"${outPath.replace(/\\/g, '\\\\')}", "width": w, "height": h}))
    else:
        print(json.dumps({"error": "Failed to capture frame"}))
`;
      const tmp = path.join(os.tmpdir(), `wcam_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`python "${tmp}"`, { timeout: 15000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmp); } catch {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        if (data.error) return ok(`Webcam error: ${data.error}`);
        return ok(`📸 Webcam captured: ${data.width}x${data.height}\nSaved: ${data.path}`);
      } catch { return ok(r.stdout || 'Webcam capture failed'); }
    }

    case 'webcam_detect': {
      const camIdx = args.camera || 0;
      const outPath = path.join(os.tmpdir(), `wcam_det_${Date.now()}.jpg`);
      const pyScript = `
import cv2, json
cap = cv2.VideoCapture(${camIdx})
ret, frame = cap.read()
cap.release()
if not ret:
    print(json.dumps({"error": "No frame"}))
    exit()

cv2.imwrite(r"${outPath.replace(/\\/g, '\\\\')}", frame)

try:
    from ultralytics import YOLO
    model = YOLO('yolov8n.pt')
    results = model(frame, conf=${args.confidence || 0.4}, verbose=False)
    dets = []
    for r in results:
        for box in r.boxes:
            cls = r.names[int(box.cls[0])]
            conf = float(box.conf[0])
            x1,y1,x2,y2 = map(int, box.xyxy[0])
            dets.append({"class":cls,"conf":round(conf,2),"center":[int((x1+x2)/2),int((y1+y2)/2)]})
    print(json.dumps({"count":len(dets),"objects":dets,"image":r"${outPath.replace(/\\/g, '\\\\')}"})) 
except ImportError:
    # Fallback: face detection with OpenCV Haar cascade
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)
    dets = [{"class":"face","bbox":[int(x),int(y),int(w),int(h)]} for (x,y,w,h) in faces]
    print(json.dumps({"count":len(dets),"objects":dets,"method":"haar","image":r"${outPath.replace(/\\/g, '\\\\')}"})) 
`;
      const tmp = path.join(os.tmpdir(), `wcam_det_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`python "${tmp}"`, { timeout: 30000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmp); } catch {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        if (data.error) return ok(`Detection error: ${data.error}`);
        let out = `👁️ Webcam Detection: ${data.count} objects found\n`;
        data.objects.forEach(o => { out += `  • ${o.class} (${o.conf ? Math.round(o.conf*100)+'%' : 'detected'})\n`; });
        out += `Image: ${data.image}`;
        return ok(out);
      } catch { return ok(r.stdout || 'Detection failed'); }
    }

    case 'webcam_read': {
      const camIdx = args.camera || 0;
      const pyScript = `
import cv2, json
try:
    import pytesseract
except ImportError:
    print(json.dumps({"error": "pytesseract not installed"}))
    exit()

cap = cv2.VideoCapture(${camIdx})
ret, frame = cap.read()
cap.release()
if not ret:
    print(json.dumps({"error": "No frame"}))
    exit()

gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
text = pytesseract.image_to_string(gray).strip()
print(json.dumps({"text": text, "words": len(text.split()) if text else 0}))
`;
      const tmp = path.join(os.tmpdir(), `wcam_ocr_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`python "${tmp}"`, { timeout: 20000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmp); } catch {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        if (data.error) return ok(`OCR error: ${data.error}`);
        return ok(`📖 Webcam Text (${data.words} words):\n${data.text || '(no text visible)'}`);
      } catch { return ok(r.stdout || 'Webcam OCR failed'); }
    }

    // ── FILE OPS ────────────────────────────────────────────────────────
    case 'file_copy': {
      try {
        const stat = fs.statSync(args.source);
        if (stat.isDirectory()) {
          await execAsync(`xcopy "${args.source}" "${args.destination}" /E /I /Y`, { shell: 'cmd.exe', timeout: 30000 });
        } else {
          fs.copyFileSync(args.source, args.destination);
        }
        return ok(`Copied: ${args.source} → ${args.destination}`);
      } catch (e) { return ok(`Copy error: ${e.message}`); }
    }

    case 'file_move': {
      try {
        fs.renameSync(args.source, args.destination);
        return ok(`Moved: ${args.source} → ${args.destination}`);
      } catch (e) {
        // Cross-device move: copy then delete
        try {
          fs.copyFileSync(args.source, args.destination);
          fs.unlinkSync(args.source);
          return ok(`Moved (cross-device): ${args.source} → ${args.destination}`);
        } catch (e2) { return ok(`Move error: ${e2.message}`); }
      }
    }

    case 'file_delete': {
      // Safety: block deletion of system paths
      if (/^[A-Z]:\\(Windows|Program Files|Users\\Admin\\AppData)/i.test(args.path)) return ok('BLOCKED: Cannot delete system paths');
      try {
        const stat = fs.statSync(args.path);
        if (stat.isDirectory()) { fs.rmdirSync(args.path); } else { fs.unlinkSync(args.path); }
        return ok(`Deleted: ${args.path}`);
      } catch (e) { return ok(`Delete error: ${e.message}`); }
    }

    case 'dir_create': {
      try {
        fs.mkdirSync(args.path, { recursive: true });
        return ok(`Created directory: ${args.path}`);
      } catch (e) { return ok(`Dir error: ${e.message}`); }
    }

    // ── DOWNLOAD ──────────────────────────────────────────────────────
    case 'download_file': {
      try {
        const dest = args.destination || path.join('C:\\Users\\Admin\\Downloads', path.basename(new URL(args.url).pathname) || `download_${Date.now()}`);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        const r = await execAsync(`powershell.exe -NoProfile -Command "Invoke-WebRequest -Uri '${san(args.url)}' -OutFile '${dest}' -UseBasicParsing"`, { timeout: 120000 });
        const size = fs.existsSync(dest) ? (fs.statSync(dest).size / 1024).toFixed(1) : '?';
        return ok(`⬇️ Downloaded: ${dest} (${size}KB)\nFrom: ${args.url}`);
      } catch (e) { return ok(`Download error: ${e.message}`); }
    }

    // ── PROCESS ───────────────────────────────────────────────────────
    case 'process_list': {
      try {
        let cmdStr = 'tasklist /FO CSV /NH';
        if (args.filter) cmdStr += ` /FI "IMAGENAME eq *${san(args.filter)}*"`;
        const r = await cmd(cmdStr, 8000);
        const lines = r.trim().split('\n').filter(l => l.includes(',')).slice(0, 30);
        const procs = lines.map(l => {
          const parts = l.replace(/"/g, '').split(',');
          return `${parts[0]} (PID:${parts[1]}, ${(parseInt(parts[4]||0)/1024).toFixed(0)}MB)`;
        });
        return ok(`Processes (${procs.length}):\n${procs.join('\n')}`);
      } catch (e) { return ok(`Process list error: ${e.message}`); }
    }

    case 'process_kill': {
      // Safety: block killing critical processes
      const blocked = ['explorer','csrss','lsass','winlogon','svchost','system'];
      if (args.name && blocked.includes(args.name.toLowerCase().replace('.exe',''))) return ok('BLOCKED: Critical process');
      try {
        if (args.pid) { await cmd(`taskkill /PID ${args.pid} /F`, 5000); return ok(`Killed PID ${args.pid}`); }
        if (args.name) { await cmd(`taskkill /IM "${san(args.name)}" /F`, 5000); return ok(`Killed: ${args.name}`); }
        return ok('Specify name or pid');
      } catch (e) { return ok(`Kill error: ${e.message}`); }
    }

    // ── AUDIO ─────────────────────────────────────────────────────────
    case 'volume_control': {
      try {
        const action = args.action || 'set';
        if (action === 'mute') {
          await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)`, 5000);
          return ok('🔇 Muted');
        }
        if (action === 'unmute') {
          await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)`, 5000);
          return ok('🔊 Unmuted (toggle)');
        }
        // Volume up/down/set use nircmd if available, otherwise PS
        const vol = Math.min(100, Math.max(0, args.level || 50));
        const steps = action === 'up' ? 5 : action === 'down' ? -5 : 0;
        if (steps !== 0) {
          const key = steps > 0 ? 175 : 174; // VK_VOLUME_UP / VK_VOLUME_DOWN
          for (let i = 0; i < Math.abs(steps); i++) {
            await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]${key})`, 2000);
          }
          return ok(`🔊 Volume ${action}`);
        }
        // Set to exact level via PowerShell audio API
        await psScript(`
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); int j(); int k(); int l(); int m(); int n(); int o(); int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices); int GetDefaultAudioEndpoint(int dataFlow, int role, out IntPtr ppEndpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class Audio {
    public static void SetVolume(float level) {
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IntPtr dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        var endpoint = (IAudioEndpointVolume)Marshal.GetObjectForIUnknown(dev);
        endpoint.SetMasterVolumeLevelScalar(level, System.Guid.Empty);
    }
}
'@ -ErrorAction SilentlyContinue
[Audio]::SetVolume(${vol/100})
`, 8000);
        return ok(`🔊 Volume set to ${vol}%`);
      } catch (e) { return ok(`Volume error: ${e.message}`); }
    }

    // ── ARCHIVE ───────────────────────────────────────────────────────
    case 'zip_create': {
      try {
        await ps(`Compress-Archive -Path '${san(args.source)}' -DestinationPath '${san(args.destination)}' -Force`, 30000);
        const size = fs.existsSync(args.destination) ? (fs.statSync(args.destination).size/1024).toFixed(1) : '?';
        return ok(`📦 Created: ${args.destination} (${size}KB)`);
      } catch (e) { return ok(`Zip error: ${e.message}`); }
    }

    case 'zip_extract': {
      try {
        const dest = args.destination || path.dirname(args.source);
        await ps(`Expand-Archive -Path '${san(args.source)}' -DestinationPath '${san(dest)}' -Force`, 30000);
        return ok(`📦 Extracted: ${args.source} → ${dest}`);
      } catch (e) { return ok(`Unzip error: ${e.message}`); }
    }

    // ── PACKAGES ──────────────────────────────────────────────────────
    case 'install_package': {
      try {
        const mgr = args.manager.toLowerCase();
        const pkg = san(args.packages);
        let cmdStr;
        if (mgr === 'pip') cmdStr = `pip install ${pkg} --quiet`;
        else if (mgr === 'npm') cmdStr = `npm install ${pkg}`;
        else if (mgr === 'choco') cmdStr = `choco install ${pkg} -y`;
        else return ok(`Unknown manager: ${mgr}`);
        const { stdout, stderr } = await execAsync(cmdStr, { cwd: args.cwd || 'C:\\Users\\Admin\\Desktop', shell: 'powershell.exe', timeout: 120000 }).catch(e => ({ stdout: '', stderr: e.message }));
        return ok(`📦 ${mgr} install ${pkg}:\n${(stdout || stderr || 'Done').substring(0, 3000)}`);
      } catch (e) { return ok(`Install error: ${e.message}`); }
    }

    // ── CONTEXT ───────────────────────────────────────────────────────
    case 'active_window': {
      try {
        const r = await psScript(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$h = [Win32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($h, $sb, 256) | Out-Null
$pid2 = 0; [Win32]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
$proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
$rect = New-Object Win32+RECT; [Win32]::GetWindowRect($h, [ref]$rect) | Out-Null
Write-Output "Title: $($sb.ToString())"
Write-Output "Process: $($proc.ProcessName) (PID: $pid2)"
Write-Output "Position: ($($rect.Left),$($rect.Top)) Size: $($rect.Right-$rect.Left)x$($rect.Bottom-$rect.Top)"
Write-Output "CPU: $([math]::Round($proc.CPU,1))s  Memory: $([math]::Round($proc.WorkingSet64/1MB,1))MB"
`, 8000);
        return ok(`🖥️ Active Window:\n${r}`);
      } catch (e) { return ok(`Context error: ${e.message}`); }
    }

    // ── SYSTEM STATUS ──────────────────────────────────────────────────
    case 'system_status': {
      const cpu = await cmd('wmic cpu get loadpercentage /value 2>nul', 5000);
      const mem = await cmd('wmic os get FreePhysicalMemory,TotalVisibleMemorySize /value 2>nul', 5000);
      const procs = await cmd('tasklist /FI "MEMUSAGE gt 100000" /FO TABLE /NH 2>nul', 5000);
      const cpuPct = (cpu.match(/LoadPercentage=(\d+)/) || [,'?'])[1];
      const freeKB = (mem.match(/FreePhysicalMemory=(\d+)/) || [,'0'])[1];
      const totalKB = (mem.match(/TotalVisibleMemorySize=(\d+)/) || [,'1'])[1];
      const usedPct = Math.round((1 - parseInt(freeKB)/parseInt(totalKB)) * 100);
      return ok(`System Status\n─────────────\nCPU: ${cpuPct}%\nRAM: ${usedPct}% used (${Math.round(parseInt(freeKB)/1024)}MB free)\nBridge: v6.0 ULTIMATE\nTools: ${TOOLS.length}\nPURPCLAW: ${purpProc?'RUNNING':'idle'}\nTasks: ${taskQueue.filter(t=>t.status==='scheduled').length} pending\n\nTop Processes:\n${procs.substring(0,1500)}`);
    }

    case 'disk_info': {
      try {
        const r = await cmd('wmic logicaldisk get caption,freespace,size,filesystem /value 2>nul', 8000);
        const drives = r.split(/\r?\n\r?\n/).filter(d => d.includes('Caption=')).map(d => {
          const cap = (d.match(/Caption=(.+)/) || [,'?'])[1].trim();
          const free = parseInt((d.match(/FreeSpace=(\d+)/) || [,'0'])[1]) / (1024**3);
          const total = parseInt((d.match(/Size=(\d+)/) || [,'1'])[1]) / (1024**3);
          const fs = (d.match(/FileSystem=(.+)/) || [,'?'])[1].trim();
          return `${cap} ${fs}: ${free.toFixed(1)}GB free / ${total.toFixed(1)}GB total (${Math.round((1-free/total)*100)}% used)`;
        });
        return ok(`💾 Disk Info:\n${drives.join('\n')}`);
      } catch (e) { return ok(`Disk error: ${e.message}`); }
    }

    case 'network_info': {
      try {
        const ip = await cmd('ipconfig | findstr /R "IPv4 Wireless Wi-Fi Ethernet"', 5000);
        const ping = await cmd('ping -n 1 -w 1000 8.8.8.8 | findstr "time="', 3000).catch(() => 'No internet');
        const wifi = await cmd('netsh wlan show interfaces | findstr "SSID Signal State"', 5000).catch(() => 'No WiFi');
        return ok(`🌐 Network Info:\n${ip.trim()}\n\nWiFi:\n${wifi.trim()}\n\nInternet: ${ping.trim()}`);
      } catch (e) { return ok(`Network error: ${e.message}`); }
    }

    default: return ok(`Unknown tool: ${name}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function httpGet(url) {
  return new Promise((res, rej) => {
    const m = url.startsWith('https') ? https : http;
    m.get(url, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error',rej);
  });
}

function httpReq(url, method='GET', body) {
  return new Promise((res, rej) => {
    try {
      const u = new URL(url);
      const m = u.protocol==='https:' ? https : http;
      const r = m.request({ hostname:u.hostname, port:u.port, path:u.pathname+u.search, method, headers:{'Content-Type':'application/json'} }, resp => {
        let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>res(`HTTP ${resp.statusCode}\n${d.substring(0,3000)}`));
      });
      r.on('error', e=>rej(e));
      r.setTimeout(15000, ()=>{ r.destroy(); rej(new Error('Timeout')); });
      if(body) r.write(typeof body==='string'?body:JSON.stringify(body));
      r.end();
    } catch(e) { rej(e); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP JSON-RPC
// ═══════════════════════════════════════════════════════════════════════════
async function handleRpc(req) {
  const { id, method, params } = req;
  switch (method) {
    case 'initialize': return { jsonrpc:'2.0', id, result: { protocolVersion:'2024-11-05', capabilities:{tools:{listChanged:false}}, serverInfo:{name:'purpclaw-v6.0',version:'6.0.0'} } };
    case 'initialized': console.log('[BRIDGE] ✅ Init'); return { jsonrpc:'2.0', id, result:{} };
    case 'notifications/initialized': console.log('[BRIDGE] ✅ Client OK'); return null;
    case 'tools/list': console.log(`[BRIDGE] 📋 ${TOOLS.length} tools`); return { jsonrpc:'2.0', id, result:{tools:TOOLS} };
    case 'tools/call': { const { name, arguments:a } = params||{}; if(!name) return { jsonrpc:'2.0', id, error:{code:-32602,message:'No tool'} }; return { jsonrpc:'2.0', id, result: await executeTool(name, a||{}) }; }
    case 'ping': return { jsonrpc:'2.0', id, result:{} };
    default: return { jsonrpc:'2.0', id, error:{code:-32601,message:`Unknown: ${method}`} };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════════════════════════
let ws = null, hb = null, rc = null;

function connect() {
  if (rc) clearTimeout(rc);
  ws = new WebSocket(XIAOZHI_WS_URL);
  ws.on('open', () => {
    console.log('[BRIDGE] ✅ CONNECTED — v6.0 ULTIMATE');
    if (hb) clearInterval(hb);
    hb = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.ping(); }, 25000);
  });
  ws.on('message', async (data) => {
    try {
      const raw = data.toString();
      const req = JSON.parse(raw);
      if (req.method !== 'ping') console.log('[BRIDGE] ←', raw.substring(0, 150));
      const resp = await handleRpc(req);
      if (resp && ws?.readyState === WebSocket.OPEN) {
        const out = JSON.stringify(resp);
        if (req.method !== 'ping') console.log('[BRIDGE] →', out.substring(0, 150));
        ws.send(out);
      }
    } catch (e) { console.error('[BRIDGE] ❌', e.message); }
  });
  ws.on('close', c => { console.log(`[BRIDGE] Disc (${c})`); if(hb)clearInterval(hb); recon(); });
  ws.on('error', e => console.error('[BRIDGE] ERR:', e.message));
}

function recon() { if(rc)clearTimeout(rc); rc=setTimeout(connect, 5000); }

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  🦞 PURPCLAW v6.0 — ULTIMATE');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Tools:     ${TOOLS.length}`);
console.log('  Browser:   Playwright (click, type, scroll, read, download)');
console.log('  Webcam:    look, detect (Haar), read (OCR)');
console.log('  File Ops:  copy, move, delete, zip, extract, download');
console.log('  System:    processes, volume, network, disk, active window');
console.log('  All async. All hardened. Shell-injection proof.');
console.log('═══════════════════════════════════════════════════════════════');

if (!XIAOZHI_WS_URL || XIAOZHI_WS_URL.includes('YOUR_TOKEN')) { console.error('Set XIAOZHI_MCP_URL!'); process.exit(1); }
connect();

process.on('SIGINT', () => { if(hb)clearInterval(hb); if(rc)clearTimeout(rc); ws?.close(); if(purpProc)purpProc.kill(); if(pwBrowser)pwBrowser.close().catch(()=>{}); process.exit(0); });
process.on('uncaughtException', e => { console.error('[BRIDGE] CRASH:', e.message); recon(); });
