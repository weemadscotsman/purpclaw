# Multi-Model LLM Rate Limiter — Pattern & Implementation

**Date added:** 2026-06-04
**Implicated skills:** local-first-ai-app-architecture, systematic-debugging
**Status:** Pattern proven in PURPCLAW deep-research-group. Reference implementation: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/rate-limiter.js`

## Why This Exists

Ted pays for OpenRouter. He literally yelled "I GET CHARGED" at me when a multi-model call fired N models in parallel with no throttling. **Multi-model fan-out is a financial-safety operation, not just a code-quality one.** Treat the rate limiter like a seatbelt: required, not optional.

This pattern is for any code path that fans out to N LLM providers/models at once:
- Group chat / model room
- Deep research with multi-model synthesis
- Model-ensemble voting
- Any "ask K models and aggregate" pattern

## The Six Properties (Non-Negotiable)

A correct multi-model rate limiter enforces ALL of these:

| # | Property              | Default                | Why                                                                  |
|---|-----------------------|------------------------|----------------------------------------------------------------------|
| 1 | **Bounded concurrency** | 2-3 parallel max     | Free models are rate-limited per IP. Paid models cost real money.   |
| 2 | **Per-provider throttle** | 1 active per provider | Don't slam Google + OpenAI + NVIDIA in parallel from one host.     |
| 3 | **Inter-start delay**  | 1500ms between starts | Smooths out burst patterns, dramatically reduces 429s on free tier. |
| 4 | **Per-call timeout**   | 90s                    | One slow model can't block the whole batch.                          |
| 5 | **Hard cost cap**      | $5/batch (env-tunable) | Operator-facing circuit breaker. Pre-flight rejects paid selections that exceed it. |
| 6 | **Per-provider 429 cooldown** | 60s after a 429   | Respects Retry-After implicitly. Provider can't be re-tried mid-batch. |

Bonus: **free-first ordering**. If half the selected models are paid, run the free ones first — you get signal fast and the paid ones only fire if the cap still allows.

## Reference Implementation

The PURPCLAW `lib/rate-limiter.js` exports a single function, `rateLimited({...})`, that wraps any array of "items" with these properties. ~150 lines, no dependencies. The worker function returns whatever the caller wants — the rate limiter only adds `status`, `costUsd`, `skipped`, `error`.

```js
const { rateLimited } = require('./rate-limiter');

const results = await rateLimited({
  items:           models,                    // array of { id, provider, pricing? }
  worker:          async (model) => { /* returns { status, answer, error } */ },
  concurrency:     2,                         // max parallel
  minDelayMs:      1500,                      // gap between starts
  perProviderMax:  1,                         // max active per provider
  callTimeoutMs:   90000,                     // per-worker deadline
  costCapUsd:      5.00,                      // hard stop
});
```

Each result is the worker's return value, decorated with `{ costUsd, status, error? }`. Skipped items (cost cap hit) come back as `{ skipped: 'cost-cap', reason: '...' }` — the batch is aborted (not throwing) so partial results survive.

## Env-Var Convention (PURPCLAW style)

Read defaults from env so the operator can tune without code changes:

```
PURPCLAW_RESEARCH_CONCURRENCY=2
PURPCLAW_RESEARCH_MIN_DELAY_MS=1500
PURPCLAW_RESEARCH_PER_PROVIDER=1
PURPCLAW_RESEARCH_CALL_TIMEOUT_MS=90000
PURPCLAW_RESEARCH_COST_CAP_USD=5.0
```

Per-request options override env defaults. The `runGroupResearch()` function in `lib/deep-research-group.js` is the canonical example.

## Pre-Flight Cost Check

Don't just enforce the cap mid-batch — check upfront:

```js
const paidModels = selectedModels.filter(m => !isFreeModelId(m.id));
if (paidModels.length) {
  const estCost = paidModels.reduce((sum, m) => sum + estimateCostUsd(m), 0);
  if (estCost > rateOpts.costCapUsd) {
    throw new Error(`cost-cap: ${paidModels.length} paid model(s), est $${estCost.toFixed(2)} > $${rateOpts.costCapUsd.toFixed(2)} cap`);
  }
}
```

This makes the failure mode obvious in logs: "you selected 3 paid models that would cost $X, cap is $Y" beats silently only running 2 of 3 and confusing the user.

## Cost Estimation

OpenRouter's `/models` endpoint returns per-token pricing. The function `estimateCostUsd(model)` in `lib/rate-limiter.js`:

- `*:free` model ID → `$0`
- Has `pricing: { prompt, completion }` → scales a typical 1.5k-token answer
- Unknown paid model → conservative `$0.01/call` default (so an accidental paid pick still trips the cap)

If your model catalog doesn't include pricing, you can pass a custom `estimateCostUsd` function in the options.

## Browser-Side Mirror: The "Failed to fetch" Trap

If a multi-model call takes >15s and goes through a Next.js service-proxy with `AbortSignal.timeout(15000)`, the browser sees `TypeError: Failed to fetch` — not a server error. **This is the proxy timeout, not a network problem.** Fix: make the endpoint async-with-job-id. The UI polls the job and the user sees progress.

Full pattern: `systematic-debugging/references/purpclaw-group-chat-fetch-error-2026-06-04.md`

## When to Apply This Pattern

Trigger conditions (any one):

- [ ] Code path that calls 2+ LLM models in parallel
- [ ] OpenRouter with mixed `*:free` and paid models in the picker
- [ ] Ted's name is on the bill (he yelled, or he will)
- [ ] The endpoint could take >10s (deep research, multi-model synthesis)
- [ ] Free-tier rate limits (429s) are showing up in logs

**Do not** apply this for:
- Single-model chat completions (no fan-out to throttle)
- Embedding generation (cheap, no rate concern)
- Local model calls (no provider to throttle against)

## The Two-Line Summary

> Multi-model calls = money. Default to `*:free`, cap concurrency, cap cost, cooldown on 429. If a 15s proxy timeout kills the long call, flip it to async-job-poll — don't raise the proxy timeout.

## Related References

- `systematic-debugging/references/purpclaw-group-chat-fetch-error-2026-06-04.md` — async-job-poll pattern for the "Failed to fetch" trap
- `local-first-ai-app-architecture/references/openrouter-free-models-account.md` — confirmed-working free models
- `lib/rate-limiter.js` in PURPCLAW — the reference implementation
- `lib/deep-research-group.js` — canonical use site (env config + runGroupResearch wrapper)
