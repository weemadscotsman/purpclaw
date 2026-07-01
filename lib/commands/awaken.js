'use strict';

/**
 * lib/commands/awaken.js
 * CLI: purpclaw awaken
 *
 *   purpclaw awaken                  — run with default mode (work)
 *   purpclaw awaken --mode watch     — read-only monitoring
 *   purpclaw awaken --mode work     — safe docs/evidence writes
 *   purpclaw awaken --mode monster   — autonomous scanning/research
 *   purpclaw awaken --mode ritual    — Shaman-led guided session
 *   purpclaw awaken status           — show current state
 *   purpclaw awaken stop            — abort active run
 *   purpclaw awaken events [--n 20] — show recent events
 */

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
};

const isTTY = !!process.stdout.isTTY;
const col = (c, s) => isTTY ? `${c}${String(s)}${C.reset}` : String(s);
const bold = (s) => col(C.bold, s);
const dim = (s) => col(C.gray, s);
const tick = (ok) => ok ? col(C.green, '✓') : col(C.red, '✗');
const warn = (s) => col(C.yellow, s);
const info = (s) => col(C.cyan, s);

const { ALL_MODES, getMode } = require('../awaken/awaken-permissions');

function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (const a of args) {
    if (a === '--json') flags.json = true;
    else if (a.startsWith('--mode=')) flags.mode = a.replace('--mode=', '');
    else if (a.startsWith('--n=')) flags.n = parseInt(a.replace('--n=', ''), 10);
    else positional.push(a);
  }
  return { flags, positional };
}

function sectionHead(label) {
  console.log('\n' + dim('─'.repeat(56)));
  console.log('  ' + bold(label));
  console.log(dim('─'.repeat(56)));
}

async function cmdAwaken(args) {
  const { flags, positional } = parseArgs(args);
  const sub = positional[0] || '';

  if (sub === 'status') return showStatus(flags);
  if (sub === 'stop') return doStop(flags);
  if (sub === 'events') return showEvents(flags);
  if (sub === 'preflight') return showPreflight(flags);

  // ── Run ────────────────────────────────────────────────────────────────
  const mode = flags.mode || 'work';
  if (!ALL_MODES.includes(mode)) {
    console.error(`Unknown mode: ${mode}. Options: ${ALL_MODES.join(', ')}`);
    process.exit(1);
  }

  const modeInfo = getMode(mode);
  const modeLabel = `${modeInfo.colour}${modeInfo.label.toUpperCase()}${C.reset}`;

  console.log('\n' + bold('🔴 AWAKEN — THE BIG RED BUTTON'));
  console.log(dim('The machine breathes.'));
  console.log('');
  console.log(`  Mode:     ${modeLabel}`);
  console.log(`  Preflight check...`);

  // Preflight first (synchronous for feedback)
  const { preflightChecks } = require('../awaken/awaken-preflight');
  const preflight = await preflightChecks();

  if (preflight.failures > 0) {
    console.log(`  ${tick(false)} Preflight: ${warn(preflight.summary)}`);
  } else {
    console.log(`  ${tick(true)} Preflight: ${preflight.summary}`);
  }

  console.log(`\n  ${dim('Starting AWAKEN loop...')}\n`);

  // Run async, collect result
  const { run } = require('../awaken/awaken-loop');
  const result = await run(mode, {});

  // ── Output ─────────────────────────────────────────────────────────────
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n' + dim('═'.repeat(56)));
  console.log('  ' + bold('AWAKEN REPORT — ' + result.runId));
  console.log(dim('═'.repeat(56)));

  // Badge display
  const badgeMap = { clean: col(C.green, '🟢 CLEAN'), warning: col(C.yellow, '🟡 WARNINGS'), errors: col(C.red, '🔴 ERRORS') };
  console.log(`\n  Overall:  ${badgeMap[result.badge] || result.badge}`);
  console.log(`  Mode:     ${modeLabel}`);
  console.log(`  Run ID:   ${dim(result.runId)}`);
  console.log(`  Summary:  ${result.summary}`);

  if (result.preflightWarnings) {
    console.log(`  Preflight: ${warn(result.preflightWarnings)}`);
  }

  // Findings breakdown
  sectionHead('FINDINGS (' + result.findings.length + ')');
  const clean = result.findings.filter(f => f.badge === 'clean');
  const warnings = result.findings.filter(f => f.badge === 'warning');
  const errors = result.findings.filter(f => f.badge === 'error' || f.badge === 'liar');

  if (clean.length) {
    for (const f of clean.slice(0, 10)) {
      console.log(`  ${col(C.green, '🟢')}  ${col(C.white, f.category.padEnd(20))} ${dim(f.item)}`);
    }
  }
  if (warnings.length) {
    for (const f of warnings.slice(0, 10)) {
      console.log(`  ${col(C.yellow, '🟡')}  ${col(C.white, f.category.padEnd(20))} ${dim(f.item)}`);
    }
  }
  if (errors.length) {
    for (const f of errors.slice(0, 10)) {
      console.log(`  ${col(C.red, '🔴')}  ${col(C.white, f.category.padEnd(20))} ${dim(f.item)}`);
    }
  }

  // Companion reactions
  if (result.companionReactions && result.companionReactions.length) {
    sectionHead('COMPANIONS');
    for (const r of result.companionReactions) {
      console.log(`  ${dim('→')} ${info(r.companion)}: ${dim(r.reaction)}`);
    }
  }

  // Actions taken
  if (result.actions && result.actions.length) {
    sectionHead('ACTIONS (' + result.actions.length + ')');
    for (const a of result.actions) {
      const riskColour = a.risk === 'safe' ? C.green : a.risk === 'low' ? C.cyan : a.risk === 'medium' ? C.yellow : C.red;
      console.log(`  ${col(riskColour, a.risk.toUpperCase().padEnd(7))} ${a.action} → ${a.status} ${dim(a.detail)}`);
    }
  }

  // Preflight detail if issues
  if (preflight.failures > 0) {
    sectionHead('PREFLIGHT DETAIL');
    for (const check of preflight.checks) {
      if (!check.ok) {
        const icon = check.ok === false ? tick(false) : tick(true);
        console.log(`  ${icon}  ${check.name.padEnd(30)} ${dim(check.detail)}`);
      }
    }
  }

  console.log('\n' + dim(`  Report: agent_work/awaken/runs/${result.runId}/report.md`));
  console.log(dim(`  Events: agent_work/awaken/events.jsonl`));
  console.log('');
}

// ── Status ────────────────────────────────────────────────────────────────────

function showStatus(flags) {
  const { status } = require('../awaken/awaken-loop');
  const st = status();
  const { read } = require('../awaken/awaken-state');

  if (flags.json) {
    console.log(JSON.stringify(st, null, 2));
    return;
  }

  console.log('\n' + bold('🔴 AWAKEN STATUS'));

  const lastRun = read();
  console.log(`  Total runs:     ${info(lastRun.total_runs || 0)}`);
  console.log(`  Last result:    ${lastRun.last_awaken_result ? lastRun.last_awaken_result : dim('never')}`);
  console.log(`  Last run ID:    ${lastRun.last_run_id ? dim(lastRun.last_run_id) : dim('none')}`);
  if (lastRun.last_awaken_finished_at) {
    console.log(`  Last finished:  ${dim(lastRun.last_awaken_finished_at)}`);
  }
  console.log(`  Current mode:   ${st.mode ? info(st.mode) : dim('idle')}`);
  console.log(`  Active:         ${st.active ? col(C.red, 'RUNNING') : col(C.green, 'idle')}`);
  if (st.active && st.currentRun) {
    console.log(`  Run ID:         ${dim(st.currentRun)}`);
  }
  if (st.uptime) {
    const secs = Math.round(st.uptime / 1000);
    console.log(`  Uptime:         ${dim(secs + 's')}`);
  }
  if (lastRun.consecutive_fails) {
    console.log(`  Consecutive fails: ${warn(lastRun.consecutive_fails)}`);
  }
  console.log('');
}

// ── Stop ───────────────────────────────────────────────────────────────────────

function doStop(flags) {
  const { stop } = require('../awaken/awaken-loop');
  const result = stop();
  if (result.ok) {
    console.log(`\n  ${col(C.yellow, '⚠ ABORTED')} AWAKEN run ${result.runId} stopped.\n`);
  } else {
    console.error(`\n  ${col(C.red, '✗')} ${result.error}\n`);
    process.exit(1);
  }
}

// ── Events ─────────────────────────────────────────────────────────────────────

function showEvents(flags) {
  const { getRecent } = require('../awaken/awaken-events');
  const count = flags.n || 20;
  const events = getRecent(count);

  if (flags.json) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  console.log('\n' + bold(`RECENT AWAKEN EVENTS (last ${events.length})`));
  for (const e of events.slice(-count)) {
    const ts = e.ts ? dim(e.ts.slice(11, 19)) : dim('??:??:??');
    const phaseMap = { arm: 'ARM', wake: 'WAKE', scan: 'SCAN', self_run: 'SELF-RUN', report: 'REPORT', complete: 'DONE', abort: 'ABORT', error: 'ERROR' };
    const phase = phaseMap[e.phase] || e.phase || '';
    const phaseColour = e.phase === 'complete' ? C.green : e.phase === 'error' || e.phase === 'abort' ? C.red : e.phase === 'scan' ? C.cyan : C.gray;
    const type = e.type || '';
    console.log(`  ${ts}  ${col(phaseColour, phase.padEnd(9))} ${info(type)}`);
    if (e.detail) console.log(`           ${dim(String(e.detail).slice(0, 60))}`);
  }
  console.log('');
}

// ── Preflight only ──────────────────────────────────────────────────────────────

async function showPreflight(flags) {
  const { preflightChecks } = require('../awaken/awaken-preflight');
  const result = await preflightChecks();

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n' + bold('🔴 PREFLIGHT'));
  for (const check of result.checks) {
    const icon = check.ok === true ? tick(true) : check.ok === false ? tick(false) : dim('?');
    const nameColour = check.ok === false ? C.red : check.ok === null ? C.yellow : C.white;
    console.log(`  ${icon}  ${col(nameColour, String(check.name).padEnd(30))} ${dim(check.detail || '')}`);
  }
  console.log(`\n  ${result.failures > 0 ? tick(false) : tick(true)} ${result.summary}`);
  console.log('');
}

module.exports = { run: cmdAwaken };
