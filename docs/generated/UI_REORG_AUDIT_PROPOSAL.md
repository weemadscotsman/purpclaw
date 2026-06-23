# PURPCLAW UI Reorg Audit Proposal

Generated: 2026-06-19

This pass is documentation only. No UI source was changed while producing this file.

## Current Shell Ownership

| Surface | File | Current role | Finding |
| --- | --- | --- | --- |
| Root layout | `app/layout.tsx` | Global HTML wrapper and `AgentStatusBar` | Not the sidebar owner. Keep it boring. |
| Full-page shell | `app/components/CockpitShell.tsx` | Left rail, top header, footer status, page wrapper | Used by `system-map`, `evolution`, `providers`, `settings`, `omni`, `voice`, `skyscraper`. It is a second shell separate from Mission Control. |
| Mission shell | `app/components/MissionControl.tsx` | Mission dashboard, mission navigation, tab/page host | Owns the crowded Mission UI problem. It contains active code plus old unused/legacy tab components in the same file. |
| Chat workbench | `app/components/CommandPanel.tsx` | Main chat, sessions, trace terminal mount, command modes | Owns chat layout and terminal docking pressure. |
| Static public shell | `app/public/ui/shell.jsx` | Public/static UI shell | Needs classification as legacy/static or migrated. It should not be silently treated as the app shell. |
| Settings mini drawer | `app/components/SettingsCog.tsx` | Small right-side control drawer | Separate drawer pattern that may conflict with the new mission drawer if expanded. |

## Route Liveness Probe

Probe command used same-origin local app at `http://localhost:3030`.

| Route | Status | Verdict |
| --- | ---: | --- |
| `/` | 307 | Redirect route, live but not a direct page. |
| `/agents` | 200 | Live page. |
| `/bridge` | 200 | Live page. |
| `/cockpit` | 307 | Redirect route, live but not a direct page. |
| `/command-center` | 404 | Folder exists but no live page. Decide: create page, redirect, or remove from nav. |
| `/dash` | 307 | Redirect route, live but not a direct page. |
| `/evolution` | 200 | Live page. |
| `/inline` | 200 | Live page. |
| `/mission` | 200 | Live page. |
| `/mission/harness` | 200 | Live page. |
| `/mochi` | 200 | Live page. |
| `/omni` | 200 | Live page. |
| `/particle-viz` | 404 | Folder exists but no live page. Decide: create page, redirect, or remove from nav. |
| `/pipeline` | 200 | Live page. |
| `/preprompt` | 200 | Live page. |
| `/providers` | 200 | Live page. |
| `/settings` | 200 | Live page. |
| `/skyscraper` | 200 | Live page. |
| `/swarm` | 200 | Live page. |
| `/system-map` | 200 | Live page. |
| `/ui` | 200 | Live page. |
| `/voice` | 200 | Live page. |

## Route File Inventory

Active page files:

| File | Notes |
| --- | --- |
| `app/agents/page.tsx` | Uses `AgentTower` directly, not `CockpitShell`. |
| `app/bridge/page.tsx` | Live bridge page. |
| `app/cockpit/page.tsx` | Redirect page. |
| `app/dash/page.tsx` | Redirect page. |
| `app/evolution/page.tsx` | Uses `CockpitShell`; exposes self-evolution controls and `TraceTerminal`. |
| `app/inline/page.tsx` | Page function name says `MissionControl`; needs naming cleanup later. |
| `app/mission/page.tsx` | Uses `MissionControl`. This is the main rescue target. |
| `app/mission/harness/page.tsx` | Standalone harness page, not `CockpitShell`. |
| `app/mochi/page.tsx` | Live Mochi page. |
| `app/omni/page.tsx` | Uses `CockpitShell`. |
| `app/pipeline/page.tsx` | Live pipeline page. |
| `app/preprompt/page.tsx` | Live preprompt page. |
| `app/providers/page.tsx` | Uses `CockpitShell`. |
| `app/settings/page.tsx` | Uses `CockpitShell`. |
| `app/skyscraper/page.tsx` | Uses `CockpitShell`; 3D stack surface. |
| `app/swarm/page.tsx` | Live swarm page. |
| `app/system-map/page.tsx` | Uses `CockpitShell`; embeds `LiveSystemMap` and 3D stack iframe. |
| `app/ui/page.tsx` | Live UI page. |
| `app/voice/page.tsx` | Uses `CockpitShell`. |

Archived page files:

| File | Notes |
| --- | --- |
| `app/_archive/mission/page.tsx` | Archived copy. Do not wire into nav. |
| `app/_archive/mission/harness/page.tsx` | Archived copy. Do not wire into nav. |

## Component Duplication / Confusion Map

| Area | Files | Risk |
| --- | --- | --- |
| Mission shells | `MissionControl.tsx`, `MissionCockpit.tsx`, `MissionCockpitChat.tsx` | Multiple mission/chat concepts coexist. Decide which is canonical before further layout work. |
| Agent views | `AgentTower.tsx`, `AgentTower3D.tsx`, `AgentCard.tsx`, `AgentList.tsx`, `TowerPanel.tsx` | Not necessarily duplicates, but names overlap. Need explicit ownership: full page, 3D viz, card, list, panel. |
| Swarm views | `SwarmPanel.tsx`, `SwarmOrchestrationView.tsx`, `components/OrchestratorWithSwarm.tsx`, `components/useSwarmControl.ts` | Root `components/` versions look like older/parallel UI. Verify before deleting. |
| Hooks | `app/hooks/useAgentTower.ts`, `hooks/useAgentTower.ts` | Same hook name in two roots. Pick one canonical import path. |
| Harness | `AutonomousHarnessPanel.tsx`, `app/mission/harness/page.tsx` | Panel and full page both exist. That may be valid, but the relationship is undocumented. |
| System map | `LiveSystemMap.tsx`, `app/system-map/page.tsx`, `app/skyscraper/page.tsx` | Good split in principle: 2D component, system page, 3D stack page. Need shared data contract doc. |
| Trace | `TraceTerminal.tsx`, `/api/trace/*` | Trace terminal now exists in multiple pages. It should be mounted by one shell zone, not randomly repeated per page. |

## What Is Actually Broken Architecturally

The UI problem is not that there are no pages. Most pages are live.

The problem is that there are too many shell patterns:

1. `CockpitShell` pages use a permanent 220px left rail plus top/footer chrome.
2. `/mission` uses its own separate Mission shell and internal tab system.
3. `CommandPanel` adds session and trace UI inside the mission body.
4. `SettingsCog` adds another drawer concept.
5. Static/public shell code still exists and can be mistaken for the real app shell.

That makes the UI feel like multiple dashboards fighting for ownership of the same viewport.

## Proposed Canonical Layout Contract

Do this after rollback/screenshot baseline is agreed.

| Zone | Owner | Contract |
| --- | --- | --- |
| `TopStatusBar` | Shared shell component | Compact live status only. No big cards. |
| `MissionIconRail` | Shared shell component | Slim icon rail only. Always visible on desktop. |
| `MissionDrawer` | Shared shell component | Slide-in/pinnable drawer for sessions, page nav, Mochi/output widgets. Closed by default. |
| `MainWorkArea` | Page content | Largest visible area. Chat/work panel dominates `/mission`. |
| `TraceTerminalDock` | Shared shell component | Docked right panel on desktop; bottom drawer on narrow viewports. Never floating over content. |
| `BottomJobRibbon` | Optional shared shell component | Only active jobs/stuck workflows. No permanent clutter. |

## Repair Order

1. Freeze current UI with screenshots at `1920x1080` and `1536x710`.
2. Decide canonical shell: either extend `CockpitShell` to support Mission mode, or extract a new shared `MissionWorkspaceShell`.
3. Move session drawer and trace dock ownership out of `CommandPanel`; `CommandPanel` should own chat behavior, not global layout.
4. Keep `/mission` as the canonical operator page. Do not create a parallel replacement page.
5. Convert legacy mission tabs into full-page links only after their route liveness is verified.
6. Remove or hide nav entries for `/command-center` and `/particle-viz` until they have real pages.
7. De-duplicate imports by choosing canonical files for agent, swarm, hook, and mission chat ownership.
8. Run viewport smoke tests after each layout edit, with screenshots saved under `docs/generated/`.

## Acceptance Gates Before More UI Work

Every UI layout patch should prove:

| Gate | Required proof |
| --- | --- |
| Build | `npm run build` passes. |
| Mission desktop | Screenshot at `1920x1080`. |
| Mission laptop | Screenshot at `1536x710`. |
| Drawer | Screenshot with drawer open. |
| Trace | Screenshot with trace dock visible and not overlapping chat/composer. |
| Overflow | Playwright check: no horizontal document overflow. |
| Composer | Playwright check: composer/input visible after load. |
| Route truth | `/system-map` shows nonzero live services when backend reports `healthy` or `online`. |

## Immediate No-Code Recommendations

| Item | Recommendation |
| --- | --- |
| `/command-center` | Remove from navigation until it has `app/command-center/page.tsx`, or make it redirect to `/mission`. |
| `/particle-viz` | Remove from navigation until it has `app/particle-viz/page.tsx`, or make it redirect to `/skyscraper`. |
| `CommandPanel` | Stop expanding global layout responsibilities inside it. Keep it as chat plus command behavior. |
| `MissionControl.tsx` | Split into smaller files only after a screenshot baseline and rollback point exist. |
| `CockpitShell.tsx` | Decide if it becomes the only app shell. If yes, it needs drawer/dock variants instead of hardcoded 220px rail. |
| Root `components/` | Treat as suspicious legacy until imports prove otherwise. Do not delete without `rg` import proof. |

## Commands Run

```powershell
Invoke-WebRequest http://localhost:3030/<route>
Get-ChildItem app -Recurse -File -Include page.tsx,page.ts,page.jsx,page.js,layout.tsx,layout.ts,loading.tsx,error.tsx,not-found.tsx
rg "export default|function .*Page|CockpitShell|MissionControl|CommandPanel|LiveSystemMap|SelfEvolutionPanel" app -g "page.tsx" -g "layout.tsx" -g "*.tsx"
rg --files app\components components app\hooks hooks
```

## Existing Screenshot Evidence

Recent full-screen screenshots already saved:

| File | Purpose |
| --- | --- |
| `docs/generated/ui-step-00-current-fullscreen-1920x1080.png` | Broken/current baseline before core recovery. |
| `docs/generated/ui-step-01-after-safe-start-fullscreen-1920x1080.png` | After `safe-start --core`. |
| `docs/generated/ui-step-02-pm2-recovered-fullscreen-1920x1080.png` | PM2 recovered state. |
| `docs/generated/mission-ui-current-1536x710.png` | Laptop viewport current state. |
| `docs/generated/mission-ui-smoke-1536x710.png` | Smoke screenshot, drawer closed. |
| `docs/generated/mission-ui-smoke-1536x710-drawer.png` | Smoke screenshot, drawer open. |
| `docs/generated/mission-ui-smoke-1920x1080.png` | Desktop smoke screenshot, drawer closed. |
| `docs/generated/mission-ui-smoke-1920x1080-drawer.png` | Desktop smoke screenshot, drawer open. |

## Bottom Line

The app has live pages. The UI failure is shell ownership and viewport hierarchy, not missing backend wiring.

Next code work should be a controlled layout repair with screenshot gates after each patch, not another feature pass.
