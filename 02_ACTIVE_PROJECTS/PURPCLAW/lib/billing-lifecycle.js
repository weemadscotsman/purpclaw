'use strict';
/**
 * lib/billing-lifecycle.js — PurpClaw Billing Lifecycle Display System
 *
 * Maps every billing.* / subscription.* state shape served from NAS to
 * exact user-facing copy and recovery actions, per
 * docs/billing-lifecycle.md (179-line spec).
 *
 * Exports:
 *   BillableEvent        — enum of all known billing event codes
 *   BILLING_EVENT_MAP    — code → {code, copy, recovery, retryable, portalUrl}
 *   PollEngine           — polls charge settlement with 2s cadence, 5-min cap
 *   renderBillingError(e)          — exact copy per §2 of the spec
 *   renderChargeOutcome(s,r)      — §3 settlement outcomes
 *   renderSubscriptionPreview(eff) — §4 preview effects (CLI parity)
 *   renderUpgradeResult(r)         — §4 upgrade result matrix
 *   CLI_FORMAT              — text-mode parity constants
 *   DEFAULT_POLL_INTERVAL_MS = 2000
 *   DEFAULT_POLL_CAP_MS      = 300000 (5 minutes)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. BillableEvent enum + full event map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @enum {string}
 * All known billing/subscription refusal codes from NAS + CLI.
 * 21 codes from the task list + 10 more derived from the doc §2–§4.
 */
const BillableEvent = {
  // Task-specified 21
  INSUFFICIENT_SCOPE:          'insufficient_scope',
  REMOTE_SPENDING_REVOKED:     'remote_spending_revoked',
  SESSION_REVOKED:              'session_revoked',
  CLI_BILLING_DISABLED:        'cli_billing_disabled',
  CONSENT_REQUIRED:             'consent_required',
  ORG_ACCESS_DENIED:            'org_access_denied',
  UPGRADE_CAP_EXCEEDED:         'upgrade_cap_exceeded',
  AUTO_TOP_UP_DISABLED_FAILURES:'auto_top_up_disabled_failures',
  IDEMPOTENCY_CONFLICT:         'idempotency_conflict',
  NO_PAYMENT_METHOD:            'no_payment_method',
  MONTHLY_CAP_EXCEEDED:         'monthly_cap_exceeded',
  RATE_LIMITED:                 'rate_limited',
  STRIPE_UNAVAILABLE:           'stripe_unavailable',
  CHARGE_AUTH_REQUIRED:         'charge_auth_required',
  CARD_DECLINED:                'card_declined',
  CARD_EXPIRED:                 'card_expired',
  PROCESSING_ERROR:             'processing_error',
  POLL_TIMEOUT:                 'poll_timeout',
  UPGRADED:                     'upgraded',
  ALREADY_ON_TIER:              'already_on_tier',
  SETTLED:                      'settled',
  // 10 more from doc
  REMOTE_SPENDING_DISABLED:     'remote_spending_disabled', // dual-emitted with cli_billing_disabled
  ROLE_REQUIRED:                'role_required',
  TEMPORARILY_UNAVAILABLE:      'temporarily_unavailable',
  PAYMENT_METHOD_EXPIRED:       'payment_method_expired',   // same as card_expired
  SUBSCRIPTION_PAYMENT_INTENT_REQUIRES_ACTION: 'subscription_payment_intent_requires_action',
  CARD_PAUSED:                  'card_paused',               // NAS W3 forward-compat
  CARD_MISMATCH:                'card_mismatch',             // NAS W3 forward-compat
  AUTHENTICATION_REQUIRED:      'authentication_required',
  REQUIRES_ACTION:              'requires_action',
  PAYMENT_FAILED:               'payment_failed',
};

const BILLING_EVENT_MAP = {
  // ── Insufficient scope ──────────────────────────────────────────────────
  [BillableEvent.INSUFFICIENT_SCOPE]: {
    code:       BillableEvent.INSUFFICIENT_SCOPE,
    copy:       'This needs Remote Spending allowed. Start a top-up to allow it, then retry.',
    recovery:   'Run /topup to add funds, then retry the original operation.',
    retryable:  false,
    portalUrl:  null,
  },

  // ── Revocation ───────────────────────────────────────────────────────────
  [BillableEvent.REMOTE_SPENDING_REVOKED]: {
    code:       BillableEvent.REMOTE_SPENDING_REVOKED,
    copy:       'Remote spending was stopped for this terminal. Reconnect to restore — run /portal to re-authorize this terminal.',
    recovery:   'Run /portal to re-authorize the terminal, then retry.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.SESSION_REVOKED]: {
    code:       BillableEvent.SESSION_REVOKED,
    copy:       'Your session was logged out. Run /portal to log in again.',
    recovery:   'Run /portal to log in again, then retry.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.CLI_BILLING_DISABLED]: {
    code:       BillableEvent.CLI_BILLING_DISABLED,
    copy:       'Remote spending is off for this account — a billing admin can turn it on from the portal\'s Hermes Agent page.',
    recovery:   'Ask a billing admin to enable Remote Spending in the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.REMOTE_SPENDING_DISABLED]: {
    code:       BillableEvent.REMOTE_SPENDING_DISABLED,
    copy:       'Remote spending is off for this account — a billing admin can turn it on from the portal\'s Hermes Agent page.',
    recovery:   'Ask a billing admin to enable Remote Spending in the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.ROLE_REQUIRED]: {
    code:       BillableEvent.ROLE_REQUIRED,
    copy:       'Adding funds needs someone with billing permissions (owner, admin, or finance admin), or manage this on the portal.',
    recovery:   'Ask someone with billing permissions to perform this action, or use the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.CONSENT_REQUIRED]: {
    code:       BillableEvent.CONSENT_REQUIRED,
    copy:       'This action needs a one-time card confirmation and consent step on the portal before it can proceed.',
    recovery:   'Complete the card confirmation step on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.ORG_ACCESS_DENIED]: {
    code:       BillableEvent.ORG_ACCESS_DENIED,
    copy:       'This token isn\'t bound to an org you can manage. Sign in with the right org, or manage this on the portal.',
    recovery:   'Sign in with the correct org or use the portal directly.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.UPGRADE_CAP_EXCEEDED]: {
    code:       BillableEvent.UPGRADE_CAP_EXCEEDED,
    copy:       '🔴 Daily plan-change limit reached (5 per org) — try again tomorrow, or manage this on the portal.',
    recovery:   'Wait until tomorrow, or make the change directly on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.AUTO_TOP_UP_DISABLED_FAILURES]: {
    code:       BillableEvent.AUTO_TOP_UP_DISABLED_FAILURES,
    copy:       'Auto-reload was turned off after repeated charge failures. Fix the card issue, then re-enable it from /topup → Auto-reload.',
    recovery:   'Fix the card issue on the portal, then re-enable auto-reload via /topup → Auto-reload.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.IDEMPOTENCY_CONFLICT]: {
    code:       BillableEvent.IDEMPOTENCY_CONFLICT,
    copy:       '🔴 That charge key was already used for a different amount. Start a fresh top-up.',
    recovery:   'Start a new top-up with a fresh charge.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.NO_PAYMENT_METHOD]: {
    code:       BillableEvent.NO_PAYMENT_METHOD,
    copy:       '💳 No saved card for terminal charges yet. Set one up on the portal (one-time credit buys don\'t save a reusable card).',
    recovery:   'Add a reusable payment method on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.MONTHLY_CAP_EXCEEDED]: {
    code:       BillableEvent.MONTHLY_CAP_EXCEEDED,
    copy:       '🔴 Monthly spend cap reached.',
    recovery:   'Wait for the next billing period or increase your cap on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  // ── Rate / availability (retryable) ──────────────────────────────────────
  [BillableEvent.RATE_LIMITED]: {
    code:       BillableEvent.RATE_LIMITED,
    copy:       '🟡 Too many charges right now. This isn\'t a payment failure.',
    recovery:   'Wait a moment and retry.',
    retryable:  true,
    portalUrl:  null,
  },

  [BillableEvent.TEMPORARILY_UNAVAILABLE]: {
    code:       BillableEvent.TEMPORARILY_UNAVAILABLE,
    copy:       '🟡 Too many charges right now. This isn\'t a payment failure.',
    recovery:   'Wait a moment and retry.',
    retryable:  true,
    portalUrl:  null,
  },

  [BillableEvent.STRIPE_UNAVAILABLE]: {
    code:       BillableEvent.STRIPE_UNAVAILABLE,
    copy:       '🟡 Stripe is having trouble right now — try again shortly.',
    recovery:   'Wait a short while and retry.',
    retryable:  true,
    portalUrl:  null,
  },

  // ── Charge outcomes (pollCharge / renderChargeFailed §3) ─────────────────
  [BillableEvent.CHARGE_AUTH_REQUIRED]: {
    code:       BillableEvent.CHARGE_AUTH_REQUIRED,
    copy:       '🔴 Your bank requires verification (3DS). Complete it on the portal to finish this purchase.',
    recovery:   'Complete 3DS verification on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.CARD_DECLINED]: {
    code:       BillableEvent.CARD_DECLINED,
    copy:       '🔴 Your card was declined. Try another card on the portal.',
    recovery:   'Try a different card on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.CARD_EXPIRED]: {
    code:       BillableEvent.CARD_EXPIRED,
    copy:       '🔴 Your card has expired. Update it on the portal.',
    recovery:   'Update your card on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.PAYMENT_METHOD_EXPIRED]: {
    code:       BillableEvent.PAYMENT_METHOD_EXPIRED,
    copy:       '🔴 Your card has expired. Update it on the portal.',
    recovery:   'Update your card on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.PROCESSING_ERROR]: {
    code:       BillableEvent.PROCESSING_ERROR,
    copy:       '🔴 The charge didn\'t go through (processing_error).',
    recovery:   'Try again or use the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.POLL_TIMEOUT]: {
    code:       BillableEvent.POLL_TIMEOUT,
    copy:       '🟡 Still processing after 5 minutes — this is a timeout, not a failure. Check /topup or the portal shortly.',
    recovery:   'Check your balance via /topup or on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  // ── Upgrade / subscription outcomes (§4) ────────────────────────────────
  [BillableEvent.AUTHENTICATION_REQUIRED]: {
    code:       BillableEvent.AUTHENTICATION_REQUIRED,
    copy:       'Please verify your card in the portal to finish this upgrade.',
    recovery:   'Complete 3DS / card verification on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.SUBSCRIPTION_PAYMENT_INTENT_REQUIRES_ACTION]: {
    code:       BillableEvent.SUBSCRIPTION_PAYMENT_INTENT_REQUIRES_ACTION,
    copy:       'Please verify your card in the portal to finish this upgrade.',
    recovery:   'Complete 3DS / card verification on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.REQUIRES_ACTION]: {
    code:       BillableEvent.REQUIRES_ACTION,
    copy:       'This upgrade needs extra verification (3DS). Finish it on the portal.',
    recovery:   'Complete 3DS verification on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.PAYMENT_FAILED]: {
    code:       BillableEvent.PAYMENT_FAILED,
    copy:       'Your card was declined. Update your payment method on the portal and try again.',
    recovery:   'Update your payment method on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.UPGRADED]: {
    code:       BillableEvent.UPGRADED,
    copy:       'Upgraded to {target_tier_name}. Your new monthly credits land in a moment.',
    recovery:   null,
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.ALREADY_ON_TIER]: {
    code:       BillableEvent.ALREADY_ON_TIER,
    copy:       'You are already on {target_tier_name}.',
    recovery:   null,
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.SETTLED]: {
    code:       BillableEvent.SETTLED,
    copy:       '✅ Credits added.',
    recovery:   null,
    retryable:  false,
    portalUrl:  null,
  },

  // ── Forward-compat (NAS W3) ─────────────────────────────────────────────
  [BillableEvent.CARD_PAUSED]: {
    code:       BillableEvent.CARD_PAUSED,
    copy:       'Your card has been paused. Update your payment method on the portal.',
    recovery:   'Update your payment method on the portal.',
    retryable:  false,
    portalUrl:  null,
  },

  [BillableEvent.CARD_MISMATCH]: {
    code:       BillableEvent.CARD_MISMATCH,
    copy:       'Card mismatch detected. Update your payment method on the portal.',
    recovery:   'Update your payment method on the portal.',
    retryable:  false,
    portalUrl:  null,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. PollEngine
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 2_000;   // 2 seconds
const DEFAULT_POLL_CAP_MS       = 300_000; // 5 minutes
const DEFAULT_BACKOFF_MAX_MS   = 30_000;  // cap backoff at 30s
const DEFAULT_BACKOFF_DEFAULT_MS = 5_000; // default backoff when retry_after absent

/**
 * PollEngine — polls charge settlement status with exponential-backoff on
 * rate/availability errors (429/503).
 *
 * @param {object} options
 * @param {number} [options.intervalMs=2000]     polling interval
 * @param {number} [options.capMs=300000]        max total poll time (5 min)
 * @param {number} [options.backoffMaxMs=30000]   backoff ceiling
 * @param {Function} [options.fetchStatus]       async (chargeId) => {status, reason, portalUrl?}
 * @param {Function} [options.onStatus]           called on each poll result
 * @param {Function} [options.onFinal]            called on terminal outcome
 */
class PollEngine {
  constructor(options = {}) {
    this.intervalMs    = options.intervalMs    ?? DEFAULT_POLL_INTERVAL_MS;
    this.capMs         = options.capMs         ?? DEFAULT_POLL_CAP_MS;
    this.backoffMaxMs  = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
    this.fetchStatus   = options.fetchStatus   ?? null;  // injected
    this.onStatus      = options.onStatus      ?? null;
    this.onFinal       = options.onFinal       ?? null;
    this._timer        = null;
    this._aborted      = false;
  }

  /**
   * Poll a charge until settled, failed, or the 5-minute cap is hit.
   * Returns a promise that resolves with the terminal outcome.
   *
   * @param {string} chargeId
   * @param {object} [options]
   * @param {number} [options.intervalMs]
   * @param {number} [options.capMs]
   * @returns {Promise<{outcome: string, status: string, reason: string|null, portalUrl: string|null, elapsedMs: number}>}
   */
  async poll(chargeId, options = {}) {
    const intervalMs = options.intervalMs ?? this.intervalMs;
    const capMs     = options.capMs     ?? this.capMs;

    this._aborted = false;
    const start = Date.now();

    // Backoff state
    let backoffMs = 0;

    const tick = async () => {
      if (this._aborted) return { outcome: 'aborted', status: null, reason: null, portalUrl: null, elapsedMs: Date.now() - start };

      const elapsed = Date.now() - start;

      // Cap exceeded
      if (elapsed >= capMs) {
        return this._terminal({
          outcome: 'timeout',
          status:  'pending',
          reason:  null,
          portalUrl: null,
          elapsedMs: elapsed,
        });
      }

      let result;
      try {
        result = await this._fetch(chargeId);
      } catch (err) {
        // Transport loss → unconfirmed, not failed
        return this._terminal({
          outcome:  'unconfirmed',
          status:   null,
          reason:   null,
          portalUrl: null,
          elapsedMs: elapsed,
          message:  err.message,
        });
      }

      const { status, reason, portalUrl } = result;

      if (this.onStatus) this.onStatus({ status, reason, portalUrl, elapsedMs: elapsed });

      // ── Terminal outcomes ────────────────────────────────────────────────
      if (status === 'settled') {
        return this._terminal({ outcome: 'settled', status, reason: null, portalUrl, elapsedMs: elapsed });
      }

      // Revocation mid-poll (§3 CF-7 rule 4) — checked BEFORE failed check
      // because a revocation while polling is ambiguous (charge may have settled).
      if (reason === 'remote_spending_revoked' || reason === 'session_revoked') {
        return this._terminal({
          outcome:  'unconfirmed',
          status,
          reason,
          portalUrl,
          elapsedMs: elapsed,
        });
      }

      if (status === 'failed') {
        return this._terminal({ outcome: 'failed', status, reason, portalUrl, elapsedMs: elapsed });
      }

      // 429 / 503 backoff — rate / availability, not a payment failure
      if (status === 'rate_limited' || status === 'temporarily_unavailable' || status === 'stripe_unavailable' || status === 429 || status === 503) {
        backoffMs = this._computeBackoff(result.retry_after);
        return this._schedule({ delayMs: backoffMs, chargeId, tick, start, capMs, reason: 'backoff' });
      }

      // Pending — continue polling after interval
      return this._schedule({ delayMs: intervalMs, chargeId, tick, start, capMs, reason: 'pending' });
    };

    return this._schedule({ delayMs: intervalMs, chargeId, tick, start, capMs, reason: 'first' });
  }

  abort() {
    this._aborted = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  async _fetch(chargeId) {
    if (!this.fetchStatus) {
      throw new Error('PollEngine: no fetchStatus function configured');
    }
    return this.fetchStatus(chargeId);
  }

  _computeBackoff(retryAfter) {
    let wait;
    if (retryAfter != null && retryAfter > 0) {
      // Formula from doc §2: max(1, round(retry_after/60)) minutes → ms
      const minutes = Math.max(1, Math.round(retryAfter / 60));
      wait = minutes * 60 * 1000;
    } else {
      wait = DEFAULT_BACKOFF_DEFAULT_MS;
    }
    return Math.min(wait, this.backoffMaxMs);
  }

  _schedule({ delayMs, chargeId, tick, start, capMs, reason }) {
    return new Promise((resolve) => {
      this._timer = setTimeout(async () => {
        const result = await tick();
        resolve(result);
      }, delayMs);
    }).then(r => {
      // Propagate terminal outcomes directly; intermediate _schedule calls resolve normally
      return r;
    });
  }

  async _terminal({ outcome, status, reason, portalUrl, elapsedMs, message }) {
    if (this.onFinal) {
      this.onFinal({ outcome, status, reason, portalUrl, elapsedMs, message });
    }
    return { outcome, status, reason, portalUrl, elapsedMs, message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. renderBillingError — exact copy per doc §2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a billing error code to user-facing copy.
 * Exact copy strings from billing-lifecycle.md §2.
 *
 * @param {object|string} event — {code, message?, portalUrl?, remainingUsd?} or just a code string
 * @returns {string} formatted message
 */
function renderBillingError(event) {
  const code       = typeof event === 'string' ? event : (event.code || event.error || 'unknown');
  const message    = typeof event === 'string' ? null : (event.message || null);
  const portalUrl = typeof event === 'string' ? null : (event.portalUrl || null);
  const remainingUsd = typeof event === 'string' ? null : (event.remainingUsd || null);

  const def = BILLING_EVENT_MAP[code];

  // Unknown / default — still surfaces the server message, never blank
  if (!def) {
    const base = message || code || 'Billing request failed.';
    return portalUrl ? `${base}\nPortal: ${portalUrl}` : base;
  }

  let copy = def.copy;

  // monthly_cap_exceeded — inject remainingUsd if provided
  if (code === BillableEvent.MONTHLY_CAP_EXCEEDED && remainingUsd != null) {
    copy = `🔴 Monthly spend cap reached — $${remainingUsd} headroom left.`;
  }

  // rate_limited / stripe_unavailable — append retry-after hint if provided
  if ((code === BillableEvent.RATE_LIMITED || code === BillableEvent.TEMPORARILY_UNAVAILABLE || code === BillableEvent.STRIPE_UNAVAILABLE) && def.retryable) {
    // retry_after is handled in PollEngine; here we render the base copy
    // The caller is responsible for injecting "(try again in ~N min)" if retry_after is known
  }

  return portalUrl ? `${copy}\nPortal: ${portalUrl}` : copy;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. renderChargeOutcome — exact copy per doc §3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a charge settlement outcome (§3).
 *
 * @param {string} status  — 'settled' | 'failed' | 'pending'
 * @param {string|null} reason
 * @param {object} [extras] — {portalUrl?, amount_usd?, retry_after?, elapsedMs?}
 * @returns {string}
 */
function renderChargeOutcome(status, reason, extras = {}) {
  const { portalUrl, amount_usd, retry_after, elapsedMs } = extras;

  // ── Settled ──────────────────────────────────────────────────────────────
  if (status === 'settled') {
    const base = amount_usd ? `✅ $${amount_usd} added.` : '✅ Credits added.';
    return portalUrl ? `${base}\nPortal: ${portalUrl}` : base;
  }

  // ── Failed ───────────────────────────────────────────────────────────────
  if (status === 'failed') {
    let copy;

    switch (reason) {
      case 'authentication_required':
        copy = '🔴 Your bank requires verification (3DS). Complete it on the portal to finish this purchase.';
        break;
      case 'payment_method_expired':
      case 'card_expired':
        copy = '🔴 Your card has expired. Update it on the portal.';
        break;
      case 'card_declined':
        copy = '🔴 Your card was declined. Try another card on the portal.';
        break;
      case 'processing_error':
        copy = '🔴 The charge didn\'t go through (processing_error).';
        break;
      default: {
        const r = reason || 'processing_error';
        copy = `🔴 The charge didn't go through (${r}).`;
      }
    }

    return portalUrl ? `${copy}\nPortal: ${portalUrl}` : copy;
  }

  // ── Pending but timed out ─────────────────────────────────────────────────
  if (status === 'pending' && elapsedMs != null && elapsedMs >= 300_000) {
    const base = '🟡 Still processing after 5 minutes — this is a timeout, not a failure. Check /topup or the portal shortly.';
    return portalUrl ? `${base}\nPortal: ${portalUrl}` : base;
  }

  // ── Unconfirmed (transport loss or mid-poll revocation) ──────────────────
  // These are not 'failed' — the charge may have settled.
  if (status === 'unconfirmed') {
    const base = '🟡 Your last charge\'s outcome is unconfirmed — check your balance/history before retrying.';
    return portalUrl ? `${base}\nPortal: ${portalUrl}` : base;
  }

  // ── Pending (non-terminal) ───────────────────────────────────────────────
  // No copy — caller should show a spinner/pending state
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Subscription preview / upgrade rendering (§4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a subscription preview effect (CLI parity §4).
 * Returns { headline, detail, action } or null.
 */
function renderSubscriptionPreview(effect, preview = {}) {
  const { target, amount, date, reason } = preview;

  switch (effect) {
    case 'charge_now':
      return {
        headline: `Upgrade to ${target}. You will be charged ${amount} now (prorated).`,
        detail:   null,
        action:   `Pay ${amount} & upgrade now`,
      };
    case 'scheduled':
      return {
        headline: `Change to ${target} — takes effect ${date}. No charge now; you keep your current plan until then.`,
        detail:   null,
        action:   `Schedule change to ${target}`,
      };
    case 'no_op':
      return {
        headline: `You are already on ${target} — nothing to change.`,
        detail:   null,
        action:   null,
      };
    case 'blocked':
      return {
        headline: reason || 'That change cannot be made here — manage it on the portal.',
        detail:   null,
        action:   'Manage on portal',
      };
    default:
      return null;
  }
}

/**
 * Render an upgrade result (§4 upgradeResult matrix).
 *
 * @param {object} result — {ok, status, reason, recovery_url?, target_tier_name?}
 * @returns {string}
 */
function renderUpgradeResult(result) {
  const { ok, status, reason, recovery_url, target_tier_name } = result;

  // Transport failure
  if (result === null || (ok === undefined && status === undefined)) {
    return 'Couldn\'t confirm the upgrade — your card may or may not have been charged. Re-run /subscription to check your plan before trying again.';
  }

  // SCA / authentication required — checked BEFORE status (reason first)
  if (reason === 'authentication_required' || reason === 'subscription_payment_intent_requires_action') {
    const base = 'Please verify your card in the portal to finish this upgrade.';
    return recovery_url ? `${base}\nPortal: ${recovery_url}` : base;
  }

  // Card declined
  if (reason === 'card_declined') {
    const base = 'Your card was declined — try a different card on the portal.';
    return recovery_url ? `${base}\nPortal: ${recovery_url}` : base;
  }

  // Already on tier
  if (ok && status === 'already_on_tier') {
    return `You are already on ${target_tier_name || 'this plan'}.`;
  }

  // Upgraded successfully
  if (ok && status === 'upgraded') {
    return `Upgraded to ${target_tier_name || 'the new plan'}. Your new monthly credits land in a moment.`;
  }

  // requires_action (no distinguishing reason)
  if (status === 'requires_action') {
    const base = 'This upgrade needs extra verification (3DS). Finish it on the portal.';
    return recovery_url ? `${base}\nPortal: ${recovery_url}` : base;
  }

  // payment_failed (no distinguishing reason)
  if (status === 'payment_failed') {
    const base = 'Your card was declined. Update your payment method on the portal and try again.';
    return recovery_url ? `${base}\nPortal: ${recovery_url}` : base;
  }

  // Default / unknown
  const msg = result.message || result.error || 'Something went wrong. Try again, or manage on the portal.';
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CLI text-mode parity
// ─────────────────────────────────────────────────────────────────────────────

const CLI_FORMAT = {
  /**
   * CLI /topup overview copy (parity with doc §CLI parity row).
   * @param {object} opts — {interactive, autoReload?, balance?, amount?}
   */
  topupOverview(opts = {}) {
    const lines = [];
    if (opts.interactive) {
      lines.push('Add funds now — a single charge, added to your balance today.');
      if (opts.autoReload) {
        const { threshold, refillAmount } = opts.autoReload;
        if (threshold != null && refillAmount != null) {
          lines.push(`Refill when low — charges $${refillAmount} automatically when your balance falls below $${threshold}.`);
        } else {
          lines.push('Auto-reload is available — configure amounts in the portal.');
        }
      } else {
        lines.push('Auto-reload is off for this account.');
      }
    } else {
      lines.push('One-time top-up: add credits to your balance immediately.');
      if (opts.portalUrl) lines.push(`Manage on the portal: ${opts.portalUrl}`);
    }
    return lines.join('\n');
  },

  /**
   * Format a usage bar for CLI display.
   * @param {number} used   — dollars used
   * @param {number} limit   — dollar limit
   * @param {string} label
   */
  usageBar(used, limit, label = 'used this month') {
    const pct  = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const full = Math.round(pct / 10);
    const bar  = '█'.repeat(full) + '░'.repeat(10 - full);
    return `${bar} $${used.toFixed(2)} of $${limit.toFixed(2)} ${label}`;
  },

  /**
   * CLI subscription plan row (parity §CLI row 1).
   * @param {object} tier — {tier_id, name, price_usd, monthly_credits}
   */
  planRow(tier) {
    const credits = tier.monthly_credits != null
      ? `$${tier.price_usd}/mo · $${tier.monthly_credits} credits/mo`
      : `$${tier.price_usd}/mo`;
    return `${tier.name} · ${credits}`;
  },

  /**
   * Build a portal URL with optional tier preselect (CLI §CLI row 2).
   * @param {string} baseUrl
   * @param {object} opts — {org_id?, tier_id?}
   */
  portalManageUrl(baseUrl, opts = {}) {
    const url = new URL(baseUrl);
    if (opts.org_id)  url.searchParams.set('org_id', opts.org_id);
    if (opts.tier_id) url.searchParams.set('plan',    opts.tier_id);
    return url.toString();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. Config helpers
// ─────────────────────────────────────────────────────────────────────────────

const path   = require('path');
const os     = require('os');
const fs     = require('fs');

function pocketDir() {
  return process.env.PURP_DIR
    || process.env.POCKET_DIR
    || path.join(os.homedir(), '.purpclaw', 'pocket');
}

function billingConfigPath() {
  return path.join(pocketDir(), 'billing-config.json');
}

const DEFAULT_BILLING_CONFIG = {
  pollIntervalMs:   DEFAULT_POLL_INTERVAL_MS,
  pollCapMs:        DEFAULT_POLL_CAP_MS,
  backoffMaxMs:     DEFAULT_BACKOFF_MAX_MS,
  alertThresholds:  [0.5, 0.8, 0.95],     // fraction of monthly cap
  monthlySpendCap:  null,                 // null = no cap
  defaultPortalUrl: 'https://portal.nousresearch.com',
};

function loadBillingConfig() {
  try {
    return { ...DEFAULT_BILLING_CONFIG, ...JSON.parse(fs.readFileSync(billingConfigPath(), 'utf8')) };
  } catch {
    return { ...DEFAULT_BILLING_CONFIG };
  }
}

function saveBillingConfig(cfg) {
  const dir = pocketDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(billingConfigPath(), JSON.stringify(cfg, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Spend-gate wiring — route LLM API billing errors through billing-lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map an LLM API error (from the provider) to a BillableEvent.
 * Called by spend-gate.js when an LLM API call returns a billing-related error.
 *
 * Recognized error shapes:
 *   { error: { type: 'billing'|..., code: 'insufficient_scope'|'rate_limited'|... } }
 *   { error: { type: 'invalid_request_error', code: ... } }
 *   HTTP 402 / 429 / 503
 *
 * @param {object} apiError — raw error from LLM API call
 * @returns {{ eventCode: string, remainingUsd?: number, portalUrl?: string } | null}
 */
function mapLlmApiError(apiError) {
  if (!apiError || !apiError.error) return null;

  const { type, code, message, remainingUsd, portalUrl } = apiError.error;

  // HTTP 402 → payment required
  if (apiError.status === 402 || type === 'billing' || type === 'payment_required') {
    if (code === 'insufficient_scope' || code === 'remote_spending_revoked') {
      return { eventCode: code, remainingUsd, portalUrl };
    }
    if (code === 'monthly_cap_exceeded' || code === 'monthly_spend_cap_exceeded') {
      return { eventCode: BillableEvent.MONTHLY_CAP_EXCEEDED, remainingUsd, portalUrl };
    }
    if (code === 'rate_limited') {
      return { eventCode: BillableEvent.RATE_LIMITED, portalUrl };
    }
    if (code === 'card_declined') {
      return { eventCode: BillableEvent.CARD_DECLINED, portalUrl };
    }
    if (code === 'no_payment_method' || code === 'payment_method_not_found') {
      return { eventCode: BillableEvent.NO_PAYMENT_METHOD, portalUrl };
    }
    if (code === 'authentication_required' || code === '3ds_required') {
      return { eventCode: BillableEvent.CHARGE_AUTH_REQUIRED, portalUrl };
    }
    if (code === 'processing_error' || code === 'stripe_error') {
      return { eventCode: BillableEvent.PROCESSING_ERROR, portalUrl };
    }
    if (code === 'remote_spending_disabled' || code === 'cli_billing_disabled') {
      return { eventCode: BillableEvent.CLI_BILLING_DISABLED, portalUrl };
    }
    // Default 402 → generic billing failure
    return { eventCode: BillableEvent.PROCESSING_ERROR, portalUrl };
  }

  // HTTP 429 → rate limited
  if (apiError.status === 429 || type === 'rate_limit_exceeded' || code === 'rate_limited') {
    const retryAfter = apiError.headers?.['retry-after']
      ? parseInt(apiError.headers['retry-after'], 10)
      : (apiError.error.retryAfter || null);
    return { eventCode: BillableEvent.RATE_LIMITED, retryAfter, portalUrl };
  }

  // HTTP 503 → stripe unavailable
  if (apiError.status === 503 || type === 'service_unavailable' || code === 'stripe_unavailable') {
    return { eventCode: BillableEvent.STRIPE_UNAVAILABLE, portalUrl };
  }

  // insufficient_scope on API call → step-up required
  if (code === 'insufficient_scope' || type === 'insufficient_scope') {
    return { eventCode: BillableEvent.INSUFFICIENT_SCOPE, portalUrl };
  }

  return null;
}

/**
 * Given a spend-gate check result that was denied due to a billing error,
 * render the appropriate user-facing message.
 *
 * @param {object} spendResult — { allow: false, reason: string, ... }
 * @param {object} [llmApiError] — raw API error if available
 * @returns {string}
 */
function renderSpendGateError(spendResult, llmApiError = null) {
  if (llmApiError) {
    const mapped = mapLlmApiError(llmApiError);
    if (mapped) {
      return renderBillingError({
        code:        mapped.eventCode,
        remainingUsd: mapped.remainingUsd,
        portalUrl:   mapped.portalUrl || loadBillingConfig().defaultPortalUrl,
      });
    }
  }

  // Fallback to spend-gate's own reason string
  return `🔴 ${spendResult.reason || 'Billing request failed.'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Enum
  BillableEvent,
  BILLING_EVENT_MAP,

  // Core render functions
  renderBillingError,
  renderChargeOutcome,
  renderSubscriptionPreview,
  renderUpgradeResult,

  // Spend-gate wiring
  mapLlmApiError,
  renderSpendGateError,

  // Poll engine
  PollEngine,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_CAP_MS,

  // CLI parity
  CLI_FORMAT,

  // Config helpers
  pocketDir,
  billingConfigPath,
  loadBillingConfig,
  saveBillingConfig,
  DEFAULT_BILLING_CONFIG,
};
