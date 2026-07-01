# OMNI-SURGEON — Master Spec v0.1 — SHIPPED

**Date:** 2026-06-13
**Cycle:** 6 (Phases 1-6 of OMNI-SURGEON)
**Status:** ✅ **All 6 phases complete. All cockpit endpoints live. Master spec shipped.**

---

## What was built

### Phase 1 — Repo Truth Scanner (`lib/omni/truth-scanner.js`, 504 lines)
Walks the entire repo and emits `agent_work/omni/truth-snapshot.json` with: file map, imports, routes, static assets, services, feature candidates, broken links, missing routes, god files, cycles, dead-like candidates. **Read-only.** Excludes vendored `node_modules` and the donor archives.

Output verified: **5,269 files, 42 routes, 17 static assets, 46 services, 1 real cycle** (lib/harness/benchmark ↔ lib/harness/engine).

### Phase 2 — Feature Registry Builder (`lib/omni/feature-registry.js`, 285 lines)
Classifies every detected feature into one of 9 states: `active`, `partial`, `missing-wiring`, `failing`, `blocked-by-dependency`, `operator-disabled`, `legacy`, `external`, `planned`. **Never classifies as "dead"** without operator approval. Overlays 13 STRESS-listed features that the scanner misses by filename.

Output verified: **29 features total: 5 active, 8 partial, 11 missing-wiring, 1 failing, 4 planned. 24 action-required.**

### Phase 3 — Patch Governor (`lib/omni/patch-governor.js`)
Six rules that auto-block autonomous patches:
- `noStubRegisteredFeature` — rejects 501 / "not implemented" / "disabled" on registered features
- `noAuthChangeWithoutProof` — auth changes must include a smoke test
- `towerHonestyRequired` — touching agent execution requires a passing tower honesty E2E
- `noDeleteUnknownCode` — flags large deletions in non-test files
- `noRawSecrets` — detects `sk-…`, `ghp_…`, `AKIA…`, `AIza…` in diffs
- `claimedWorkWithoutEvidence` — claims to registry-known features must have a test

Operator can override with `--operator` flag. **YAWEEGIT should not hard-block the operator.**

Verified: legit-fix → allow, cosplay-stub → block, agent-tower-no-e2e → block.

### Phase 4 — AGENT.md / LOOP.md generator (`lib/omni/generate-agent-docs.js`)
Emits `docs/AGENT.md` and `docs/LOOP.md` deterministically from the snapshot + registry. The standing doctrine, attribution model, state vocabulary, and current cycle are all written into the docs. The cockpit page points at these.

### Phase 5 — Cockpit (`app/omni/page.tsx` + 5 API routes)
Operator surface that displays the truth snapshot, feature registry, patch review, and provider integrity. **Built AFTER scanner + registry + governor**, per master spec.

| Endpoint | HTTP | What |
|---|---|---|
| `/omni` | 200 | Cockpit UI page |
| `/api/omni/status` | 200 | Artifact status (which files exist, last update times) |
| `/api/omni/registry` | 200 | Full feature registry with stats |
| `/api/omni/scan` | 200 | Last scan stats |
| `/api/omni/patch/review` | 200 | Last patch review verdict |
| `/api/omni/providers` | 200 | Provider integrity summary (Phase 6) |

All 6 endpoints verified live (HTTP 200).

### Phase 6 — Provider Integrity Engine (`lib/omni/provider-integrity.js`, 320 lines)
Read-only diagnostics runner. Probes 6 providers × 5 prompts × 3 paths = 90 probes per run. Records every probe to `agent_work/omni/provider-integrity.jsonl`. Detects wrapper-only failures, provider-only failures, trigger-term divergence, refusal markers, latency drift.

**MVP does NOT change runtime routing** — per master spec, auto-routing is premature until a trust baseline exists.

Verified: 28 events recorded across 4 providers. Real failures (401, timeout) are surfaced as Provider Integrity Events.

---

## Files (delivered)

```
lib/omni/truth-scanner.js          (504 lines, Phase 1)
lib/omni/feature-registry.js       (285 lines, Phase 2)
lib/omni/patch-governor.js         (320 lines, Phase 3)
lib/omni/generate-agent-docs.js    (293 lines, Phase 4)
lib/omni/provider-integrity.js     (320 lines, Phase 6)
app/omni/page.tsx                  (240 lines, Phase 5)
app/api/omni/status/route.ts       (32 lines, Phase 5)
app/api/omni/registry/route.ts     (22 lines, Phase 5)
app/api/omni/scan/route.ts         (24 lines, Phase 5)
app/api/omni/patch/review/route.ts (24 lines, Phase 5)
app/api/omni/providers/route.ts    (47 lines, Phase 6)
docs/AGENT.md                      (~150 lines, Phase 4)
docs/LOOP.md                       (~80 lines, Phase 4)
```

Total: ~2,300 lines of new code. **No existing code modified** (read-only OMNI layer).

---

## What I personally performed

- Wrote all 6 lib/omni modules + 6 API routes + 1 page + 2 docs
- Fixed 3 bugs during verification: CLI parser, segment-level exclude, diff parser format, URL path joining
- Wrote 3 audit docs: `STRESS/OMNI-SURGEON-PHASE-ONE.md`, `STRESS/OMNI-SURGEON-PHASE-TWO.md`, this master spec
- Built the Next.js app to verify all 6 cockpit endpoints return 200
- Ran the Provider Integrity engine against 4 providers, recorded 28 events

## What I found already present (verified, not authored)

- All prior audit docs (STRESS/AUDIT-*)
- The Cycle 1-7 patches (P0-1 through P0-4)
- The pre-prompt compiler, OBLITERATUS routes, and live services
- The donor archives at `.donors/` (No Spaghett, Gotham, YAWEEGIT, WHY.EXE) — not yet wired; deferred to a future cycle

## What I rejected / deferred

- **Auto-routing from registry state** — premature per master spec, MVP is read-only
- **Removing the 24 actionRequired features** — rejected per doctrine
- **Classifying anything as "dead"** — rejected per doctrine
- **Donor module wiring** — Phase Two/Three work, deferred to a separate cycle
- **Action-queue resolution** (the 24 actionRequired features) — separate work, not part of the master spec
- **Heavy Next dev mode** — kept production build (1GB RAM constraint noted in ecosystem.config.js)

## Standing doctrine (encoded in AGENT.md)

> Gated, not gutted. Real, not simulated. Wired, not hidden. Verified, not claimed.
> No deletion by confusion. No stubs as repairs. No feature amputation.
> No synthetic evidence. No raw secrets in docs or patches.

## The seven panels of truth (encoded in AGENT.md)

If a claim involves any of these, the test must be live:
- Services (`/api/services`)
- Tools (`lib/tools/index.js`; `agent_tower.js` tool-call branch must EXECUTE)
- Routes (`app/api/**/route.ts`; every mutating route has `checkOperator`)
- Pre-prompt (`lib/runtime/preprompt-compiler.js`; profile wired into `lib/agent-loop.js:109-115`)
- SpendGate (`lib/spend-gate.js`; `recordLLMUsage` calls `gate.record()`)
- Audit log (`agent_work/preprompt-audit.jsonl`, `llm-ledger.jsonl`, `omni/`)
- Tower (`agent_tower.js`; helper call restored, pending Phase 1B removal)

## Loop status (the standing debug-forever loop)

```
audit     → lib/omni/truth-scanner.js
cross-check → lib/omni/feature-registry.js
plan      → pick a single actionRequired feature
repair    → small, reversible, one finding
execute   → touch only the files in the plan
verify    → smoke test, curl, or service restart
document  → update STRESS/<cycle>.md
repeat    → next actionRequired feature
```

The loop is encoded in `docs/AGENT.md` and `docs/LOOP.md`. The next agent who picks up the repo will read these before touching code.

---

## Open work (separate from the master spec)

The 24 `actionRequired` features in the registry are queue targets for the next round. They are NOT part of the OMNI-SURGEON master spec. The next operator who picks up the repo will:

1. Read `docs/AGENT.md` and `docs/LOOP.md`
2. Open `/omni` in a browser to see the cockpit
3. Pick a single `actionRequired` feature
4. Apply the loop: audit → cross-check → plan → repair → verify → document
5. The Patch Governor gates each patch; the Provider Integrity surfaces real failures

**The master spec is shipped. Six phases done. Loop ready for the next operator.**
