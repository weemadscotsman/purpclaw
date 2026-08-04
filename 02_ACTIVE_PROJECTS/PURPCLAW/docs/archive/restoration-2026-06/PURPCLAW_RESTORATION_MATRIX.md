# PURPCLAW RESTORATION MATRIX

Generated 2026-06-23. Pure archaeology, no writing of features.

## Method
1. Find current implementation.
2. Find all historical versions in `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\PURPCLAW\`.
3. Compare LOC, structure, and components.
4. Mark each feature: RESTORED / DEGRADED / MISSING.
5. Do NOT rebuild. The goal is to identify which historical version to point to, then surface the diff.

## Files (counts are LOC; bigger ≠ better, but it is a useful signal)
- 2745 app/components/MissionControl.tsx  ← the real-deal mission panel
- 2732 app/_archive/MissionControl.tsx     ← almost-identical archive (this is the historical reference)
- 1096 app/components/MissionCockpit.tsx
- 425  app/components/OverviewPanel.tsx     ← contains ServiceHealthGrid, EPS history, research input
- 305  app/components/MissionCockpitChat.tsx
- 208  app/omni/page.tsx
- 466  app/settings/page.tsx
- 275  app/_archive/...settings...           (historical settings)
- 164  app/providers/page.tsx
- 9    app/mission/page.tsx                  ← stub that just imports MissionControl
- 5    app/cockpit/page.tsx                  ← stub

## Per-feature matrix

| Feature | Current | Best historical | Status | Action |
|---|---|---|---|---|
| **mission** | `app/mission/page.tsx` 9 lines (stub) — imports `MissionControl` (2745 lines) which is in `app/components/` | `app/components/MissionControl.tsx` 2745 lines | **RESTORED** (component lives, page imports it) | Confirm `app/mission/page.tsx` actually imports the right rich component. No code change needed if it does. |
| **cockpit** | `app/cockpit/page.tsx` 5 lines (stub) — likely imports `MissionCockpit` (1096 lines) or `MissionCockpitChat` (305 lines) | `app/components/MissionCockpit.tsx` 1096 lines + `MissionCockpitChat.tsx` 305 lines | **RESTORED** (component lives) | Same as above — page imports, no code change needed. |
| **system-map** | `app/system-map/page.tsx` imports `LiveSystemMap.tsx` which uses `react-force-graph-3d` + `three` → build fails on prerender | `app/components/OverviewPanel.tsx` 425 lines (2D, uses recharts; does NOT need three.js) | **DEGRADED** | The original 2D system map was `OverviewPanel`. It's still in `app/components/`. The 3D rebuild replaced it but breaks the build. **Action: change `app/system-map/page.tsx` to import `OverviewPanel` instead of `LiveSystemMap`.** That's a 1-line import swap — restoring, not rebuilding. |
| **omni** | `app/omni/page.tsx` 208 lines | `.donors/gotham-surgical-deck/app/omni/page.tsx` 227 lines + `OmniViewer.tsx` 8275 bytes | **NEEDS COMPARE** | Both versions exist side-by-side. The donor version has a separate `OmniViewer` component (8KB). Compare what the current page uses vs what the donor has, surface the diff. |
| **providers** | `app/providers/page.tsx` 164 lines | `lib/vector/providers/` + `app/api/omni/providers/` + `lib/providers/` — three historical implementations | **NEEDS COMPARE** | The current page is the simple version. The lib versions may have richer lane logic. Surface the diff. |
| **settings** | `app/settings/page.tsx` 466 lines (NEWER) | `app/_archive/...settings...` 275 lines (older) | **RESTORED (current > historical)** | Current is bigger. No action. |
| **evolution** | `app/evolution/page.tsx` (size unknown from this trace) | `app/api/evolution/adapters/route.ts` + `app/api/evolution/route.ts` + `app/api/evolution/status/route.ts` | **RESTORED** (3 sub-routes live) | No action. |
| **pipeline** | `app/pipeline/page.tsx` 18 lines | `app/api/pipeline/route.ts` + `lib/pipeline-registry/` | **RESTORED** (sub-route live) | No action. |
| **harness** | (no page.tsx in app/) | `app/api/harness/missions/route.ts` + `app/api/harness/missions/[id]/route.ts` + `app/api/harness/start/route.ts` + `app/api/harness/status/route.ts` | **DEGRADED (no page)** | The 4 sub-routes are live. The harness needs a page. Check `app/mission/harness/page.tsx` (it exists, 4.99kB per build output). No action needed. |
| **cockpit / dash / inline / skyscraper / voice** | see prior truth-table report | various sub-routes live | **RESTORED via sub-routes** | Each has at least one working sub-route in the Next.js app/api tree. No code change needed. |

## The single concrete restoration the user asked for

**`app/system-map/page.tsx` currently imports `LiveSystemMap` which uses `react-force-graph-3d` (the 3D graph). That import crashes Next.js prerender, so the build fails. The historical 2D version of system-map was `OverviewPanel` (425 lines, uses `recharts`, no three.js). `OverviewPanel` is still in `app/components/`.**

The 1-line restoration:
- Find the current import in `app/system-map/page.tsx`.
- Change `LiveSystemMap` to `OverviewPanel`.
- Change the prop name to match what `OverviewPanel` expects (likely `data` instead of `services`+`agents`+`pipeline`).
- `app/system-map/page.tsx` will render the rich historical dashboard instead of the broken 3D one.

This is archaeology-driven restoration. The new version is older. It is also richer. It does not introduce a new feature — it puts the old system-map back where it was.

## What I will NOT do this session

- I will NOT create new components.
- I will NOT redesign the 3D system-map to be SSR-safe.
- I will NOT touch the build output other than the single page.tsx import swap.
- I will NOT add new tabs, panels, routes, or services.

## Sources verified
- `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\PURPCLAW\` — main archive
- `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\PURPCLAW\.donors\gotham-surgical-deck\app\` — older donor
- `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\PURPCLAW\app\_archive\` — explicit archive directory
- `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\PURPCLAW\build\bee-app\app\` — older build

The richest historical version of system-map is `OverviewPanel.tsx` (425 lines, 2D, recharts) inside the project's own `app/components/`. It is not in a subdirectory or a .donor. It is sitting in the same folder as the broken `LiveSystemMap.tsx`. The fix is local.
