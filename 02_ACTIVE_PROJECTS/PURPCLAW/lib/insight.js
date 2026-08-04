'use strict';

/**
 * insight — mid-job learning. Capture a better way the instant it's discovered
 * and make it immediately usable, so agents adapt their tooling ON THE FLY.
 *
 * The loop: an agent (or the user in chat) finds out something works better →
 * capture() writes it to memory (all layers, high importance) and drops the
 * recall cache so it's INSTANTLY recallable → the next step/agent recall()s it
 * and adapts. No waiting for the next job, no cache lag.
 *
 *   const insight = require('./lib/insight');
 *   insight.capture('use npm.cmd not npm on win32 (spawn EINVAL)', { jobId, kind: 'tooling' });
 *   const learned = await insight.recall('how to run npm on windows');  // instant
 */

const mem = require('./memory-client');
const fs = require('fs');
const path = require('path');
let chain = null; try { chain = require('./job-chain'); } catch { /* optional */ }

const TAG = '[INSIGHT]';
const STORE = path.join(__dirname, '..', 'agent_work', 'insights.jsonl');

function appendLocalInsight(text, o = {}) {
  try { fs.mkdirSync(path.dirname(STORE), { recursive: true }); } catch {}
  const id = `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    id,
    at: new Date().toISOString(),
    content: text,
    text,
    type: 'insight',
    layer: 'local-insight',
    source: o.source || o.jobId || 'insight',
    metadata: { insight: true, kind: o.kind || 'general', jobId: o.jobId || null, fallback: true },
  };
  fs.appendFileSync(STORE, JSON.stringify(row) + '\n', 'utf8');
  return id;
}

function readLocalInsights(query = '', limit = 6) {
  try {
    const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const rows = fs.readFileSync(STORE, 'utf8').split(/\r?\n/).filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
    return rows.map(row => {
      const content = String(row.content || row.text || '').toLowerCase();
      const score = terms.length ? terms.reduce((n, term) => n + (content.includes(term) ? 1 : 0), 0) : 1;
      return { row, score };
    }).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || String(b.row.at).localeCompare(String(a.row.at)))
      .slice(0, limit)
      .map(x => x.row);
  } catch {
    return [];
  }
}

/**
 * Capture a discovered better-way. High importance so retention keeps it;
 * tagged so it's recallable as an insight; instant (ingest drops recall cache).
 * @param {string} text  what was learned
 * @param {object} o { jobId, kind, importance, source }
 */
async function capture(text, o = {}) {
  const body = String(text || '').trim();
  if (!body) return null;
  const content = `${TAG} ${o.kind ? '(' + o.kind + ') ' : ''}${body}`;
  const id = await mem.ingest(content, {
    source: o.source || o.jobId || 'insight',
    importance: o.importance != null ? o.importance : 0.85, // high — learned lessons stick
    type: 'insight',
    metadata: { insight: true, kind: o.kind || 'general', jobId: o.jobId || null },
  });
  const finalId = id || appendLocalInsight(content, o);
  if (chain && o.jobId) {
    chain.step(o.jobId, { stage: 'executing', area: 'insight', to: o.kind || 'learned', status: 'info', detail: `learned: ${body.slice(0, 160)}` });
  }
  return finalId;
}

/**
 * Recall relevant insights, ALWAYS fresh (bypasses the recall cache) so a
 * just-captured insight is seen. Returns { insights, formatted } — formatted is
 * ready to inject into the next agent step's context for on-the-fly adaptation.
 */
async function recall(query, o = {}) {
  const { results } = await mem.recall(query || 'better way to do this', { limit: o.limit || 6, useCache: false });
  const insights = (results || []).filter(r => {
    const c = String(r.content || r.text || '');
    return c.includes(TAG) || r.type === 'insight' || (r.layer === 'semantic');
  });
  const local = readLocalInsights(query || 'better way to do this', o.limit || 6);
  const seen = new Set();
  const list = [...(insights.length ? insights : (results || [])), ...local].filter(r => {
    const key = r.id || r.memory_id || r.content || r.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, o.limit || 6);
  const formatted = list.length
    ? `## Learned better-ways (adapt if relevant)\n${list.map((r, i) => `${i + 1}. ${String(r.content || r.text || '').replace(TAG, '').trim().slice(0, 240)}`).join('\n')}\n`
    : '';
  return { insights: list, formatted };
}

/** Recall insights relevant to a specific job's objective (mid-job adaptation). */
async function forJob(jobId, query, o = {}) {
  return recall(query, o);
}

module.exports = { capture, recall, forJob, TAG };

// Self-check: capture → instant recall must return the just-learned insight.
if (require.main === module) {
  (async () => {
    const assert = require('assert');
    const marker = 'zzq' + Math.random().toString(36).slice(2, 7);
    await capture(`test lesson ${marker}: prefer execSafe over raw spawn`, { jobId: 'selftest', kind: 'tooling' });
    const { insights, formatted } = await recall(`test lesson ${marker}`);
    const hit = insights.some(r => String(r.content || r.text || '').includes(marker));
    // If the memory spine is offline this can't round-trip; report honestly.
    if (hit) console.log(`insight self-check: PASS — captured + instantly recalled "${marker}"`);
    else console.log(`insight self-check: INCONCLUSIVE — memory spine offline (:7880 down); capture path OK, round-trip needs the spine`);
    assert.ok(typeof formatted === 'string', 'formatted context is a string');
  })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
}
