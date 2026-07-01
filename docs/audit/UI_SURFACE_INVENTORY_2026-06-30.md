# P7 UI Surface Inventory — 2026-06-30

## Routes (app/**/page.tsx)

| Route | Lines | Shell | Panel/Content | Status |
|-------|-------|-------|---------------|--------|
| `/` | 4 | redirect → `/mission` | — | KEEP_ACTIVE |
| `/mission` | 253 | MissionControl | CommandPanel + 17-tab megapanel | BROKEN_NEEDS_FIX — nested shell |
| `/awaken` | 27,154 | NONE (standalone) | AWAKEN runtime cards | KEEP_ACTIVE — needs shell |
| `/cockpit` | 115 | NONE | redirect stub | REDIRECT → `/mission` |
| `/dash` | 112 | NONE | redirect stub | REDIRECT → `/mission` |
| `/inline` | 486 | NONE | cognitive/memory | ARCHIVE_DONOR — `/memory` covers this |
| `/inline/inline` | 28,914 | NONE | DivisionActivityPanel | ARCHIVE_DONOR — too deep |
| `/mission/harness` | 24,166 | CockpitShell | AutonomousHarnessPanel | KEEP_ACTIVE — needs shell trim |
| `/evolution` | 4,867 | CockpitShell | SelfEvolutionPanel | KEEP_ACTIVE |
| `/frameworks` | 14,060 | CockpitShell | unknown | BROKEN_NEEDS_FIX — duplicate page |
| `/bridge` | 720 | CockpitShell | BridgePanel | KEEP_ACTIVE |
| `/memory` | 360 | CockpitShell | CognitivePanel | KEEP_ACTIVE |
| `/providers` | 10,655 | CockpitShell | provider panels | KEEP_ACTIVE |
| `/omni` | 9,276 | CockpitShell | truth/audit panels | KEEP_ACTIVE |
| `/pipeline` | 410 | CockpitShell | PipelinePanel | KEEP_ACTIVE |
| `/preprompt` | 7,812 | CockpitShell | preprompt editor | KEEP_ACTIVE |
| `/agents` | 503 | CockpitShell | AgentTower | KEEP_ACTIVE |
| `/swarm` | 408 | CockpitShell | SwarmPanel | KEEP_ACTIVE |
| `/system-map` | 4,276 | CockpitShell | LiveSystemMap + OverviewPanel | KEEP_ACTIVE |
| `/skyscraper` | 8,231 | CockpitShell | AbliteratorPanel | KEEP_ACTIVE |
| `/spine` | 7,519 | CockpitShell | unknown | ARCHIVE_DONOR — duplicate of /mission |
| `/voice` | 6,975 | CockpitShell | voice bridge | KEEP_ACTIVE |
| `/settings` | 32,429 | CockpitShell | settings OS | KEEP_ACTIVE |
| `/mochi` | 23,593 | NONE (standalone) | Mochi page | BROKEN_NEEDS_FIX — needs shell |

## Components (app/components/)

| Component | Lines | Role | Status |
|-----------|-------|------|--------|
| MissionControl.tsx | 2,857 | Full-app shell + 17 tabs | SPLIT_INTO_PANELS |
| CommandPanel.tsx | 2,571 | Chat-first surface | KEEP_ACTIVE → /mission default |
| CockpitShell.tsx | 357 | OS shell (sidebar+header+footer+content) | KEEP_ACTIVE — canonical shell |
| AbliteratorPanel.tsx | 590 | Redact/purge panel | KEEP_ACTIVE |
| OverviewPanel.tsx | 421 | System overview cards | KEEP_ACTIVE |
| AgentTower.tsx | 444 | Agent roster | KEEP_ACTIVE |
| CognitivePanel.tsx | 425 | Memory/cognitive | KEEP_ACTIVE |
| LiveSystemMap.tsx | 390 | Service/flow map | KEEP_ACTIVE |
| AutonomousHarnessPanel.tsx | 343 | Harness runs | KEEP_ACTIVE |
| AgentWorkDock.tsx | 378 | Work radar | MERGE_INTO_SHELL |
| AmbientTabVisualizer.tsx | 388 | Fallback tab viz | KEEP_ACTIVE |
| TowerPanel.tsx | 258 | Tower state | KEEP_ACTIVE |
| PersonalityDial.tsx | 231 | Personality control | KEEP_ACTIVE |
| MochiAvatar.tsx | 301 | Companion avatar | KEEP_ACTIVE |
| AgentStatusBar.tsx | 261 | Compact health strip | MERGE_INTO_PANELS — not global |
| AgentList.tsx | 256 | Agent list | KEEP_ACTIVE |
| LogFeed.tsx | 352 | Live log feed | KEEP_ACTIVE |
| SwarmPanel.tsx | 135 | Swarm roster | KEEP_ACTIVE |
| SamplerPanel.tsx | 125 | Metrics | KEEP_ACTIVE |
| MissionTrace.tsx | 145 | Trace view | KEEP_ACTIVE |
| SessionSidebar.tsx | 125 | Session list | KEEP_ACTIVE |
| GatekeeperPanel.tsx | 120 | Safety gates | KEEP_ACTIVE |
| DivisionActivityPanel.tsx | 106 | Division activity | ARCHIVE_DONOR |
| AgentCard.tsx | 109 | Agent card | KEEP_ACTIVE |
| EventTimelinePanel.tsx | 87 | Event timeline | KEEP_ACTIVE |
| MochiWidget.tsx | 90 | Mini companion | KEEP_ACTIVE |
| Toast.tsx | 89 | Toast notifications | KEEP_ACTIVE |
| ServiceHealthGrid.tsx | 44 | Service grid | KEEP_ACTIVE |
| ErrorBoundary.tsx | 48 | Crash boundary | KEEP_ACTIVE |
| PurpClawLogo.tsx | 39 | Logo | KEEP_ACTIVE |
| LoadingSpinner.tsx | 45 | Loading states | KEEP_ACTIVE |

## Visual Layers

| Layer | Status |
|-------|--------|
| ENTHEA (public/enthea.html) | RESTORED — lazy background, 220KB, 200 OK |
| AmbientTabVisualizer.tsx | KEEP_ACTIVE — ENTHEA fallback |
| GridBackground / ScanlineOverlay | Keep as MissionControl background |
| VignetteOverlay | Keep |

## Legacy/Archive

| Path | Action |
|------|--------|
| public/ui/ | ARCHIVE_DONOR — DO_NOT_USE_ACTIVE_UI.md |
| app/public/ui/ | ARCHIVE_DONOR |
| docs/archive/ui-shadow-2026-06-22/ | SOURCE — ENTHEA restored from here |
| archive/legacy-ui/ | QUARANTINE |

## Hooks

| Hook | Used By | Status |
|------|---------|--------|
| useMissionData.ts | MissionControl, CockpitShell | KEEP_ACTIVE — single data source |
| useAgentEvents.ts | various panels | KEEP_ACTIVE |
| useWebSocket.ts | LogFeed, pipeline | KEEP_ACTIVE |

## Key Decisions

1. **CockpitShell = ONE canonical shell** — all 12 routes use it
2. **MissionControl → SPLIT** — CommandPanel goes to /mission, 17 tabs become tabbed dashboard within shell
3. **CommandPanel = /mission default** — chat-first, chat loads < 2s
4. **CockpitShell sidebar = ONLY sidebar** — RAIL_GROUPS nav, MissionControl's FloatingTabRail removed
5. **ENTHEA = lazy background** — opacity 0.15 normally, full when DR tab open
6. **No fake green** — ACTIVE/WARNING/UNKNOWN/OFFLINE truth badges everywhere
7. **12 active routes** — all share CockpitShell + globals.css tokens
