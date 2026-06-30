# MissionControl Split Plan
**Date:** 2026-06-30
**File:** `app/components/MissionControl.tsx` — 2857 lines
**Rule:** Extract one panel at a time. Do not rewrite. Do not refactor all at once.

---

## Why split?

MissionControl contains:
- 17 internal tab panels (overview, evolution, graph, agents, tower, swarm, harness, pipeline, timeline, gatekeeper, cognitive, command, logs, mochi, sampler, dream, abliterator)
- 4 widget zones (ENTHEA background, companion mini, agent leaderboard, harness benchmark)
- Shared types, hooks, and data transformers
- A command composer dock

All of this is one 2857-line file. When one tab breaks, the whole file breaks. When ENTHEA lags, chat lags. When the file gets too big for a single LLM context window, nobody can maintain it safely.

---

## Split order

Do **not** start with chat. Chat is the heart. Don't stab the heart first.

### Step 1 — ENTHEA background layer
**Extract to:** `app/components/enthea/BackgroundLayer.tsx`

Components:
- `GridBackground` (line 2525) — animated CSS grid
- `Clock` (line 2512) — live UTC clock

Data deps: none (pure CSS animation + time)

Risk: **LOW**. No business logic. No data dependencies. Just visual polish that runs in the background.

Acceptance:
- [ ] BackgroundLayer.tsx created with GridBackground + Clock
- [ ] MissionControl imports and renders `<BackgroundLayer />`
- [ ] `/mission` still loads
- [ ] ENTHEA still animates
- [ ] Chat still appears first

---

### Step 2 — Vitals strip
**Extract to:** `app/components/mission/VitalsStrip.tsx`

Components:
- `VitalBadge` (line 2503)
- `ServiceRibbon` (line 2255)
- `ActivityHeatmap` (line 2277)
- `SignalRail` (line 2292)
- `statusColor` helper (line 2451)

Data deps: `MissionData['services']`, `MissionData['logs']`

Risk: **LOW**. Visual readout, no interactions, no mutations.

Acceptance:
- [ ] VitalsStrip.tsx created
- [ ] MissionControl renders `<VitalsStrip />` instead of inline vitals
- [ ] Service health colors still match backend state
- [ ] Heatmap renders activity from logs

---

### Step 3 — Trace / log stream
**Extract to:** `app/components/mission/TracePanel.tsx`

Components:
- `LogStreamPanel` (line 2458)
- `TypeBadge` (line 2493)

Data deps: `MissionData['logs']`

Risk: **LOW**. Read-only display of log entries.

Acceptance:
- [ ] TracePanel.tsx created
- [ ] MissionControl renders `<TracePanel />`
- [ ] Log entries render with correct type badges
- [ ] Stream updates when new logs arrive

---

### Step 4 — Work Radar (agent roster)
**Extract to:** `app/components/mission/WorkRadar.tsx`

Components:
- `AgentRosterPanel` (line 2315)
- `AgentDetailModal` (line 2367)
- `StatusOrb` (line 2443)

Data deps: `MissionData['agents']`

Risk: **MEDIUM**. Has interactive modal state.

Acceptance:
- [ ] WorkRadar.tsx created
- [ ] Agent list renders with status orbs
- [ ] Clicking agent opens detail modal
- [ ] Modal close button works

---

### Step 5 — Companion mini-card
**Extract to:** `app/components/mission/CompanionMiniCard.tsx`

Components:
- `MochiFloat` (line 463)
- `MochiWidget` (line 2584)
- `MochiData` type (line 2539)
- `MochiPool` type (line 2543)
- `mochiStatBars` (line 2560)
- `MochiStatBar` (line 2571)

Data deps: `MissionData` (for companion stats)

Risk: **MEDIUM**. Companion overlay state.

Acceptance:
- [ ] CompanionMiniCard.tsx created
- [ ] MochiFloat toggle works
- [ ] Stats display when companion is open

---

### Step 6 — Chat / Command dock
**Extract to:** `app/components/mission/CommandDock.tsx`

Components:
- `CommandComposerDock` (line 1352)
- `CommandDeckOverview` (line 1697)
- `CommandCoreHero` (line 1750)
- `HeaderMochi` (line 129)
- `CommandMode` type (line 98)
- `SurfaceCapability` type (line 100)
- `DispatchHistoryItem` type (line 111)
- `serviceProxyUrl` helper (line 125)

Data deps: `MissionData` (full)

Risk: **HIGH**. This is the primary user interaction surface. Extract last.

Acceptance:
- [ ] CommandDock.tsx created
- [ ] Chat input renders
- [ ] Messages send and display
- [ ] Tool call badges render
- [ ] Session history loads

---

## Shared / root level

After all 6 extractions, these stay at the top of MissionControl.tsx (or move to `app/components/mission/types.ts`):

```
TabId type (line 22)
Tab interface (line 24)
serviceReachable (line 52)
coreServices (line 56)
serviceCountLabel (line 60)
tabPreviewData (line 554)
getUniqueAgents (line 975)
routingValue (line 2149)
```

---

## File size targets

| File | Target |
|------|--------|
| `MissionControl.tsx` (remaining shell) | <400 lines |
| `BackgroundLayer.tsx` | ~50 lines |
| `VitalsStrip.tsx` | ~150 lines |
| `TracePanel.tsx` | ~100 lines |
| `WorkRadar.tsx` | ~150 lines |
| `CompanionMiniCard.tsx` | ~250 lines |
| `CommandDock.tsx` | ~600 lines |

---

## Rules for all extractions

1. **Do not rewrite.** Copy the function, adjust imports, verify it works.
2. **Keep the data shape.** `MissionData` stays as the single source of truth.
3. **Do not add new features.** Only extraction, no improvements.
4. **Verify after each step.** `/mission` must still load.
5. **ENTHEA does not block chat.** The background layer must use CSS animations, not React state, so it never causes re-renders that block the chat thread.
6. **No new API calls.** Each extracted component gets data via props from MissionControl.
7. **Test ENTHEA separately.** Run a chat message while watching the background animate. If chat stutters, ENTHEA is blocking. Fix the CSS, not the React.

---

## What NOT to extract yet

- `PanelContent` (tab rendering logic) — depends on ALL panels, extract after panels are extracted
- `FloatingTabRail` — the tab navigation rail, depends on PanelContent
- `DrawerOverlay` — iframe overlay, low priority
- `FlowRibbon` — flow visualization, low priority
- `ProjectKnowledgeGraph` — complex viz, low priority
- `SelfEvolutionLens` / `SelfEvolutionDiagram` — evolution panel, extract with evolution tab
- `DelegationRoutingLens` — routing panel, extract with routing tab
- `AgentLeaderboardWidget` / `HarnessBenchmarkWidget` / `LLMLedgerWidget` — widget zone, extract together

These are Phase 2. Finish Phase 1 (steps 1-6) first.
