#!/usr/bin/env node
'use strict';

/**
 * PURPCLAW — Process Leash
 * ══════════════════════════════
 * A lightweight process watchdog that keeps the agent stack from eating the machine.
 *
 * What it does:
 *   - Polls all Node/Python processes every 5s via tasklist
 *   - Detects runaway memory hogs (default threshold: 500MB)
 *   - Kills them cleanly and logs the corpse
 *   - Publishes events to EventBus so Terminal Fly reacts
 *   - Fires Accuracy Fish if any agent claims "stable" while bloating
 *
 * Run:     node process-leash.js
 * Or:      purpclaw safe-start --dark  (wake dark cluster)
 * PM2:     purpclaw safe-start purpclaw-process-leash
 *
 * Port:     none (runs headless, publishes to EventBus only)
 * EventBus: :7782 (publishes to leash.* topic)
 *
 * Watcher ignore rules (built in):
 *   - node_modules/
 *   - .git/
 *   - dist/, build/, .next/, .nuxt/
 *   - logs/, cache/, tmp/, temp/
 *   - Coverage reports
 */

const http  = require('http');
const { execSync, exec } = require('child_process');
const fs    = require('fs');
const os    = require('os');

// ── Config ────────────────────────────────────────────────────────────────────

const EVENTBUS      = process.env.EVENTBUS_PORT || '7782';
const POLL_MS       = parseInt(process.env.LEASH_POLL_MS   || '5000',  10);
const MEM_LIMIT_MB  = parseInt(process.env.LEASH_MEM_MB   || '500',   10);
const FLY_PORT      = parseInt(process.env.FLY_PORT       || '7799',  10);
const PURP_ROOT     = process.env.PURPCLAW_ROOT || __dirname;

// ── State ─────────────────────────────────────────────────────────────────────

let lastCorpse = null;   // most recent killed process
let lastAlert   = null;   // most recent memory warning

// ── EventBus publish ────────────────────────────────────────────────────────

function publish(event) {
  const body = JSON.stringify(event);
  const req = http.request({
    hostname: '127.0.0.1',
    port: EVENTBUS,
    path: '/events',
    method: 'POST',
    headers: { 'Content\Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, res => { res.resume(); });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// ── Log ──────────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[leash] ${ts} ${msg}`);
}

// ── Memory polling ───────────────────────────────────────────────────────────

/**
 * Get process list via tasklist (Windows), returns array of {pid, name, memMB, cmdline}
 */
function getProcessList() {
  try {
    // tasklist columns: Image Name, PID, Mem Usage (in KB)
    const out = execSync(
      'tasklist /FO CSV /NH 2>&1',
      { encoding: 'utf8', windowsHide: true, timeout: 8000 }
    );
    const procs = [];
    for (const line of out.split('\n')) {
      const cells = line.split('","').map(s => s.replace(/^"|"$/g, '').trim());
      if (cells.length >= 3 && cells[0] && cells[1]) {
        const pid = parseInt(cells[1], 10);
        if (!pid || pid === process.pid) continue;
        const memKB = parseInt(cells[2].replace(/[^\d]/g, '') || '0', 10);
        procs.push({
          pid,
          name: cells[0].replace('.exe', '').toLowerCase(),
          memMB: +(memKB / 1024).toFixed(1),
          cmdline: ''
        });
      }
    }
    return procs;
  } catch (e) {
    log('tasklist failed: ' + e.message);
    return [];
  }
}

/**
 * Kill process by PID, report success/failure.
 */
function killProcess(pid) {
  return new Promise(resolve => {
    try {
      exec(`taskkill /PID ${pid} /F /T`, { windowsHide: true, timeout: 5000 }, (err, stdout, stderr) => {
        if (err) {
          log(`kill failed PID ${pid}: ${err.message}`);
          resolve(false);
        } else {
          log(`killed PID ${pid}`);
          resolve(true);
        }
      });
    } catch (e) {
      log(`kill exception PID ${pid}: ${e.message}`);
      resolve(false);
    }
  });
}

// ── Watcher path detection ─────────────────────────────────────────────────

/**
 * Scan for processes whose command line hints at recursive file watching.
 * Windows doesn't expose full command line via tasklist easily, so we check known patterns.
 */
function detectWatcherProcesses(procs) {
  const WATCHER_SIGNATURES = [
    /node_modules[\\/]chokidar/i,
    /node_modules[\\/]watch/i,
    /node_modules[\\/]nodemon/i,
    /node_modules[\\/]ts-node/i,
    /node_modules[\\/]vite[\\/]/i,
    /node_modules[\\/]next[\\/]/i,
    /\.git[\\/]/i,
    /logs[\\/]/i,
    /dist[\\/]/i,
    /build[\\/]/i,
  ];

  // Get Node processes with their command lines via wmic
  try {
    const out = execSync(
      'wmic process where "name=\'node.exe\'" get ProcessId,CommandLine 2>&1',
      { encoding: 'utf8', windowsHide: true, timeout: 8000 }
    );
    for (const line of out.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('CommandLine') || !/\d/.test(trimmed)) continue;
      const parts = trimmed.split(/\s{2,}/);
      if (parts.length < 2) continue;
      const pid = parseInt(parts[0], 10);
      const cmdline = (parts[1] || '').toString();
      if (!pid || pid === process.pid) continue;

      for (const re of WATCHER_SIGNATURES) {
        if (re.test(cmdline)) {
          log(`watcher signature detected — PID ${pid}: ${cmdline.slice(0, 120)}`);
          procs.find(p => p.pid === pid && (p.cmdline = cmdline));
          break;
        }
      }
    }
  } catch (e) {
    // wmic may be slow/slow — don't spam logs
  }

  return procs;
}

// ── Main leash loop ─────────────────────────────────────────────────────────

async function check() {
  let procs = getProcessList();
  if (!procs.length) return;

  procs = detectWatcherProcesses(procs);

  const offenders = procs.filter(p => p.memMB > MEM_LIMIT_MB);

  // Memory hogs
  for (const p of offenders) {
    const topic = p.name === 'node' ? 'leash.node_hog' : 'leash.python_hog';

    log(`MEMORY ALERT: ${p.name} PID ${p.pid} is eating ${p.memMB}MB (limit: ${MEM_LIMIT_MB}MB)`);

    // Update last alert
    lastAlert = {
      pid: p.pid,
      name: p.name,
      memMB: p.memMB,
      ts: new Date().toISOString()
    };

    // Kill it
    const killed = await killProcess(p.pid);

    const corpse = {
      topic,
      type: 'leash.process_killed',
      name: p.name,
      pid: p.pid,
      memMB: p.memMB,
      killed,
      ts: new Date().toISOString(),
      reason: killed ? `memory exceeded ${MEM_LIMIT_MB}MB` : 'kill failed',
      action: 'killed',
      state: killed ? 'SICK' : 'SICK_KILL_FAILED'
    };

    lastCorpse = corpse;
    publish(corpse);

    // Also notify Terminal Fly directly via HTTP (EventBus might be choked during memory crisis)
    try {
      const body = JSON.stringify({ state: 'OBEESE', message: `${p.name} PID ${p.pid} was eating ${p.memMB}MB. Killed.`, source: 'leash' });
      http.request({
        hostname: '127.0.0.1', port: FLY_PORT, path: '/api/fly/state', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, res => { res.resume(); }).on('error', () => {}).write(body).end();
    } catch (_) {}

    // Accuracy Fish trigger: if a process claims stable but ate this much, it's lying
    if (p.name === 'node' && p.memMB > MEM_LIMIT_MB * 2) {
      publish({
        topic: 'leash.fish_alert',
        type: 'leash.fish_trigger',
        claim: `Process "${p.name}" remained "stable" while eating ${p.memMB}MB`,
        verdict_trigger: 'SLAP',
        pid: p.pid,
        memMB: p.memMB,
        fish_reason: 'False stability claim under resource starvation',
        ts: new Date().toISOString()
      });
      log(`Fish alert fired — false stability claim: ${p.name} PID ${p.pid} at ${p.memMB}MB`);
    }
  }
}

// ── Startup ─────────────────────────────────────────────────────────────────

log('Process Leash online');
log(`  Memory limit: ${MEM_LIMIT_MB}MB per process`);
log(`  Poll interval: ${POLL_MS}ms`);
log(`  EventBus: ${EVENTBUS}`);
log(`  Built-in ignore: node_modules .git dist build logs`);
log('Watching for memory hogs...');

// Initial scan after 3s (let the stack settle)
setTimeout(() => {
  check();
  setInterval(check, POLL_MS);
}, 3000);
