'use strict';

/**
 * lib/awaken/awaken-loop.js
 * The AWAKEN core loop.
 *
 * Modes:
 *   watch   — read-only monitoring
 *   work    — safe writes: docs, evidence, queue updates
 *   monster — autonomous: research, donor candidates, evolve proposals
 *   ritual  — Shaman-led guided session
 *
 * Safety contract:
 *   - Every action writes an event.
 *   - High-risk actions require approval before execution.
 *   - No silent destructive writes.
 *   - Stop command exists.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PURP_DIR        = path.join(__dirname, '..', '..');
const EVENTS_DIR      = path.join(PURP_DIR, 'agent_work', 'awaken');
const RUNS_DIR        = path.join(EVENTS_DIR, 'runs');
const EVIDENCE_DIR    = path.join(EVENTS_DIR, 'evidence');

const state        = require('./awaken-state');
const events       = require('./awaken-events');
const perms        = require('./awaken-permissions');

const RISK = { SAFE: 'safe', LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

// ── Utilities ────────────────────────────────────────────────────────────────

function runId() {
  return `awaken-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function badgeClass(badge) {
  const map = { clean: 'green', warning: 'yellow', error: 'red', unknown: 'gray', suspicious: 'cyan', liar: 'red', drift: 'yellow' };
  return map[badge] || 'gray';
}

function evidencePath(runId, name) {
  return path.join(EVIDENCE_DIR, `${runId}_${name}.json`);
}

function runDir(runId) {
  return path.join(RUNS_DIR, runId);
}

// ── World state snapshot ─────────────────────────────────────────────────────

async function snapshotWorldState(runId) {
  const snap = { ts: new Date().toISOString(), runId };

  // Agent leaderboard
  try {
    const AGENT_SCORE = path.join(PURP_DIR, 'agent_work', 'agent_score.json');
    if (fs.existsSync(AGENT_SCORE)) {
      const scores = JSON.parse(fs.readFileSync(AGENT_SCORE, 'utf8'));
      const ranked = Object.entries(scores)
        .filter(([, s]) => (s.totalTasks || 0) >= 1)
        .sort(([, a], [, b]) => (b.successRate || 0) - (a.successRate || 0))
        .slice(0, 10)
        .map(([name, s]) => ({ name, successRate: s.successRate, totalTasks: s.totalTasks }));
      snap.agentLeaderboard = ranked;
    }
  } catch (_) {}

  // Idle engine state
  try {
    const idleFile = path.join(PURP_DIR, 'agent_work', '.idle_engine_state.json');
    if (fs.existsSync(idleFile)) {
      snap.idleEngine = JSON.parse(fs.readFileSync(idleFile, 'utf8'));
    }
  } catch (_) {}

  // Evolution log
  try {
    const logFile = path.join(PURP_DIR, 'agent_work', 'evolution-log.jsonl');
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-5);
      snap.recentEvolution = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    }
  } catch (_) {}

  // Evolve proposals
  try {
    const proposedFile = path.join(PURP_DIR, 'agent_work', 'evolution', 'proposed.jsonl');
    if (fs.existsSync(proposedFile)) {
      const lines = fs.readFileSync(proposedFile, 'utf8').trim().split('\n').slice(-10);
      snap.pendingEvolve = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    }
  } catch (_) {}

  // Training data summary
  try {
    const fbDir = path.join(process.env.PURPCLAW_TRAINING_DIR || 'E:/training', 'user-feedback');
    if (fs.existsSync(fbDir)) {
      const files = fs.readdirSync(fbDir).filter(f => f.endsWith('.ndjson'));
      const latest = files.sort().slice(-1)[0];
      if (latest) {
        const lines = fs.readFileSync(path.join(fbDir, latest), 'utf8').trim().split('\n');
        const counts = { total: lines.length, corrections: 0, preferences: 0 };
        for (const l of lines) {
          try {
            const r = JSON.parse(l);
            if (r.type === 'correction') counts.corrections++;
            if (r.type === 'preference') counts.preferences++;
          } catch (_) {}
        }
        snap.training = { ...counts, latestFile: latest };
      }
    }
  } catch (_) {}

  // Workflows (orchestrator queue) — sw graceful if offline
  try {
    const http = require('http');
    const data = await new Promise((res) => {
      const req = http.get('http://127.0.0.1:7784/api/workflows', r => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => { try { res(JSON.parse(body)); } catch { res({}); } });
      });
      req.setTimeout(3000, () => { try { req.destroy(); } catch (_) {} res({}); });
      req.on('error', () => { try { req.destroy(); } catch (_) {} res({}); });
    });
    snap.activeWorkflows = (data.workflows || data.active || []).slice(0, 10);
    snap.queueDepth = data.queueDepth || data.queue || 0;
  } catch (_) {}

  // Awaken history
  try {
    const recent = events.getRecent(5);
    snap.recentAwaken = recent.map(e => ({ ts: e.ts, runId: e.runId, phase: e.phase, type: e.type }));
  } catch (_) {}

  // Save snapshot
  const snapFile = path.join(runDir(runId), 'snapshot.json');
  fs.mkdirSync(path.dirname(snapFile), { recursive: true });
  fs.writeFileSync(snapFile, JSON.stringify(snap, null, 2));

  return snap;
}

// ── Scanner ─────────────────────────────────────────────────────────────────

async function scan(runId, mode) {
  const findings = [];

  // ── Docs drift ────────────────────────────────────────────────────────────
  try {
    const docsDir = path.join(PURP_DIR, 'docs');
    const auditDir = path.join(PURP_DIR, 'docs', 'audit');
    const designDir = path.join(PURP_DIR, 'docs', 'design');
    const readDoc = (dir, file) => {
      const p = path.join(dir, file);
      if (!fs.existsSync(p)) return null;
      const m = fs.statSync(p).mtime;
      const content = fs.readFileSync(p, 'utf8');
      const dateMatch = content.match(/Date:\s*(\d{4}-\d{2}-\d{2})/);
      return { path: p, mtime: m, docDate: dateMatch ? dateMatch[1] : null };
    };

    for (const [dir, label] of [[docsDir, 'docs'], [auditDir, 'audit'], [designDir, 'design']]) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const f of files.slice(0, 20)) {
        const info = readDoc(dir, f);
        if (!info) continue;
        const now = new Date();
        const mtime = new Date(info.mtime);
        const daysOld = Math.round((now - mtime) / 86400000);
        const badge = daysOld > 14 ? 'warning' : 'clean';
        const item = { category: `docs/${label}`, item: f, badge, detail: `mtime ${daysOld}d ago`, daysOld };
        findings.push(item);
        events.emitScanItem(runId, item.category, item.item, item.badge);
      }
    }
  } catch (e) {
    findings.push({ category: 'docs', item: 'scan', badge: 'unknown', detail: e.message });
  }

  // ── Untracked/unaccounted files ─────────────────────────────────────────────
  try {
    const untracked = execSync('git status --porcelain', { cwd: PURP_DIR, encoding: 'utf8', windowsHide: true, timeout: 5000 })
      .trim().split('\n').filter(Boolean).slice(0, 20);
    for (const line of untracked) {
      const file = line.slice(3).trim();
      const badge = file.includes('agent_work/') ? 'warning' : 'drift';
      const item = { category: 'git/untracked', item: file, badge, detail: 'untracked' };
      findings.push(item);
      events.emitScanItem(runId, item.category, item.item, item.badge);
    }
  } catch (_) {}

  // ── Provider health ────────────────────────────────────────────────────────
  try {
    const providerHealthFile = path.join(PURP_DIR, 'agent_work', 'llm-ledger.jsonl');
    if (fs.existsSync(providerHealthFile)) {
      const lines = fs.readFileSync(providerHealthFile, 'utf8').trim().split('\n').slice(-20);
      const latestEntries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const providerStatus = {};
      for (const e of latestEntries) {
        const p = e.provider || 'unknown';
        if (!providerStatus[p]) providerStatus[p] = { ok: 0, fail: 0 };
        if (e.ok) providerStatus[p].ok++;
        else providerStatus[p].fail++;
      }
      for (const [provider, st] of Object.entries(providerStatus)) {
        const badge = st.fail > st.ok ? 'warning' : 'clean';
        const item = { category: 'provider', item: provider, badge, detail: `${st.ok}ok/${st.fail}fail` };
        findings.push(item);
        events.emitScanItem(runId, item.category, item.item, item.badge);
      }
    }
  } catch (_) {}

  // ── Service outages ────────────────────────────────────────────────────────
  try {
    const serviceRegistry = require(path.join(PURP_DIR, 'service_registry.js'));
    const services = serviceRegistry.getServices().filter(s => s.healthPort && s.healthPath);
    const http = require('http');
    const results = await Promise.allSettled(
      services.slice(0, 15).map(s =>
        new Promise((res) => {
          const req = http.get(`http://127.0.0.1:${s.healthPort}${s.healthPath}`, () => res({ port: s.healthPort, name: s.name, ok: true }));
          req.setTimeout(2000, () => { try { req.destroy(); } catch (_) {} res({ port: s.healthPort, name: s.name, ok: false }); });
          req.on('error', () => res({ port: s.healthPort, name: s.name, ok: false }));
        })
      )
    );
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const badge = r.value.ok ? 'clean' : 'warning';
      const item = { category: 'service', item: r.value.name, badge, detail: `${r.value.ok ? 'online' : 'offline'} :${r.value.port}` };
      findings.push(item);
      events.emitScanItem(runId, item.category, item.item, item.badge);
    }
  } catch (e) {
    findings.push({ category: 'service', item: 'scan', badge: 'unknown', detail: e.message });
  }

  // ── Evidence file count ────────────────────────────────────────────────────
  try {
    const evDir = EVIDENCE_DIR;
    if (!fs.existsSync(evDir)) fs.mkdirSync(evDir, { recursive: true });
    const files = fs.readdirSync(evDir).filter(f => f.endsWith('.json'));
    const badge = files.length > 100 ? 'warning' : files.length > 50 ? 'drift' : 'clean';
    findings.push({ category: 'system', item: 'evidence files', badge, detail: `${files.length} evidence files` });
    events.emitScanItem(runId, 'system', 'evidence files', badge);
  } catch (_) {}

  // ── Smith-Neo reliability ────────────────────────────────────────────────────
  try {
    const ledger = path.join(PURP_DIR, 'agent_work', 'smith-neo-ledger.json');
    if (fs.existsSync(ledger)) {
      const data = JSON.parse(fs.readFileSync(ledger, 'utf8'));
      const escapes = (data.attacks || []).filter(a => a.result === 'escaped').length;
      const total = (data.attacks || []).length;
      const badge = escapes > 0 ? 'warning' : total > 100 ? 'drift' : 'clean';
      findings.push({ category: 'security', item: 'smith-neo', badge, detail: `${escapes} escaped / ${total} total attacks` });
      events.emitScanItem(runId, 'security', 'smith-neo', badge);
    }
  } catch (_) {}

  // ── Open incidents (workflow failures) ─────────────────────────────────────
  try {
    const http = require('http');
    const data = await new Promise((res) => {
      const req = http.get('http://127.0.0.1:7784/api/workflows', r => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => { try { res(JSON.parse(body)); } catch { res({}); } });
      });
      req.setTimeout(3000, () => { try { req.destroy(); } catch (_) {} res({}); });
      req.on('error', () => { try { req.destroy(); } catch (_) {} res({}); });
    });
    const failed = (data.workflows || []).filter(w => w.status === 'failed').slice(0, 5);
    for (const wf of failed) {
      findings.push({ category: 'workflow', item: wf.workflowId || wf.id || 'unknown', badge: 'warning', detail: 'failed workflow' });
      events.emitScanItem(runId, 'workflow', (wf.workflowId || wf.id), 'warning');
    }
  } catch (_) {}

  return findings;
}

// ── Companion reactions ───────────────────────────────────────────────────────

async function triggerCompanionReactions(runId, mode, scanResults) {
  if (!perms.canDo(mode, 'companion_reactions')) return;

  const reactions = [];
  const errorCount = scanResults.filter(f => f.badge === 'error' || f.badge === 'liar').length;
  const warningCount = scanResults.filter(f => f.badge === 'warning').length;
  const cleanCount = scanResults.filter(f => f.badge === 'clean').length;

  // Mochi wakes
  try {
    const mochiFile = path.join(PURP_DIR, 'agent_work', 'mochi.json');
    if (fs.existsSync(mochiFile)) {
      const mochi = JSON.parse(fs.readFileSync(mochiFile, 'utf8'));
      const mood = errorCount > 0 ? 'concerned' : warningCount > 0 ? 'alert' : 'happy';
      const reaction = `Mochi (${mochi.name}) wakes — mood: ${mood}`;
      reactions.push({ companion: 'mochi', reaction });
      events.emitCompanionReaction(runId, 'mochi', reaction);
    }
  } catch (_) {}

  // Chorus enters mode
  if (mode !== 'watch') {
    const reaction = `Chorus enters ${mode} mode — ambient hum active`;
    reactions.push({ companion: 'chorus', reaction });
    events.emitCompanionReaction(runId, 'chorus', reaction);
  } else {
    const reaction = 'Chorus in watch mode — minimal hum';
    reactions.push({ companion: 'chorus', reaction });
    events.emitCompanionReaction(runId, 'chorus', reaction);
  }

  // Weatherman reports
  try {
    const weathermanFile = path.join(PURP_DIR, 'agent_work', '.idle_engine_state.json');
    if (fs.existsSync(weathermanFile)) {
      const idle = JSON.parse(fs.readFileSync(weathermanFile, 'utf8'));
      const pressure = errorCount > 0 ? 'HIGH' : warningCount > 2 ? 'ELEVATED' : 'NORMAL';
      const reaction = `Weatherman: system pressure ${pressure} (${cleanCount} clean / ${warningCount} warnings / ${errorCount} errors)`;
      reactions.push({ companion: 'weatherman', reaction });
      events.emitCompanionReaction(runId, 'weatherman', reaction);
    }
  } catch (_) {}

  // Duck is always there
  if (Math.random() < 0.3) {
    const duckReactions = [
      'Duck: watching. Approving.',
      'Duck tilts head.',
      'Duck: observing.',
    ];
    const reaction = duckReactions[Math.floor(Math.random() * duckReactions.length)];
    reactions.push({ companion: 'duck', reaction });
    events.emitCompanionReaction(runId, 'duck', reaction);
  }

  // Mochi angry if liar found
  if (errorCount > 0) {
    const reaction = `Mochi is angry — LIAR badge found (${errorCount} items)`;
    reactions.push({ companion: 'mochi_angry', reaction });
    events.emitCompanionReaction(runId, 'mochi', reaction);
  }

  // Squad reactions — petdex pets react to system state
  try {
    const squad = require(path.join(PURP_DIR, 'lib', 'squad'));
    const status = squad.squadStatus();
    const event = errorCount > 0 ? 'tool_error' : warningCount > 0 ? 'tool_warn' : 'tool_success';
    for (const pet of status.pets.slice(0, 3)) { // top 3 pets react
      const squadReaction = squad.squadReact(pet.slug, event, { errorCount, warningCount, mode });
      if (squadReaction) {
        reactions.push({ companion: pet.slug, reaction: squadReaction });
      }
    }
  } catch (_) {}

  return reactions;
}

// ── Safe actions (mode-dependent) ──────────────────────────────────────────────

async function runSafeActions(runId, mode, scanResults) {
  const actions = [];

  if (!perms.canDo(mode, 'safe_write')) return actions;

  // Write report
  if (perms.canDo(mode, 'safe_write')) {
    if (!fs.existsSync(runDir(runId))) {
      fs.mkdirSync(runDir(runId), { recursive: true });
    }
    const reportFile = path.join(runDir(runId), 'report.md');
    const cleanItems = scanResults.filter(f => f.badge === 'clean');
    const warningItems = scanResults.filter(f => f.badge === 'warning');
    const errorItems = scanResults.filter(f => f.badge === 'error' || f.badge === 'liar');

    const report = `# AWAKEN Report — ${runId}\n\n` +
      `**Mode:** ${mode}  \n` +
      `**Ran:** ${new Date().toISOString()}  \n\n` +
      `## Summary\n\n` +
      `| Badge | Count |\n|---|---|\n` +
      `| 🟢 Clean | ${cleanItems.length} |\n` +
      `| 🟡 Warning | ${warningItems.length} |\n` +
      `| 🔴 Error | ${errorItems.length} |\n\n` +
      `## Findings\n\n` +
      [...cleanItems, ...warningItems, ...errorItems]
        .map(f => `| ${events.BADGES[f.badge] || '⚫'} | **${f.category}** | ${f.item} | ${f.detail} |`)
        .join('\n') + '\n';

    fs.writeFileSync(reportFile, report);
    actions.push({ action: 'write_report', risk: RISK.SAFE, status: 'done', detail: `report.md written` });
    events.emitAction(runId, 'write_report', RISK.SAFE, 'done', 'report.md written');
  }

  // Write evidence
  const evidenceFile = evidencePath(runId, 'findings');
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
  fs.writeFileSync(evidenceFile, JSON.stringify({ runId, ts: new Date().toISOString(), mode, findings: scanResults }, null, 2));
  actions.push({ action: 'write_evidence', risk: RISK.SAFE, status: 'done', detail: `${scanResults.length} findings` });
  events.emitAction(runId, 'write_evidence', RISK.SAFE, 'done', `${scanResults.length} findings`);

  // Queue evolve proposals if monster mode
  if (mode === 'monster' && perms.canDo(mode, 'propose')) {
    const errorItems = scanResults.filter(f => f.badge === 'error' || f.badge === 'liar');
    if (errorItems.length > 0) {
      const proposal = {
        id: `proposal-${runId}`,
        ts: new Date().toISOString(),
        type: 'awaken-triggered',
        triggered_by: runId,
        items: errorItems.map(i => ({ category: i.category, item: i.item, badge: i.badge })),
        status: 'pending',
      };
      const proposedFile = path.join(PURP_DIR, 'agent_work', 'evolution', 'proposed.jsonl');
      fs.appendFileSync(proposedFile, JSON.stringify(proposal) + '\n');
      actions.push({ action: 'propose_evolve', risk: RISK.MEDIUM, status: 'queued', detail: `${errorItems.length} error items queued for evolve` });
      events.emitAction(runId, 'propose_evolve', RISK.MEDIUM, 'queued', `${errorItems.length} items`);
    }
  }

  return actions;
}

// ── Main run ─────────────────────────────────────────────────────────────────

async function run(mode = 'work', options = {}) {
  const { runId: optRunId } = options;
  const awakenMode = perms.getMode(mode);
  const rid = optRunId || runId();

  // Update state
  state.write({ last_awaken_started_at: new Date().toISOString(), mode, total_runs: state.read().total_runs + 1 });

  events.emit(rid, events.PHASES.ARM, 'run_start', { mode, version: '1.0.0' });

  // Phase 1: Preflight
  const preflight = await require('./awaken-preflight').preflightChecks();
  for (const check of preflight.checks) {
    events.emitPreflight(rid, check.name, check.ok, check.detail);
  }

  if (!preflight.ok) {
    // Don't abort — warn and continue
    events.emit(rid, events.PHASES.ARM, 'preflight_warnings', { failures: preflight.failures, unknowns: preflight.unknowns });
  }

  // Phase 2: Wake
  events.emit(rid, events.PHASES.WAKE, 'stack_wake', { mode, gitDirty: preflight.gitDirty });

  const components = ['world_state', 'companions', 'timeline', 'weatherman', 'oracle', 'shaman'];
  for (const comp of components) {
    events.emitAwakening(rid, comp, comp === 'shaman' && mode === 'ritual' ? 'ritual' : 'active');
  }

  // Phase 3: Scan
  const findings = await scan(rid, mode);

  // Phase 4: Self-run loop
  const companionReactions = await triggerCompanionReactions(rid, mode, findings);
  const actions = await runSafeActions(rid, mode, findings);

  // Phase 5: Report
  const errorCount = findings.filter(f => f.badge === 'error' || f.badge === 'liar').length;
  const warningCount = findings.filter(f => f.badge === 'warning').length;
  const overallBadge = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'clean';
  const summary = `${findings.length} items scanned — ${findings.filter(f => f.badge === 'clean').length} clean, ${warningCount} warnings, ${errorCount} errors`;

  events.emitReport(rid, overallBadge, summary, {
    findings: findings.length,
    clean: findings.filter(f => f.badge === 'clean').length,
    warnings: warningCount,
    errors: errorCount,
    mode,
    actions: actions.length,
    companionReactions: companionReactions ? companionReactions.length : 0,
  });

  // Update state
  state.write({
    last_awaken_finished_at: new Date().toISOString(),
    last_reviewed_change_at: new Date().toISOString(),
    last_awaken_result: overallBadge === 'clean' ? 'clean' : overallBadge === 'error' ? 'errors' : 'warnings',
    last_run_id: rid,
    consecutive_fails: overallBadge === 'error' ? state.read().consecutive_fails + 1 : 0,
  });

  events.emitComplete(rid, overallBadge);

  return {
    runId: rid,
    ok: preflight.ok,
    preflight,
    mode,
    badge: overallBadge,
    summary,
    findings,
    companionReactions,
    actions,
    preflightWarnings: preflight.failures > 0 ? `${preflight.failures} preflight failures` : null,
  };
}

// ── Stop ──────────────────────────────────────────────────────────────────────

let _activeRun = null;
let _abortController = null;

function startRun(mode, options = {}) {
  if (_activeRun && _activeRun.status === 'running') {
    return { ok: false, error: `AWAKEN already running (${_activeRun.runId}). Run 'purpclaw awaken stop' first.` };
  }
  _abortController = new (function() { try { return require('abort-controller'); } catch { return Object; } }())();
  _activeRun = { runId: null, status: 'running', mode, startTime: Date.now() };

  // Run async without blocking
  run(mode, options).then(result => {
    _activeRun = { ..._activeRun, ...result, status: 'done', endTime: Date.now() };
  }).catch(err => {
    events.emitError(_activeRun.runId, err.message);
    _activeRun = { ..._activeRun, status: 'error', error: err.message };
  });

  return { ok: true, runId: _activeRun.runId || 'pending', status: 'starting' };
}

function stop() {
  if (!_activeRun || _activeRun.status !== 'running') {
    return { ok: false, error: 'No AWAKEN run is currently running' };
  }
  if (_abortController) {
    try { _abortController.abort(); } catch (_) {}
  }
  _activeRun.status = 'aborted';
  state.write({ last_awaken_result: 'aborted' });
  events.emitAbort(_activeRun.runId, 'operator_stop');
  return { ok: true, runId: _activeRun.runId };
}

function status() {
  const st = state.read();
  return {
    state: st,
    active: _activeRun?.status === 'running',
    currentRun: _activeRun?.runId || null,
    mode: _activeRun?.mode || null,
    uptime: _activeRun?.startTime ? Date.now() - _activeRun.startTime : null,
  };
}

module.exports = { run, startRun, stop, status, scan, snapshotWorldState };
