'use strict';
/**
 * lib/idle-engine.js — The Beast That Wakes When You Stop Typing
 * ════════════════════════════════════════════════════════════════════
 *
 * PurpClaw has two modes:
 *   ACTIVE — user is chatting, working, correcting
 *   IDLE   — no user activity. The beast wakes up.
 *
 * This module is the handoff layer. When a session ends (agent loop
 * emits 'done', chat closes, TUI exits), the idle engine fires:
 *
 *   1. Export personal dataset from session feedback
 *   2. Run memory consolidation (AutoDream)
 *   3. Queue LoRA training if enough new data accumulated
 *   4. Run system diagnostics
 *   5. Self-optimize: merge adapters, update active model
 *
 * The pipeline is aggressive. It uses idle time to make the next
 * session smarter than the last. No human watching. No prompts needed.
 *
 * Configuration (env vars):
 *   PURPCLAW_IDLE_DELAY_MS    — ms of inactivity before firing (default: 30000)
 *   PURPCLAW_IDLE_AUTO_TRAIN  — auto-trigger LoRA training (default: '1')
 *   PURPCLAW_IDLE_MIN_NEW     — min new corrections before auto-train (default: 5)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PURP_DIR = path.resolve(__dirname, '..');
const IDLE_STATE_FILE = path.join(PURP_DIR, 'agent_work', '.idle_engine_state.json');
const IDLE_LOG_FILE = path.join(PURP_DIR, 'agent_work', 'idle_engine.log');

const IDLE_DELAY_MS = parseInt(process.env.PURPCLAW_IDLE_DELAY_MS || '30000', 10);
const AUTO_TRAIN = process.env.PURPCLAW_IDLE_AUTO_TRAIN !== '0';
const MIN_NEW = parseInt(process.env.PURPCLAW_IDLE_MIN_NEW || '5', 10);

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  active: false,           // is user currently active?
  lastActivityAt: null,    // ISO timestamp of last user interaction
  sessionCount: 0,         // total sessions this run
  idleCycles: 0,           // how many idle optimization cycles fired
  currentPhase: null,      // what the engine is doing right now
  phases: {},              // per-phase stats
  lastIdleRun: null,       // when the last idle cycle completed
  totalCorrectionsProcessed: 0,
  totalDatasetsExported: 0,
  totalTrainingRunsQueued: 0,
};

function loadState() {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(IDLE_STATE_FILE, 'utf8')) }; } catch {}
}
function saveState() {
  try {
    fs.mkdirSync(path.dirname(IDLE_STATE_FILE), { recursive: true });
    fs.writeFileSync(IDLE_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {}
}

loadState();

// ── Logging ────────────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[idle-engine ${ts}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(IDLE_LOG_FILE), { recursive: true });
    fs.appendFileSync(IDLE_LOG_FILE, line + '\n', 'utf8');
  } catch {}
}

// ── Activity tracking ──────────────────────────────────────────────────────
function markActive(source = 'unknown') {
  state.active = true;
  state.lastActivityAt = new Date().toISOString();
  saveState();
}

function markIdle(source = 'session-end') {
  state.active = false;
  state.lastActivityAt = new Date().toISOString();
  state.sessionCount++;
  saveState();
  log(`Session ended (${source}). Session #${state.sessionCount}. Idle engine watching...`);

  // Schedule the idle optimization cycle
  setTimeout(() => runIdleCycle(source), IDLE_DELAY_MS);
}

// ── Idle optimization cycle ────────────────────────────────────────────────
async function runIdleCycle(trigger = 'timer') {
  // Don't run if user became active again
  if (state.active) {
    log('User became active — skipping idle cycle');
    return { skipped: true, reason: 'user-active' };
  }

  state.idleCycles++;
  state.currentPhase = 'starting';
  state.lastIdleRun = new Date().toISOString();
  saveState();

  log(`═══ Idle cycle #${state.idleCycles} starting (trigger: ${trigger}) ═══`);
  const results = { cycle: state.idleCycles, phases: {} };

  // ── Phase 1: Export personal dataset ──────────────────────────────────
  try {
    state.currentPhase = 'dataset-export';
    saveState();
    log('Phase 1/5: Exporting personal dataset...');

    const PD = require('./training/personal-dataset');
    const exported = PD.exportToFile('chatml');

    if (exported.ready) {
      results.phases.dataset = { ok: true, count: exported.count, path: exported.path };
      state.totalDatasetsExported++;
      log(`  ✓ Dataset exported: ${exported.count} examples → ${exported.path}`);
    } else {
      results.phases.dataset = { ok: false, reason: exported.reason };
      log(`  ○ Dataset skipped: ${exported.reason}`);
    }
  } catch (e) {
    results.phases.dataset = { ok: false, error: e.message };
    log(`  ✗ Dataset export failed: ${e.message}`);
  }

  // ── Phase 2: Memory consolidation (AutoDream) ─────────────────────────
  try {
    state.currentPhase = 'memory-consolidation';
    saveState();
    log('Phase 2/5: Memory consolidation...');

    const FB = require('./user-feedback');
    const fbStatus = FB.status();
    const newSinceLast = fbStatus.stats.corrections - (state.totalCorrectionsProcessed || 0);
    state.totalCorrectionsProcessed = fbStatus.stats.corrections;

    // Trigger AutoDream via cognitive spine
    const http = require('http');
    const dreamResult = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1', port: 7880, path: '/autodream/consolidate',
        method: 'POST', timeout: 30000,
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
      });
      req.on('error', () => resolve(null));
      req.end(JSON.stringify({ source: 'idle-engine', newCorrections: newSinceLast }));
    });

    results.phases.memory = { ok: !!dreamResult, newCorrections: newSinceLast };
    log(`  ${dreamResult ? '✓' : '○'} Memory consolidation ${dreamResult ? 'triggered' : 'skipped (spine unreachable)'}`);
  } catch (e) {
    results.phases.memory = { ok: false, error: e.message };
    log(`  ○ Memory consolidation skipped: ${e.message}`);
  }

  // ── Phase 3: Run diagnostics ──────────────────────────────────────────
  try {
    state.currentPhase = 'diagnostics';
    saveState();
    log('Phase 3/5: System diagnostics...');

    const http = require('http');
    const diagResult = await new Promise((resolve) => {
      const req = http.get({ hostname: '127.0.0.1', port: 7880, path: '/diagnostics/run', timeout: 15000 }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
      });
      req.on('error', () => resolve(null));
    });

    results.phases.diagnostics = { ok: !!diagResult };
    log(`  ${diagResult ? '✓' : '○'} Diagnostics ${diagResult ? 'complete' : 'skipped'}`);
  } catch (e) {
    results.phases.diagnostics = { ok: false, error: e.message };
  }

  // ── Phase 4: Check training readiness ─────────────────────────────────
  try {
    state.currentPhase = 'training-check';
    saveState();
    log('Phase 4/5: Checking training readiness...');

    const PD = require('./training/personal-dataset');
    const pStats = PD.stats();
    const totalPersonal = pStats.corrections + pStats.preferences + pStats.edits;

    results.phases.trainingCheck = {
      totalPersonal,
      ready: totalPersonal >= MIN_NEW,
    };

    if (totalPersonal >= MIN_NEW && AUTO_TRAIN) {
      log(`  ✓ ${totalPersonal} personal examples — training eligible`);
    } else {
      log(`  ○ ${totalPersonal}/${MIN_NEW} examples — not enough for auto-train yet`);
    }
  } catch (e) {
    results.phases.trainingCheck = { ok: false, error: e.message };
  }

  // ── Phase 5: Auto-train if ready ──────────────────────────────────────
  if (results.phases.trainingCheck && results.phases.trainingCheck.ready && AUTO_TRAIN) {
    try {
      state.currentPhase = 'auto-training';
      saveState();
      log('Phase 5/5: Auto-training personal LoRA...');

      const PD = require('./training/personal-dataset');
      const exported = PD.exportToFile('chatml');
      const scriptPath = path.join(PURP_DIR, 'scripts', 'lora-train.py');
      const py = process.env.PYTHON_BIN || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';

      if (exported.ready && exported.path) {
        state.totalTrainingRunsQueued++;
        log(`  Launching: ${py} ${scriptPath} --personal-dataset ${exported.path} --merge`);

        const child = spawn(py, [scriptPath, '--personal-dataset', exported.path, '--merge', '--epochs', '1'], {
          cwd: PURP_DIR,
          stdio: 'pipe',
          env: { ...process.env, PURPCLAW_TRAINING_MODE: 'personal-idle', PURPCLAW_PERSONAL_DATASET: exported.path },
        });

        let output = '';
        child.stdout.on('data', d => output += d.toString());
        child.stderr.on('data', d => output += d.toString());

        await new Promise((resolve) => {
          child.on('exit', (code) => {
            results.phases.training = { ok: code === 0, exitCode: code, output: output.substring(0, 2000) };
            log(`  ${code === 0 ? '✓' : '✗'} Training ${code === 0 ? 'complete' : `failed (exit ${code})`}`);
            resolve();
          });
        });
      } else {
        results.phases.training = { ok: false, reason: 'dataset not ready' };
      }
    } catch (e) {
      results.phases.training = { ok: false, error: e.message };
      log(`  ✗ Auto-training failed: ${e.message}`);
    }
  } else {
    results.phases.training = { ok: false, reason: 'not ready or auto-train disabled' };
    log('Phase 5/5: Auto-training skipped (not ready or disabled)');
  }

  state.currentPhase = 'idle';
  saveState();
  log(`═══ Idle cycle #${state.idleCycles} complete ═══`);
  log(`Results: dataset=${results.phases.dataset?.ok ? '✓' : '○'} memory=${results.phases.memory?.ok ? '✓' : '○'} diag=${results.phases.diagnostics?.ok ? '✓' : '○'} train=${results.phases.training?.ok ? '✓' : '○'}`);

  return results;
}

// ── Status ─────────────────────────────────────────────────────────────────
function status() {
  const PD = (() => { try { return require('./training/personal-dataset'); } catch { return null; } })();
  const FB = (() => { try { return require('./user-feedback'); } catch { return null; } })();

  let personalStats = { corrections: 0, preferences: 0, edits: 0 };
  let feedbackStats = { total: 0 };
  if (PD) personalStats = PD.stats();
  if (FB) feedbackStats = FB.status().stats;

  return {
    ...state,
    personalStats,
    feedbackTotal: feedbackStats.total,
    idleDelayMs: IDLE_DELAY_MS,
    autoTrainEnabled: AUTO_TRAIN,
    minNewForTrain: MIN_NEW,
    readyForAutoTrain: (personalStats.corrections + personalStats.preferences + personalStats.edits) >= MIN_NEW,
  };
}

// ── Force trigger (CLI: purpclaw idle trigger) ────────────────────────────
async function forceTrigger() {
  markIdle('manual-trigger');
  return runIdleCycle('manual');
}

module.exports = {
  markActive,
  markIdle,
  runIdleCycle,
  forceTrigger,
  status,
  state: () => state,
};
