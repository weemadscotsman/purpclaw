# PURPCLAW Doc Update Patch Plan

> **Generated 2026-06-29.**
> **Companion to:** `docs/audit/DOCS_VS_REALITY_2026-06-29.md`
> **Mode:** READ-ONLY audit complete. This is the patch plan, not the patches.

## Rule

**No doc survives unless runtime proves it. No patch is applied unless this plan says so.**

---

## Status of This Plan

| Phase | Status |
|---|---|
| 1. Read every doc that makes architectural claims | ✅ DONE |
| 2. Probe runtime for each claim | ✅ DONE |
| 3. Side-by-side truth table | ✅ DONE — `docs/audit/DOCS_VS_REALITY_2026-06-29.md` |
| 4. **Patch plan** | ✅ THIS FILE |
| 5. Apply patches | ⏸ AWAITING APPROVAL |
| 6. Re-run audit | ⏸ POST-PATCH |

---

## Patch List (Ranked by Severity)

### P0 — Launch Blockers (1)

| # | File | Patch | Why |
|---|---|---|---|
| 1 | `bin/purpclaw.js` `cmdStatus` | Replace hardcoded "TOOLS: 110+", "AGENTS: 35+", "PROVIDERS: 17" with live counts from disk | Status command displays "lying" totals even after the item-zero fix. Live counts: 379 SKILL.md + 55 commands = 434 tools, 94 agents (divisions), 4 providers (lib/providers/). |

### P1 — Stale Counts (3)

| # | File | Patch | Why |
|---|---|---|---|
| 2 | `docs/ARCHITECTURE.md` | Top-line version "v0.2.0" → "v0.3.0", date "2026-06-22" → "2026-06-29". Service topology count: 25 services → 27 (12 core + 15 optional). "73 agents" → "94 agents (across 9 divisions)". "459 tools" → "379 skill folders + 55 commands = 434+ tools". "7-8 env providers" → "4 wired + 13+ compatible". | ARCHITECTURE.md is the most-quoted doc and its numbers are 19 days stale. |
| 3 | `docs/LAUNCH.md` | Update version to v0.3.0. Rewrite X-post: "PurpClaw v0.3.0 is live. 379 skills. 4 wired providers. 94 agents. MCP native. Self-improving. Terminal-first AI operating system." | LAUNCH.md is a public launch pack. Wrong numbers in a launch post = embarrassment. |
| 4 | `docs/QUICKSTART.md` | Update version to v0.3.0. After "First Boot" section, add: "Verify the cognitive loop: `npm run verify:hivemind:rank1` (should exit 0 with 11/11 pass)." | The CI gate exists but isn't in the install path. New operators should know it works. |

### P1 — Soul Count Inconsistency (1)

| # | File | Patch | Why |
|---|---|---|---|
| 5 | `registry/souls.json` | Either: (a) update `total: 85` to `total: 95` to match the array, OR (b) add 10 more souls to reach 85. **Decision required** — do we trust the array or the field? | Internal inconsistency. The handoff doc and the audit both claim "95 souls" but the file's own `total` field says 85. Pick one truth. |
| 5a | (Alternative) | Add a note to `registry/souls.json`: `"note": "total field is a count of actively-deployed souls, not souls in the souls array. See README for distinction."` | If the 85 vs 95 gap is intentional (e.g. archived souls), document why. |

### P2 — Stale Reports (1)

| # | File | Patch | Why |
|---|---|---|---|
| 6 | `docs/AUDIT_REPORT.md` | At the top, replace with: `> SUPERSEDED by docs/PURPCLAW_FULL_AUDIT_2026-06-29.md. This 2026-06-10 audit is 19 days old. Treat as historical evidence only.` | AUDIT_REPORT.md is 19 days old. New users reading it would see wrong numbers and bad recommendations. |

### P2 — Ambiguous Canonical (1)

| # | File | Patch | Why |
|---|---|---|---|
| 7 | NEW: `docs/spec/STUDIO_CANONICAL.md` | Write a 1-page decision doc: "PURPCLAW has two Studio systems. `lib/studio.js` (Soul/Studio layer, registry-backed modes) is the canonical org-layer mode registry. `podcast_studio/` is the legacy side app for episode generation. The two should merge or one should be deprecated. As of 2026-06-29: `lib/studio.js` is canonical, `podcast_studio/` is parked for migration." | Two systems, no decision doc = future agents will reinvent the wrong one. |

### P2 — Steering Not Wired (1)

| # | File | Patch | Why |
|---|---|---|---|
| 8 | `lib/hivemind/trace-recorder.js` | After `spring.enrichRecord(trace)`, call `steeringLoader.loadForTask(trace.intent, trace.task)` and attach the result to `trace.steering` and `trace.context`. | 32 steering files exist. 0 are loaded by runtime. Wiring takes ~10 lines. |
| 8a | (Verification) | `lib/hivemind/test.js` should add a check: traces have `trace.steering` populated when steering files exist for the trace's intent. | Confirms the fix works. |

### P3 — Nice to Have (3)

| # | File | Patch | Why |
|---|---|---|---|
| 9 | `docs/SERVICE_RUNTIME_INDEX.md` | Bump table: 9 core services → 12 core, 5 optional → 15 optional (per current `service_registry.js`). | Doc lag, low severity. |
| 10 | `docs/ROUTE_INDEX.md` | Spot-check 3-5 routes (e.g. `/`, `/mission`, `/cockpit`, `/agents`, `/skyscraper`) actually render. If any 404 or blank, mark as "STUB". | Routes listed but not all confirmed working. |
| 11 | `bin/purpclaw.js` `cmdStatus` (already in P0) | Also: "🌐 UI: :3000" → "🌐 UI: :3030" (Next.js default per handoff) AND "💰 MoneyPrinter: :8080" only if MoneyPrinter is actually configured | Hard-coded numbers that may not match reality. |

---

## Total Patch Scope

| Severity | Count | Effort | Blocks Launch? |
|---|---:|---|---|
| P0 (Launch) | 1 | 30 min | **YES** (status command still has lying totals) |
| P1 (Stale) | 3 | 1.5 hr | NO (numbers, not behavior) |
| P1 (Inconsistency) | 1 | 5 min | NO (data file) |
| P2 (Stale reports) | 1 | 10 min | NO (mark supersede) |
| P2 (Ambiguous canonical) | 1 | 30 min | NO (decision doc) |
| P2 (Steering wired) | 1 | 30 min | NO (feature gap, not bug) |
| P3 (Polish) | 3 | 30 min | NO (cosmetic) |
| **Total** | **11** | **~4.5 hours** | — |

**The P0 patch is the only launch blocker.** The rest is cleanup.

---

## Patch Order (Recommended)

1. **P0 #1** — Fix status command hardcoded totals (this is the most user-facing, and item zero is incomplete without it).
2. **P1 #5** — Fix `total: 85` vs `souls array of 95` inconsistency. This is data, not a patch — 5 minutes.
3. **P1 #2, #3, #4** — Update count claims in ARCHITECTURE.md, LAUNCH.md, QUICKSTART.md. Pure documentation.
4. **P2 #6** — Mark AUDIT_REPORT.md as superseded by `docs/PURPCLAW_FULL_AUDIT_2026-06-29.md`. Single-line patch.
5. **P2 #7** — Write STUDIO_CANONICAL.md decision doc.
6. **P2 #8** — Wire `lib/hivemind/steering-loader.js` into trace-recorder. ~10 lines of code + a test.
7. **P3 #9, #10, #11** — Polish.

---

## Verification After Patches

Re-run:
```bash
node scripts/verify-status.js          # should still pass 8/8
node scripts/verify-hivemind.js --rank=1   # should still pass 11/11
node bin/purpclaw.js registries audit  # should still show CRITICAL_DRIFT with 6 recommendations
```

And a final docs pass:
```bash
# Spot-check that no doc still claims "73 agents" or "v0.2.0"
grep -r "73 agents\|v0.2.0\|54 tools\|152 agents" docs/ --include="*.md" | head
# Should be empty
```

---

## What This Plan Does NOT Cover

- The 6 registry audit recommendations (Batch 4 in Monster Launch Ledger). **Awaiting human approval** before any quarantine/move/delete.
- The 8 "What's Next" queued jobs (Shared Spaces, Ambient Life, etc.). Pure roadmap, not doc fixes.
- The cage match harness (already deferred per Round 1 failure report).
- New features (Auto Research → Donor → Auto Evolve closed loop, etc.). Not doc fixes.

This patch plan is **only** about reconciling what the docs CLAIM with what the code DOES. New work is separate.

---

## Ready to Apply

If you approve, the P0 patch (1) is the priority. After that's applied and verified:
- P1 docs are pure text edits (no code change)
- P2 #6 is a one-line prepend
- P2 #7 is a 1-page new file
- P2 #8 is the only real code change (~10 lines + test)

**Total real code change: P0 + P2#8 = ~40 lines across 2 files.**

The rest is text.

Standing by. 🦆
