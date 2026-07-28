'use strict';
/**
 * lib/approval-prompt.js — S2 ship blocker.
 *
 * Eddie audit ask 2026-07-17: "CLI run command shows 'Approval required'
 * and tells me to re-run with --approval=<id>. That's bullshit. Just ask
 * me y/n during the run."
 *
 * Provides an interactive Y/N prompt that reads from stdin, writes to
 * governance store, optionally POSTs to the orchestrator. Designed to be
 * called from the SSE event handler in bin/purpclaw.js run command.
 *
 * Returns Promise<'once'|'session'|'always'|'deny'>.
 */

const readline = require('readline');
const path = require('path');

const PURP_DIR = (() => {
  try {
    const marker = 'docs' + path.sep + 'COMPANION_EVENT_MAP.md';
    const known = ['E:' + path.sep + 'god folder' + path.sep + '02_ACTIVE_PROJECTS' + path.sep + 'PURPCLAW'];
    for (const p of known) if (require('fs').existsSync(path.join(p, marker))) return p;
  } catch {}
  return path.resolve(__dirname, '..');
})();

const COLORS = {
  reset: '\x1b[0m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  gray: '\x1b[90m', green: '\x1b[32m', red: '\x1b[31m', bold: '\x1b[1m',
};

async function prompt(approvalId, opts = {}) {
  const { command = '', risks = [], governance, httpPost, port, defaultChoice = 'once', timeoutMs = 60000 } = opts;
  // Skip the interactive prompt if stdin is not a TTY (pipes, automation)
  if (!process.stdin.isTTY) {
    return defaultChoice;
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (choice) => {
      if (done) return;
      done = true;
      try { rl.close(); } catch {}
      resolve(choice);
    };
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const banner = [
      '',
      `${COLORS.yellow}${COLORS.bold}  ⚠ Approval required${COLORS.reset}  ${COLORS.cyan}${approvalId}${COLORS.reset}`,
      command ? `${COLORS.gray}  Command: ${COLORS.reset}${command.substring(0, 200)}` : '',
      Array.isArray(risks) && risks.length ? `${COLORS.gray}  Risks:   ${COLORS.reset}${risks.join(', ')}` : '',
      '',
      `${COLORS.cyan}  [y]es once · [n]o · [s]ession allow · [a]lways allow · [d]eny + abort${COLORS.reset}`,
      `  > `,
    ].filter(Boolean).join('\n');
    process.stdout.write(banner);
    // Timeout — if user doesn't answer, default to deny (fail-closed)
    const timeout = setTimeout(() => finish('deny'), timeoutMs);
    rl.once('line', (line) => {
      clearTimeout(timeout);
      const ans = String(line || '').trim().toLowerCase();
      const map = { y: 'once', yes: 'once', s: 'session', a: 'always', n: 'no', no: 'no', d: 'deny', '': defaultChoice };
      finish(map[ans] || 'deny');
    });
    rl.once('close', () => {
      clearTimeout(timeout);
      finish('deny');
    });
  });
}

/**
 * Apply the user's choice to governance store + best-effort orchestrator POST.
 * Returns { choice, decision, posted }.
 */
async function apply(approvalId, choice, opts = {}) {
  const decision = { once: 'approved', session: 'approved', always: 'approved', no: 'denied', deny: 'denied' }[choice] || 'denied';
  let posted = false;
  // Write to governance store (synchronous, on-disk JSONL)
  try {
    const gov = opts.governance || require(path.join(PURP_DIR, 'lib', 'governance'));
    gov.setApprovalStatus(PURP_DIR, approvalId, decision);
  } catch (e) {
    console.error(`${COLORS.red}  approval store write failed: ${e.message}${COLORS.reset}`);
  }
  // Best-effort POST to orchestrator
  if (opts.httpPost && opts.port) {
    try {
      await opts.httpPost(opts.port, `/api/approvals/${approvalId}`, { status: decision, choice }, 5000);
      posted = true;
    } catch { /* endpoint optional */ }
  }
  const color = decision === 'approved' ? COLORS.green : COLORS.red;
  const label = decision === 'approved' ? '✓ approved' : '✗ denied';
  console.log(`${color}  ${label}${COLORS.reset}`);
  return { choice, decision, posted };
}

module.exports = { prompt, apply, PURP_DIR, COLORS };
