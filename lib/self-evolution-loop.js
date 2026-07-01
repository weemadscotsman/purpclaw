'use strict';

/**
 * PURPCLAW Self-Evolution Loop
 * ============================
 * Runs automatically on a timer. Each tick:
 *   1. Picks a research topic based on recent agent failures / knowledge gaps
 *   2. Fires a deep-research-group run via OpenRouter free models
 *   3. Ingests synthesis into memory matrix so agents recall it next mission
 *   4. Records the loop tick to agent_work/evolution-log.jsonl
 *
 * Real LLM research → real memory ingest → real recall.
 */

const fs   = require('fs');
const path = require('path');
const mem  = require('./memory-client');
const canonicalMemorySync = (() => {
  try { return require('./canonical-memory-sync'); } catch { return null; }
})();

let deepResearch = null;
try { deepResearch = require('./deep-research-group'); } catch {}

const LOG_FILE    = path.join(__dirname, '..', 'agent_work', 'evolution-log.jsonl');
const LEDGER_FILE = path.join(__dirname, '..', 'agent_work', 'llm-ledger.jsonl');

// ── Throttle config (all overridable via .env) ──────────────────────────────
// This loop used to fire 6 models every 30 min, 24/7, with no brakes — it tore
// through the OpenRouter + MiniMax APIs. Now it has a cooldown, a daily ceiling,
// a spend circuit-breaker, and jitter so it can never run away again.
const TICK_MS         = parseInt(process.env.EVOLUTION_TICK_MS     || String(2 * 60 * 60 * 1000), 10); // 2h (was 30m)
const TICK_JITTER_MS  = parseInt(process.env.EVOLUTION_JITTER_MS   || String(15 * 60 * 1000), 10);     // ±15m spread
const MIN_COOLDOWN_MS = parseInt(process.env.EVOLUTION_COOLDOWN_MS || String(20 * 60 * 1000), 10);     // hard floor between ticks
const MAX_MODELS      = parseInt(process.env.EVOLUTION_MODELS      || '3',  10);                        // per tick (was 6)
const MAX_TICKS_DAY   = parseInt(process.env.EVOLUTION_MAX_TICKS_PER_DAY || '8', 10);                   // daily tick cap
const DAILY_COST_USD  = parseFloat(process.env.EVOLUTION_DAILY_COST_USD  || '0.50');                    // total-spend breaker
const ENABLED         = process.env.EVOLUTION_DISABLED !== '1';

// ── Karpathy ratchet: research → learn → bake into a LoRA. Every Nth tick, if a
// training dataset is ready, fire a real 6GB-VRAM QLoRA run (scripts/lora-train.py
// already does 4-bit nf4). Spine-tracked; the adapter stays "pending eval +
// gatekeeper" — it does NOT auto-activate. ──
const { spawn } = require('child_process');
const LORA_ENABLED     = process.env.EVOLUTION_TRAIN !== '0';     // set 0 to research-only
const LORA_TRAIN_EVERY = parseInt(process.env.EVOLUTION_TRAIN_EVERY || '6', 10);   // train every Nth tick
const LORA_COOLDOWN_MS = parseInt(process.env.EVOLUTION_TRAIN_COOLDOWN_MS || String(6 * 60 * 60 * 1000), 10); // 6h floor
// Training runs on the E: CUDA venv (per the no-C:-drive rule). The venv has the
// GPU torch build; the C: base python is CPU-only. Fall back to base if the venv
// isn't present yet (training will then pause with the honest no-CUDA blocker).
const VENV_PY          = 'E:/purpclaw-venv/Scripts/python.exe';
const PY_BIN           = process.env.LORA_PYTHON || (fs.existsSync(VENV_PY) ? VENV_PY : (process.env.PYTHON_BIN || 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe'));

let _timer      = null;
let _running    = false;
let _lastTick   = null;
let _lastResult = null;
let _tickCount  = 0;
let _lastTickMs = 0;     // wall-clock of last attempt, for cooldown
let _backoff    = 1;     // multiplier, grows on error, resets on success
let _lastTrainMs = 0;    // wall-clock of last training launch (cooldown)
let _training    = false;// a LoRA run is currently in flight
let _trainPausedUntil = 0;// wall-clock until which training is paused (e.g. no-CUDA blocker)

// ── Guards: cooldown, daily tick cap, spend circuit-breaker ─────────────────
const _todayKey = () => new Date().toISOString().slice(0, 10);

function ticksToday() {
  try {
    const day = _todayKey();
    return fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n')
      .filter(l => l.includes(day))
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(t => t && (t.startedAt || '').slice(0, 10) === day).length;
  } catch { return 0; }
}

function spendToday() {
  try {
    const day = _todayKey();
    return fs.readFileSync(LEDGER_FILE, 'utf8').trim().split('\n')
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e && (e.timestamp || '').slice(0, 10) === day)
      .reduce((sum, e) => sum + (e.estimatedCost || 0), 0);
  } catch { return 0; }
}

// Returns null if OK to run, or a string reason to skip.
function throttleReason() {
  if (Date.now() - _lastTickMs < MIN_COOLDOWN_MS) {
    return `cooldown — ${Math.ceil((MIN_COOLDOWN_MS - (Date.now() - _lastTickMs)) / 60000)}m left`;
  }
  const n = ticksToday();
  if (n >= MAX_TICKS_DAY) return `daily tick cap reached (${n}/${MAX_TICKS_DAY})`;
  const spent = spendToday();
  if (spent >= DAILY_COST_USD) return `spend breaker — $${spent.toFixed(2)} today >= $${DAILY_COST_USD.toFixed(2)} ceiling`;
  return null;
}

// ── Topic selection ───────────────────────────────────────────────────────────

function pickTopic() {
  // Read recent lessons to find gaps / failures
  const lessonsFile = path.join(__dirname, '..', 'agent_work', 'harness_lessons.jsonl');
  let recentFailures = [];
  try {
    const lines = fs.readFileSync(lessonsFile, 'utf8').trim().split('\n').filter(Boolean);
    recentFailures = lines.slice(-40)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(l => l && !l.success)
      .map(l => l.task || l.text || '');
  } catch {}

  // Fixed research topics that help PURPCLAW improve itself
  const topics = [
    'best practices for multi-agent LLM orchestration and swarm coordination in 2026',
    'how to improve agent task decomposition quality and subtask routing accuracy',
    'effective memory and context management patterns for persistent AI agent systems',
    'self-healing and self-repair patterns for distributed AI service architectures',
    'optimal LLM prompt engineering for specialist agent personas in coding tasks',
    'evaluation and benchmarking methods for autonomous AI agent systems',
    'patterns for autonomous code analysis and codebase improvement by AI agents',
    'techniques for AI systems to learn and improve from their own execution history',
    'real-time monitoring and observability for multi-agent AI orchestration platforms',
    'security and safety patterns for autonomous AI agent execution environments',
  ];

  // If there are recent failures, research something related to fixing them
  if (recentFailures.length > 0) {
    const failure = recentFailures[Math.floor(Math.random() * recentFailures.length)];
    return `how to improve AI agent execution for tasks like: "${failure.slice(0, 100)}"`;
  }

  return topics[_tickCount % topics.length];
}

// ── Single evolution tick ─────────────────────────────────────────────────────

// The training half of the ratchet. Non-blocking: fires lora-train.py in the
// background (it takes minutes), tracked as a Training Forge spine job that
// finishes when the run exits. Returns immediately with start/skip status.
function maybeTrain() {
  if (!LORA_ENABLED) return { skipped: true, reason: 'training disabled (EVOLUTION_TRAIN=0)' };
  if (_training) return { skipped: true, reason: 'a LoRA run is already in flight' };
  if (Date.now() < _trainPausedUntil) return { skipped: true, reason: `training paused until ${new Date(_trainPausedUntil).toISOString()} (no-CUDA blocker)` };
  if (LORA_TRAIN_EVERY > 0 && (_tickCount % LORA_TRAIN_EVERY) !== 0) return { skipped: true, reason: `not a training tick (every ${LORA_TRAIN_EVERY})` };
  if (Date.now() - _lastTrainMs < LORA_COOLDOWN_MS) return { skipped: true, reason: 'training cooldown' };

  // Dataset readiness — only train when there's real material to learn from.
  let dataset;
  try { dataset = require('./training/personal-dataset').exportToFile('chatml'); }
  catch (e) { return { skipped: true, reason: 'dataset module unavailable: ' + e.message }; }
  if (!dataset || !dataset.ready || !dataset.path) return { skipped: true, reason: 'dataset not ready (need more examples)' };

  // Spine job — Training Forge lane. Pending eval + gatekeeper on finish.
  let jobId = null;
  try {
    const reg = require('./pipeline-registry');
    const job = reg.start({ pipeline: 'lora.train', project: 'PURPCLAW', lane: 'Training Forge', trigger: 'self-evolution', risk: 'medium', inputs: { dataset: dataset.path, base: process.env.LORA_BASE_MODEL || 'Qwen/Qwen2.5-1.5B-Instruct', vram: '6GB QLoRA nf4' } });
    jobId = job && job.job_id;
    if (jobId) { reg.step(jobId, 'dataset_locked'); reg.step(jobId, 'training'); reg.output(jobId, dataset.path, { kind: 'dataset' }); }
  } catch (_) {}

  _training = true;
  _lastTrainMs = Date.now();

  // Capture training output to a log (was stdio:'ignore' → silent red jobs with
  // zero evidence; that violated "find where it died"). We also buffer stdout to
  // parse the CANDIDATE_MODEL / CANDIDATE_MERGED markers lora-train.py emits.
  const TRAIN_LOG = path.join(__dirname, '..', 'agent_work', 'lora-train.log');
  try { fs.mkdirSync(path.dirname(TRAIN_LOG), { recursive: true }); } catch {}
  let outBuf = '';
  const child = spawn(PY_BIN, [path.join(__dirname, '..', 'scripts', 'lora-train.py'), '--personal-dataset', dataset.path, '--merge', '--epochs', '1'], {
    cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, PURPCLAW_TRAINING_MODE: 'self-evolution' },
  });
  let logStream = null;
  try {
    logStream = fs.createWriteStream(TRAIN_LOG, { flags: 'a' });
    logStream.write(`\n=== train start ${new Date().toISOString()} (job ${jobId}) ===\n`);
  } catch (_) {}
  const cap = (d) => { outBuf += d; if (outBuf.length > 200000) outBuf = outBuf.slice(-100000); try { logStream && logStream.write(d); } catch (_) {} };
  child.stdout.on('data', cap);
  child.stderr.on('data', cap);

  child.on('exit', (code) => {
    _training = false;
    try { logStream && logStream.end(`\n=== train exit ${code} ===\n`); } catch (_) {}
    const reg = (() => { try { return require('./pipeline-registry'); } catch { return null; } })();

    // Exit 3 = no CUDA. Honest pause (not a silent fail) + long backoff so we
    // don't pile blocked jobs every tick until the CUDA torch build is installed.
    if (code === 3) {
      _trainPausedUntil = Date.now() + 24 * 60 * 60 * 1000;
      if (reg && jobId) reg.finish(jobId, {
        status: 'paused',
        claim: 'LoRA training PAUSED — no CUDA torch (GPU present, CPU wheel installed). Install CUDA torch to enable.',
        proof: { ran: 'lora-train.py', result: 'blocked', detail: 'exit 3 no-cuda; see agent_work/lora-train.log' },
      });
      return;
    }
    if (code !== 0) {
      if (reg && jobId) reg.finish(jobId, {
        status: 'failed',
        claim: `LoRA training failed (exit ${code})`,
        proof: { ran: 'lora-train.py', result: 'fail', detail: `exit ${code}; see agent_work/lora-train.log` },
      });
      return;
    }

    // Success → the run produced a CANDIDATE (not the live model). Finish the
    // training job, then hand the candidate to Phase E. Autonomous self-evolution
    // → it lands PENDING operator approval; it is never auto-activated.
    const name = ((outBuf.match(/^CANDIDATE_MODEL=(.+)$/m) || [])[1] || '').trim();
    const merged = ((outBuf.match(/^CANDIDATE_MERGED=(.+)$/m) || [])[1] || '').trim();
    if (reg && jobId) reg.finish(jobId, {
      status: 'complete',
      claim: 'LoRA candidate trained (6GB QLoRA) — entering eval + gatekeeper (Phase E)',
      proof: { ran: 'lora-train.py', result: 'pass', detail: `candidate ${name || '?'}; eval+gate next` },
    });
    try {
      const gate = require('./training/adapter-gate');
      const phaseE = gate.runPhaseE(
        { name: name || ('purpclaw-self-' + Date.now()), mergedDir: merged },
        { operatorInitiated: false }
      );
      try { fs.appendFileSync(TRAIN_LOG, `phase-E: ${phaseE.state}${phaseE.evalResult ? ' (eval ' + phaseE.evalResult.score + ')' : ''}\n`); } catch (_) {}
    } catch (e) {
      try { fs.appendFileSync(TRAIN_LOG, 'phase-E error: ' + e.message + '\n'); } catch (_) {}
    }
  });
  child.on('error', () => { _training = false; });
  return { started: true, jobId, dataset: dataset.path };
}

async function runTick() {
  if (_running) return { skipped: true, reason: 'previous tick still running' };
  if (!deepResearch) return { skipped: true, reason: 'deep-research-group module not available' };
  if (!ENABLED) return { skipped: true, reason: 'EVOLUTION_DISABLED=1' };

  const throttled = throttleReason();
  if (throttled) {
    console.log(`[EVOLUTION] ⏸  skipping tick — ${throttled}`);
    return { skipped: true, reason: throttled };
  }

  _running    = true;
  _lastTickMs = Date.now();
  const startedAt = new Date().toISOString();
  const topic = pickTopic();
  _tickCount++;

  let result = {
    tick: _tickCount,
    startedAt,
    topic,
    status: 'running',
    modelsAnswered: 0,
    memoryIngested: false,
    synthesis: '',
    error: null,
  };

  try {
    // 1. Run group research with free OpenRouter models
    const research = await deepResearch.runGroupResearch({
      query: topic,
      depth: 1,
      modelLimit: MAX_MODELS,
      concurrency: 3,
      memberMaxTokens: 800,
      synthesisMaxTokens: 1200,
    });

    result.modelsAnswered = research.successCount || 0;
    result.synthesis = research.synthesis || '';
    result.status = research.ok ? 'researched' : 'research_failed';

    // 2. Ingest synthesis into memory matrix if it has content
    if (research.synthesis && research.synthesis.length > 80) {
      result.status = 'ingested';
      if (canonicalMemorySync) {
        const synced = await canonicalMemorySync.syncRecord(
          path.join(__dirname, '..'),
          'evolution-log',
          result,
          { metadata: { tags: ['auto-research', 'self-evolution'] } }
        );
        result.memoryIngested = Boolean(synced?.imported || synced?.skipped);
      } else {
        await mem.ingest(
          `[AUTO-RESEARCH] ${topic}\n\n${research.synthesis}`,
          {
            source: 'self-evolution-loop',
            importance: 0.75,
            tags: ['auto-research', 'self-evolution'],
          }
        );
        result.memoryIngested = true;
      }
    }

    // 2.5 Karpathy ratchet — bake accumulated learning into a LoRA (6GB QLoRA),
    // gated. Non-blocking; reports start/skip on the tick result.
    try { result.training = maybeTrain(); } catch (e) { result.training = { skipped: true, reason: e.message }; }

    _backoff = 1; // healthy tick — reset backoff
  } catch (err) {
    result.status  = 'error';
    result.error   = err.message;
    _backoff = Math.min(_backoff * 2, 8); // grow delay on failure, cap at 8×
  }

  result.completedAt = new Date().toISOString();
  result.durationMs  = Date.now() - new Date(startedAt).getTime();

  // 3. Append to evolution log
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(result) + '\n');
  } catch {}

  // 4. Clean up the mess we made — stay under the disk budget every cycle.
  try {
    const gov = require('./space-governor');
    gov.sweepMess({ apply: true });
    const enf = gov.enforceBudget({ apply: true });
    if (enf.prunedFiles) console.log(`[EVOLUTION] 🧹 pruned ${enf.prunedFiles} files to stay under budget`);
    if (enf.warning) console.log(`[EVOLUTION] ⚠ ${enf.warning}`);
  } catch { /* governor is best-effort */ }

  _lastTick   = result;
  _lastResult = result;
  _running    = false;
  return result;
}

// ── Start / stop ──────────────────────────────────────────────────────────────

function _nextDelay() {
  const jitter = TICK_JITTER_MS ? (Math.random() * 2 - 1) * TICK_JITTER_MS : 0; // ±jitter spreads load
  return Math.max(MIN_COOLDOWN_MS, Math.round(TICK_MS * _backoff + jitter));    // backoff stretches on errors
}

function _schedule(delay) {
  _timer = setTimeout(async () => {
    await runTick().catch(() => {});
    if (_timer) _schedule(_nextDelay()); // reschedule unless stopped
  }, delay);
}

function start() {
  if (_timer) return;
  if (!ENABLED) { console.log('[EVOLUTION] disabled (EVOLUTION_DISABLED=1) — not starting'); return; }
  console.log(`announce.idle.evolve('started');
  console.log('[EVOLUTION] Auto-research started — ~${Math.round(TICK_MS/60000)}m base ±${Math.round(TICK_JITTER_MS/60000)}m, ` +
    `${MAX_MODELS} models/tick, cap ${MAX_TICKS_DAY}/day, $${DAILY_COST_USD.toFixed(2)}/day breaker`);
  _schedule(90_000); // 90s warm-up before first tick
}

function stop() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

function getStatus() {
  let recentTicks = [];
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    recentTicks = lines.slice(-10).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {}

  return {
    enabled: ENABLED,
    running: _running,
    tickCount: _tickCount,
    tickIntervalMs: TICK_MS,
    throttle: {
      ticksToday: ticksToday(),
      maxTicksPerDay: MAX_TICKS_DAY,
      spentTodayUSD: Number(spendToday().toFixed(4)),
      dailyCeilingUSD: DAILY_COST_USD,
      backoffMultiplier: _backoff,
      blockedReason: throttleReason(),
    },
    nextTickIn: _timer ? Math.max(0, TICK_MS - (Date.now() - (new Date(_lastTick?.startedAt || 0).getTime()))) : null,
    lastTick: _lastTick,
    recentTicks,
    // Training/Phase-E truth so the UI shows the real state (not a fake-green).
    training: {
      enabled: LORA_ENABLED,
      inFlight: _training,
      pythonPath: PY_BIN,
      gpuVenv: VENV_PY,
      pausedUntil: _trainPausedUntil ? new Date(_trainPausedUntil).toISOString() : null,
      trainEvery: LORA_TRAIN_EVERY,
      adapters: (() => { try { const g = require('./training/adapter-gate'); return { active: g.getActive(), pending: g.listPending().length }; } catch { return null; } })(),
    },
  };
}

module.exports = { start, stop, runTick, getStatus };
