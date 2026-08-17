# legacy/reintegrate-2026-08-17/ — REINTEGRATION QUEUE

**Why this exists:** 2026-08-17 cleanup moved these 6 directories to `archive/2026-08-17-cleanup/`.
Eddie called it out: don't archive good code, **rewrite it to fit the stack**.

**This directory is the visible re-write queue.** Items here are NOT trash. They are
real products / tools / references that the current stack has not yet integrated.

**Rule for the next session:** for each item below, do NOT just copy-paste into the
live tree. **Rewrite** the code so it matches the current monorepo shape
(`packages/*`, `services/*`, `lib/control/drivers/*`, `bin/purpclaw.js`) and uses
the real `agent-registry.js`, `event-contract/`, `permissions/`, `proof-contract/`,
`verification-core/`, and the new `packages/swarm/`.

---

## Items in this queue

| Name | Type | Action | Status |
|---|---|---|---|
| `mochi/` | Three sub-products: (a) pet sprites/JS at root (duplicate of `packages/studio/presence/mochi/`), (b) `menu_mochi/` social media campaign toolkit (8 files), (c) `menu_mochi_extension/` real Chrome extension v1.2 (12 source files + 4 icons) | Pet sprites are duplicates; safe to keep as reference. menu_mochi marketing toolkit + menu_mochi_extension Chrome extension → moved to `apps/extensions/menu-mochi/` (extension) + `apps/extensions/menu-mochi/marketing/` (campaign toolkit). | **DONE 2026-08-17** — see [DONE § menu-mochi](#done--menu-mochi) below |
| `purpconsole/` | Python TUI (app.py 8135B, features.py 4485B, purpconsole.tcss 5062B, __main__.py) — 14 files | Rewrite as `services/console/` or merge into `bin/purpclaw.js` command surface. | **DONE 2026-08-17** — see [DONE § purpconsole](#done--purpconsole) below |
| `DreamTask/` | Single TS class `DreamTask.ts` (4699B) | UI surfacing layer for the auto-dream agent (memory consolidation subagent) — makes the forked background agent visible in the desktop footer pill and Shift+Down dialog. Local no-op adapter stubs at top of file keep it compiling in isolation. Real wiring needs the desktop UI task/surface area + a real task registry. | **NOT dead, NOT abandoned.** Real feature. Needs the right home and the stubs wired to a real task registry. `lib/auto-dream.js` is the engine side; DreamTask.ts is the UI side. Integration = move to the right place, wire the stubs, rewrite to fit. |
| `Samantha's Daily Log/` | `SAMANTHA_Daily_*.md` (312B) — personal log, possibly Eddie's book character | Personal artefact. Keep, do not rewrite. | KEPT |
| `PURPCLAW_OLD/` | Old version of the whole stack — reference only | Reference. Do NOT import from. | KEPT |
| `lib-lib-abandoned-installer-20260617/` | Abandoned installer from 2026-06-17 — reference only | Reference. Do NOT import from. | KEPT |

---

## DONE — purpconsole

**Date:** 2026-08-17
**Origin:** `legacy/reintegrate-2026-08-17/purpconsole/` (legacy Textual TUI, 14 files)
**Target:** `services/console/` (live monorepo)

**What shipped:**
- Moved 8 files (.py + .tcss + README) from `legacy/.../purpconsole/` → `services/console/`
- Internal imports rewritten: `from purpconsole.X` → `from .X` (relative package imports)
- New `services/console/text_report.py` (4,479 bytes) — plain-text parity report that always works, no TUI dep
- `services/console/__main__.py` (908 bytes) — TUI-or-text auto-detect: tries Textual, falls back to text report
- CLI surface in `bin/purpclaw.js`: `purpclaw parity [--json] [--by-id NN]` spawns the Python module
- 10-test cert at `tests/console/test_console.py` + cert gate at `agent_work/cert_gates/console/`
- Result.json verdict: **PASS** (10/10 tests green)

**What is still aspirational (not certified):**
- The Textual TUI itself (`services/console/app.py`) is code-intact but not visually certified — `textual` is not installed in the runtime. The plain-text fallback is the always-on surface.

---

## DONE — menu-mochi

**Date:** 2026-08-17
**Origin:** `legacy/reintegrate-2026-08-17/mochi/menu_mochi_extension/` (Chrome extension v1.2, 12 source files + 4 icons) + `legacy/reintegrate-2026-08-17/mochi/menu_mochi/` (marketing toolkit, 8 files)
**Target:** `apps/extensions/menu-mochi/` (extension) + `apps/extensions/menu-mochi/marketing/` (campaign toolkit)

**What shipped:**
- Moved 12 files (manifest.json, popup.html, popup.css, popup.js, content.js, background.js, README.md, icons/{16,32,48,128}.png) to `apps/extensions/menu-mochi/`
- Co-located 8 marketing files (campaign_posts.md, competitor-research.template.json, config.template.json, hook_bank.csv, posts_6_slide_scripts.json, strategy.json) to `apps/extensions/menu-mochi/marketing/`
- Wrote a top-level README explaining the structure and install path
- 10-check structure cert at `tests/menu_mochi/test_extension.py` + cert gate at `agent_work/cert_gates/menu_mochi/`
- Result.json verdict: **PASS** (18 passes, 0 fails across 10 unique checks)

**What is still aspirational (not certified):**
- The extension is NOT loaded in a real browser. Runtime behaviour (state machine, popup interactions, content script) requires loading `apps/extensions/menu-mochi/` as an unpacked extension in Chrome/Edge.
- The 7 pet sprite/JS files at the root of `legacy/reintegrate-2026-08-17/mochi/` (mochi.js, mochi-sprites.js, mochi.json, mochi.png, mochiKey.png, mochiMap.png, mochiRocket.png) are NOT moved — they're duplicates of `packages/studio/presence/mochi/`. Eddie can delete the legacy copies manually when ready.
- The 6 features are static hand-curated data; future "live" version would query real services for actual status.

---

## What is still in `archive/2026-08-17-cleanup/` (the disposable cruft)

| Name | Why archived |
|---|---|
| `lib/site-packages/` | 34,361 leaked Python packages — raw pip cache, not source. No code to salvage. |
| `.next.old`, `.next.old2`, `.next.old3` | Next.js build artifacts from prior app runs. Regenerate. |
| `companion-chorus/` | Empty directory, nothing to salvage. |

These are genuinely disposable. Re-archiving them later is fine.

---

## Re-write checklist (per item)

1. Read the README, package.json, requirements.txt, or main entry point
2. Map the entry points to the current monorepo (`packages/*`, `services/*`, `bin/purpclaw.js`)
3. Rewrite the file with the same logic but using:
   - `agent-registry.js` for any persona lookup
   - `event-contract/` for any event emission
   - `permissions/` for any side-effect requiring authority
   - `proof-contract/` for any evidence chain
   - `verification-core/` for any verification gate
   - `packages/swarm/` if the item dispatches sub-agents
4. Add a test that exercises the rewritten code path
5. Add a cert gate at `agent_work/cert_gates/<item>/` if the item is cert-worthy
6. Update this README to mark the item DONE (move to a "DONE" section or delete the row)

---

## Origin

2026-08-17 11:55 — moved here from `archive/2026-08-17-cleanup/` per Eddie's correction
"we are re writing them to fit the stack right not just throwing away goodcode bro".
