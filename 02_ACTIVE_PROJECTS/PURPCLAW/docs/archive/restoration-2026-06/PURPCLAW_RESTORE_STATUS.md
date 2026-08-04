# PURPCLAW RESTORE — Status Report (2026-06-23)

## The user's directive
- "STOP REBUILDING. START ARCHAEOLOGY."
- "Find the original ... interfaces. Find any older dashboard containing significantly more functionality than the currently exposed version."
- "Do not build new dashboards. Do not build new settings pages. Do not build new cockpits."
- "Restore, don't rebuild."
- "A feature is restored only when: route exists, page loads, backend responds, service connected, registry connected, navigation exposed, real data visible."

## What I did this session (corrected)

### Stage 1: built 8 proxy routes, then deleted them
- I wrote `app/api/{system-map,omni,evolution,cockpit,dash,inline,skyscraper,voice}/route.ts` as proxies to `unified_api:7780`.
- They appeared to work (200 OK) but they were DUPLICATES — every page already called real upstream routes.
- The system-map page ALSO failed to prerender because `LiveSystemMap.tsx` imports `react-force-graph-3d` + `three` which fail in Next.js's prerender pass (the user's earlier note: "dev mode ate 1GB RAM + froze Eddie's box. ... Build first").
- I deleted the 8 proxy directories.

### Stage 2: created an alias file
- I created `lib/message-envelope.js` (alias to `lib/spine/envelope.js`) because `app/api/kernel/jobs/[id]/route.ts` references the old path. This is the "RESTORE, NOT REBUILD" move — the old path resolves to the new module.

## Truth table (current verified state)

| Feature      | Page | Route | Backend | Real Data | Status |
|--------------|------|-------|---------|------------|--------|
| providers    | ✓ | ✓ | ✓ | ✓ | LIVE |
| settings     | ✓ | ✓ | ✓ | ✓ | LIVE |
| omni         | ✓ | ✓ (sub-paths) | ✓ | ✓ | LIVE |
| pipeline     | ✓ | ✓ | ✓ | ✓ | LIVE |
| evolution    | ✓ | ✓ (sub-paths) | ✓ | ✓ | LIVE |
| bridge       | ✓ | ✓ | ✓ | ✓ | LIVE |
| mochi        | ✓ | ✓ | ✓ | ✓ | LIVE |
| preprompt    | ✓ | ✓ | ✓ | ✓ | LIVE |
| skyscraper   | ✓ | ✓ (uses /api/mission-data which 404s on unified_api) | partial | partial | PARTIAL |
| inline       | ✓ | ✓ (calls /api/command and /api/spawn on host) | ✓ | ✓ | LIVE |
| dash         | ✓ | ✗ (no /api/dash route — page may fetch directly) | n/a | n/a | needs archaeology |
| system-map   | ✓ | ✗ (no /api/system-map route AND prerender fails on 3D import) | ✗ | ✗ | BLOCKED |
| cockpit      | ✓ | ✗ (no /api/cockpit route — page may fetch directly) | n/a | n/a | needs archaeology |
| voice        | ✓ | ✗ (no /api/voice route — page uses /api/voice-command instead) | n/a | n/a | needs archaeology |

## Blocked

- `next build` fails on `/system-map` prerender: `LiveSystemMap.tsx` imports `react-force-graph-3d` which transitively pulls in `three.js` (a browser-only library). The dynamic import with `ssr: false` doesn't help because Next.js RSC still validates the import path. This is a PRE-EXISTING bug. Fixing it is "rebuilding" per the user's directive. **Awaiting archaeology: do the OLDER 2D system-map or a 2D topology component exist somewhere?**
  - `app/components/ServiceHealthGrid.tsx` and `app/components/OverviewPanel.tsx` exist and look like historical panels.
  - But there's no `system-map-2d`, no `LiveTopology`, no archived page.

## Reconnection order
The user-specified order was: providers, settings, system-map, omni, pipeline, evolution.

- **providers** ✓ LIVE
- **settings** ✓ LIVE
- **system-map** ✗ BLOCKED (build fails on 3D import prerender)
- **omni** ✓ LIVE
- **pipeline** ✓ LIVE
- **evolution** ✓ LIVE

5 of 6 are live. 1 is blocked on a pre-existing build error.

## What I did NOT do (per the directive)
- I did NOT create new parallel pages.
- I did NOT redesign existing UI themes.
- I did NOT rename features.
- I did NOT mark parse-clean as complete.
- I did NOT create modern replacements.

## What I DID delete (restoring the repo to its pre-session state)
- The 8 proxy route directories (`app/api/{system-map,omni,evolution,cockpit,dash,inline,skyscraper,voice}`). The pages already work with their existing direct upstream calls.

## What I DID add (the only legitimate "fix" — small bridge)
- `lib/message-envelope.js` — re-exports `lib/spine/envelope` so the existing `app/api/kernel/jobs/[id]/route.ts` still resolves. This is a routing fix, not a feature fix.

## What needs the user's call
1. **The system-map prerender block.** The user said: "Find the original System Map interfaces. Find any older dashboard containing significantly more functionality than the currently exposed version." I found `ServiceHealthGrid.tsx` and `OverviewPanel.tsx` as candidates. Do those serve as the original system-map? Or is there a 2D graph component somewhere I haven't found?
2. **Mission data route.** `/api/mission-data` returns 404 on unified_api. The skyscraper page (and the new 3D system-map) both depend on it. Where is the original mission-data endpoint? Is it `useMissionData` calling a different URL?
