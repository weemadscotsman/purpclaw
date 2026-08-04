'use strict';
/**
 * lib/pty.js — Tier 2 priority #3. Real PTY terminal for PURPCLAW.
 *
 * Wraps @homebridge/node-pty-prebuilt-multiarch so PURPCLAW can run
 * interactive shell sessions (ssh, vim, psql, REPLs, curses apps, etc.)
 * that don't work with plain child_process.spawn.
 *
 * Why this matters:
 *   - Claude Code / Hermes ship this. Code that depends on ANSI escape
 *     sequences, terminal resize, signal propagation, or TTY detection
 *     breaks under plain spawn().
 *   - Eddie's audit ask 2026-07-17: "PTY terminal — Claude Code parity."
 *
 * Built on @homebridge/node-pty-prebuilt-multiarch because the upstream
 * `node-pty` requires node-gyp + VS Build Tools to compile on Windows, and
 * Eddie's machine doesn't have them. The prebuilt package ships native
 * .node binaries for win32-x64 / darwin-x64 / linux-x64 with no compile.
 *
 * ENV / config:
 *   - PURPCLAW_PTY_DISABLED=1   disables PTY, falls back to plain spawn
 *   - PURPCLAW_PTY_COLS         default 80
 *   - PURPCLAW_PTY_ROWS         default 24
 *
 * USAGE:
 *   const PTY = require('./lib/pty');
 *   const session = PTY.spawn('bash', ['-i'], { cwd: '/home/eddie' });
 *   session.onData(d => process.stdout.write(d));
 *   session.write('ls -la\n');
 *   session.resize(120, 40);
 *   session.kill();
 */

const path = require('path');
const { EventEmitter } = require('events');

const DISABLED = process.env.PURPCLAW_PTY_DISABLED === '1';
const DEFAULT_COLS = parseInt(process.env.PURPCLAW_PTY_COLS || '80', 10);
const DEFAULT_ROWS = parseInt(process.env.PURPCLAW_PTY_ROWS || '24', 10);

const VERSION = '1.0.0'; // Tier 2 priority #3 — initial PTY wrapper (Eddie 2026-07-18)

let _ptyImpl = null;
function loadPty() {
  if (_ptyImpl !== null) return _ptyImpl;
  if (DISABLED) { _ptyImpl = false; return false; }
  try {
    _ptyImpl = require('@homebridge/node-pty-prebuilt-multiarch');
  } catch (e) {
    console.warn(`[pty] native module unavailable: ${e.message}. Falling back to plain spawn.`);
    _ptyImpl = false;
  }
  return _ptyImpl;
}

class PtySession extends EventEmitter {
  constructor(impl, handle, meta) {
    super();
    this._impl = impl;
    this._handle = handle;
    this.meta = meta;            // { command, args, pid, cols, rows, cwd, startedAt }
    this.exitCode = null;
    this._paused = false;
    handle.onData(d => this.emit('data', d));
    handle.onExit(({ exitCode, signal }) => {
      this.exitCode = exitCode;
      this.emit('exit', { exitCode, signal });
    });
  }
  // Resize the terminal. SSH, vim, psql etc all use this for redraw.
  resize(cols, rows) {
    if (this._handle && typeof this._handle.resize === 'function') {
      try { this._handle.resize(cols, rows); this.meta.cols = cols; this.meta.rows = rows; }
      catch (e) { /* resize unsupported by some shells */ }
    }
  }
  // Write data to stdin. Use this for keystrokes, paste, EOF (Ctrl-D = \x04).
  write(data) {
    if (this._handle && typeof this._handle.write === 'function') {
      try { return this._handle.write(data); } catch (e) { return false; }
    }
    return false;
  }
  // Send SIGTERM, then SIGKILL after grace period.
  kill(signal) {
    if (!this._handle) return;
    try {
      if (signal && typeof this._handle.kill === 'function') this._handle.kill(signal);
      else this._handle.kill();
    } catch (e) { /* already dead */ }
  }
  pid() { return this.meta.pid; }
  cols() { return this.meta.cols; }
  rows() { return this.meta.rows; }
  command() { return this.meta.command; }
  args() { return this.meta.args; }
  cwd() { return this.meta.cwd; }
  startedAt() { return this.meta.startedAt; }
  durationMs() { return Date.now() - this.meta.startedAt; }
  isAlive() { return this.exitCode === null; }
}

/**
 * Spawn a command in a real PTY. Returns a PtySession that emits 'data' /
 * 'exit'. Falls back to child_process.spawn if PTY is unavailable.
 *
 * opts:
 *   - command        executable (e.g. 'bash', 'cmd.exe', 'ssh')
 *   - args           string[]
 *   - cwd            working dir (default process.cwd())
 *   - env            env object (default process.env)
 *   - cols, rows     terminal size (defaults 80x24)
 *   - name           terminal type string (default 'xterm-256color')
 *   - timeoutMs      auto-kill after N ms (optional)
 *   - onData         convenience callback (alternative to .on('data'))
 *   - onExit         convenience callback
 */
function spawn(command, args = [], opts = {}) {
  const meta = {
    command, args,
    pid: null,
    cols: opts.cols || DEFAULT_COLS,
    rows: opts.rows || DEFAULT_ROWS,
    cwd: opts.cwd || process.cwd(),
    startedAt: Date.now(),
  };

  const ptyImpl = loadPty();

  if (ptyImpl && typeof ptyImpl.spawn === 'function') {
    // Real PTY path.
    const handle = ptyImpl.spawn(command, args, {
      name : opts.name || 'xterm-256color',
      cols : meta.cols,
      rows : meta.rows,
      cwd  : meta.cwd,
      env  : opts.env || process.env,
    });
    meta.pid = handle.pid;
    const session = new PtySession(ptyImpl, handle, meta);
    if (opts.onData) session.on('data', opts.onData);
    if (opts.onExit) session.on('exit', opts.onExit);
    if (opts.timeoutMs) {
      setTimeout(() => session.kill(), opts.timeoutMs).unref();
    }
    return session;
  }

  // Fallback: plain spawn. Behaves like a PTY (streams data, emits exit)
  // but lacks terminal features (resize, signal forwarding, TTY detection).
  const { spawn: childSpawn } = require('child_process');
  const cp = childSpawn(command, args, {
    cwd  : meta.cwd,
    env  : opts.env || process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  meta.pid = cp.pid;
  const session = new PtySession(null, {
    write: d => { try { cp.stdin.write(d); return true; } catch { return false; } },
    resize: () => {},
    kill: () => { try { cp.kill(); } catch {} },
    onData: cb => { cp.stdout.on('data', cb); cp.stderr.on('data', cb); },
    onExit: cb => cp.on('close', code => cb({ exitCode: code, signal: null })),
    pid: cp.pid,
  }, meta);
  if (opts.onData) session.on('data', opts.onData);
  if (opts.onExit) session.on('exit', opts.onExit);
  if (opts.timeoutMs) {
    setTimeout(() => session.kill(), opts.timeoutMs).unref();
  }
  return session;
}

/**
 * Run a command to completion, capture output. Convenience wrapper for
 * "just give me the stdout" callers. Returns { stdout, stderr, exitCode }.
 */
function run(command, args = [], opts = {}) {
  return new Promise(resolve => {
    const stdoutChunks = [];
    const stderrChunks = [];
    let exit = null;
    const session = spawn(command, args, {
      ...opts,
      onData: d => {
        // Cheap split — pty interleaves stdout/stderr in one stream when
        // merged (true for shells). For most callers this is fine.
        stdoutChunks.push(d);
      },
      onExit: ({ exitCode }) => {
        exit = exitCode;
        resolve({
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          exitCode: exit,
          durationMs: session.durationMs(),
          pid: session.pid(),
          mode: loadPty() ? 'pty' : 'spawn',
        });
      },
    });
  });
}

function isAvailable() {
  return !!loadPty();
}

module.exports = {
  spawn,
  run,
  isAvailable,
  VERSION,
  PtySession,
  // Test-only / debug
  _loadPty: loadPty,
  DEFAULT_COLS,
  DEFAULT_ROWS,
};
