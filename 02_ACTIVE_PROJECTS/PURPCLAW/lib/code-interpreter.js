'use strict';
/**
 * lib/code-interpreter.js — Python Code Interpreter Tool
 * 
 * Executes Python code in an isolated subprocess with resource limits.
 * Matches Codex's code interpreter capability.
 * 
 * Usage:
 *   registry.invoke('code_interpreter', { code: 'print(1+1)', timeout_ms: 30000 })
 *   registry.invoke('code_interpreter', { code: 'import numpy as np; np.array([1,2,3])', language: 'python' })
 */

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');

const PURP_DIR = process.env.PURP_DIR || path.join(os.homedir(), '.purpclaw');
const RUN_DIR  = path.join(PURP_DIR, 'code-runner');
const MAX_STDOUT = 100_000;
const MAX_STDERR = 20_000;
const DEFAULT_TIMEOUT_MS = 60_000;

// ── Init ──────────────────────────────────────────────────────────────────────

function _ensureRunDir() {
  if (!fs.existsSync(RUN_DIR)) fs.mkdirSync(RUN_DIR, { recursive: true });
}

// ── Execute ───────────────────────────────────────────────────────────────────

/**
 * Execute Python code in an isolated subprocess.
 * @param {object} params
 * @param {string} params.code        - Python code to execute
 * @param {number} [params.timeout_ms] - Max runtime in ms (default 60000)
 * @param {string} [params.language]  - 'python' (default) — extensible later
 * @param {string} [params.stdin]    - Optional stdin to feed before code runs
 * @returns {Promise<{ok, stdout, stderr, returncode, durationMs, error?}>}
 */
async function runCode({ code, timeout_ms = DEFAULT_TIMEOUT_MS, language = 'python', stdin = '' }) {
  _ensureRunDir();

  const startTime = Date.now();
  const requestId = crypto.randomBytes(4).toString('hex');
  
  // Write code to temp file
  const codeFile = path.join(RUN_DIR, `code-${requestId}.py`);
  fs.writeFileSync(codeFile, code, 'utf8');

  // Wrap with optional stdin injection
  const wrapped = stdin
    ? `${stdin}\n\n# === INJECTED STDIN ===\n__stdin_data__ = '''${stdin.replace(/'''/g, "\\'\\'\\'")}'''\n\n# === USER CODE ===\n${code}`
    : code;

  // Build the actual execution script that handles errors cleanly
  const execScript = [
    'import sys',
    'import traceback',
    'import json as __json',
    'import io as __io',
    '',
    '# Capture stdout/stderr',
    '__out__ = __io.StringIO()',
    '__err__ = __io.StringIO()',
    '__old_out__ = sys.stdout',
    '__old_err__ = sys.stderr',
    'sys.stdout = __out__',
    'sys.stderr = __err__',
    '',
    'try:',
    ...wrapped.split('\n').map(line => '    ' + line),
    '',
    'except SystemExit:',
    '    pass',
    'except Exception as __e:',
    '    traceback.print_exc(file=sys.stderr)',
    '',
    'finally:',
    '    sys.stdout = __old_out__',
    '    sys.stderr = __old_err__',
    '',
    '# Output result as JSON',
    '__result__ = {',
    '    "stdout": __out__.getvalue()[:' + MAX_STDOUT + '],',
    '    "stderr": __err__.getvalue()[:' + MAX_STDERR + '],',
    '    "ok": True',
    '}',
    'print(__json.dumps(__result__))',
  ].join('\n');

  const execFile = path.join(RUN_DIR, `exec-${requestId}.py`);
  fs.writeFileSync(execFile, execScript, 'utf8');

  // Clean up temp files after run
  const cleanup = () => {
    try { fs.unlinkSync(codeFile); } catch {}
    try { fs.unlinkSync(execFile); } catch {}
  };

  return new Promise((resolve) => {
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try { pid.kill('SIGTERM'); } catch {}
      cleanup();
      resolve({
        ok: false,
        stdout: '',
        stderr: '',
        returncode: -1,
        durationMs: Date.now() - startTime,
        error: `TIMEOUT after ${timeout_ms}ms`,
      });
    }, timeout_ms);

    const pid = spawn(
      'python',
      ['-u', execFile],  // -u = unbuffered for real-time capture
      {
        cwd: RUN_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          // Isolate: no LLM keys in code execution
          LLM_API_KEY: undefined,
          LLM_API_KEY_2: undefined,
          PURPCLAW_SANDBOX: '1',
        },
      }
    );

    let stdout = '';
    let stderr = '';

    pid.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > MAX_STDOUT * 2) stdout = stdout.slice(0, MAX_STDOUT * 2);
    });

    pid.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > MAX_STDERR * 2) stderr = stderr.slice(0, MAX_STDERR * 2);
    });

    pid.on('close', (code, signal) => {
      clearTimeout(timer);
      cleanup();
      if (killed) return; // already resolved with timeout

      const durationMs = Date.now() - startTime;

      // Try to parse JSON result
      try {
        // Find the last JSON object in stdout (in case of stray print statements)
        const trimmed = stdout.trim();
        const jsonMatch = trimmed.match(/\{[\s\S]*\}$/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        if (result) {
          resolve({
            ok: result.ok !== false,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            returncode: code || 0,
            durationMs,
          });
          return;
        }
      } catch {}

      // Fallback: raw output
      resolve({
        ok: code === 0,
        stdout: stdout.slice(0, MAX_STDOUT),
        stderr: stderr.slice(0, MAX_STDERR),
        returncode: code || 0,
        durationMs,
        error: code !== 0 ? `exit code ${code}` : undefined,
      });
    });

    pid.on('error', (err) => {
      clearTimeout(timer);
      cleanup();
      resolve({
        ok: false,
        stdout: '',
        stderr: '',
        returncode: -1,
        durationMs: Date.now() - startTime,
        error: 'process spawn failed: ' + err.message,
      });
    });
  });
}

// ── Tool Registration ─────────────────────────────────────────────────────────

function registerCodeInterpreter(registry) {
  registry.register({
    name: 'code_interpreter',
    description: 'Execute Python code in an isolated subprocess with resource limits. Returns stdout, stderr, and return code. Use for calculations, data processing, string manipulation, file operations, and running generated Python scripts. Timeout default is 60 seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python code to execute. Can include imports, function definitions, and any valid Python. Print output is captured and returned.',
        },
        timeout_ms: {
          type: 'integer',
          description: 'Maximum execution time in milliseconds (default 60000, max 300000).',
          default: 60000,
        },
        stdin: {
          type: 'string',
          description: 'Optional stdin data to inject as __stdin__ variable before running code.',
        },
      },
      required: ['code'],
    },
    execute: async (args) => {
      const { code, timeout_ms, stdin } = args;
      if (!code || typeof code !== 'string') {
        return { ok: false, error: 'code field is required and must be a string' };
      }
      if (code.length > 100_000) {
        return { ok: false, error: 'code exceeds 100KB limit' };
      }
      const effectiveTimeout = Math.min(
        parseInt(timeout_ms) || DEFAULT_TIMEOUT_MS,
        300_000
      );
      const result = await runCode({
        code,
        timeout_ms: effectiveTimeout,
        stdin: stdin || '',
      });
      // Format for tool result
      const output = [];
      if (result.stdout) output.push('# stdout\n' + result.stdout);
      if (result.stderr) output.push('# stderr\n' + result.stderr);
      if (result.error) output.push('# error: ' + result.error);
      output.push(`# returncode: ${result.returncode}  duration: ${result.durationMs}ms`);
      return {
        ok: result.ok,
        output: output.join('\n'),
        stdout: result.stdout,
        stderr: result.stderr,
        returncode: result.returncode,
        durationMs: result.durationMs,
        error: result.error || undefined,
      };
    },
  });
}

module.exports = { runCode, registerCodeInterpreter };
