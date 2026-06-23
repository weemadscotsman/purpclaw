'use strict';
/**
 * lib/chaos-campaign.js — Systematic Chaos Campaign Engine
 * ════════════════════════════════════════════════════════════════
 * Extends Smith + Neo with organized attack packs and a
 * reliability ledger that tracks: attack type, detection rate,
 * repair rate, and response time.
 *
 * The goal: prove PurpClaw survives itself.
 */

const { smith, neo } = require('./smith-neo');
const fs = require('fs');
const path = require('path');

const PURP_DIR = path.resolve(__dirname, '..');
const RELIABILITY_FILE = path.join(PURP_DIR, 'agent_work', 'reliability-ledger.json');

// ── Attack Packs ────────────────────────────────────────────────────

/**
 * Systematic attack packs — organized by failure mode category.
 * Each pack has a set of techniques with expected outcomes.
 */
const ATTACK_PACKS = {
  output: {
    name: 'Output Attacks',
    description: 'Corrupt LLM responses before the agent processes them',
    techniques: [
      { id: 'refusal', count: 5, severity: 'high' },
      { id: 'truncate', count: 5, severity: 'medium' },
      { id: 'null_output', count: 5, severity: 'medium' },
      { id: 'hallucinate', count: 5, severity: 'high' },
    ],
  },
  memory: {
    name: 'Memory Attacks',
    description: 'Corrupt facts, timelines, and stored knowledge',
    techniques: [
      { id: 'reorder', count: 5, severity: 'high' },
      { id: 'swap_args', count: 5, severity: 'high' },
    ],
  },
  agent: {
    name: 'Agent Attacks',
    description: 'Stress agent lifecycles and delegation patterns',
    techniques: [
      { id: 'delay', count: 5, severity: 'low' },
      { id: 'slow_leak', count: 3, severity: 'low' },
    ],
  },
  provider: {
    name: 'Provider Attacks',
    description: 'Simulate API failures and provider degradation',
    techniques: [
      { id: 'null_output', count: 5, severity: 'medium' },
      { id: 'refusal', count: 3, severity: 'high' },
    ],
  },
};

// ── Reliability Ledger ─────────────────────────────────────────────

function loadLedger() {
  try { return JSON.parse(fs.readFileSync(RELIABILITY_FILE, 'utf-8')); }
  catch { return { campaigns: [], totals: { attacks: 0, detected: 0, repaired: 0, avgResponseMs: 0 }, byPack: {}, byTechnique: {}, history: [] }; }
}
function saveLedger(data) {
  try { fs.mkdirSync(path.dirname(RELIABILITY_FILE), { recursive: true }); } catch {}
  fs.writeFileSync(RELIABILITY_FILE, JSON.stringify(data, null, 2));
}

/**
 * Run a single chaos round: attack → detect → stabilize → record.
 * @returns {object} round result with timing
 */
function runRound(techniqueId, targetContent = '') {
  const start = Date.now();
  const target = targetContent ? { content: targetContent } : { content: 'function deploy() { const api = new PurpClawAPI(); return api.start(); }' };

  // 1. SMITH: inject
  const attack = smith.inject(techniqueId, target);
  if (!attack.ok) return { ok: false, error: attack.error, technique: techniqueId, elapsedMs: Date.now() - start };

  // 2. NEO: detect
  const detection = neo.detect({ content: attack.corrupted.content || attack.corrupted.output || '' });

  // 3. NEO: stabilize
  const stabilization = neo.stabilize({ content: attack.corrupted.content || attack.corrupted.output || '' });

  const elapsed = Date.now() - start;

  return {
    ok: true,
    technique: techniqueId,
    severity: TECHNIQUE_SEVERITY[techniqueId] || 'medium',
    attackResult: attack.attack?.result || 'injected',
    detected: detection.anomaly,
    confidence: detection.confidence,
    repaired: stabilization.stabilized,
    responseMs: elapsed,
    signals: detection.signals?.length || 0,
  };
}

const TECHNIQUE_SEVERITY = { refusal: 'high', truncate: 'medium', null_output: 'medium', hallucinate: 'high', reorder: 'high', swap_args: 'high', delay: 'low', slow_leak: 'low' };

/**
 * Run a full attack pack against the system.
 * @param {string} packId - one of ATTACK_PACKS keys
 * @returns {object} campaign results
 */
function runCampaign(packId = 'output') {
  const pack = ATTACK_PACKS[packId];
  if (!pack) return { ok: false, error: `Unknown pack: ${packId}. Available: ${Object.keys(ATTACK_PACKS).join(', ')}` };

  const results = [];
  const startTime = Date.now();

  for (const tech of pack.techniques) {
    for (let i = 0; i < tech.count; i++) {
      // Use appropriate targets per technique so Neo's detectors can fire
      let target = null;
      if (tech.id === 'reorder') {
        // Code with variable declarations — reorder detection scans for use-before-declare
        target = `const api = new PurpClawAPI();\nfunction deploy() {\n  const result = api.start(config);\n  const config = { port: 7780 };\n  return result;\n}\nconst system = api.connect();\nconst auth = system.login(token);\nconst token = 'sk-test';\n`;
      } else if (tech.id === 'swap_args') {
        // Tool calls with src/dst semantics — swap_args detection scans for backup→src patterns
        target = JSON.stringify({ src: 'backup/output.zip', dst: 'src/main/index.js', args: { src: 'dist/bundle.js', dst: 'src/components/' } });
      } else if (tech.id === 'delay') {
        // Structured output that includes timing metadata
        target = JSON.stringify({ content: 'Task completed successfully.', _injected_delay_ms: 0, duration: 0 });
      } else {
        target = `test_${tech.id}_${i + 1}: verify system integrity`;
      }
      const rd = runRound(tech.id, target);
      results.push(rd);
    }
  }

  const detected = results.filter(r => r.detected).length;
  const repaired = results.filter(r => r.repaired).length;
  const total = results.length;
  const avgMs = results.reduce((s, r) => s + (r.responseMs || 0), 0) / Math.max(total, 1);

  const campaign = {
    id: `campaign-${Date.now()}`,
    pack: packId,
    packName: pack.name,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    results: {
      total,
      detected,
      repaired,
      detectionRate: total > 0 ? Math.round(detected / total * 100) : 0,
      repairRate: total > 0 ? Math.round(repaired / total * 100) : 0,
      avgResponseMs: Math.round(avgMs),
    },
    byTechnique: {},
  };

  // Group by technique
  for (const r of results) {
    if (!campaign.byTechnique[r.technique]) {
      campaign.byTechnique[r.technique] = { total: 0, detected: 0, repaired: 0, totalMs: 0 };
    }
    const t = campaign.byTechnique[r.technique];
    t.total++;
    if (r.detected) t.detected++;
    if (r.repaired) t.repaired++;
    t.totalMs += r.responseMs || 0;
  }
  for (const [tech, stats] of Object.entries(campaign.byTechnique)) {
    stats.detectionRate = Math.round(stats.detected / stats.total * 100);
    stats.repairRate = Math.round(stats.repaired / stats.total * 100);
    stats.avgMs = Math.round(stats.totalMs / stats.total);
  }

  // Persist
  const ledger = loadLedger();
  ledger.campaigns.push(campaign);
  ledger.totals.attacks += total;
  ledger.totals.detected += detected;
  ledger.totals.repaired += repaired;
  ledger.totals.avgResponseMs = Math.round((ledger.totals.avgResponseMs * (ledger.totals.attacks - total) + avgMs * total) / ledger.totals.attacks);
  for (const r of results) {
    const tid = r.technique;
    if (!ledger.byTechnique[tid]) ledger.byTechnique[tid] = { total: 0, detected: 0, repaired: 0 };
    ledger.byTechnique[tid].total++;
    if (r.detected) ledger.byTechnique[tid].detected++;
    if (r.repaired) ledger.byTechnique[tid].repaired++;
  }
  ledger.history.push({ timestamp: new Date().toISOString(), pack: packId, total, detected, repaired });
  saveLedger(ledger);

  return { ok: true, campaign, message: `⚔️ ${pack.name}: ${total} attacks · ${detected} detected (${Math.round(detected/total*100)}%) · ${repaired} repaired (${Math.round(repaired/total*100)}%) · ${Math.round(avgMs)}ms avg` };
}

/**
 * Run ALL attack packs. Full system stress test.
 */
function runAllPacks() {
  const results = {};
  for (const packId of Object.keys(ATTACK_PACKS)) {
    const r = runCampaign(packId);
    results[packId] = r.ok ? r.campaign.results : { error: r.error };
  }
  const ledger = loadLedger();
  return {
    ok: true,
    packs: results,
    totals: ledger.totals,
    message: `🛡️ Full chaos campaign complete. ${ledger.totals.attacks} total attacks across ${Object.keys(ATTACK_PACKS).length} packs.`,
  };
}

/**
 * Get current reliability status.
 */
function status() {
  const ledger = loadLedger();
  const lastCampaign = ledger.campaigns[ledger.campaigns.length - 1];
  return {
    totals: ledger.totals,
    lastCampaign: lastCampaign ? {
      pack: lastCampaign.packName,
      detectionRate: lastCampaign.results.detectionRate,
      repairRate: lastCampaign.results.repairRate,
      avgMs: lastCampaign.results.avgResponseMs,
      at: lastCampaign.timestamp,
    } : null,
    byTechnique: ledger.byTechnique,
    byPack: Object.keys(ATTACK_PACKS).reduce((acc, pid) => {
      const campaigns = ledger.campaigns.filter(c => c.pack === pid);
      if (campaigns.length) {
        const last = campaigns[campaigns.length - 1];
        acc[pid] = { name: ATTACK_PACKS[pid].name, runs: campaigns.length, lastDetectionRate: last.results.detectionRate, lastRepairRate: last.results.repairRate };
      }
      return acc;
    }, {}),
  };
}

/**
 * Reset the reliability ledger.
 */
function reset() {
  saveLedger({ campaigns: [], totals: { attacks: 0, detected: 0, repaired: 0, avgResponseMs: 0 }, byPack: {}, byTechnique: {}, history: [] });
  neo.reset();
  return { ok: true, message: 'Reliability ledger reset. Fresh slate.' };
}

module.exports = { runRound, runCampaign, runAllPacks, status, reset, ATTACK_PACKS };
