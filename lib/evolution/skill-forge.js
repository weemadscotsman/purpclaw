'use strict';

/**
 * lib/evolution/skill-forge.js
 * ═════════════════════════════
 * When the mutator detects an UNROUTED-INTENT pattern (N+ subtasks where
 * classifyJob fell back to 'code' with low confidence, OR live dispatch
 * could not deliver across multiple attempts), the forge proposes a new
 * job-type entry and/or a new Thringlet archetype to fill the gap.
 *
 * Output: agent_work/evolution/forged/<id>.json
 *   {
 *     kind: 'job_type' | 'archetype',
 *     id, name, evidence, proposal, risk: 'medium' | 'high', status: 'pending'
 *   }
 *
 * Proposals are NEVER auto-applied — they require operator approval through
 * `purpclaw evolve approve <id>`. Approval triggers a write to
 * lib/job-contract.js (new keyword set + agents + gates) and/or
 * lib/thringlets/archetypes.js (new archetype block) via a structured patch.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EVO_DIR = path.join(ROOT, 'agent_work', 'evolution', 'forged');
const HARNESS_DIR = path.join(ROOT, 'agent_work', 'harness');
const BENCH_HISTORY = path.join(ROOT, 'agent_work', 'benchmark', 'history.jsonl');

const UNROUTED_THRESHOLD = 4;     // N+ low-confidence classifications → propose new type
const FAILURE_CLUSTER_THRESHOLD = 5; // N+ failed subtasks with same intent → propose better archetype

const now = () => Date.now();
const ensureDir = d => { try { fs.mkdirSync(d, { recursive: true }); } catch {} };
const makeId = pfx => `${pfx}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function loadRecentJobs(limit = 50) {
  try {
    if (!fs.existsSync(HARNESS_DIR)) return [];
    const files = fs.readdirSync(HARNESS_DIR).filter(f => f.endsWith('.json'));
    return files.slice(-limit).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(HARNESS_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function loadBenchmarks(limit = 20) {
  try {
    if (!fs.existsSync(BENCH_HISTORY)) return [];
    return fs.readFileSync(BENCH_HISTORY, 'utf8').trim().split('\n').slice(-limit)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// ─── Gap detectors ────────────────────────────────────────────────────────────

/**
 * Find clusters of subtask descriptions that classifyJob couldn't tag with
 * high confidence AND that consistently failed. Those are gaps in the
 * job-type taxonomy.
 */
function detectUnroutedClusters(jobs) {
  const lowConfFails = [];
  for (const job of jobs) {
    for (const s of (job.plan || [])) {
      const cls = s.contract?.confidence || job.classification?.confidence;
      const lowConf = cls === 'low' || cls === 'medium';
      const failed = ['failed', 'rejected'].includes(s.state);
      if (lowConf && failed && s.description) {
        lowConfFails.push({
          desc: s.description.slice(0, 200),
          intent: s.contract?.routeIntent || 'unknown',
          jobId: job.id,
        });
      }
    }
  }

  if (lowConfFails.length < UNROUTED_THRESHOLD) return [];

  // Extract candidate keywords — words that appear in 3+ descriptions
  // but aren't already in any JOB_TYPES keyword set.
  const { JOB_TYPES } = require('../job-contract');
  const existingKeywords = new Set();
  for (const def of Object.values(JOB_TYPES)) for (const k of def.keywords) existingKeywords.add(k.toLowerCase());

  const wordCounts = {};
  for (const row of lowConfFails) {
    const words = row.desc.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const seen = new Set();
    for (const w of words) {
      if (seen.has(w)) continue;
      seen.add(w);
      if (existingKeywords.has(w)) continue;
      if (['the', 'and', 'that', 'this', 'with', 'from', 'into', 'have', 'must', 'will', 'must', 'should', 'would'].includes(w)) continue;
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }
  }
  const candidateKeywords = Object.entries(wordCounts).filter(([, n]) => n >= 3).map(([w]) => w);
  if (candidateKeywords.length === 0) return [];

  return [{
    kind: 'job_type',
    id: makeId('forge-jt'),
    name: candidateKeywords[0],
    risk: 'medium',
    status: 'pending',
    proposedAt: now(),
    evidence: { lowConfFails: lowConfFails.length, candidateKeywords: candidateKeywords.slice(0, 8) },
    proposal: {
      type: candidateKeywords[0],
      keywords: candidateKeywords.slice(0, 6),
      routeIntent: candidateKeywords[0],
      agents: ['owl', 'wolf', 'penguin'],  // safe baseline
      gates: ['contract-review'],          // soft gate — never auto-fail
    },
    reason: `${lowConfFails.length} subtasks classified low-confidence and failed. Recurring novel keywords [${candidateKeywords.slice(0, 4).join(', ')}] suggest an unrouted intent. Forging a new JOB_TYPE.`,
  }];
}

/**
 * Find intents where >threshold subtasks failed despite multiple retries —
 * propose a new Thringlet archetype tuned to that domain (extra cautious
 * traits, custom abilities).
 */
function detectArchetypeGaps(jobs) {
  const byIntent = {};
  for (const job of jobs) {
    for (const s of (job.plan || [])) {
      const intent = s.contract?.routeIntent || 'unknown';
      if (!byIntent[intent]) byIntent[intent] = { total: 0, failed: 0, samples: [] };
      byIntent[intent].total++;
      if (['failed', 'rejected'].includes(s.state)) {
        byIntent[intent].failed++;
        if (byIntent[intent].samples.length < 5) byIntent[intent].samples.push(s.description?.slice(0, 100));
      }
    }
  }

  const proposals = [];
  for (const [intent, stats] of Object.entries(byIntent)) {
    if (stats.total < FAILURE_CLUSTER_THRESHOLD) continue;
    const failRate = stats.failed / stats.total;
    if (failRate < 0.6) continue;

    proposals.push({
      kind: 'archetype',
      id: makeId('forge-arc'),
      name: `THR-FORGED-${intent.toUpperCase()}`,
      risk: 'high',                     // never auto-apply
      status: 'pending',
      proposedAt: now(),
      evidence: { intent, total: stats.total, failed: stats.failed, failRate: failRate.toFixed(2), samples: stats.samples },
      proposal: {
        id: `THR-FORGED-${intent.toUpperCase()}`,
        name: `Forged-${intent}`,
        type: 'Specialist',
        core: intent,
        personality: `Domain-tuned ${intent} specialist forged from observed failure patterns`,
        lore: `Emerged from ${stats.failed} failures across ${stats.total} ${intent} subtasks. Built to fail less.`,
        abilities: [
          { name: `${intent.toUpperCase()}_LOCK`, type: 'utility', desc: `Focused execution for ${intent}-class subtasks` },
          { name: `${intent.toUpperCase()}_PEER_REVIEW`, type: 'governance', desc: `Cross-checks before submitting deliverable` },
        ],
        rarity: 'Epic',
      },
      reason: `${intent} intent has ${(failRate * 100).toFixed(0)}% failure rate (${stats.failed}/${stats.total}). Existing archetypes aren't covering this domain. Operator approval required to forge new archetype.`,
    });
  }
  return proposals;
}

// ─── Top-level forge pass ────────────────────────────────────────────────────

function runForgePass() {
  const jobs = loadRecentJobs(50);
  const benchmarks = loadBenchmarks(20);

  const proposals = [
    ...detectUnroutedClusters(jobs),
    ...detectArchetypeGaps(jobs),
  ];

  ensureDir(EVO_DIR);
  for (const p of proposals) {
    fs.writeFileSync(path.join(EVO_DIR, `${p.id}.json`), JSON.stringify(p, null, 2));
  }

  return {
    ok: true,
    evidenceSummary: { jobs: jobs.length, benchmarks: benchmarks.length },
    proposals,
  };
}

function listForged({ status } = {}) {
  ensureDir(EVO_DIR);
  let files = [];
  try { files = fs.readdirSync(EVO_DIR).filter(f => f.endsWith('.json')); } catch {}
  const all = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(EVO_DIR, f), 'utf8')); }
    catch { return null; }
  }).filter(Boolean);
  return status ? all.filter(p => p.status === status) : all;
}

function getForged(id) {
  try { return JSON.parse(fs.readFileSync(path.join(EVO_DIR, `${id}.json`), 'utf8')); }
  catch { return null; }
}

function setForgedStatus(id, status, note) {
  const item = getForged(id);
  if (!item) return { ok: false, error: 'not-found', id };
  item.status = status;
  item.statusNote = note || null;
  item.statusUpdatedAt = now();
  fs.writeFileSync(path.join(EVO_DIR, `${id}.json`), JSON.stringify(item, null, 2));
  return { ok: true, id, status };
}

module.exports = {
  runForgePass,
  listForged,
  getForged,
  setForgedStatus,
  EVO_DIR,
};
