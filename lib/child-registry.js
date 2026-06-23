'use strict';
/**
 * lib/child-registry.js — single source of truth for all spawned child
 * processes. Replaces the scattered `spawn()`, `exec()`, and
 * `spawnSync()` calls that were leaking detached cmd.exe windows
 * and orphaned node workers on Eddie's machine.
 *
 * Rules:
 *  - Every spawn goes through this module. No raw `spawn`/`exec` in
 *    other code unless the caller is a short-lived CLI one-shot.
 *  - All children are tracked. On `SIGINT`/`SIGTERM`/`beforeExit`/
 *    `uncaughtException`, every tracked child gets `kill('SIGTERM')`
 *    with a 2-second grace period, then `kill('SIGKILL')`.
 *  - No child is `detached: true`. The whole point of detached
 *    processes is to outlive the parent, and that's the leak.
 *  - Every spawn has a default hard timeout (60s for shells, 5min
 *    for training). The timeout kills the child if it overruns.
 *  - All spawns go through `windowsHide: true` so no new
 *    console windows pop up. We never use `cmd /c start`.
 *
 * If you need a child that survives the parent (e.g. a long-lived
 * daemon), write it to pm2 instead. Don't detach from this registry.
 */

const { spawn, exec } = require('child_process');
const path = require('path');

const DEFAULT_SHELL_TIMEOUT_MS  = 60_000;   // 60s for normal shell
const DEFAULT_TRAIN_TIMEOUT_MS  = 300_000;  // 5min for training jobs
const KILL_GRACE_MS             = 2_000;    // 2s between SIGTERM and SIGKILL

const children = new Set();
let cleanupInstalled = false;
let killInProgress = false;

/**
 * Wrap a `spawn()` result so it's tracked, time-bounded, and
 * auto-cleaned. Returns the ChildProcess with extra properties.
 */
function trackedSpawn(command, args = [], opts = {}) {
  const tag       = opts.tag || `${command} ${args.slice(0, 2).join(' ')}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS;
  const safeOpts  = {
    ...opts,
    detached: false,            // NEVER detached
    windowsHide: opts.windowsHide !== false,  // default true
    shell: opts.shell ?? false, // NEVER shell: true (DEP0190 security)
  };
  delete safeOpts.tag;
  delete safeOpts.timeoutMs;

  const child = spawn(command, args, safeOpts);
  const entry = {
    pid: child.pid,
    tag,
    command,
    args,
    startedAt: Date.now(),
    child,
    timeoutHandle: null,
    killed: false,
  };
  children.add(entry);

  // Hard timeout
  if (timeoutMs > 0) {
    entry.timeoutHandle = setTimeout(() => {
      if (entry.killed) return;
      entry.killed = true;
      try { process.stderr.write(`[child-registry] timeout ${tag} (${timeoutMs}ms), killing pid=${child.pid}\n`); } catch {}
      killChild(entry, 'SIGTERM');
    }, timeoutMs);
  }

  // Auto-cleanup on exit
  const onExit = () => untrack(entry);
  child.on('exit', () => {
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    onExit();
  });
  child.on('error', (e) => {
    try { process.stderr.write(`[child-registry] error in ${tag}: ${e.message}\n`); } catch {}
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    onExit();
  });

  return child;
}

function untrack(entry) {
  children.delete(entry);
  if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
}

function killChild(entry, signal) {
  if (!entry.child || entry.child.killed || entry.child.exitCode !== null) return;
  try { entry.child.kill(signal); } catch { /* already dead */ }
}

function killAll(signal = 'SIGTERM') {
  if (killInProgress) return;
  killInProgress = true;
  for (const entry of children) {
    entry.killed = true;
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    killChild(entry, signal);
  }
  // Wait KILL_GRACE_MS, then SIGKILL anything still alive
  setTimeout(() => {
    for (const entry of children) killChild(entry, 'SIGKILL');
    children.clear();
  }, KILL_GRACE_MS);
}

function installCleanup() {
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  process.on('SIGINT',  () => { killAll('SIGTERM'); process.exit(130); });
  process.on('SIGTERM', () => { killAll('SIGTERM'); process.exit(143); });
  process.on('beforeExit',     () => killAll('SIGTERM'));
  process.on('uncaughtException', (e) => {
    try { process.stderr.write(`[child-registry] uncaught: ${e?.stack || e}\n`); } catch {}
    killAll('SIGTERM');
    process.exit(1);
  });
}

/**
 * Run a command and wait for stdout/stderr. Resolves with the result.
 * This is the SAFE replacement for `exec()` — no shell, bounded, tracked.
 */
function execSafe(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = trackedSpawn(command, args, { ...opts, tag: opts.tag || `${command} ${args.join(' ')}` });
    let stdout = '', stderr = '';
    child.stdout?.on('data', d => stdout += d.toString());
    child.stderr?.on('data', d => stderr += d.toString());
    child.on('error', e => resolve({ ok: false, code: -1, stdout, stderr: stderr + e.message }));
    child.on('close', code => resolve({ ok: code === 0, code, stdout, stderr }));
  });
}

/**
 * Diagnostic: list tracked children (for debugging).
 */
function list() {
  return [...children].map(e => ({
    pid: e.pid, tag: e.tag, startedAt: e.startedAt,
    ageMs: Date.now() - e.startedAt, killed: e.killed,
  }));
}

module.exports = {
  trackedSpawn,
  execSafe,
  killAll,
  installCleanup,
  list,
  // Constants exported for tests
  DEFAULT_SHELL_TIMEOUT_MS,
  DEFAULT_TRAIN_TIMEOUT_MS,
};
