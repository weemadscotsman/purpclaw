# PURPCLAW Megapanel — UI Reorg Proposal

**Date:** 2026-06-19
**Status:** PROPOSAL — awaiting approval. No files changed yet.
**Scope:** `app/` directory + `app/components/CockpitShell.tsx` nav rail.

---

## 1. Current State (What's Wrong)

### 1.1 The left rail is a flat 15-item list

From `app/components/CockpitShell.tsx` lines 16–32, the `RAIL` array:

| # | Label | Route |
|---|-------|-------|
| 1 | System Map | `/system-map` |
| 2 | Self Evolution | `/evolution` |
| 3 | Mission Harness | `/mission/harness` |
| 4 | OMNI Cockpit | `/omni` |
| 5 | Mission Control | `/mission` |
| 6 | Agent Tower | `/agents` |
| 7 | Settings OS | `/settings` |
| 8 | GOOP Playground | `/bridge` |
| 9 | Providers & Models | `/providers` |
| 10 | Voice | `/voice` |
| 11 | MOCHI | `/mochi` |
| 12 | Benchmarks | `/swarm` |
| 13 | Memory | `/inline` |
| 14 | Abliterator | `/skyscraper` |
| 15 | Power User | `/pipeline` |

**Problem:** No grouping. Operator has to scan all 15 every time. Three items say "Mission", two look like system tools (System Map + OMNI), and the bottom three are power-user-ish but mixed with the rest.

### 1.2 Label/Route mismatches (5 of 15)

The label and the URL don't match — this is pure tech-debt confusion:

| Label | Route | Issue |
|-------|-------|-------|
| Benchmarks | `/swarm` | "swarm" was an old name |
| Memory | `/inline` | "inline" leaked from impl detail |
| Abliterator | `/skyscraper` | "skyscraper" is leftover codename |
| Power User | `/pipeline` | "pipeline" is a monitor-wall leftover |
| GOOP Playground | `/bridge` | "bridge" is the impl name |

### 1.3 Dead weight in `app/`

| Path | Status | Action |
|------|--------|--------|
| `_archive/MissionControl.tsx` | dead | leave (already archived) |
| `_archive/UnifiedDashboard.tsx` | dead | leave |
| `_archive/PerkplerDashboard.tsx` | dead | leave |
| `_archive/page.tsx.v8.3.0-dead` | dead | leave |
| `command-center/` | **empty dir** | delete |
| `dash/page.tsx` | redirect → `/mission` | keep (back-compat) |
| `cockpit/page.tsx` | redirect → `/mission` | keep (back-compat) |

### 1.4 Monitor-wall stubs are now orphans

Three pages predate `CockpitShell` — they're bare black-bg panels designed for the 4-monitor physical wall (`Monitor 2/3/4 — ASUS/DELL`). With CockpitShell now wrapping everything, these stubs are redundant:

| Route | Comment in source | Disposition |
|-------|-------------------|-------------|
| `agents/page.tsx` | "Monitor 2 — ASUS Left" | **CONFLICT** — also wraps `AgentTower` which the rail links as "Agent Tower → /agents". Decide: promote to CockpitShell or kill. |
| `swarm/page.tsx` | "Monitor 3 — DELL Middle" | Same — bare wrapper around `<AgentList />`. Rail says Benchmarks → /swarm but page renders AgentList. **Real bug.** |
| `pipeline/page.tsx` | "Monitor 4 — ASUS Right" | Bare wrapper around `<LogFeed />`. Rail says Power User → /pipeline but page renders LogFeed. **Real bug.** |

The rail labels lie about what these pages render. That's worse than messy — it's broken UX.

### 1.5 Orphan routes (in `app/` but not in rail)

| Route | What it is | Decision |
|-------|-----------|----------|
| `preprompt/` | preprompt editor | promote to rail under Models & Routing |
| `particle-viz/` | particle visualization | decide: novelty demo → kill, or promote under Interface |
| `inline/` | "Memory" — rail points here | rename to `/memory` |
| `skyscraper/` | "Abliterator" — rail points here | rename to `/ablate` |
| `bridge/` | "GOOP Playground" — rail points here | rename to `/goop` |

---

## 2. Proposed Tiered Rail (5 groups, 15 items)

Replace the flat `RAIL` array with grouped nav. Same destinations, organized by intent.

### Group A: **OPERATIONS** — run the missions
- **Mission Control** → `/mission` (overview & command)
- **Mission Harness** → `/mission/harness` (runs, streams, results)
- **Agent Tower** → `/agents` (deploy & orchestrate)

### Group B: **OBSERVABILITY** — see what's happening
- **System Map** → `/system-map` (services, agents, flows)
- **OMNI Cockpit** → `/omni` (truth & integrity)
- **Benchmarks** → `/benchmarks` (was `/swarm`)

### Group C: **INTELLIGENCE** — self-modifying systems
- **Self Evolution** → `/evolution` (loop status & controls)
- **Memory** → `/memory` (was `/inline`)
- **Abliterator** → `/ablate` (was `/skyscraper`)

### Group D: **MODELS & ROUTING** — LLM plumbing
- **Providers & Models** → `/providers`
- **GOOP Playground** → `/goop` (was `/bridge`)
- **Preprompt** → `/preprompt` (currently orphan — promote)

### Group E: **INTERFACE** — how you talk to it
- **Voice** → `/voice`
- **MOCHI** → `/mochi`
- **Particle Viz** → `/particle-viz` (currently orphan — promote)

### Group F: **SYSTEM** — housekeeping
- **Settings OS** → `/settings`
- **Power User** → `/power` (was `/pipeline`)

**Result:** 6 groups, 17 items (was 15 — added preprompt + particle-viz orphans). Each group ≤3 items. Scannable.

---

## 3. Route Renames (Clean Label/Route Match)

Five renames. Each gets a back-compat redirect so old URLs/bookmarks don't break.

| Old route | New route | Rail label (unchanged) |
|-----------|-----------|------------------------|
| `/swarm` | `/benchmarks` | Benchmarks |
| `/inline` | `/memory` | Memory |
| `/skyscraper` | `/ablate` | Abliterator |
| `/pipeline` | `/power` | Power User |
| `/bridge` | `/goop` | GOOP Playground |

**Important:** `/swarm`, `/pipeline`, `/agents` currently render the monitor-wall bare stubs. After rename:
- `/benchmarks` (new) → wire to actual benchmark page (need to find/write one — rail says Benchmarks, page rendered AgentList, that's a bug)
- `/power` (new) → wire to actual power-user page (page rendered LogFeed, also a bug)
- `/agents` (kept) → promote from bare stub to CockpitShell-wrapped Agent Tower page

The "monitor-wall stub" pattern (`<div className="min-h-screen bg-black">…`) is **dead**. CockpitShell won. Delete the three stubs and rebuild their destinations properly.

---

## 4. Component Inventory Triage (preliminary — needs deeper pass)

`app/components/` has ~45 `.tsx` files. Visible overlap:

| Cluster | Files | Issue |
|---------|-------|-------|
| Mission | `MissionControl.tsx` (live), `_archive/MissionControl.tsx` (dead) | name collision in archive |
| Dashboards | `UnifiedDashboard.tsx`, `PerkplerDashboard.tsx` (both archived) | leave |
| Panels | `BridgePanel.tsx`, others | TBD |
| Towers | `AgentTower.tsx`, others | TBD |

**Full component dedupe is task #4** — separate pass after nav shape is locked. Don't bundle.

---

## 5. CockpitShell Changes Required

Single file edit: `app/components/CockpitShell.tsx`

1. **Replace flat `RAIL` array** (lines 16–32) with nested `RAIL_GROUPS` structure:
   ```ts
   const RAIL_GROUPS = [
     { id: 'ops', label: 'OPERATIONS', items: [ /* 3 */ ] },
     { id: 'obs', label: 'OBSERVABILITY', items: [ /* 3 */ ] },
     { id: 'int', label: 'INTELLIGENCE', items: [ /* 3 */ ] },
     { id: 'mod', label: 'MODELS & ROUTING', items: [ /* 3 */ ] },
     { id: 'ui',  label: 'INTERFACE', items: [ /* 3 */ ] },
     { id: 'sys', label: 'SYSTEM', items: [ /* 2 */ ] },
   ];
   ```
2. **Update `<nav>` render** (lines 145–183) to iterate groups → items, with group header rows.
3. **No CSS changes** — existing rail styling still applies per-item; only add a `.cockpit-nav-group-label` style for group headers (~10 lines of inline style).

---

## 6. Execution Order (when approved)

1. **Route renames** — 5 dirs renamed + 5 redirect stubs (`old/page.tsx` → `redirect('/new')`)
2. **Delete dead stubs** — `command-center/` (empty), optionally `dash/` + `cockpit/` redirects
3. **CockpitShell edit** — swap flat RAIL for RAIL_GROUPS
4. **Smoke test** — hit all 17 routes, confirm none 404
5. **Component dedupe** (separate workstream — task #4)

---

## 7. Open Questions (need user call before execution)

1. **`/swarm` and `/pipeline` currently render wrong content** (AgentList / LogFeed instead of Benchmarks / Power User). Do you want me to:
   - (a) Build new pages for Benchmarks + Power User from scratch, OR
   - (b) Repoint those labels to whatever AgentList/LogFeed actually do (keep the impl, change the label), OR
   - (c) Delete those two rail entries entirely?

2. **Preprompt + Particle Viz** — promote to rail, or leave as orphans (accessible only by direct URL)?

3. **Back-compat redirects** — keep the 5 old routes as redirect stubs, or hard-delete?

4. **`dash/` + `cockpit/` redirect stubs** — keep (someone may have bookmarks) or delete?

---

## 8. What I Did NOT Touch

- `app/api/*` — 40+ route folders, not in scope
- `app/components/*` — full dedupe deferred to task #4
- `lib/`, `agents/`, `skills/` — not UI
- Tailwind/global CSS — no styling changes proposed
- Theme/colors — no changes
