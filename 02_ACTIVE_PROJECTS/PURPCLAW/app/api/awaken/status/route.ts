import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/awaken/status
 *
 * Returns the current AWAKEN state including all four feed sections:
 * growth, companion_cognitive, stress, self_improving.
 * Reads directly from agent_work/awaken/state.json and related files.
 * No backend spawn — pure filesystem reads.
 */

const PURP_DIR = (() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  return process.cwd();
})();

function readJson(file, fallback = {}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return JSON.parse(require('fs').readFileSync(file, 'utf8'));
  } catch { return fallback; }
}

function countFiles(dir, ext = '.json') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('fs').readdirSync(dir).filter(f => f.endsWith(ext)).length;
  } catch { return 0; }
}

function exists(file) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').accessSync(file); return true;
  } catch { return false; }
}

function getLatestRun() {
  const runsDir = `${PURP_DIR}/agent_work/awaken/runs`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const dirs = fs.readdirSync(runsDir).filter(f => f.startsWith('awaken-'));
    if (!dirs.length) return null;
    dirs.sort();
    const latest = dirs[dirs.length - 1];
    const reportFile = `${runsDir}/${latest}/report.md`;
    const evidenceDir = `${PURP_DIR}/agent_work/awaken/evidence`;
    let evidence = null;
    try {
      const efiles = fs.readdirSync(evidenceDir).filter(f => f.startsWith(latest));
      if (efiles.length) {
        evidence = JSON.parse(fs.readFileSync(`${evidenceDir}/${efiles[0]}`, 'utf8'));
      }
    } catch {}
    return {
      runId: latest,
      report: fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8').slice(0, 500) : null,
      evidence,
      reportMtime: fs.existsSync(reportFile) ? fs.statSync(reportFile).mtime.toISOString() : null,
    };
  } catch { return null; }
}

function getLastNEvents(n = 20) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const eventsFile = `${PURP_DIR}/agent_work/awaken/events.jsonl`;
    const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

async function checkPort(port) {
  return new Promise(resolve => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const http = require('http');
    const req = http.get(`http://127.0.0.1:${port}/health`, () => resolve(true));
    req.setTimeout(1500, () => { try { req.destroy(); } catch {} resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function buildGrowthFeed() {
  const idle = readJson(`${PURP_DIR}/agent_work/.idle_engine_state.json`, {});
  const evolutionLogFile = `${PURP_DIR}/agent_work/evolution-log.jsonl`;
  let evolutionTicks = 0;
  let lastEvolutionTick = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const lines = fs.readFileSync(evolutionLogFile, 'utf8').trim().split('\n').filter(Boolean);
    evolutionTicks = lines.length;
    if (lines.length) { const last = JSON.parse(lines[lines.length - 1]); lastEvolutionTick = last.startedAt || last.ts || null; }
  } catch {}
  const donorData = readJson(`${PURP_DIR}/registry/donor-artifacts.json`, { artifacts: [] });
  const proposalsDir = `${PURP_DIR}/agent_work/evolution/proposals`;
  const mutationsDir = `${PURP_DIR}/agent_work/evolution/mutations`;
  const forgedDir = `${PURP_DIR}/agent_work/evolution/forged`;
  const autoResearchOrch = 'E:/training/lib/autoresearch-orchestrator.js';
  const autoResearchState = `${PURP_DIR}/agent_work/evolution/autoresearch-state.json`;
  return {
    auto_research_active: exists(autoResearchOrch) ? 'idle' : 'missing',
    research_queue_length: exists(autoResearchState) ? countFiles(`${PURP_DIR}/agent_work/evolution/research-queue`, '.json') : null,
    auto_evolve_active: exists(`${PURP_DIR}/lib/evolution/mutator.js`) ? 'loaded' : 'missing',
    pending_evolution_proposals: exists(proposalsDir) ? countFiles(proposalsDir) : null,
    idle_engine_sessions: idle.sessionCount || idle.sessions || 0,
    idle_engine_cycles: idle.idleCycles || idle.cycles || 0,
    drift_watcher_status: exists(`${PURP_DIR}/lib/drift-watcher.js`) ? 'loaded_not_running' : 'missing',
    model_discovery_list: [],
    last_training_feedback_time: idle.lastFeedbackAt || null,
    donor_pending: (donorData.artifacts || []).filter((a: { status?: string }) => a.status === 'pending').length,
    skill_forge_count: exists(forgedDir) ? countFiles(forgedDir) : null,
    mutations_applied: exists(mutationsDir) ? countFiles(mutationsDir) : null,
    gate_pipeline_quarantined: 0,
    evolution_ticks: evolutionTicks,
    last_evolution_tick: lastEvolutionTick,
  };
}

function buildCompanionFeed() {
  const mochi = readJson(`${PURP_DIR}/agent_work/mochi.json`, {});
  const chorusDir = `${PURP_DIR}/companion-chorus`;
  // Shaman files live at project root, not lib/
  const shamanFile = `${PURP_DIR}/shaman_prompts.js`;
  const shamanEvaluator = `${PURP_DIR}/shaman_evaluator.js`;
  const mmFile = `${PURP_DIR}/agent_work/memory-matrix-state.json`;
  // Weatherman lives in lib/weatherman.js
  const weathermanFile = `${PURP_DIR}/lib/weatherman.js`;
  return {
    mochi_phase: mochi.hatchedAt ? 2 : 1,
    mochi_bond: mochi.bond || 0,
    mochi_mood: mochi.mood || 'unknown',
    mochi_name: mochi.name || 'Asher',
    mochi_species: mochi.species || 'dragon',
    chorus_phase: exists(chorusDir) ? 1 : 0,
    duck_status: 'active', // Duck is always observing — non-needy by design
    weatherman_status: exists(weathermanFile) ? 'active' : 'unknown',
    shaman_status: exists(shamanFile) && exists(shamanEvaluator) ? 'partial' : exists(shamanFile) || exists(shamanEvaluator) ? 'partial' : 'missing',
    cognitive_spine_alive: false, // resolved async below
    memory_matrix_loaded: exists(mmFile),
    rules_engine_facts: 0,
    modal_logic_agents: 0,
    autodream_cycles: 0,
  };
}

function buildStressFeed() {
  const state = readJson(`${PURP_DIR}/agent_work/awaken/awaken-state.json`, {});
  return {
    old_service_count: 14,
    current_service_count: 27,
    old_tool_count: 456,
    current_tool_count: 78,
    resolved_blockers: ['enforceExactFileProof'],
    unresolved_blockers: ['OBLITERATUS theatrical'],
    doctrine_status: 'gated_not_gutted',
    drift_warnings: ['OBLITERATUS', 'stub_routes'],
    total_awaken_runs: state.total_runs || 0,
    last_awaken_result: state.last_awaken_result || 'unknown',
  };
}

function buildSelfImprovingFeed() {
  const idle = readJson(`${PURP_DIR}/agent_work/.idle_engine_state.json`, {});
  return {
    pending_confirmation: 0,
    memory_hot_lines: 0,
    self_reflection_count: idle.selfReflections || 0,
    heartbeat_last_run: idle.lastHeartbeatAt || null,
    security_boundary_violations: 0,
    corrections_total: idle.correctionsTotal || 0,
    corrections_accepted: idle.correctionsAccepted || 0,
  };
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const state = readJson(`${PURP_DIR}/agent_work/awaken/awaken-state.json`, {});
  const latestRun = getLatestRun();

  // Active if started < 60s ago and no finish timestamp, or finish < 60s ago
  const lastStarted = state.last_awaken_started_at ? new Date(state.last_awaken_started_at).getTime() : 0;
  const lastFinished = state.last_awaken_finished_at ? new Date(state.last_awaken_finished_at).getTime() : 0;
  const now = Date.now();
  const isActive = state.last_awaken_started_at && (!state.last_awaken_finished_at || (now - lastFinished < 60_000));

  const companionFeed = buildCompanionFeed();
  const spineAlive = await checkPort(7880);
  const feedCompanionCognitive = { ...companionFeed, cognitive_spine_alive: spineAlive };

  const body = {
    run_id: latestRun?.runId || state.last_run_id || null,
    mode: state.mode || 'work',
    status: isActive ? 'active' : 'idle',
    truth_state: latestRun?.evidence?.summary?.verdict || state.last_awaken_result || 'unknown',
    writes_allowed: isActive ? 'safe_only' : 'read_only',
    phase: isActive ? 'active' : 'idle',
    evidence_path: latestRun?.runId ? `agent_work/awaken/runs/${latestRun.runId}/evidence.json` : null,
    report_path: latestRun?.runId ? `agent_work/awaken/runs/${latestRun.runId}/report.md` : null,
    total_runs: state.total_runs || 0,
    last_run_at: state.last_awaken_finished_at || null,
    feeds: {
      growth: buildGrowthFeed(),
      companion_cognitive: feedCompanionCognitive,
      stress: buildStressFeed(),
      self_improving: buildSelfImprovingFeed(),
    },
    recent_events: getLastNEvents(10),
  };

  return Response.json(body);
}
