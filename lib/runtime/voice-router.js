'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { trackedSpawn } = require('../child-registry');
const { PROJECT_ROOT } = require('../paths');

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:7784';
const EVENTBUS = process.env.EVENTBUS_URL || 'http://127.0.0.1:7782';

// External-action detection (B5 gate). FAIL SAFE: it is far worse to silently
// email an investor or place a call than to over-ask for approval on an
// ambiguous command. Two tiers:
//   HARD — inherently outward-facing verbs that gate on their own. A voice
//          command containing any of these reaches real people/money/accounts.
//   SOFT — ambiguous verbs (could be internal) that only gate when paired with
//          an outbound noun.
// Original bug: the single verb+noun regex let "email the investor and book a
// sales call" through because investor/pitch/sales-call weren't in the noun list.
const EXTERNAL_ACTION_HARD = /\b(e-?mail|sms|texting|purchase|purchasing|buy|buying|pay|paying|invoice|checkout|subscribe|dial|cold-?call)\b/i;
const EXTERNAL_ACTION_SOFT = /\b(send|sending|text|call|calling|book|booking|schedule|scheduling|order|ordering|apply|applying|open|register|registering|transfer|wire|post|publish|tweet|dm|message)\b[\s\S]*\b(customer|client|lead|leads|prospect|investor|founder|fund|meeting|appointment|call|demo|pitch|deck|proposal|quote|deal|sale|sales|credit|loan|card|account|bank|payment|invoice|supplier|vendor|contract|subscription|product|inventory|order|store|shopify|stripe|email|number|phone)\b/i;
const DESTRUCTIVE_ACTION = /\b(delete|remove|erase|wipe|destroy|drop|truncate|format|uninstall|revoke|terminate|kill|shutdown)\b[\s\S]*\b(all|file|files|folder|folders|directory|directories|database|table|account|service|process|data|history|backup|repository|repo|branch|deployment|server|system)\b/i;
const EXTERNAL_ACTION = {
  test: (s) => EXTERNAL_ACTION_HARD.test(s) || EXTERNAL_ACTION_SOFT.test(s) || DESTRUCTIVE_ACTION.test(s),
};
const FACTORY_COMMAND = /\b(run|start|build|launch)\b.*\b(product factory|autonomous product demo|one button product)\b/i;

// B5 fix: signed approval tokens.
// Voice-router used to accept any caller-supplied `approved:true`. That let
// any caller (voice included) trigger external actions with zero proof of
// human consent. Now: every external action requires an `approvalToken`
// that the voice router itself minted (TTL 60s, HMAC-signed). Tokens are
// persisted to `agent_work/approvals.jsonl` for the immutable consent
// record. Bare booleans are rejected as 401.
const APPROVAL_TTL_MS = 60_000;
const APPROVALS_LOG = path.join(PROJECT_ROOT, 'agent_work', 'approvals.jsonl');

function approvalSecret() {
  return (
    process.env.PURPCLAW_OPERATOR_TOKEN ||
    process.env.POCKET_MASTER_KEY ||
    process.env.INTERNAL_API_KEY ||
    'dev-no-secret'
  );
}

function mintApprovalToken({ command, source, approver, scope }) {
  const ts = Date.now();
  const payload = `${ts}|${scope}|${approver || 'unknown'}|${source || 'unknown'}|${command}`;
  const sig = crypto
    .createHmac('sha256', approvalSecret())
    .update(payload)
    .digest('hex')
    .slice(0, 32);
  return { token: `v1.${ts}.${sig}`, ts, scope, approver, source, command };
}

function verifyApprovalToken({ token, command, source, approver, scope, maxAgeMs = APPROVAL_TTL_MS }) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'token-missing' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, reason: 'token-malformed' };
  const ts = Number(parts[1]);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'ts-bad' };
  if (Date.now() - ts > maxAgeMs) return { ok: false, reason: 'token-expired' };
  const expected = crypto
    .createHmac('sha256', approvalSecret())
    .update(`${ts}|${scope}|${approver || 'unknown'}|${source || 'unknown'}|${command}`)
    .digest('hex')
    .slice(0, 32);
  // Constant-time compare to avoid timing side-channels
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts[2], 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'sig-mismatch' };
  }
  return { ok: true, ts };
}

function recordApproval({ command, source, approver, scope, token, decision }) {
  try {
    fs.mkdirSync(path.dirname(APPROVALS_LOG), { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      decision,
      scope,
      source,
      approver: approver || 'unknown',
      command,
      token,
    }) + '\n';
    fs.appendFileSync(APPROVALS_LOG, line, 'utf8');
  } catch {
    // best-effort: never block the request on log write failure
  }
}

async function postJson(url, payload, timeoutMs = 120000) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${url} returned ${response.status}`);
  return data;
}

async function publish(topic, data) {
  return postJson(`${EVENTBUS}/publish`, {
    topic,
    type: topic,
    source: 'voice-router',
    ts: Date.now(),
    ...data,
  }, 5000).catch(() => null);
}

function startFactory(text) {
  const script = path.join(PROJECT_ROOT, 'scripts', 'demo-factory.js');
  const child = trackedSpawn(process.execPath, [script, text], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    timeoutMs: 20 * 60 * 1000,
    windowsHide: true,
    tag: 'voice-product-factory',
  });
  return { ok: true, status: 'accepted', route: 'product-factory', pid: child.pid };
}

function isExternalAction(command) {
  return EXTERNAL_ACTION.test(command);
}

/**
 * Mint a new approval token for a voice command.
 * Voice UI should call this when the user explicitly says "do it" on a
 * approval-gate prompt, then submit the token back via dispatchVoiceCommand.
 */
function issueApproval({ command, source, approver, scope = 'external-action' }) {
  const t = mintApprovalToken({ command, source, approver, scope });
  recordApproval({ command, source, approver, scope, token: t.token, decision: 'issued' });
  return t;
}

async function dispatchVoiceCommand(text, options = {}) {
  const command = String(text || '').trim();
  if (!command) throw new Error('voice command text is required');

  const source = options.source || 'voice';
  const approver = options.approver || 'unknown';
  const scope = options.scope || 'external-action';

  await publish('voice.command.received', { command, source, approver });

  // B5: external actions require a *signed* token, never a bare bool.
  if (isExternalAction(command)) {
    const ok = options.approvalToken
      ? verifyApprovalToken({
          token: options.approvalToken,
          command, source, approver, scope,
        })
      : { ok: false, reason: 'token-missing' };

    if (!ok.ok) {
      recordApproval({
        command, source, approver, scope,
        token: options.approvalToken || null,
        decision: `rejected:${ok.reason}`,
      });
      // Surface a fresh token so the UI can re-prompt for confirmation.
      const fresh = mintApprovalToken({ command, source, approver, scope });
      const result = {
        ok: false,
        status: 'approval_required',
        route: 'approval-gate',
        command,
        reason: ok.reason,
        approvalToken: fresh.token, // returned so the UI can re-submit
        message: 'External, destructive, or irreversible actions require a fresh signed approval token.',
      };
      await publish('voice.command.approval_required', result);
      return result;
    }
    recordApproval({
      command, source, approver, scope,
      token: options.approvalToken,
      decision: 'approved',
    });
  }

  if (FACTORY_COMMAND.test(command)) {
    const result = startFactory(command);
    await publish('voice.command.dispatched', { command, source, ...result });
    return result;
  }

  const result = await postJson(`${ORCHESTRATOR}/api/orchestrate`, {
    command,
    source,
    approver,
    metadata: { input: 'voice', submittedAt: new Date().toISOString() },
  });
  const routed = {
    ok: true,
    status: result.status || 'accepted',
    route: 'orchestrator',
    workflowId: result.workflowId,
    poll: result.poll || (result.workflowId ? `/api/workflow/${result.workflowId}` : undefined),
  };
  await publish('voice.command.dispatched', { command, source, ...routed });
  return routed;
}

module.exports = {
  dispatchVoiceCommand,
  issueApproval,
  isExternalAction,
  EXTERNAL_ACTION,
  DESTRUCTIVE_ACTION,
  FACTORY_COMMAND,
  // exported for tests
  _internal: { verifyApprovalToken, mintApprovalToken, recordApproval },
};
