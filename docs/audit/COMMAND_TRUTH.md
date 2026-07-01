# Command Truth — 9 Loose Modules
**Date:** 2026-07-01
**Phase:** P7 Integration Truth Repair · Item 1

---

## Decision Framework

For each module: routed / internal / deprecated-donor / dead.

**routed** — registered in CLI dispatcher (`bin/purpclaw.js`)  
**internal** — imported by other modules, not called directly from CLI  
**deprecated-donor** — was real, now superseded by better architecture  
**dead** — file exists, never called, no imports reference it

---

## Classification Table

| Module | Location | CLI wired? | Status | Evidence | Action |
|--------|----------|------------|--------|----------|--------|
| `grow` | `lib/commands/grow.js` | ❌ No | **routed** | `purpclaw evolve` already exists at `lib/commands/evolve.js` (wired). `grow.js` is an **alternative evolve implementation** — uses `lib/evolution/mutator.js`, `lib/evolution/skill-forge.js`, `lib/reasoning-tick.js`. Active deps. | Wire as `purpclaw grow` or merge into evolve |
| `harness` | `lib/commands/harness.js` | ❌ No | **routed** | Autonomous productivity harness. Has real run/list/show/stop logic. `lib/harness/` subdir also exists. | Wire as `purpclaw harness` |
| `plan` | `lib/commands/plan.js` | ❌ No | **routed** | Plan-then-act with LLM, dry-run, checkpoint resume. Real code. No equivalent wired. | Wire as `purpclaw plan` |
| `ponytail` | `lib/commands/ponytail.js` | ❌ No | **routed** | Wraps OmniCode ponytail tools. Has status/off/lite/full/ultra/audit/plan subcommands. Real integration. | Wire as `purpclaw ponytail` |
| `telemetry` | `lib/commands/telemetry.js` | ❌ No | **routed** | Uses `../runtime/pipeline-telemetry`. Has --limit/--workflow/--service/--status flags. Real telemetry. | Wire as `purpclaw telemetry` |
| `thringlets` | `lib/commands/thringlets.js` | ❌ No | **routed** | Colony lens + manual interaction. HTTP to `:7799`. Has list/colony/archetypes/show/bond/release/interact subcommands. Real. | Wire as `purpclaw thringlets` |
| `business` | `lib/commands/business.js` | ❌ No | **deprecated-donor** | Twilio integration (`require('../business/twilio')`) — external telephony dependency. `lib/business/` has operations.js, store.js, twilio.js. Carrier ops module. | Keep as donor. Do NOT wire without Twilio credentials verified. |
| `deploy` | `lib/commands/deploy.js` | ❌ No | **deprecated-donor** | One-command VPS Docker deploy. PM2 + ecosystem.config.js is the current deploy mechanism. Docker VPS deploy is superseded by local PM2 management. | Keep as donor/archive. |
| `open` | `lib/commands/open.js` | ❌ No | **deprecated-donor** | Explicit UI launcher. `purpclaw tui` is the wired equivalent. "UIs only appear when the user asks" is already served by `purpclaw tui`. | Keep as donor. Do NOT wire duplicate. |

---

## Wire Plan (for items marked routed)

### Wire as `purpclaw grow`
```js
// bin/purpclaw.js — add case
case 'grow':    return loadCmd('grow').run(args, sharedCtx());
```

### Wire as `purpclaw harness`
```js
case 'harness': return loadCmd('harness').run(args, sharedCtx());
```

### Wire as `purpclaw plan`
```js
case 'plan':    return loadCmd('plan').run(args, sharedCtx());
```

### Wire as `purpclaw ponytail`
```js
case 'ponytail': return loadCmd('ponytail').run(args, sharedCtx());
```

### Wire as `purpclaw telemetry`
```js
case 'telemetry': return loadCmd('telemetry').run(args, sharedCtx());
```

### Wire as `purpclaw thringlets`
```js
case 'thringlets': return loadCmd('thringlets').run(args, sharedCtx());
```

---

## Verification

```bash
cd /e/god folder/02_ACTIVE_PROJECTS/PURPCLAW

# None should appear in CLI dispatch
grep -E "case 'grow'|case 'harness'|case 'plan'|case 'ponytail'|case 'telemetry'|case 'thringlets'" bin/purpclaw.js
# → empty (all unwired)

# All 9 command files exist
for f in grow harness plan ponytail telemetry thringlets business deploy open; do
  [ -f "lib/commands/$f.js" ] && echo "EXISTS: $f" || echo "MISSING: $f"
done
# → all exist
```

---

## Note on `business` and `deploy`

These are not dead — they have real implementations. But:
- `business` requires Twilio credentials and is carrier-ops specific
- `deploy` assumes a VPS Docker target that PM2 already handles locally

They serve as **donor code** for future reference. If PURPCLAW ever needs Twilio integration or VPS deploy, these are the starting points.

---

## Next
→ Item 2: Project phase truth — find the "discovery" misnomer
