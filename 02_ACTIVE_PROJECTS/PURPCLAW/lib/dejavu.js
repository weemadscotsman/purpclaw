'use strict';
/**
 * lib/dejavu.js — execution-pattern recognition across the memory spine.
 *
 * NOT an eighth memory layer. Déjà Vu records traces into the existing
 * `procedural` layer (how things were done) via the canonical memory gateway,
 * and keeps only a small local index for fast sequence matching. Canonical
 * history stays in the seven-layer spine; this never becomes a second truth
 * store.
 *
 *   record(trace)  — write a completed run: intent, tool sequence, outcome
 *   match(prefix)  — "have I been inside this execution shape before?"
 *
 * Two rules the design hangs on:
 *
 *   1. PREDICTION IS NOT PERMISSION. match() returns evidence. Whether any
 *      predicted continuation may run is decided by steering + the ToolRuntime
 *      gate, exactly as it is for a step nobody predicted.
 *
 *   2. REPETITION CREATES FAMILIARITY, VERIFICATION CREATES TRUST. Confidence
 *      is weighted by whether historical runs actually SUCCEEDED, not by how
 *      often they occurred. Twenty unverified repeats rank below four verified
 *      successes — otherwise a tool that lies (a fake-green `curl` returning
 *      HTTP 200 without making a request) teaches the system its own bug.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');
const INDEX = path.join(DATA, 'memory', 'dejavu-index.jsonl');
const MEMORY = (() => { try { return require('./memory-gateway'); } catch { return null; } })();

const MAX_INDEX = Number(process.env.PURPCLAW_DEJAVU_INDEX_MAX || 4000);

/** Normalise an intent into a stable slug for coarse bucketing. */
function intentSlug(text) {
  return String(text || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w))
    .slice(0, 6).join('-') || 'unspecified';
}
const STOP = new Set(['this','that','with','from','have','been','they','what','when','where','which','please','could','would','should','about','there','their','then','than','into','your','make','just','like','need','want','tell']);

/** Classify a failure so "same shape of broken" matches across wordings. */
function errorClass(err) {
  const e = String(err || '').toLowerCase();
  if (!e) return 'none';
  if (/401|403|unauthor|invalid api key|authentic/.test(e)) return 'authentication';
  if (/402|quota|balance|credit|billing/.test(e))           return 'billing';
  if (/429|rate.?limit/.test(e))                            return 'rate-limit';
  if (/enoent|not found|no such file|missing/.test(e))       return 'missing-path';
  if (/timeout|timed out|deadline/.test(e))                  return 'timeout';
  if (/denied|forbidden|permission|steering/.test(e))        return 'denied';
  if (/econnrefused|unreachable|offline|socket/.test(e))     return 'unreachable';
  return 'other';
}

/**
 * Compact fingerprint. Deliberately short and human-readable:
 *   purpclaw|provider-routing|authentication|config.read>provider.test|failure
 */
function fingerprint(t = {}) {
  const seq = (t.sequence || []).map(s => s.tool || s).join('>');
  return [
    t.project || 'purpclaw',
    intentSlug(t.intent),
    t.errorClass || 'none',
    seq || 'no-tools',
    t.outcome || 'unknown',
  ].join('|');
}

function readIndex() {
  try {
    return fs.readFileSync(INDEX, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/**
 * Record a completed run. Canonical narrative goes to the memory spine
 * (procedural layer); only the fingerprint + sequence is indexed locally.
 */
async function record(trace = {}) {
  const seq = (trace.sequence || []).map(s => ({ tool: s.tool || String(s), ok: s.ok !== false }));
  const failed = seq.filter(s => !s.ok);
  const outcome = trace.outcome || (seq.length === 0 ? 'no-tools' : failed.length ? 'partial' : 'success');
  const ec = trace.errorClass || errorClass(failed.map(f => f.err).join(' '));
  const rec = {
    id: 'dv_' + crypto.randomUUID(),
    at: new Date().toISOString(),
    fp: fingerprint({ ...trace, sequence: seq, outcome, errorClass: ec }),
    intent: String(trace.intent || '').slice(0, 240),
    project: trace.project || 'purpclaw',
    sequence: seq,
    outcome, errorClass: ec,
    verified: trace.verified === true,     // only a real check sets this
    durationMs: trace.durationMs || null,
    session: trace.session || null,
  };

  try {
    fs.mkdirSync(path.dirname(INDEX), { recursive: true });
    fs.appendFileSync(INDEX, JSON.stringify(rec) + '\n', 'utf8');
    const all = readIndex();
    if (all.length > MAX_INDEX) {
      fs.writeFileSync(INDEX, all.slice(-MAX_INDEX).map(r => JSON.stringify(r)).join('\n') + '\n');
    }
  } catch { /* index is an accelerator, never the truth */ }

  // Canonical copy into the spine — procedural = "how this was done".
  if (MEMORY && seq.length) {
    try {
      await MEMORY.record({
        layer: 'procedural', kind: 'trace',
        content: { text: `Intent: ${rec.intent}\nRoute: ${seq.map(s => s.tool).join(' > ')}\nOutcome: ${outcome}${ec !== 'none' ? ' (' + ec + ')' : ''}` },
        scope: { user: 'operator', session: rec.session },
        source: 'dejavu',
      });
    } catch { /* spine down — the local index still works */ }
  }
  return rec;
}

/** Longest common prefix length between two tool-name arrays. */
function prefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * "Have we been here before?"
 *
 * Scores similarity from the shared execution prefix, the intent bucket and the
 * error class, then weights by VERIFIED success — not by raw frequency.
 * Returns evidence only; it grants nothing.
 */
function match({ intent = '', sequence = [], project = 'purpclaw', errorClass: ec = null, limit = 5 } = {}) {
  const now = Date.now();
  const cur = (sequence || []).map(s => s.tool || String(s));
  const slug = intentSlug(intent);
  const rows = readIndex().filter(r => r.project === project);
  if (!rows.length) return { matched: false, confidence: 0, historicalRuns: 0, continuations: [] };

  const scored = rows.map(r => {
    const hist = (r.sequence || []).map(s => s.tool);
    const pl = prefixLen(cur, hist);
    const seqScore = cur.length ? pl / Math.max(cur.length, 1) : 0;
    const intentScore = r.intent && intentSlug(r.intent) === slug ? 1 : 0;
    const errScore = ec && r.errorClass === ec ? 1 : 0;
    // similarity: execution shape dominates, intent and error class support it
    const similarity = (seqScore * 0.6) + (intentScore * 0.3) + (errScore * 0.1);
    const ageDays = Math.max(0, (now - Date.parse(r.at || 0)) / 86_400_000);
    const recency = 1 / (1 + ageDays / 30);
    return { r, similarity, prefix: pl, recency, rest: hist.slice(pl) };
  }).filter(x => x.similarity > 0.25);

  if (!scored.length) return { matched: false, confidence: 0, historicalRuns: 0, continuations: [] };

  const successes = scored.filter(x => x.r.outcome === 'success');
  const verified = successes.filter(x => x.r.verified);
  // Verification creates trust: verified runs count for far more than repeats.
  const trust = (verified.length * 1.0 + (successes.length - verified.length) * 0.25)
              / Math.max(scored.length, 1);
  const bestSim = Math.max(...scored.map(x => x.similarity));
  const bestRec = Math.max(...scored.map(x => x.recency));
  const confidence = Math.min(0.99, bestSim * (0.4 + 0.6 * trust) * (0.7 + 0.3 * bestRec));

  // What happened NEXT, in successful runs that shared our prefix.
  const nextCounts = new Map();
  successes.forEach(x => {
    if (!x.rest.length) return;
    const step = x.rest[0];
    const e = nextCounts.get(step) || { action: step, runs: 0, verified: 0 };
    e.runs++; if (x.r.verified) e.verified++;
    nextCounts.set(step, e);
  });
  // Share of successful runs that took this step, weighted so a VERIFIED run
  // counts full and an unverified one counts a quarter. Capped at 1: a
  // confidence over 100% is a bug, not enthusiasm.
  const continuations = [...nextCounts.values()]
    .map(e => {
      const weighted = e.verified + (e.runs - e.verified) * 0.25;
      return { ...e, confidence: Number(Math.min(1, weighted / Math.max(successes.length, 1)).toFixed(3)) };
    })
    .sort((a, b) => b.confidence - a.confidence).slice(0, limit);

  const best = scored.sort((a, b) => b.similarity - a.similarity)[0];
  return {
    matched: confidence >= 0.5,
    confidence: Number(confidence.toFixed(3)),
    historicalRuns: scored.length,
    successfulRuns: successes.length,
    verifiedRuns: verified.length,
    matchedPrefix: best.prefix,
    closest: { intent: best.r.intent, route: (best.r.sequence || []).map(s => s.tool), outcome: best.r.outcome, at: best.r.at },
    continuations,
    // Said out loud so no caller mistakes evidence for authority.
    note: 'evidence only — steering and the ToolRuntime gate still decide what may run',
  };
}

function stats() {
  const rows = readIndex();
  return {
    ok: true, traces: rows.length, index: INDEX,
    success: rows.filter(r => r.outcome === 'success').length,
    verified: rows.filter(r => r.verified).length,
  };
}

module.exports = { record, match, stats, fingerprint, intentSlug, errorClass };

if (require.main === module) console.log(JSON.stringify(stats(), null, 2));
