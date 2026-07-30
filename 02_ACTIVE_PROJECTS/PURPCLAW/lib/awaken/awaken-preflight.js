'use strict';

/**
 * lib/awaken/awaken-preflight.js
 * Phase 1 — ARM: verify truth before waking the stack.
 * Returns { ok, checks[] } where checks = [{ name, ok, detail }]
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PURP_DIR = path.join(__dirname, '..', '..');

async function preflightChecks() {
  const checks = [];

  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

  // ── 1. File structure ───────────────────────────────────────────────────────
  add('workspace/SOUL.md',    fs.existsSync(path.join(PURP_DIR, 'workspace', 'SOUL.md')));
  add('workspace/AGENTS.md',  fs.existsSync(path.join(PURP_DIR, 'workspace', 'AGENTS.md')));
  add('lib/awaken/',          fs.existsSync(path.join(PURP_DIR, 'lib', 'awaken')));
  add('agent_work/',          fs.existsSync(path.join(PURP_DIR, 'agent_work')));

  // ── 2. Node runtime ─────────────────────────────────────────────────────────
  try {
    const v = process.version;
    add('Node.js', true, v);
  } catch (e) {
    add('Node.js', false, e.message);
  }

  // ── 3. Git state ─────────────────────────────────────────────────────────────
  let gitDirty = false;
  let gitBranch = 'unknown';
  try {
    const status = execSync('git status --porcelain', {
      cwd: PURP_DIR, encoding: 'utf8', windowsHide: true, timeout: 5000,
    });
    gitDirty = status.trim().length > 0;
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: PURP_DIR, encoding: 'utf8', windowsHide: true, timeout: 5000,
    }).trim();
    add('git', !gitDirty, gitDirty ? `dirty (${gitBranch})` : `clean (${gitBranch})`);
  } catch (e) {
    add('git', false, 'unavailable');
    gitDirty = true; // treat as dirty so the run still proceeds but warns
  }

  // ── 4. Disk space (E: drive) ────────────────────────────────────────────────
  // WMIC not available on Win11 — use PowerShell
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'powershell -Command "(Get-PSDrive E).Free / 1MB -as [int]"',
        { encoding: 'utf8', windowsHide: true, timeout: 5000 }
      );
      const mb = parseInt(out.trim(), 10);
      add('E: drive space', mb > 500, `${mb.toLocaleString()} MB free`);
    }
  } catch {
    add('E: drive space', null, 'could not check');
  }

  // ── 5. Service health (sample probe) ────────────────────────────────────────
  // Probes up to 10 service ports with a 2s timeout per port.
  // HTTP errors are caught locally — no uncaughtException possible.
  try {
    const serviceRegistry = require(path.join(PURP_DIR, 'service_registry.js'));
    const services = serviceRegistry.getServices().filter(s => s.healthPort && s.healthPath);
    const pinged = await Promise.allSettled(
      services.slice(0, 10).map(s =>
        new Promise((resolve) => {
          const http = require('http');
          const req = http.get(`http://127.0.0.1:${s.healthPort}${s.healthPath}`, resolve);
          req.setTimeout(2000, () => { try { req.destroy(); } catch (_) {} resolve(false); });
          req.on('error', () => resolve(false)); // connection refused / unreachable — not an exception
        })
      )
    );
    const online = pinged.filter(r => r.status === 'fulfilled' && r.value === true).length;
    add('service health (sample)', online > 0, `${online}/${Math.min(services.length, 10)} ports responding`);
  } catch (e) {
    add('service health (sample)', null, 'unavailable');
  }

  // ── 6. Training data available ──────────────────────────────────────────────
  const trainingDir = process.env.PURPCLAW_TRAINING_DIR || 'E:/training';
  try {
    const feedbackDir = path.join(trainingDir, 'user-feedback');
    const hasFeedback = fs.existsSync(feedbackDir) && fs.readdirSync(feedbackDir).length > 0;
    add('training data', hasFeedback, hasFeedback ? 'user-feedback present' : 'no feedback data yet');
  } catch {
    add('training data', null, 'unavailable');
  }

  // ── 7. Evidence directory ────────────────────────────────────────────────────
  const evidenceDir = path.join(PURP_DIR, 'agent_work', 'awaken', 'evidence');
  const hasEvidence = fs.existsSync(evidenceDir);
  add('awaken/evidence/', hasEvidence || true, hasEvidence ? 'exists' : 'will be created');

  // ── 8. Self-evolution loop ──────────────────────────────────────────────────
  try {
        const sel = require(path.join(PURP_DIR, 'lib', 'self-evolution-loop'));
    const selStatus = sel.getStatus ? sel.getStatus() : {};
    add('self-evolution-loop', true, selStatus.running ? 'running' : 'idle');
  } catch {
    add('self-evolution-loop', null, 'not loaded');
  }

  // ── 9. Idle engine ──────────────────────────────────────────────────────────
  try {
    const idleStateFile = path.join(PURP_DIR, 'agent_work', '.idle_engine_state.json');
    if (fs.existsSync(idleStateFile)) {
      const idleState = JSON.parse(fs.readFileSync(idleStateFile, 'utf8'));
      add('idle-engine', true, `${idleState.sessionCount || 0} sessions, ${idleState.idleCycles || 0} cycles`);
    } else {
      add('idle-engine', null, 'no state file');
    }
  } catch {
    add('idle-engine', null, 'unavailable');
  }

  // ── 10. Awaken state ────────────────────────────────────────────────────────
  try {
    const awakenState = require('./awaken-state');
    const st = awakenState.read();
    add('awaken state', true, st.last_run_id ? `last run: ${st.last_run_id}` : 'no prior runs');
  } catch {
    add('awaken state', null, 'unavailable');
  }

  const failures = checks.filter(c => c.ok === false).length;
  const unknowns = checks.filter(c => c.ok === null).length;
  const ok = failures === 0;

  return {
    ok,
    checks,
    failures,
    unknowns,
    gitDirty,
    gitBranch,
    summary: ok
      ? `CLEAN — ${checks.filter(c => c.ok).length}/${checks.length} checks passed`
      : `ISSUES — ${failures} failed, ${unknowns} unknown (${checks.length} total)`,
  };
}

module.exports = { preflightChecks };
