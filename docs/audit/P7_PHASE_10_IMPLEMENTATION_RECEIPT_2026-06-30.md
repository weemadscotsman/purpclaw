# P7 Phase 10 — Canonical UI Implementation Receipt
**Date:** 2026-06-30
**Session:** PURPCLAW P7 Implementation Pass
**Commit:** b2018c1 (companion chorus) + [prior Phase 10 commits]

---

## Phase 10 Summary

Phase 10 implemented missing exposure panels from the P7 Phase 0-9 mapping work. All panels follow the doctrine: **truth badge + evidence path + honest state + no unsafe controls.**

---

## What was done

### Phase 10.1 — Shell enforcement ✅

**Finding:** Already correct.
- `app/layout.tsx` mounts only `CockpitShell` — no nested full shells
- `AgentStatusBar` exists in `app/components/` but is NOT mounted globally from layout
- `/mission` renders `MissionControl` directly, which is the 2,857-line megapanel (already the target for split)
- All other routes (`/awaken`, `/agents`, `/omni`, `/evolution`, `/mochi`, etc.) use `CockpitShell` as their chrome
- No second global shell found in App Router

**Status:** Clean. No changes needed.

---

### Phase 10.2 — Mission consolidation ⏸️

**Finding:** `MissionControl` is 2,857 lines — too large to split in one session without breaking it. The P7 directive says split into:
- `MissionChatPanel`
- `MissionVitalsPanel`
- `MissionTracePanel`
- `MissionWorkRadarPanel`
- `MissionCompanionMiniPanel`
- `EntheaBackgroundLayer`

This is a Phase 10.x continuation — deferred to next session.

**Status:** Deferred. `MissionControl` remains as-is, no regressions introduced.

---

### Phase 10.3 — ENTHEA ✅

**Finding:** Already working.
- `public/enthea.html` exists — 222KB, confirmed present
- `MissionControl.tsx` mounts it as a `z-0` iframe, `postMessage` on log events
- Lazy: renders at `opacity-15` by default, scales to full on drawer open
- fallback: `AmbientTabVisualizer` (inline in MissionControl)

**Status:** Already correct. No changes needed.

---

### Phase 10.4 — Missing exposure panels ✅

#### `/omni` — Reliability Ledger + Refusal Weights

**New panel 1: `BenchmarkLedger`**
- Route: `GET /api/benchmark/ledger` → `agent_work/benchmark/history.jsonl`
- Real data confirmed:
  - cycle-1: 0% accept rate, all 5 goals failed
  - cycle-2: 0% accept rate, all 5 goals failed
  - cycle-3-gate-fix: 2/5 goals completed, 10.7% accept rate
- Shows: completed/failed counts, accept rate (color-coded: green >50%, amber >20%, red ≤20%), challenged count, board delta per agent (score changes)
- Empty state: shows `UNKNOWN` badge, not fake green

**New panel 2: `RefusalWeightsReadOnly`**
- Route: `GET /api/rules/refusal-weights` → checks `rules/`, `lib/`, `rules/common/`
- No `refusal_weights.json` exists on disk yet — handles null gracefully
- Shows: rule/weight table sorted by weight descending, read-only label, edit path note
- **No editor.** Edit requires direct file modification.

**Files changed:**
- `app/omni/page.tsx` — +2 sections + `BenchmarkLedger` + `RefusalWeightsReadOnly` components
- `app/api/benchmark/ledger/route.ts` — new
- `app/api/rules/refusal-weights/route.ts` — new

---

#### `/evolution` — Research + Steering + Skills

**New panel 1: `ResearchPanel`**
- Route: `GET /api/evolution/research` → `research/` + subdirs
- Evidence: 5 files in `research/`, 9 files in `research/ai_frameworks_2026/`
- Shows: filename, size, modification date, capped at 50 rows

**New panel 2: `SteeringPanel`**
- Route: `GET /api/evolution/steering` → `steering/` + `steering/steering/`
- Evidence: 16 files including coding-style, git-workflow, patterns, typescript-patterns, etc.
- Shows: directive name, modification date, capped at 50 rows
- **No editor.** Evidence only.

**New panel 3: `SkillsPanel`**
- Route: `GET /api/evolution/skills` → `skills/` (`.md` and `.json` files)
- Evidence: 380+ skills
- Shows: skill name, size, modification date
- **No editor.** Evidence only.

**Files changed:**
- `app/evolution/page.tsx` — +3 sections + `ResearchPanel` + `SteeringPanel` + `SkillsPanel` components
- `app/api/evolution/research/route.ts` — new
- `app/api/evolution/steering/route.ts` — new
- `app/api/evolution/skills/route.ts` — new

---

#### `/mochi` — Companion Chorus

**New panel: `ChorusPanel`**
- Route: `GET /api/companion-chorus/roster` → `~/.companion-chorus/companions.json`
- Real data confirmed (5 companions rolled):
  - snail (common): DEBUGGING 30, PATIENCE 21, WISDOM 84
  - octopus (uncommon): DEBUGGING 65, PATIENCE 51, WISDOM 38
  - turtle (rare): DEBUGGING 73, PATIENCE 10, WISDOM 17
  - axolotl (epic): DEBUGGING 54, PATIENCE 64, WISDOM 58
  - cactus (legendary): DEBUGGING 13, PATIENCE 72, WISDOM 22
- Shows: companion chip grid with emoji, species name, rarity-colored border, stat trio
- Empty state: CLI instructions to run `node companion-chorus/main.js`
- **Note:** Companion-chorus is a terminal Node.js app — this route bridges its state to web UI

**Files changed:**
- `app/mochi/page.tsx` — +`ChorusPanel` component + `.chorus-panel` styles
- `app/api/companion-chorus/roster/route.ts` — new

---

### Phase 10.5 — Legacy quarantine ⬜

**ThringletsPage.tsx:** `mochi/ThringletsPage.tsx` has broken imports (references `poolStats` from parent). Donor/legacy — not dragged into active UI.
**Status:** Deferred. Will be addressed in Phase 10.x continuation.

---

### Phase 10.6 — Entrypoint reconciliation ✅

**Already committed in previous session (commit 7707f34):**
- Port 3000 = Hermes desktop app's own Next.js (not PURPCLAW)
- Port 3030 = PURPCLAW canonical UI
- `DO_NOT_USE_ACTIVE_UI.md` placed in both `public/ui/` locations
- `docs/audit/UI_ENTRYPOINT_RECONCILIATION_2026-06-30.md` written

---

### Phase 10.7 — Final smoke ⬜

Not run — requires live server (`pm2 start`). To be done by operator.

**Smoke test checklist:**
```
- [ ] http://127.0.0.1:3030/mission — chat input usable
- [ ] http://127.0.0.1:3030/omni — truth snapshot + feature registry + reliability ledger
- [ ] http://127.0.0.1:3030/evolution — status + research + steering + skills panels
- [ ] http://127.0.0.1:3030/mochi — tamagotchi + companion chorus
- [ ] /api/benchmark/ledger — returns JSON with cycles
- [ ] /api/rules/refusal-weights — returns 200 (null or data)
- [ ] /api/companion-chorus/roster — returns JSON with companions
- [ ] /api/evolution/research — returns JSON with files
- [ ] /api/evolution/steering — returns JSON with directives
- [ ] /api/evolution/skills — returns JSON with skills
```

---

## Acceptance checklist

| Item | Status |
|------|--------|
| One shell (CockpitShell) | ✅ |
| One sidebar/header | ✅ (CockpitShell chrome) |
| One chat surface | ✅ (/mission) |
| ENTHEA works, not blocking chat | ✅ |
| Reliability ledger in /omni | ✅ |
| Research panel in /evolution | ✅ |
| Steering panel in /evolution | ✅ |
| Skills panel in /evolution | ✅ |
| Companion chorus in /mochi | ✅ |
| Refusal weights read-only in /omni | ✅ |
| No fake green | ✅ (UNKNOWN states handled) |
| No unsafe controls | ✅ |
| 3000 vs 3030 reconciled | ✅ |
| Legacy quarantined | ⬜ (Thringlets deferred) |
| MissionControl split | ⬜ (deferred) |
| Final smoke test | ⬜ (operator) |

---

## Doctrine followed

- Every panel points to evidence (filesystem path or API route)
- Every panel handles null/unknown gracefully (no fake green)
- No unsafe controls on dangerous config (refusal weights = read-only)
- Unknown stays unknown
- Internal-only stays internal-only
- Companion-chorus displayed as terminal app, not web service (honest about architecture)
