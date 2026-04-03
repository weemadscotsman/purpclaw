/**
 * XIAOZHI ↔ OPENCLAW MCP BRIDGE
 * ==============================
 * Connects the xiaozhi.me ball device to OpenClaw's tool ecosystem.
 * 
 * Architecture:
 *   [Xiaozhi Ball] → voice → [xiaozhi.me cloud] → MCP WebSocket → [THIS BRIDGE] → [OpenClaw Gateway]
 *                                                                                    ↓
 *                                                                              [36 Skills: desktop-control, 
 *                                                                               browser, shell, voice, etc.]
 * 
 * The bridge acts as an MCP server that:
 * 1. Connects to xiaozhi.me via WebSocket (wss://api.xiaozhi.me/mcp/?token=...)
 * 2. Registers OpenClaw capabilities as MCP tools
 * 3. When xiaozhi sends tools/call → routes to OpenClaw gateway or local execution
 * 4. Returns results back through the WebSocket to the ball
 * 
 * Usage:
 *   npx ts-node lib/xiaozhi_bridge.ts
 *   (or compile and run with node)
 * 
 * Environment:
 *   XIAOZHI_MCP_TOKEN  - JWT token from xiaozhi.me dashboard
 *   OPENCLAW_GATEWAY   - OpenClaw gateway URL (default: ws://127.0.0.1:18789)
 *   MCP_BRIDGE_URL     - OpenClaw MCP bridge URL (default: http://localhost:3001)
 */

import WebSocket from 'ws';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================
const XIAOZHI_WS_URL = process.env.XIAOZHI_MCP_URL || 'wss://api.xiaozhi.me/mcp/?token=YOUR_TOKEN_HERE';
const OPENCLAW_GATEWAY = process.env.OPENCLAW_GATEWAY || 'ws://127.0.0.1:18789';
const MCP_BRIDGE_URL = process.env.MCP_BRIDGE_URL || 'http://localhost:3001';
const KOKORO_SEND = 'C:\\Users\\Admin\\.openclaw\\kokoro_send.bat';
const KOKORO_LONG_SEND = 'C:\\Users\\Admin\\.openclaw\\kokoro_long_send.bat';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;

// ============================================================================
// OPENCLAW TOOLS EXPOSED TO XIAOZHI
// ============================================================================
const OPENCLAW_TOOLS = [
  {
    name: 'execute_command',
    description: 'Execute a shell command on the PC. Use for file operations, launching apps, running scripts.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The PowerShell command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' }
      },
      required: ['command']
    }
  },
  {
    name: 'desktop_control',
    description: 'Control mouse and keyboard on the PC. Move mouse, click, type text, press keys.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['mouse_move', 'click', 'double_click', 'type_text', 'key_press', 'screenshot'], description: 'The desktop action to perform' },
        x: { type: 'number', description: 'Mouse X coordinate (for mouse_move/click)' },
        y: { type: 'number', description: 'Mouse Y coordinate (for mouse_move/click)' },
        text: { type: 'string', description: 'Text to type (for type_text) or key to press (for key_press)' }
      },
      required: ['action']
    }
  },
  {
    name: 'speak',
    description: 'Make the PC speak using Kokoro TTS voice. Socket will say the message out loud.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to speak aloud' },
        long: { type: 'boolean', description: 'Use long message mode for chunked delivery (default: false)' }
      },
      required: ['message']
    }
  },
  {
    name: 'open_application',
    description: 'Open an application on the PC by name. Supports common apps like Chrome, Blender, VS Code, Explorer, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'Name of the application to open (e.g., "chrome", "blender", "vscode", "explorer")' }
      },
      required: ['app_name']
    }
  },
  {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL or perform browser actions.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        action: { type: 'string', enum: ['navigate', 'screenshot', 'back', 'forward', 'refresh'], description: 'Browser action' }
      },
      required: ['action']
    }
  },
  {
    name: 'openclaw_gateway',
    description: 'Send a raw message to the OpenClaw gateway for processing by the AI agent (Socket). Use this for complex requests that need AI reasoning.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message/command to send to OpenClaw' }
      },
      required: ['message']
    }
  },
  {
    name: 'system_status',
    description: 'Get the current system status including running processes, CPU, memory, and OpenClaw health.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'purpclaw_status',
    description: 'Get the current PURPCLAW pipeline status — check if any builds are running, their stage, and guard states.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// ============================================================================
// TOOL EXECUTION ENGINE
// ============================================================================
async function executeTool(toolName: string, args: Record<string, any>): Promise<{ content: { type: string; text: string }[] }> {
  console.log(`[BRIDGE] Executing tool: ${toolName}`, JSON.stringify(args));

  try {
    switch (toolName) {
      case 'execute_command': {
        const cwd = args.cwd || 'C:\\Users\\Admin\\Desktop';
        const { stdout, stderr } = await execAsync(args.command, { cwd, shell: 'powershell.exe', timeout: 30000 });
        return { content: [{ type: 'text', text: stdout || stderr || 'Command completed (no output)' }] };
      }

      case 'desktop_control': {
        // Route to OpenClaw's desktop-control skill via PowerShell automation
        const { action, x, y, text } = args;
        let psCommand = '';
        switch (action) {
          case 'mouse_move':
            psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})`;
            break;
          case 'click':
            psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y}); Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W; [W.U]::mouse_event(2,0,0,0,0); [W.U]::mouse_event(4,0,0,0,0)`;
            break;
          case 'type_text':
            psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${(text || '').replace(/'/g, "''")}')`;
            break;
          case 'key_press':
            psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text}')`;
            break;
          case 'screenshot':
            psCommand = `Add-Type -AssemblyName System.Windows.Forms; $b = New-Object Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width,[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(0,0,0,0,$b.Size); $p = "$env:TEMP\\screenshot_$(Get-Date -Format 'yyyyMMdd_HHmmss').png"; $b.Save($p); Write-Output "Screenshot saved: $p"`;
            break;
          default:
            return { content: [{ type: 'text', text: `Unknown desktop action: ${action}` }] };
        }
        const { stdout } = await execAsync(psCommand, { shell: 'powershell.exe', timeout: 10000 });
        return { content: [{ type: 'text', text: stdout || `Desktop action '${action}' completed` }] };
      }

      case 'speak': {
        const bat = args.long ? KOKORO_LONG_SEND : KOKORO_SEND;
        const message = (args.message || '').replace(/"/g, '\\"');
        await execAsync(`"${bat}" "${message}"`, { shell: 'cmd.exe', timeout: 30000 });
        return { content: [{ type: 'text', text: `Speaking: "${args.message}"` }] };
      }

      case 'open_application': {
        const appMap: Record<string, string> = {
          'chrome': 'start chrome',
          'blender': 'start "" "C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe"',
          'vscode': 'code',
          'explorer': 'explorer',
          'notepad': 'notepad',
          'terminal': 'wt',
          'obs': 'start "" "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe"',
          'discord': 'start "" "%LOCALAPPDATA%\\Discord\\Update.exe" --processStart Discord.exe',
        };
        const cmd = appMap[args.app_name?.toLowerCase()] || `start ${args.app_name}`;
        await execAsync(cmd, { shell: 'cmd.exe', timeout: 10000 });
        return { content: [{ type: 'text', text: `Opened: ${args.app_name}` }] };
      }

      case 'browser_navigate': {
        if (args.action === 'navigate' && args.url) {
          await execAsync(`start chrome "${args.url}"`, { shell: 'cmd.exe' });
          return { content: [{ type: 'text', text: `Navigated to: ${args.url}` }] };
        }
        // For other actions, delegate to MCP bridge's puppeteer server
        const result = await callMcpBridge('puppeteer', `browser_${args.action}`, { url: args.url });
        return { content: [{ type: 'text', text: result }] };
      }

      case 'openclaw_gateway': {
        const result = await sendToOpenClawGateway(args.message);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'system_status': {
        const { stdout } = await execAsync(
          'Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name,CPU,WorkingSet | Format-Table -AutoSize | Out-String; Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize | Format-List | Out-String',
          { shell: 'powershell.exe', timeout: 10000 }
        );
        // Also check OpenClaw MCP bridge health
        let bridgeHealth = 'unknown';
        try {
          bridgeHealth = await httpGet(`${MCP_BRIDGE_URL}/health`);
        } catch { bridgeHealth = 'offline'; }
        return { content: [{ type: 'text', text: `System:\n${stdout}\nMCP Bridge: ${bridgeHealth}` }] };
      }

      case 'purpclaw_status': {
        try {
          const stateFile = path.join(process.cwd(), 'loop_state.json');
          const { stdout } = await execAsync(`type "${stateFile}"`, { shell: 'cmd.exe' });
          return { content: [{ type: 'text', text: `PURPCLAW State:\n${stdout}` }] };
        } catch {
          return { content: [{ type: 'text', text: 'PURPCLAW: No active pipeline (idle)' }] };
        }
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }] };
    }
  } catch (error: any) {
    console.error(`[BRIDGE] Tool execution error:`, error.message);
    return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  }
}

// ============================================================================
// HELPER: Call OpenClaw MCP Bridge HTTP API
// ============================================================================
async function callMcpBridge(server: string, tool: string, args: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ server, tool, args });
    const url = new URL(`${MCP_BRIDGE_URL}/call`);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

// ============================================================================
// HELPER: HTTP GET
// ============================================================================
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// ============================================================================
// HELPER: Send message to OpenClaw Gateway WebSocket
// ============================================================================
function sendToOpenClawGateway(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OPENCLAW_GATEWAY);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('OpenClaw gateway timeout'));
    }, 30000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'message', content: message }));
    });

    ws.on('message', (data: WebSocket.Data) => {
      clearTimeout(timeout);
      ws.close();
      resolve(data.toString());
    });

    ws.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ============================================================================
// MCP JSON-RPC 2.0 MESSAGE HANDLING
// ============================================================================
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

function createResponse(id: number | string, result: any): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function createError(id: number | string, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return createResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'purpclaw-openclaw-bridge', version: '1.0.0' }
      });

    case 'initialized':
      // Notification, no response needed but we'll acknowledge
      return createResponse(id, {});

    case 'tools/list':
      return createResponse(id, { tools: OPENCLAW_TOOLS });

    case 'tools/call': {
      const { name, arguments: toolArgs } = params || {};
      if (!name) return createError(id, -32602, 'Missing tool name');
      const result = await executeTool(name, toolArgs || {});
      return createResponse(id, result);
    }

    case 'ping':
      return createResponse(id, {});

    default:
      console.warn(`[BRIDGE] Unknown method: ${method}`);
      return createError(id, -32601, `Method not found: ${method}`);
  }
}

// ============================================================================
// XIAOZHI WEBSOCKET CONNECTION (with auto-reconnect)
// ============================================================================
let ws: WebSocket | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function connect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);

  console.log(`[BRIDGE] Connecting to xiaozhi.me MCP endpoint...`);
  ws = new WebSocket(XIAOZHI_WS_URL);

  ws.on('open', () => {
    console.log(`[BRIDGE] ✅ Connected to xiaozhi.me!`);
    console.log(`[BRIDGE] 🦞 PURPCLAW-OpenClaw bridge active. The claw is listening.`);

    // Start heartbeat
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 'heartbeat' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  });

  ws.on('message', async (data: WebSocket.Data) => {
    try {
      const raw = data.toString();
      console.log(`[BRIDGE] ← Received:`, raw.substring(0, 200));

      const request: JsonRpcRequest = JSON.parse(raw);
      const response = await handleJsonRpc(request);

      if (ws?.readyState === WebSocket.OPEN) {
        const responseStr = JSON.stringify(response);
        console.log(`[BRIDGE] → Sending:`, responseStr.substring(0, 200));
        ws.send(responseStr);
      }
    } catch (error: any) {
      console.error(`[BRIDGE] Message handling error:`, error.message);
    }
  });

  ws.on('close', (code: number, reason: Buffer) => {
    console.log(`[BRIDGE] ⚠️ Disconnected from xiaozhi.me (code: ${code}, reason: ${reason.toString()})`);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    scheduleReconnect();
  });

  ws.on('error', (error: Error) => {
    console.error(`[BRIDGE] ❌ WebSocket error:`, error.message);
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  console.log(`[BRIDGE] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
  reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
}

// ============================================================================
// STARTUP
// ============================================================================
console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('  🦞 PURPCLAW × OPENCLAW × XIAOZHI MCP BRIDGE');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Xiaozhi WS:  ${XIAOZHI_WS_URL.substring(0, 50)}...`);
console.log(`  OpenClaw GW: ${OPENCLAW_GATEWAY}`);
console.log(`  MCP Bridge:  ${MCP_BRIDGE_URL}`);
console.log(`  Tools:       ${OPENCLAW_TOOLS.length} registered`);
console.log('═══════════════════════════════════════════════════════');
console.log('');

// Validate token
if (XIAOZHI_WS_URL.includes('YOUR_TOKEN_HERE')) {
  console.error('[BRIDGE] ❌ FATAL: Set XIAOZHI_MCP_URL environment variable with your real token!');
  console.error('[BRIDGE] Example: set XIAOZHI_MCP_URL=wss://api.xiaozhi.me/mcp/?token=YOUR_REAL_TOKEN');
  process.exit(1);
}

connect();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[BRIDGE] Shutting down...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[BRIDGE] Uncaught exception:', err.message);
  scheduleReconnect();
});
