'use strict';
/**
 * lib/goop-playground/squirrel.js — SQUIRREL the broker monitor.
 *
 * Passive observer of GOOP_PLAYGROUND. NEVER makes external calls in MVP.
 * Reads the usage ledger, computes metrics, surfaces warnings.
 *
 * Reports:
 *   - calls per agent (top 10)
 *   - cache hit rates
 *   - failed calls
 *   - rate-limited calls
 *   - dead APIs (high failure_count)
 *   - suspicious repeated calls (same agent > N hits/min on different APIs)
 *
 *   CLI:
 *     node lib/goop-playground/squirrel.js              # run once
 *     node lib/goop-playground/squirrel.js --watch 5    # watch loop
 *
 *   Library:
 *     const sq = require('./squirrel');
 *     const report = sq.run();
 *     sq.watch(5);  // watch every 5 seconds
 */

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'usage-ledger.jsonl');
const SUGGESTIONS_PATH = path.join(__dirname, 'suggestions.jsonl');

function readLedger() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs.readFileSync(LOG_PATH, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function readSuggestions() {
  if (!fs.existsSync(SUGGESTIONS_PATH)) return [];
  return fs.readFileSync(SUGGESTIONS_PATH, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

/**
 * run() — read ledger, compute metrics, return a report.
 * No external calls. Pure observation.
 */
function run() {
  const ledger = readLedger();
  const suggestions = readSuggestions();

  // Per-agent stats
  const byAgent = {};
  for (const e of ledger) {
    const k = e.agent || 'unknown';
    if (!byAgent[k]) byAgent[k] = { agent: k, calls: 0, hits: 0, misses: 0, errors: 0, last_call: 0, apis: new Set() };
    byAgent[k].calls++;
    if (e.cache_hit) byAgent[k].hits++;
    else byAgent[k].misses++;
    if (e.status === 'error') byAgent[k].errors++;
    if (e.ts > byAgent[k].last_call) byAgent[k].last_call = e.ts;
    if (e.api_id) byAgent[k].apis.add(e.api_id);
  }
  for (const k of Object.keys(byAgent)) {
    byAgent[k].unique_apis = byAgent[k].apis.size;
    byAgent[k].apis = undefined;
    byAgent[k].cache_hit_rate = byAgent[k].calls > 0
      ? Math.round((byAgent[k].hits / byAgent[k].calls) * 100) : 0;
  }

  // Per-API stats
  const byApi = {};
  for (const e of ledger) {
    const k = e.api_id || 'unknown';
    if (!byApi[k]) byApi[k] = { api_id: k, calls: 0, hits: 0, errors: 0, last_call: 0, agents: new Set() };
    byApi[k].calls++;
    if (e.cache_hit) byApi[k].hits++;
    if (e.status === 'error') byApi[k].errors++;
    if (e.ts > byApi[k].last_call) byApi[k].last_call = e.ts;
    if (e.agent) byApi[k].agents.add(e.agent);
  }
  for (const k of Object.keys(byApi)) {
    byApi[k].unique_agents = byApi[k].agents.size;
    byApi[k].agents = undefined;
    byApi[k].cache_hit_rate = byApi[k].calls > 0
      ? Math.round((byApi[k].hits / byApi[k].calls) * 100) : 0;
  }

  // Detect dead APIs (high error rate)
  const deadApis = Object.values(byApi).filter(a => a.calls >= 3 && a.errors / a.calls >= 0.5);

  // Detect suspicious bursts (same agent, > 20 calls in 1 min)
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  const byAgentBurst = {};
  for (const e of ledger) {
    if (e.ts < oneMinAgo) continue;
    const k = e.agent || 'unknown';
    byAgentBurst[k] = (byAgentBurst[k] || 0) + 1;
  }
  const suspiciousAgents = Object.entries(byAgentBurst)
    .filter(([_, c]) => c > 20)
    .map(([agent, calls]) => ({ agent, calls_in_last_min: calls }));

  // Top talkers
  const topAgents = Object.values(byAgent)
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);
  const topApis = Object.values(byApi)
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);

  // Totals
  const totalCalls = ledger.length;
  const totalErrors = ledger.filter(e => e.status === 'error').length;
  const totalHits = ledger.filter(e => e.cache_hit).length;
  const cacheRate = totalCalls > 0 ? Math.round((totalHits / totalCalls) * 100) : 0;

  return {
    generated_at: new Date().toISOString(),
    ledger_size: totalCalls,
    pending_suggestions: suggestions.length,
    totals: {
      total_calls:    totalCalls,
      total_errors:   totalErrors,
      cache_hits:     totalHits,
      cache_hit_rate: cacheRate,
    },
    top_agents: topAgents,
    top_apis:   topApis,
    warnings: {
      dead_apis:        deadApis,
      suspicious_agents: suspiciousAgents,
    },
  };
}

/**
 * watch(intervalSec) — periodically call run() and log the report.
 * The console output is the entire external signal SQUIRREL emits in MVP.
 */
function watch(intervalSec = 5) {
  console.log(`[SQUIRREL] watching every ${intervalSec}s (no external calls)`);
  const tick = () => {
    const report = run();
    const w = report.warnings;
    const lines = [
      '',
      `┌── SQUIRREL tick ${report.generated_at}`,
      `│  calls=${report.totals.total_calls}  errors=${report.totals.total_errors}  cache_hit_rate=${report.totals.cache_hit_rate}%  pending_suggestions=${report.pending_suggestions}`,
    ];
    if (w.dead_apis.length)        lines.push(`│  ⚠️  ${w.dead_apis.length} dead api(s): ${w.dead_apis.map(a => a.api_id).join(', ')}`);
    if (w.suspicious_agents.length) lines.push(`│  🚨 SUSPICIOUS burst: ${w.suspicious_agents.map(a => `${a.agent}=${a.calls_in_last_min}/min`).join(', ')}`);
    if (report.top_agents[0])       lines.push(`│  top agent: ${report.top_agents[0].agent} (${report.top_agents[0].calls} calls)`);
    if (report.top_apis[0])         lines.push(`│  top api:   ${report.top_apis[0].api_id} (${report.top_apis[0].calls} calls)`);
    lines.push('└──');
    console.log(lines.join('\n'));
  };
  tick();
  setInterval(tick, intervalSec * 1000);
}

// ── CLI ────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--watch') {
    watch(parseInt(args[1] || '5', 10));
  } else {
    const report = run();
    console.log(JSON.stringify(report, null, 2));
  }
}

module.exports = { run, watch, readLedger, readSuggestions };
