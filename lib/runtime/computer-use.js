'use strict';

const fs = require('fs');
const path = require('path');
const { execSafe } = require('../child-registry');
const settings = require('./settings-registry');
const screen = require('../screen-look');
const { PROJECT_ROOT } = require('../paths');

const AUDIT_FILE = path.join(PROJECT_ROOT, 'agent_work', 'computer-use-audit.jsonl');
const ACTION_LEVEL = Object.freeze({
  status: 'observe',
  screenshot: 'observe',
  windows: 'observe',
  stop: 'observe',          // emergency brake — special-cased to always run
  notify: 'assist',
  move: 'assist',
  click: 'assist',
  double_click: 'assist',
  drag: 'assist',           // box-select / drag-and-drop
  scroll: 'assist',
  focus: 'assist',          // bring a window to the foreground
  type: 'assist',
  hotkey: 'assist',
});
const MODE_LEVEL = Object.freeze({ off: 0, observe: 1, assist: 2, autonomous: 3 });

function mode() {
  if (!settings.get('computerUse.enabled')?.value) return 'off';
  return settings.get('computerUse.mode')?.value || 'observe';
}

function audit(entry) {
  fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
  fs.appendFileSync(AUDIT_FILE, JSON.stringify({
    at: new Date().toISOString(),
    ...entry,
  }) + '\n', 'utf8');
}

function assertAllowed(action, approved) {
  const currentMode = mode();
  const required = ACTION_LEVEL[action];
  if (!required) throw new Error(`unsupported computer-use action: ${action}`);
  // The kill switch must ALWAYS work — it can only ever make things safer.
  if (action === 'stop') return currentMode;
  if (MODE_LEVEL[currentMode] < MODE_LEVEL[required]) {
    throw new Error(`computer-use mode ${currentMode} does not allow ${action}; requires ${required}`);
  }
  if (required === 'assist' && currentMode !== 'autonomous' && !approved) {
    throw new Error(`${action} requires explicit approval unless computer-use mode is autonomous`);
  }
  return currentMode;
}

function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function powershell(script, timeoutMs = 15000) {
  const result = await execSafe('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command', script,
  ], { timeoutMs, windowsHide: true });
  if (!result.ok) throw new Error(result.stderr || result.stdout || `PowerShell exited ${result.code}`);
  return String(result.stdout || '').trim();
}

const USER32 = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PurpInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
`;

async function execute(action, args = {}, options = {}) {
  const activeMode = assertAllowed(action, options.approved === true);
  let result;

  if (action === 'status') {
    result = { mode: activeMode, sessionId: process.env.SESSIONNAME || null, platform: process.platform };
  } else if (action === 'screenshot') {
    const screens = args.screen ? [Number(args.screen)] : [1];
    result = await screen.look(screens, { vision: args.vision === true, yolo: false });
  } else if (action === 'windows') {
    const output = await powershell(
      'Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress'
    );
    result = output ? JSON.parse(output) : [];
  } else if (action === 'notify') {
    const title = psLiteral(args.title || 'PurpClaw');
    const message = psLiteral(args.message || '');
    await powershell(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(${message}, ${title}) | Out-Null`);
    result = { shown: true };
  } else if (action === 'move') {
    await powershell(`${USER32}; [PurpInput]::SetCursorPos(${Number(args.x)}, ${Number(args.y)}) | Out-Null`);
    result = { x: Number(args.x), y: Number(args.y) };
  } else if (action === 'click') {
    const x = Number(args.x);
    const y = Number(args.y);
    const right = args.button === 'right';
    const down = right ? '0x0008' : '0x0002';
    const up = right ? '0x0010' : '0x0004';
    await powershell(`${USER32}; [PurpInput]::SetCursorPos(${x}, ${y}) | Out-Null; [PurpInput]::mouse_event(${down},0,0,0,[UIntPtr]::Zero); [PurpInput]::mouse_event(${up},0,0,0,[UIntPtr]::Zero)`);
    result = { x, y, button: right ? 'right' : 'left' };
  } else if (action === 'double_click') {
    const x = Number(args.x), y = Number(args.y);
    await powershell(`${USER32}; [PurpInput]::SetCursorPos(${x}, ${y}) | Out-Null; foreach ($i in 1..2) { [PurpInput]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); [PurpInput]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero) }`);
    result = { x, y, action: 'double_click' };
  } else if (action === 'drag') {
    // Box-select / drag-and-drop: press at (x,y), move to (x2,y2), release.
    const x = Number(args.x), y = Number(args.y);
    const x2 = Number(args.x2), y2 = Number(args.y2);
    const right = args.button === 'right';
    const down = right ? '0x0008' : '0x0002';
    const up = right ? '0x0010' : '0x0004';
    await powershell(`${USER32}; [PurpInput]::SetCursorPos(${x}, ${y}) | Out-Null; [PurpInput]::mouse_event(${down},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [PurpInput]::SetCursorPos(${x2}, ${y2}) | Out-Null; Start-Sleep -Milliseconds 60; [PurpInput]::mouse_event(${up},0,0,0,[UIntPtr]::Zero)`);
    result = { from: { x, y }, to: { x: x2, y: y2 }, button: right ? 'right' : 'left' };
  } else if (action === 'scroll') {
    // Positive amount scrolls up, negative scrolls down. WHEEL flag = 0x0800.
    const amount = Math.trunc(Number(args.amount) || 0);
    await powershell(`${USER32}; [PurpInput]::mouse_event(0x0800,0,0,${amount * 120},[UIntPtr]::Zero)`);
    result = { scrolled: amount };
  } else if (action === 'focus') {
    // Bring a window to the foreground by title substring or process id.
    const sel = args.pid
      ? `Get-Process -Id ${Number(args.pid)} -ErrorAction SilentlyContinue`
      : `Get-Process | Where-Object { $_.MainWindowTitle -like ${psLiteral('*' + (args.title || '') + '*')} } | Select-Object -First 1`;
    const out = await powershell(`${USER32}; $p = ${sel}; if ($p -and $p.MainWindowHandle -ne 0) { [PurpInput]::SetForegroundWindow($p.MainWindowHandle) | Out-Null; $p.MainWindowTitle } else { 'no-window' }`);
    result = { focused: out };
  } else if (action === 'stop') {
    // Emergency brake: disable computer-use so no further input can be injected,
    // AND tear down the Windows-MCP server connection (its tools bypass this
    // gate at the process level, so the kill switch must also kill its link).
    try { settings.set('computerUse.enabled', false); } catch { /* best effort */ }
    try { settings.set('computerUse.mode', 'off'); } catch { /* best effort */ }
    try { require('../tools-windows-mcp').shutdown(); } catch { /* winmcp optional */ }
    result = { stopped: true, mode: 'off', winmcp: 'disconnected' };
  } else if (action === 'type') {
    await powershell(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psLiteral(args.text || '')})`);
    result = { characters: String(args.text || '').length };
  } else if (action === 'hotkey') {
    await powershell(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psLiteral(args.keys || '')})`);
    result = { keys: args.keys };
  }

  audit({ action, mode: activeMode, approved: options.approved === true, args, ok: true });
  return result;
}

module.exports = { execute, mode, ACTION_LEVEL, MODE_LEVEL, AUDIT_FILE };
