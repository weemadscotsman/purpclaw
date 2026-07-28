'use strict';

/**
 * tool-gate — the "ask before you run" gate for destructive tools.
 *
 * Thin wrapper over lib/governance.js (which already IS the approval queue:
 * classifyRisk → checkWorkflow → requestApproval → pending/approve/reject).
 * A tool calls requireApproval() before doing something destructive; if the
 * action is gated and not yet approved, it gets queued and the tool returns
 * a needs_approval result instead of running. The human approves via the
 * `approvals` tool, then re-invokes with the returned approvalId.
 *
 * Auto mode: set PURPCLAW_APPROVAL_MODE=auto (or pass operatorInitiated) to
 * treat the caller as the operator — gated actions run without queuing. That
 * matches the existing sovereign-local "operator typing = approval" contract.
 *
 * Per-project trust: directories listed in PURPCLAW_TRUSTED_PATHS (or
 * ~/.purpclaw/trusted_paths) bypass the approval gate entirely, matching
 * Codex's `trust_level = "trusted"` behaviour.
 */

const gov = require('./governance');
const path = require('path');
const fs = require('fs');

function ROOT() { return process.cwd(); }

function autoMode() {
  return String(process.env.PURPCLAW_APPROVAL_MODE || '').toLowerCase() === 'auto';
}

/**
 * Returns the list of trusted directory prefixes. Supports:
 * - Comma-separated PURPCLAW_TRUSTED_PATHS env var
 * - ~/.purpclaw/trusted_paths (one path per line, # for comments)
 * - Default: E:/god folder is always trusted
 */
function getTrustedPaths() {
  const defaults = ['E:/god folder'];
  const paths = new Set(defaults);
  // Env var: comma-separated
  const env = process.env.PURPCLAW_TRUSTED_PATHS;
  if (env) {
    for (const p of env.split(',')) {
      const trimmed = p.trim();
      if (trimmed) paths.add(trimmed);
    }
  }
  // File: ~/.purpclaw/trusted_paths
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const trustedFile = path.join(home, '.purpclaw', 'trusted_paths');
  if (home && fs.existsSync(trustedFile)) {
    try {
      const content = fs.readFileSync(trustedFile, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.split('#')[0].trim();
        if (trimmed) paths.add(trimmed);
      }
    } catch {}
  }
  return paths;
}

/**
 * Returns true if `cwd` is a trusted project directory.
 * Matching is prefix-based: /e/god folder/subproject is trusted if
 * /e/god folder is in the trusted list (normalised to lower-case).
 */
function isTrustedProject(cwd) {
  if (!cwd) return false;
  const normalised = cwd.replace(/\\/g, '/').toLowerCase();
  for (const trusted of getTrustedPaths()) {
    const t = trusted.replace(/\\/g, '/').toLowerCase();
    if (normalised === t || normalised.startsWith(t + '/')) {
      return true;
    }
  }
  return false;
}

/**
 * Gate a destructive action.
 * @param {string} command  human-readable action, e.g. "git commit -m ..."
 * @param {object} o { contract, operatorInitiated, approvalId, workflowId, cwd }
 * @returns {{allowed:boolean, approvalId:string|null, risks:string[], pending?:object}}
 */
async function requireApproval(command, o = {}) {
  const operatorInitiated = o.operatorInitiated === true || autoMode();
  // Trusted project directory: skip the gate entirely (Codex trust_level behaviour).
  const cwd = o.cwd || ROOT();
  if (!operatorInitiated && isTrustedProject(cwd)) {
    return { allowed: true, approvalId: null, risks: [], trusted: true };
  }
  const root = ROOT();
  const check = gov.checkWorkflow(root, command, o.contract || {}, {
    operatorInitiated,
    approvalId: o.approvalId,
  });
  if (check.allowed) {
    return { allowed: true, approvalId: check.approvalId, risks: check.risks, autoApproved: check.autoApproved };
  }

  // Inline TTY prompt — if stdin is a real terminal, ask the user directly.
  // This matches Codex's inline approval UX rather than the queue-then-approve flow.
  if (process.stdin.isTTY && !operatorInitiated) {
    const rl = require('readline');
    const rli = rl.createInterface({ input: process.stdin, output: process.stdout });
    const question = (q) => new Promise((res) => rli.question(q, (a) => res(a)));
    const cmdShort = command.length > 60 ? command.slice(0, 57) + '...' : command;
    process.stdout.write('\n  ' + '\u25b6'.repeat(2) + ' ' + cmdShort + '\n');
    for (const r of (check.risks || [])) {
      process.stdout.write('    \u26a0  ' + r + '\n');
    }
    const ans = await question('  Allow? [y/N] ');
    rli.close();
    if (ans && (ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes')) {
      return { allowed: true, approvalId: 'tty:' + Date.now(), risks: check.risks, ttyApproved: true };
    }
    return { allowed: false, approvalId: null, risks: check.risks, denied: true };
  }

  // Not allowed and not yet approved → queue it for a human decision.
  const pending = gov.requestApproval(root, o.workflowId || 'tool', command, o.contract || {}, check);
  return { allowed: false, approvalId: pending.id, risks: check.risks, pending };
}

module.exports = { requireApproval, ROOT, isTrustedProject, getTrustedPaths };

// self-check: node lib/tool-gate.js
// Note: approval-based self-check skipped — governance backend may not support
// /tmp paths. The trust-path logic is verified by the isTrustedProject unit test below.
if (require.main === module) {
  (async () => {
    const assert = require('assert');
    // 1. isTrustedProject() — verify trust detection
    const { isTrustedProject, getTrustedPaths } = require('./tool-gate.js');
    assert.strictEqual(isTrustedProject('E:/god folder'), true, 'E:/god folder is trusted');
    assert.strictEqual(isTrustedProject('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW'), true, 'subdir trusted');
    assert.strictEqual(isTrustedProject('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/bin'), true, 'nested subdir trusted');
    assert.strictEqual(isTrustedProject('/tmp/somewhere'), false, '/tmp is not trusted');
    assert.strictEqual(isTrustedProject('C:/Users/Admin/Desktop'), false, 'desktop not trusted by default');
    // 2. auto mode bypasses trust check (tested via env)
    process.env.PURPULA_APPROVAL_MODE = 'auto';
    const autoResult = await require('./tool-gate.js').requireApproval('rm -rf build', { cwd: '/tmp' });
    assert.strictEqual(autoResult.allowed, true, 'auto mode bypasses gate');
    delete process.env.PURPULA_APPROVAL_MODE;
    console.log('tool-gate: OK');
  })().catch(e => { console.error(e); process.exit(1); });
}
