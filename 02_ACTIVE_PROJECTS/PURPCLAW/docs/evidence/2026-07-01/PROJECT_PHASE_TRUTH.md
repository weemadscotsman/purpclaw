# Project Phase Truth — Fix "Discovery" Misnomer
**Date:** 2026-07-01
**Phase:** P7 Integration Truth Repair · Item 2

---

## The Problem

`bin/model-discover.js` and `app/api/discover/` call themselves "discovery" because the repo under-reads its own maturity evidence. The code is production-grade, not exploratory.

**Evidence of maturity:**
- `lib/llm-provider.js` — full multi-provider router with PROVIDERS map
- `lib/model-router.js` — lane-based routing
- `lib/providers/` — per-provider implementations
- `lib/provider_health.js` — health tracking
- `bin/model-discover.js` — daily NIM/OpenRouter/HF model check with `--apply` writes
- `app/api/discover/` — ARD intent-matching capability registry backed by `/api/manifest`
- `lib/commands/services.js` — runtime service discovery with live port probes

**What "discovery" implies:** exploratory, experimental, read-only.
**What the code does:** production polling, writes to registry, hot-swap support.

---

## Classification

| Item | Current Name | Should Be | Reason |
|------|-------------|-----------|--------|
| `bin/model-discover.js` | model-discover | `purpclaw model sync` or `purpclaw model update` | "discover" undersells it — it's a sync engine with apply capability |
| `app/api/discover/` | discover | `app/api/capability-registry/` or keep as discover | ARD = Agentic Resource Discovery. This IS what it does. Name is correct for the routing/intent-matching purpose. |

---

## Recommended Rename

### `bin/model-discover.js` → `bin/model-sync.js`
```bash
# Rename
mv bin/model-discover.js bin/model-sync.js

# Update shebang + docstring
# Before: "PURPCLAW model discovery + auto-update"
# After:  "PURPCLAW model sync + auto-update"

# Update cron reference if any
# 0 6 * * * node bin/model-sync.js --check
```

### `app/api/discover/` → keep as-is
The ARD naming is accurate. Intent-based routing through a capability manifest is discovery by design.

### `lib/commands/services.js` — docstring fix
```js
// Before: "runtime service discovery + health probe"
// After:  "runtime service inventory + health probe"
```
"Discovery" is still acceptable here (probing unknown ports IS discovery), but "inventory" is more honest.

---

## What NOT to do

Do NOT rename `app/api/discover/` to something generic like `app/api/catalog` — the ARD pattern is specific and correct.

Do NOT delete `bin/model-discover.js` — it has real daily cron value.

Do NOT merge model-discover into model-sentinel — they serve different purposes:
- `model-sentinel`: monitors live provider health, fires alerts
- `model-discover`: checks external catalogs for new model releases

---

## Action Items

- [ ] Rename `bin/model-discover.js` → `bin/model-sync.js`
- [ ] Update shebang doc from "discovery" to "sync"
- [ ] Fix `lib/commands/services.js` docstring: "inventory" not "discovery"
- [ ] Verify `bin/model-sync.js --check` runs without error
- [ ] Commit

---

## Next
→ Item 3: Runtime Crosswalk
