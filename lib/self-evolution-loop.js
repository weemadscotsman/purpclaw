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

let _timer      = null;
let _running    = false;
let _lastTick   = null;
let _lastResult = null;
let _tickCount  = 0;
let _lastTickMs = 0;     // wall-clock of last attempt, for cooldown
let _backoff    = 1;     // multiplier, grows on error, resets on success

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
  };
}

module.exports = { start, stop, runTick, getStatus };
