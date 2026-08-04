# Billing Lifecycle Implementation — PurpClaw

> Spec source: `C:/Users/Admin/AppData/Local/hermes/hermes-agent/docs/billing-lifecycle.md` (179 lines)
> Implementation: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/billing-lifecycle.js`
> Tests: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/billing-lifecycle.test.js`

---

## What was built

### 1. `lib/billing-lifecycle.js` — core module

#### `BillableEvent` enum (31 codes)
21 from the task list + 10 from the doc spec:

| Code | Source |
|---|---|
| `INSUFFICIENT_SCOPE` | task + doc §2 |
| `REMOTE_SPENDING_REVOKED` | task + doc §2 |
| `SESSION_REVOKED` | task + doc §2 |
| `CLI_BILLING_DISABLED` | task + doc §2 |
| `CONSENT_REQUIRED` | task + doc §2 |
| `ORG_ACCESS_DENIED` | task + doc §2 |
| `UPGRADE_CAP_EXCEEDED` | task + doc §2 |
| `AUTO_TOP_UP_DISABLED_FAILURES` | task + doc §2 |
| `IDEMPOTENCY_CONFLICT` | task + doc §2 |
| `NO_PAYMENT_METHOD` | task + doc §2 |
| `MONTHLY_CAP_EXCEEDED` | task + doc §2 |
| `RATE_LIMITED` | task + doc §2 |
| `STRIPE_UNAVAILABLE` | task + doc §2 |
| `CHARGE_AUTH_REQUIRED` | task + doc §3 |
| `CARD_DECLINED` | task + doc §3 |
| `CARD_EXPIRED` | task + doc §3 |
| `PROCESSING_ERROR` | task + doc §3 |
| `POLL_TIMEOUT` | task + doc §3 |
| `UPGRADED` | task + doc §4 |
| `ALREADY_ON_TIER` | task + doc §4 |
| `SETTLED` | task + doc §3 |
| `REMOTE_SPENDING_DISABLED` | doc §2 (dual-emitted with `cli_billing_disabled`) |
| `ROLE_REQUIRED` | doc §2 |
| `TEMPORARILY_UNAVAILABLE` | doc §2 |
| `PAYMENT_METHOD_EXPIRED` | doc §3 |
| `SUBSCRIPTION_PAYMENT_INTENT_REQUIRES_ACTION` | doc §4 |
| `CARD_PAUSED` | doc §4 forward-compat (NAS W3) |
| `CARD_MISMATCH` | doc §4 forward-compat (NAS W3) |
| `AUTHENTICATION_REQUIRED` | doc §4 |
| `REQUIRES_ACTION` | doc §4 |
| `PAYMENT_FAILED` | doc §4 |

#### `BILLING_EVENT_MAP`
Each code maps to `{ code, copy, recovery, retryable, portalUrl }` with **exact copy strings** from billing-lifecycle.md §2.

#### `PollEngine` class
- `poll(chargeId, options)` — polls with 2s interval, 5min (300s) cap
- `abort()` — cancels in-flight polling
- `fetchStatus(chargeId)` — injected by caller
- `onStatus({status, reason, portalUrl, elapsedMs})` — called each tick
- `onFinal({outcome, status, reason, portalUrl, elapsedMs})` — called on terminal outcome

**Backoff on 429/503:**
- Formula: `wait = max(1, round(retry_after / 60)) * 60 * 1000` (minutes → ms)
- Default when `retry_after` absent: 5s
- Ceiling: 30s (configurable via `backoffMaxMs`)
- 5-min cap is checked **after** backoff elapses, so a sustained 429 cannot keep the poll alive past 5min

**Poll cadence:**
```
tick →
  elapsed >= capMs?        → timeout (pending)
  settled?                 → settled
  revocation (revoked/expired)? → unconfirmed  (§3 CF-7 rule 4 — never "failed")
  failed?                  → failed
  429/503 backoff?         → backoff, re-enter tick
  pending?                 → setTimeout(interval), re-enter tick
```

#### `renderBillingError(event)` — doc §2 exact copy
- Accepts `{code, message?, portalUrl?, remainingUsd?}` or a plain code string
- `monthly_cap_exceeded` injects `remainingUsd` into copy when provided
- Unknown codes surface `message || code || 'Billing request failed.'` (never blank)
- `Portal: {url}` appended when `portalUrl` is present

#### `renderChargeOutcome(status, reason, extras)` — doc §3
Terminal outcomes with exact copy:

| status | reason | Output |
|---|---|---|
| `settled` | — | `✅ ${amount_usd} added.` or `✅ Credits added.` |
| `failed` | `authentication_required` | 3DS copy |
| `failed` | `card_declined` | decline copy |
| `failed` | `card_expired` / `payment_method_expired` | expired copy |
| `failed` | `processing_error` | processing_error copy |
| `failed` | unrecognized | `🔴 The charge didn't go through (${reason}).` |
| `pending` | `elapsedMs >= 300_000` | timeout copy — explicitly NOT called "failed" |
| `unconfirmed` | — | unconfirmed copy — never "failed" |

#### `renderSubscriptionPreview(effect, preview)` — doc §4
Returns `{headline, detail, action}` for `charge_now`, `scheduled`, `no_op`, `blocked`.

#### `renderUpgradeResult(result)` — doc §4 upgrade matrix
Reason-first branching per spec: `authentication_required` / `subscription_payment_intent_requires_action` → SCA copy before checking status.

#### `CLI_FORMAT` — text-mode parity
- `topupOverview(opts)` — one-time vs auto-reload first-sentence distinction
- `usageBar(used, limit, label)` — █░░ bar for CLI
- `planRow(tier)` — `name · $/mo · $credits/mo` format
- `portalManageUrl(base, {org_id?, tier_id?})` — appends `?plan=<tier_id>` only when tier picked

#### Config helpers
- `loadBillingConfig()` / `saveBillingConfig(cfg)` — `PURP_DIR/pocket/billing-config.json`
- `billingConfigPath()` / `pocketDir()` — path resolution with env-var overrides

#### `mapLlmApiError(apiError)` — LLM API error → BillableEvent
Maps HTTP 402/429/503 and `error.code` fields from OpenAI/Anthropic-style API error shapes to `BillableEvent` codes.

#### `renderSpendGateError(spendResult, llmApiError)` — spend-gate integration
Given a denied spend-gate check and the raw API error, routes through `mapLlmApiError` → `renderBillingError`.

---

### 2. `lib/spend-gate.js` — wired

Added `renderBillingError(apiError)` method to `SpendGate` class:
```js
// Called when spend-gate check() returns allow:false due to LLM API billing error:
const copy = gate.renderBillingError(apiError);
// → exact copy from billing-lifecycle.md §2
```

Lazy `billingLifecycle()` loader prevents circular requires during early boot.

---

### 3. `C:/Users/Admin/.purpclaw/pocket/billing-config.json` — config

```json
{
  "pollIntervalMs": 2000,
  "pollCapMs": 300000,
  "backoffMaxMs": 30000,
  "alertThresholds": [0.5, 0.8, 0.95],
  "monthlySpendCap": null,
  "defaultPortalUrl": "https://portal.nousresearch.com",
  "thresholds": { ... }
}
```

---

### 4. Test results — `billing-lifecycle.test.js` — 7/7 PASS

```
=== Test 1: 5-second settle ===
  Poll count: 25, Outcome: settled, Elapsed: 5504ms ✅

=== Test 2: 429 backoff → settle ===
  Poll count: 3, Outcome: settled, Elapsed: 489ms ✅

=== Test 3: 5-minute timeout (3s proxy) ===
  Poll count: 13, Outcome: timeout, Elapsed: 3049ms (cap: 3000ms) ✅

=== Test 4: mid-poll revocation → unconfirmed ===
  Poll count: 3, Outcome: unconfirmed, Reason: remote_spending_revoked ✅

=== Test 5: renderBillingError exact copy ===
  11/11 cases: all ✅

=== Test 6: renderChargeOutcome branches ===
  9/9 branches: all ✅

=== Test 7: spend-gate → billing-lifecycle wiring ===
  4/4 cases: all ✅
```

**Key correctness notes:**
- Revocation mid-poll (`remote_spending_revoked` / `session_revoked`) is checked **before** the `status === 'failed'` branch — CF-7 rule 4 requires these map to `unconfirmed`, never `failed`
- `renderChargeOutcome('pending', null, {elapsedMs: 300_001})` returns the timeout copy without a portal URL appended (the 5-min timeout branch of the render function has its own portalUrl handling)
- Unknown codes in `renderBillingError` always surface the server `message` field, never a blank string

---

## Files created / modified

| File | Action |
|---|---|
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/billing-lifecycle.js` | **created** — 39KB |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/billing-lifecycle.test.js` | **created** — test suite |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/spend-gate.js` | modified — added `renderBillingError()` method + lazy billing-lifecycle loader |
| `C:/Users/Admin/.purpclaw/pocket/billing-config.json` | **created** — thresholds config |
| `docs/BILLING_LIFECYCLE_IMPL.md` | **created** — this doc |
