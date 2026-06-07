'use strict';
/**
 * lib/gate-pipeline.js — Anti-Goblin Data Ingestion Triage
 * ════════════════════════════════════════════════════════════
 *
 * The idle engine captures everything. The gate pipeline decides
 * what actually gets promoted into training data.
 *
 * Five gates. Each inspects a different dimension of session quality.
 * A session must pass ALL gates to produce training candidates.
 * Failures are quarantined, not deleted — you can review them.
 *
 * GATE 1: Compilation Gate
 *   Did the code written during this session actually build?
 *   Never train on broken syntax. Exit code 0 required.
 *
 * GATE 2: Git Diff Gate
 *   What was kept vs what was thrown away?
 *   git reset --hard = strong negative signal.
 *   git commit = positive signal.
 *
 * GATE 3: Semantic Variance Gate
 *   Is this a 2am Web3 obsession or a real pattern?
 *   Checks against historical code footprint.
 *   Bizarre libraries → sandboxed, not baked in.
 *
 * GATE 4: Session Quality Gate
 *   Was this a real work session or chaos?
 *   Duration ≥ 2 min. Not just "lol/bro" spam.
 *   Tool calls present. Actual work happened.
 *
 * GATE 5: Historical Footprint Gate
 *   Does this session match established patterns?
 *   Checks against 30-day history of packages, languages, commands.
 *   First-time patterns → flagged for review, not auto-promoted.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PURP_DIR = path.resolve(__dirname, '..');
const GATE_STATE_FILE = path.join(PURP_DIR, 'agent_work', '.gate_pipeline_state.json');
const QUARANTINE_DIR = path.join(PURP_DIR, 'agent_work', 'quarantine');
const FOOTPRINT_FILE = path.join(PURP_DIR, 'agent_work', 'historical_footprint.json');

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  sessionsGated: 0,
  sessionsPassed: 0,
  sessionsQuarantined: 0,
  gateStats: {},
  quarantined: [],
};

function loadState() {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(GATE_STATE_FILE, 'utf8')) }; } catch {}
}
function saveState() {
  try {
    fs.mkdirSync(path.dirname(GATE_STATE_FILE), { recursive: true });
    fs.writeFileSync(GATE_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {}
}
loadState();

// ── Quarantine ─────────────────────────────────────────────────────────────
function quarantine(sessionId, reason, data) {
  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  const file = path.join(QUARANTINE_DIR, `${sessionId || Date.now()}_${reason.gate}.json`);
  fs.writeFileSync(file, JSON.stringify({
    ts: new Date().toISOString(),
    reason,
    sessionData: data ? { corrections: data.corrections?.length, preferences: data.preferences?.length } : null,
    verdict: 'QUARANTINED',
  }, null, 2), 'utf8');
  state.sessionsQuarantined++;
  state.quarantined.push({ file, reason: reason.gate, ts: new Date().toISOString() });
  // Keep last 100
  if (state.quarantined.length > 100) state.quarantined = state.quarantined.slice(-100);
  saveState();
  return { passed: false, quarantined: true, reason: reason.gate, file };
}

// ── Historical Footprint ───────────────────────────────────────────────────
function loadFootprint() {
  try { return JSON.parse(fs.readFileSync(FOOTPRINT_FILE, 'utf8')); }
  catch { return { packages: {}, commands: {}, languages: {}, patterns: {}, lastUpdated: null }; }
}

function updateFootprint(sessionData) {
  const fp = loadFootprint();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  // Update package footprint
  if (sessionData.packages) {
    for (const pkg of sessionData.packages) {
      if (!fp.packages[pkg]) fp.packages[pkg] = { count: 0, firstSeen: now, lastSeen: now };
      fp.packages[pkg].count++;
      fp.packages[pkg].lastSeen = now;
    }
  }

  // Update command footprint
  if (sessionData.commands) {
    for (const cmd of sessionData.commands) {
      if (!fp.commands[cmd]) fp.commands[cmd] = { count: 0, firstSeen: now, lastSeen: now };
      fp.commands[cmd].count++;
      fp.commands[cmd].lastSeen = now;
    }
  }

  // Prune entries older than 30 days
  for (const [key, entry] of Object.entries(fp.packages)) {
    if (now - entry.lastSeen > thirtyDays) delete fp.packages[key];
  }
  for (const [key, entry] of Object.entries(fp.commands)) {
    if (now - entry.lastSeen > thirtyDays) delete fp.commands[key];
  }

  fp.lastUpdated = new Date().toISOString();
  fs.mkdirSync(path.dirname(FOOTPRINT_FILE), { recursive: true });
  fs.writeFileSync(FOOTPRINT_FILE, JSON.stringify(fp, null, 2), 'utf8');
  return fp;
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 1: Compilation Gate
// ═══════════════════════════════════════════════════════════════════════════
function gateCompilation(sessionData, context = {}) {
  const stats = state.gateStats.compilation || { runs: 0, passed: 0 };
  stats.runs++;

  // If no compilation context available, pass by default (can't verify)
  if (!context.buildCommand && !context.exitCode && !context.typeErrors) {
    stats.passed++;
    state.gateStats.compilation = stats;
    saveState();
    return { passed: true, gate: 'compilation', reason: 'no-build-context' };
  }

  // Exit code must be 0
  if (context.exitCode !== undefined && context.exitCode !== 0) {
    stats.failed = (stats.failed || 0) + 1;
    state.gateStats.compilation = stats;
    saveState();
    return { passed: false, gate: 'compilation', reason: `build failed (exit ${context.exitCode})` };
  }

  // Type errors present
  if (context.typeErrors && context.typeErrors > 0) {
    stats.failed = (stats.failed || 0) + 1;
    state.gateStats.compilation = stats;
    saveState();
    return { passed: false, gate: 'compilation', reason: `${context.typeErrors} type errors` };
  }

  stats.passed++;
  state.gateStats.compilation = stats;
  saveState();
  return { passed: true, gate: 'compilation', exitCode: context.exitCode };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 2: Git Diff Gate
// ═══════════════════════════════════════════════════════════════════════════
function gateGitDiff(sessionData, context = {}) {
  const stats = state.gateStats.gitDiff || { runs: 0, passed: 0 };
  stats.runs++;

  try {
    const cwd = context.cwd || PURP_DIR;

    // Check if this is even a git repo
    try { execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe', timeout: 5000 }); }
    catch { stats.passed++; state.gateStats.gitDiff = stats; saveState(); return { passed: true, gate: 'git-diff', reason: 'not-a-repo' }; }

    // Get diff stats
    const diffStat = execSync('git diff --stat HEAD', { cwd, encoding: 'utf8', timeout: 5000 }).trim();
    const stagedStat = execSync('git diff --cached --stat', { cwd, encoding: 'utf8', timeout: 5000 }).trim();
    const logMsg = (() => { try { return execSync('git log --oneline -1', { cwd, encoding: 'utf8', timeout: 5000 }).trim(); } catch { return ''; } })();

    // Check for reset --hard (strong negative signal)
    const reflog = (() => {
      try { return execSync('git reflog -5', { cwd, encoding: 'utf8', timeout: 5000 }); } catch { return ''; }
    })();
    const hadReset = reflog.includes('reset: moving to') || reflog.includes('reset --hard');

    if (hadReset && !logMsg) {
      stats.failed = (stats.failed || 0) + 1;
      state.gateStats.gitDiff = stats;
      saveState();
      return { passed: false, gate: 'git-diff', reason: 'git reset --hard detected — work was thrown away' };
    }

    // Check for actual commits (strong positive signal)
    const hasCommits = !!logMsg;
    const hasChanges = diffStat.length > 0 || stagedStat.length > 0;

    // Pass: either has commits or has staged/unstaged changes being worked on
    if (hasCommits || hasChanges) {
      stats.passed++;
      state.gateStats.gitDiff = stats;
      saveState();
      return { passed: true, gate: 'git-diff', hasCommits, hasChanges, lastCommit: logMsg.substring(0, 80) };
    }

    // No changes, no commits — might be a read-only session
    stats.passed++;
    state.gateStats.gitDiff = stats;
    saveState();
    return { passed: true, gate: 'git-diff', reason: 'no-changes-read-only' };
  } catch (e) {
    stats.errors = (stats.errors || 0) + 1;
    state.gateStats.gitDiff = stats;
    saveState();
    return { passed: true, gate: 'git-diff', reason: `git-check-failed: ${e.message.substring(0, 100)}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 3: Semantic Variance Gate
// ═══════════════════════════════════════════════════════════════════════════
function gateSemanticVariance(sessionData, context = {}) {
  const stats = state.gateStats.semanticVariance || { runs: 0, passed: 0 };
  stats.runs++;

  const fp = loadFootprint();
  const suspiciousPackages = [];
  const firstTimePatterns = [];

  // Check packages against historical footprint
  if (context.packages && context.packages.length > 0) {
    for (const pkg of context.packages) {
      const fpEntry = fp.packages[pkg];
      if (!fpEntry || fpEntry.count < 2) {
        // First time seeing this package or very rare
        firstTimePatterns.push({ type: 'package', name: pkg, footprint: fpEntry?.count || 0 });
      }
      // Check for suspicious categories
      const suspicious = ['web3', 'ethers', 'solana', '@solana', 'blockchain', 'crypto',
        'puppeteer-extra', 'playwright-extra', 'tor', 'selenium-stealth'];
      if (suspicious.some(s => pkg.toLowerCase().includes(s))) {
        suspiciousPackages.push(pkg);
      }
    }
  }

  // Check commands against footprint
  if (context.commands && context.commands.length > 0) {
    for (const cmd of context.commands) {
      const fpEntry = fp.commands[cmd];
      if (!fpEntry || fpEntry.count < 2) {
        firstTimePatterns.push({ type: 'command', name: cmd, footprint: fpEntry?.count || 0 });
      }
    }
  }

  // Decision logic
  if (suspiciousPackages.length > 0) {
    const ratio = suspiciousPackages.length / Math.max(context.packages.length, 1);
    if (ratio > 0.3) {
      stats.flagged = (stats.flagged || 0) + 1;
      state.gateStats.semanticVariance = stats;
      saveState();
      return {
        passed: false,
        gate: 'semantic-variance',
        reason: `${suspiciousPackages.length} suspicious packages (${(ratio * 100).toFixed(0)}% of session): ${suspiciousPackages.join(', ')}`,
        flag: 'SANDBOX_ONLY',
      };
    }
  }

  // First-time patterns aren't a fail, just a flag
  stats.passed++;
  state.gateStats.semanticVariance = stats;
  saveState();

  return {
    passed: true,
    gate: 'semantic-variance',
    firstTimePatterns: firstTimePatterns.length > 0 ? firstTimePatterns.slice(0, 10) : null,
    suspiciousCount: suspiciousPackages.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 4: Session Quality Gate
// ═══════════════════════════════════════════════════════════════════════════
function gateSessionQuality(sessionData, context = {}) {
  const stats = state.gateStats.sessionQuality || { runs: 0, passed: 0 };
  stats.runs++;

  // Duration check (minimum 2 minutes for a real work session)
  const durationMs = context.durationMs || 0;
  const durationMin = durationMs / 60000;

  if (durationMs > 0 && durationMin < 2 && context.toolCalls < 2) {
    stats.failed = (stats.failed || 0) + 1;
    state.gateStats.sessionQuality = stats;
    saveState();
    return { passed: false, gate: 'session-quality', reason: `too short (${durationMin.toFixed(1)}min) with only ${context.toolCalls || 0} tool calls` };
  }

  // Semantic density check — too much lol/bro, not enough work
  if (context.semanticScore !== undefined && context.semanticScore < 0.3) {
    stats.failed = (stats.failed || 0) + 1;
    state.gateStats.sessionQuality = stats;
    saveState();
    return { passed: false, gate: 'session-quality', reason: `low semantic density (score: ${context.semanticScore.toFixed(2)})` };
  }

  // Must have at least some tool calls or corrections
  const totalInteractions = (context.toolCalls || 0) + (context.corrections || 0);
  if (totalInteractions < 1) {
    stats.failed = (stats.failed || 0) + 1;
    state.gateStats.sessionQuality = stats;
    saveState();
    return { passed: false, gate: 'session-quality', reason: 'no tool calls or corrections — read-only session' };
  }

  stats.passed++;
  state.gateStats.sessionQuality = stats;
  saveState();
  return { passed: true, gate: 'session-quality', durationMin: durationMin.toFixed(1), toolCalls: context.toolCalls };
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE 5: Historical Footprint Gate
// ═══════════════════════════════════════════════════════════════════════════
function gateHistoricalFootprint(sessionData, context = {}) {
  const stats = state.gateStats.historicalFootprint || { runs: 0, passed: 0 };
  stats.runs++;

  const fp = loadFootprint();
  const totalKnown = Object.keys(fp.packages).length + Object.keys(fp.commands).length;

  // If no historical footprint yet, pass everything (cold start)
  if (totalKnown < 5) {
    stats.passed++;
    state.gateStats.historicalFootprint = stats;
    saveState();
    return { passed: true, gate: 'historical-footprint', reason: 'cold-start — building footprint' };
  }

  // Check how much of this session matches established patterns
  const packages = context.packages || [];
  const commands = context.commands || [];
  const totalItems = packages.length + commands.length;
  if (totalItems === 0) {
    stats.passed++;
    state.gateStats.historicalFootprint = stats;
    saveState();
    return { passed: true, gate: 'historical-footprint', reason: 'no-packages-or-commands' };
  }

  let knownCount = 0;
  for (const pkg of packages) if (fp.packages[pkg]) knownCount++;
  for (const cmd of commands) if (fp.commands[cmd]) knownCount++;

  const matchRatio = knownCount / Math.max(totalItems, 1);

  // Below 30% match = this session is mostly new territory
  if (matchRatio < 0.3 && totalItems > 3) {
    stats.flagged = (stats.flagged || 0) + 1;
    state.gateStats.historicalFootprint = stats;
    saveState();
    return {
      passed: false,
      gate: 'historical-footprint',
      reason: `low historical match (${(matchRatio * 100).toFixed(0)}% — ${knownCount}/${totalItems} known)`,
      flag: 'REVIEW_RECOMMENDED',
    };
  }

  stats.passed++;
  state.gateStats.historicalFootprint = stats;
  saveState();
  return { passed: true, gate: 'historical-footprint', matchRatio: (matchRatio * 100).toFixed(0) + '%' };
}

// ═══════════════════════════════════════════════════════════════════════════
// Full pipeline: run all 5 gates against a session
// ═══════════════════════════════════════════════════════════════════════════
function runAllGates(sessionData = {}, context = {}) {
  state.sessionsGated++;

  const results = {
    sessionId: context.sessionId || `session-${Date.now()}`,
    ts: new Date().toISOString(),
    gates: {},
    passed: true,
    quarantinedGates: [],
    promotedCount: 0,
  };

  // Run all 5 gates
  results.gates.compilation = gateCompilation(sessionData, context);
  results.gates.gitDiff = gateGitDiff(sessionData, context);
  results.gates.semanticVariance = gateSemanticVariance(sessionData, context);
  results.gates.sessionQuality = gateSessionQuality(sessionData, context);
  results.gates.historicalFootprint = gateHistoricalFootprint(sessionData, context);

  // Collect failures
  for (const [name, result] of Object.entries(results.gates)) {
    if (!result.passed) {
      results.passed = false;
      results.quarantinedGates.push({ gate: name, reason: result.reason, flag: result.flag });
    }
  }

  // If any gate failed, quarantine the session
  if (!results.passed) {
    quarantine(results.sessionId, results.quarantinedGates[0], sessionData);
  } else {
    state.sessionsPassed++;
    // Update footprint with successful session data
    updateFootprint(context);
    results.promotedCount = (sessionData.corrections?.length || 0) + (sessionData.preferences?.length || 0);
  }

  saveState();
  return results;
}

// ── Status ─────────────────────────────────────────────────────────────────
function status() {
  return {
    ...state,
    totalGated: state.sessionsGated,
    passRate: state.sessionsGated > 0
      ? ((state.sessionsPassed / state.sessionsGated) * 100).toFixed(1) + '%'
      : 'N/A',
    quarantineCount: state.sessionsQuarantined,
    footprint: (() => {
      try { const fp = loadFootprint(); return { packages: Object.keys(fp.packages).length, commands: Object.keys(fp.commands).length, lastUpdated: fp.lastUpdated }; }
      catch { return { packages: 0, commands: 0 }; }
    })(),
  };
}

// ── Review quarantined sessions ────────────────────────────────────────────
function reviewQuarantine() {
  const files = [];
  try {
    for (const f of fs.readdirSync(QUARANTINE_DIR)) {
      if (f.endsWith('.json')) {
        const data = JSON.parse(fs.readFileSync(path.join(QUARANTINE_DIR, f), 'utf8'));
        files.push({ file: f, ...data });
      }
    }
  } catch {}
  return files;
}

// ── Clear quarantine ───────────────────────────────────────────────────────
function clearQuarantine() {
  try {
    for (const f of fs.readdirSync(QUARANTINE_DIR)) {
      if (f.endsWith('.json')) fs.unlinkSync(path.join(QUARANTINE_DIR, f));
    }
    state.quarantined = [];
    state.sessionsQuarantined = 0;
    saveState();
  } catch {}
  return { cleared: true };
}

module.exports = {
  runAllGates,
  gateCompilation,
  gateGitDiff,
  gateSemanticVariance,
  gateSessionQuality,
  gateHistoricalFootprint,
  quarantine,
  reviewQuarantine,
  clearQuarantine,
  updateFootprint,
  loadFootprint,
  status,
};
