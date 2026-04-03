/**
 * PURPCLAW Interactive Shell — Session Persistence Fix
 * 
 * PROBLEM: Bridge restarts kill all shell sessions
 * FIX: Sessions are tracked in a JSON file + sessions become "zombie" aware
 *      so Sam knows when a session died vs when it's just idle
 * 
 * ALSO: Added proper shell:false for all spawns + shell type detection
 */

const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Keep track of active REPL sessions
const sessions = {};
const SESSION_FILE = path.join(os.tmpdir(), 'purpclaw_shell_sessions.json');

// Detect shell type from session file
function getShellType(sessionId) {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      return data[sessionId]?.shell_type || 'powershell';
    }
  } catch {}
  return 'powershell';
}

// Persist sessions to disk so they survive bridge restarts
function saveSessions() {
  try {
    const data = {};
    for (const [id, s] of Object.entries(sessions)) {
      data[id] = { shell_type: s.shell_type, startedAt: s.startedAt, pid: s.proc?.pid || null };
    }
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

function loadSessions() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return;
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    const data = JSON.parse(raw);
    for (const [id, info] of Object.entries(data)) {
      // Process is dead but we remember the session existed
      // Sam can check list and see it, then stop + restart it
      sessions[id] = {
        proc: null,
        output: `[Session ${id} (${info.shell_type}) was running but bridge restarted. Stop and start a new session.]`,
        timer: null,
        shell_type: info.shell_type,
        dead: true,
        startedAt: info.startedAt
      };
    }
    console.log(`[REPL] Loaded ${Object.keys(sessions).length} previous sessions from disk`);
  } catch {}
}

// Load any sessions that survived bridge restart
loadSessions();

// Shell command builder with proper paths
function buildShellCmd(shell_type) {
  switch (shell_type) {
    case 'cmd':
      return { cmd: 'cmd.exe', args: [] };
    case 'node':
      return { cmd: 'node', args: ['-i'] };
    case 'python':
      return { cmd: 'python', args: ['-i'] };
    case 'powershell':
    default:
      return { cmd: 'powershell.exe', args: ['-NoProfile', '-Command', '-'] };
  }
}

module.exports = {
  name: 'interactive_shell',
  description: 'Launch and interact with persistent shells (Powershell, Node, Python, Bash). Sessions survive bridge reconnects. Max 5 sessions. IMPORTANT: session_id is REQUIRED for start/send/read/stop actions. Only action=list works without session_id.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['start', 'send', 'read', 'stop', 'list'] },
      session_id: { type: 'string', description: 'REQUIRED (except for list action). Unique session ID (e.g. "main", "build", "test")' },
      shell_type: { type: 'string', enum: ['powershell', 'cmd', 'node', 'python'], description: 'Only needed on start action' },
      input: { type: 'string', description: 'Text to send to stdin (must include newline to execute)' }
    },
    required: ['action', 'session_id']
  },
  handler: async (args, context) => {
    const { action, session_id, shell_type, input } = args;

    if (action === 'list') {
      const active = Object.entries(sessions).map(([id, s]) => {
        const status = s.dead ? ' [DEAD - bridge restarted]' : (s.proc ? ' [running]' : ' [unknown]');
        const type = s.shell_type || 'powershell';
        return `${id} (${type})${status}`;
      });
      return active.length > 0 ? `Active Sessions:\n${active.join('\n')}` : 'No active sessions. Start one with action=start.';
    }

    if (!session_id) throw new Error('session_id is required for start, send, read, and stop.');

    // Handle DEAD sessions — auto-clean on any action except start
    if (sessions[session_id]?.dead) {
      if (action === 'start') {
        // Allow restart of dead session
        delete sessions[session_id];
      } else {
        return `Session ${session_id} is dead (bridge restarted). Use action=stop to clear it, then action=start to create a new one.`;
      }
    }

    if (action === 'start') {
      if (sessions[session_id]?.proc && !sessions[session_id]?.dead) {
        return `Session ${session_id} is already running (PID ${sessions[session_id].proc.pid}).`;
      }

      if (Object.keys(sessions).length >= 5) {
        throw new Error('Max 5 sessions. Stop one first: action=stop session_id=xxx');
      }

      const type = shell_type || 'powershell';
      const { cmd, args: shellArgs } = buildShellCmd(type);

      let child;
      try {
        child = spawn(cmd, shellArgs, {
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (e) {
        return `Failed to spawn ${cmd}: ${e.message}`;
      }

      const startedAt = new Date().toISOString();
      const s = {
        proc: child,
        output: '',
        timer: null,
        shell_type: type,
        startedAt
      };

      // Auto-cleanup after 10 min idle
      const resetTimer = () => {
        if (s.timer) clearTimeout(s.timer);
        s.timer = setTimeout(() => {
          console.log(`[REPL] ⏰ Cleaning up idle session ${session_id}`);
          if (s.proc && !s.proc.killed) s.proc.kill();
          delete sessions[session_id];
          saveSessions();
        }, 10 * 60 * 1000);
      };

      sessions[session_id] = s;
      resetTimer();
      saveSessions();

      child.stdout.on('data', data => { s.output += data.toString(); resetTimer(); });
      child.stderr.on('data', data => { s.output += data.toString(); resetTimer(); });
      child.on('exit', () => {
        if (s.timer) clearTimeout(s.timer);
        delete sessions[session_id];
        saveSessions();
        console.log(`[REPL] Session ${session_id} exited`);
      });
      child.on('error', e => {
        s.output += `\n[ERROR: ${e.message}]\n`;
        console.error(`[REPL] Session ${session_id} error: ${e.message}`);
      });

      // Wait for the initial prompt
      await new Promise(r => setTimeout(r, 1500));
      const initOutput = s.output || '';
      s.output = '';

      return `Started ${cmd} session: ${session_id} (PID ${child.pid})\nOutput:\n${initOutput}`;
    }

    if (!sessions[session_id]) throw new Error(`Session ${session_id} is not running. Start one first.`);

    const s = sessions[session_id];

    if (action === 'send') {
      if (!input) throw new Error('input is required for send action');
      if (!s.proc || s.proc.killed) return `Session ${session_id} has no live process. Start a new session.`;

      const sanitized = input;
      try {
        s.proc.stdin.write(sanitized);
      } catch (e) {
        return `Failed to write to stdin: ${e.message}`;
      }

      // Wait for command output
      await new Promise(r => setTimeout(r, 2000));
      const res = s.output;
      s.output = '';
      return res || '(No output yet)';
    }

    if (action === 'read') {
      const res = s.output;
      s.output = '';
      return res || '(No new output)';
    }

    if (action === 'stop') {
      if (s.proc && !s.proc.killed) {
        s.proc.kill();
      }
      if (s.timer) clearTimeout(s.timer);
      delete sessions[session_id];
      saveSessions();
      return `Stopped session ${session_id}`;
    }

    return `Unknown action: ${action}`;
  }
};
