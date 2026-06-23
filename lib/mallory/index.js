/**
 * Mallory Leash — Process Memory Watchdog
 * Detects and contain runaway Node.js / Python processes consuming excessive RAM.
 *
 * Rules:
 * - memory ceiling per process type
 * - process label
 * - auto-kill threshold
 * - restart policy
 * - log the offender
 * - Terminal Fly warning
 * - Goose ticket
 * - Fish verdict
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const MEMORY_CEILING_MB = {
  node:     512,   // Node.js services
  python:   384,   // Python cognitive services
  orchestrator: 1024, // orchestrator.js can grow big
  tower:    512,   // agent_tower.js
  goop:     256,   // GOOP engine
  default:  200,
};

const KILL_THRESHOLD_MB = {
  node:     800,   // kill at 800MB
  python:   600,   // kill at 600MB
  orchestrator: 1536,
  tower:    800,
  goop:     400,
  default:  350,
};

const ALERT_THRESHOLD_MB = {
  node:     400,
  python:   300,
  orchestrator: 768,
  tower:    400,
  goop:     200,
  default:  150,
};

const ALERT_LOG = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/logs/mallory-alerts.jsonl';
const PROCESS_KILL_LOG = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/logs/mallory-kills.jsonl';

/**
 * Get all running processes with memory usage (Windows).
 * Returns array of { pid, name, memoryMB, cmdline }
 */
function getProcessList() {
  return new Promise((resolve) => {
    exec('tasklist /FO CSV /NH', { timeout: 10000, windowsHide: true }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const lines = stdout.trim().split('\n').slice(0, 200);
      const procs = lines.map(line => {
        const parts = line.split('","').map(s => s.replace(/"/g, ''));
        if (parts.length < 5) return null;
        const name    = parts[0];
        const pid     = parseInt(parts[1]);
        const memStr  = parts[4].replace(/[^\d]/g, '');
        const memoryMB = parseInt(memStr) / 1024;
        return { pid, name, memoryMB, cmdline: '' };
      }).filter(Boolean);
      resolve(procs);
    });
  });
}

/**
 * Identify the type of a process by name.
 */
function classifyProcess(name) {
  const n = name.toLowerCase();
  if (n.includes('node.exe')) {
    if (n.includes('orchestrator')) return 'orchestrator';
    if (n.includes('tower') || n.includes('agent_tower')) return 'tower';
    return 'node';
  }
  if (n.includes('python') || n.includes('python3')) return 'python';
  if (n.includes('goop')) return 'goop';
  return 'default';
}

/**
 * Get the memory limit for a process type.
 */
function getLimit(type, limitType = 'ceiling') {
  const map = limitType === 'kill' ? KILL_THRESHOLD_MB
             : limitType === 'alert' ? ALERT_THRESHOLD_MB
             : MEMORY_CEILING_MB;
  return map[type] ?? map.default;
}

/**
 * Scan processes, return offenders above kill threshold.
 */
async function scanMallory() {
  const procs = await getProcessList();
  const offenders = [];
  const alerts = [];

  for (const proc of procs) {
    // Get detailed cmdline for classification hint
    const type = proc.name.toLowerCase().includes('python')
      ? 'python'
      : proc.name.toLowerCase().includes('node')
        ? 'node'
        : 'default';

    const killAt  = getLimit(type, 'kill');
    const alertAt = getLimit(type, 'alert');

    if (proc.memoryMB >= killAt) {
      offenders.push({ ...proc, type, limit: killAt, overageMB: proc.memoryMB - killAt });
    } else if (proc.memoryMB >= alertAt) {
      alerts.push({ ...proc, type, limit: alertAt, overageMB: proc.memoryMB - alertAt });
    }
  }

  return { offenders, alerts };
}

/**
 * Kill a process by PID (Windows).
 */
function killPid(pid, label = '') {
  return new Promise((resolve) => {
    const labelStr = label ? `[Mallory] ${label} PID=${pid} — ` : `[Mallory] PID=${pid} — `;
    exec(`taskkill /F /PID ${pid}`, { timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
      const entry = {
        ts: new Date().toISOString(),
        pid,
        label,
        killed: !err,
        output: err ? (stderr || err.message) : stdout.trim(),
      };

      const logDir = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/logs';
      try {
        fs.mkdirSync(logDir, { recursive: true });
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(path.join(logDir, 'mallory-kills.jsonl'), line);
      } catch (_) {}

      resolve(entry);
    });
  });
}

/**
 * Run one Mallory tick.
 * - scan
 * - kill offenders above threshold
 * - log alerts
 * - return summary
 */
async function malloryTick() {
  const { offenders, alerts } = await scanMallory();

  const killed  = [];
  const warned  = [];

  for (const p of offenders) {
    const result = await killPid(p.pid, p.name);
    killed.push({ pid: p.pid, name: p.name, mb: p.memoryMB.toFixed(1), overage: p.overageMB.toFixed(1) });
  }

  if (alerts.length > 0) {
    const logDir = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/logs';
    try {
      fs.mkdirSync(logDir, { recursive: true });
      for (const a of alerts) {
        const entry = { ts: new Date().toISOString(), type: 'alert', ...a };
        fs.appendFileSync(path.join(logDir, 'mallory-alerts.jsonl'), JSON.stringify(entry) + '\n');
      }
    } catch (_) {}
    warned.push(...alerts.map(a => ({ name: a.name, mb: a.memoryMB.toFixed(1) })));
  }

  return {
    ts: new Date().toISOString(),
    killed,
    warned,
    malloryActive: offenders.length > 0 || alerts.length > 0,
    offenderCount: offenders.length,
    alertCount: alerts.length,
  };
}

/**
 * Human-readable status line for Terminal Fly.
 */
function malloryStatus(summary) {
  if (!summary || !summary.malloryActive) {
    return 'Mallory: quiet. No RAM goblins detected.';
  }
  const parts = [];
  if (summary.killed.length) {
    parts.push(`${summary.killed.length} process(es) yeeted${summary.killed.map(p => ` ${p.name}(${p.mb}MB)`).join('')}`);
  }
  if (summary.warned.length) {
    parts.push(`${summary.warned.length} warning(s)${summary.warned.map(p => ` ${p.name}(${p.mb}MB)`).join('')}`);
  }
  return `Mallory: ${parts.join('; ')}`;
}

module.exports = {
  scanMallory,
  killPid,
  malloryTick,
  malloryStatus,
  getProcessList,
  getLimit,
  KILL_THRESHOLD_MB,
  ALERT_THRESHOLD_MB,
};
