const { spawn } = require('child_process');
const os = require('os');

// Keep track of active REPL sessions
const sessions = {};

module.exports = {
  name: 'interactive_shell',
  description: 'Launch and interact with persistent shells (Powershell, Node, Python, Bash). Good for running servers or interactive scripts.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['start', 'send', 'read', 'stop', 'list'] },
      session_id: { type: 'string', description: 'ID to uniquely name this interactive shell' },
      shell_type: { type: 'string', enum: ['powershell', 'cmd', 'node', 'python'], description: 'Only needed on start' },
      input: { type: 'string', description: 'Text to send to stdin (must include newline if you want to execute it)' }
    },
    required: ['action']
  },
  handler: async (args, context) => {
    const { action, session_id, shell_type, input } = args;

    if (action === 'list') {
      const active = Object.keys(sessions);
      return active.length > 0 ? `Active Sessions:\n${active.join('\n')}` : 'No active sessions.';
    }

    if (!session_id) throw new Error('session_id is required for start, send, read, and stop.');

    if (action === 'start') {
      if (sessions[session_id]) return `Session ${session_id} is already running.`;
      
      if (Object.keys(sessions).length >= 3) {
        throw new Error('Maximum of 3 interactive shell sessions reached! Please stop an older session before starting a new one.');
      }

      let cmd = 'powershell.exe';
      let shellArgs = ['-NoProfile'];
      if (shell_type === 'cmd') { cmd = 'cmd.exe'; shellArgs = []; }
      if (shell_type === 'node') { cmd = 'node'; shellArgs = ['-i']; }
      if (shell_type === 'python') { cmd = 'python'; shellArgs = ['-i']; }

      const child = spawn(cmd, shellArgs, { shell: false });
      
      const s = { 
        proc: child, 
        output: '',
        timer: null
      };
      
      // Auto-cleanup timer (10 minutes)
      const resetTimer = () => {
        if (s.timer) clearTimeout(s.timer);
        s.timer = setTimeout(() => {
          console.log(`[REPL] ⏰ Cleaning up idle session ${session_id}`);
          s.proc.kill();
          delete sessions[session_id];
        }, 10 * 60 * 1000);
      };

      sessions[session_id] = s;
      resetTimer();

      child.stdout.on('data', data => { s.output += data.toString(); resetTimer(); });
      child.stderr.on('data', data => { s.output += data.toString(); resetTimer(); });
      child.on('exit', () => { 
        if(s.timer) clearTimeout(s.timer); 
        delete sessions[session_id]; 
      });

      // Wait a tiny bit for the initial prompt (like Python's >>>)
      await new Promise(r => setTimeout(r, 1000));
      const initOutput = s.output || '';
      s.output = ''; // Clear buffer after reading
      
      return `Started ${cmd} session: ${session_id}\nOutput:\n${initOutput}`;
    }

    if (!sessions[session_id]) throw new Error(`Session ${session_id} is not running.`);
    const s = sessions[session_id];

    // Reset idle timer on any structured interaction
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        console.log(`[REPL] ⏰ Cleaning up idle session ${session_id}`);
        s.proc.kill();
        delete sessions[session_id];
      }, 10 * 60 * 1000);
    }

    if (action === 'send') {
      if (!input) throw new Error('input is required for send action');
      s.proc.stdin.write(input);
      // Wait for the command to execute and generate stdout
      await new Promise(r => setTimeout(r, 1500));
      const res = s.output;
      s.output = ''; // clear buffer
      return res || 'Input sent. (No output yet)';
    }

    if (action === 'read') {
      const res = s.output;
      s.output = '';
      return res || '(No new output)';
    }

    if (action === 'stop') {
      s.proc.kill();
      delete sessions[session_id];
      return `Stopped session ${session_id}`;
    }
  }
};
