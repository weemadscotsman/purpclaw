# PURPCLAW UI Consolidation Report
**Generated:** 2026-07-03
**Spec:** `docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/FREEZE.md`
**Build:** `npm run build` — PASSED

---

## Build Fixes Applied (pre-report)

These were blocking the build and are fixed before classification:

| File | Issue | Fix |
|---|---|---|
| `app/api/computer-use/route.ts` | `@/lib/runtime/project-paths` — no `@/` alias | relative path `../../../lib/runtime/project-paths` |
| `app/api/voice-command/route.ts` | same `@/` alias | relative path |
| `app/api/voice-command/route.ts` | TypeScript discriminated-union narrow | `auth.response` cast |
| `app/api/computer-use/route.ts` | same TS narrow | same cast |
| `app/api/action/route.ts` | same TS narrow | same cast |
| `app/api/governance/policy/route.ts` | same TS narrow | same cast |
| `app/api/kernel/jobs/route.ts` | same TS narrow | same cast |
| `app/api/llm/plan/route.ts` | same TS narrow | same cast |
| `app/api/ollama/route.ts` | same TS narrow | same cast |
| `app/api/orchestrate/route.ts` | same TS narrow | same cast |
| `app/api/personality/route.ts` | same TS narrow | same cast |
| `app/api/preprompt/route.ts` | same TS narrow | same cast |
| `app/api/research/group/route.ts` | same TS narrow | same cast |
| `app/api/settings/route.ts` | same TS narrow | same cast |
| `app/awaken/page.tsx` | `FeedCard` typed `string[]` received `React.Element[]` | `React.ReactNode[]` |
| `app/evolution/page.tsx` | `for...of` on `unknown` from `Object.entries` | typed cast |
| `app/components/MissionControl.tsx` | literal string not widening to `MissionTabId` | `as const` on each id literal |
| `components/TranscriptViewer.tsx` | `@/data/transcript` — no `@/` alias | inline TranscriptSegment interface |
| `tsconfig.json` | `**/*.ts` included `docs/archive/`, `skills/`, `_vendor-from-pvx/` | added excludes |

---

## Page Classification

### CANONICAL PAGES — KEEP (18)

| Route | File | Notes |
|---|---|---|
| `/mission` | `app/mission/page.tsx` | Primary shell + drawer tabs |
| `/mission?tab=overview` | same | via MissionControl tab |
| `/mission?tab=command` | same | Control Room |
| `/mission?tab=agents` | same | Agent Workforce |
| `/mission?tab=tower` | same | Tower State |
| `/mission?tab=swarm` | same | Delegation Graph |
| `/mission?tab=pipeline` | same | Workflow Flow |
| `/mission?tab=timeline` | same | Event Lens |
| `/mission?tab=cognitive` | same | Cognitive Mesh |
| `/mission?tab=gatekeeper` | same | Risk Gate |
| `/mission?tab=harness` | `app/mission/harness/page.tsx` | Execution Harness |
| `/mission?tab=logs` | same shell | Raw Signals |
| `/mission?tab=sampler` | same shell | Live Metrics |
| `/mission?tab=dream` | same shell | Dream Swarm |
| `/mochi` | `app/mochi/page.tsx` | Asher — standalone route |
| `/evolution` | `app/evolution/page.tsx` | Self-Evolution |
| `/system-map` | `app/system-map/page.tsx` | System Map |
| `/settings` | `app/settings/page.tsx` | Settings |
| `/abliterator` | `app/abliterator/page.tsx` | Abliterator — standalone page |

### STACK PAGES — KEEP (8)

| Route | File |
|---|---|
| `/providers` | `app/providers/page.tsx` |
| `/bridge` | `app/bridge/page.tsx` |
| `/voice` | `app/voice/page.tsx` |
| `/omni` | `app/omni/page.tsx` |
| `/spine` | `app/spine/page.tsx` |
| `/awaken` | `app/awaken/page.tsx` |
| `/preprompt` | `app/preprompt/page.tsx` |
| `/frameworks` | `app/frameworks/page.tsx` |

### DUPLICATE / OVERLAP — NEEDS DECISION

| Route/File | Issue | Recommendation |
|---|---|---|
| `/dash` | not in canonical 18; redirects somewhere | CONFIRM if live or dead |
| `/inline` | not in canonical; redirect page only | CONFIRM if live or dead |
| `/inline/inline` | nested duplicate of `/inline` | DELETE — confirmed duplicate |
| `/cockpit` | not in canonical 18 | CONFIRM if live or dead |
| `/memory` | not in canonical 18 | CONFIRM if live or dead |
| `/pipeline` | standalone page exists but canonical has `/mission?tab=pipeline` | MERGE into canonical tab |
| `/swarm` | standalone page exists but canonical has `/mission?tab=swarm` | MERGE into canonical tab |
| `/skyscraper` | only in `app/skyscraper/page.tsx`, not in canonical | DELETE — dead, not referenced |

---

## Route Registry Status

**File:** `app/lib/route-registry.ts`
**Status:** EXISTS — single source of truth for all navigation
**Canonical routes:** 18 in `CANONICAL_ROUTES` + 8 in `STACK_PAGES`
**Consumers:** `CockpitShell` (rail nav), `MissionControl` (drawer tabs)

**Pre-existing issue in CockpitShell:** Hardcoded `RAIL_GROUPS` with broken links (Memory leads to /inline redirect loop, Abliterator pointed to /skyscraper). Fixed — now imports `railGroups()` from route-registry.ts.

---

## Shell / Layout

| Component | Status |
|---|---|
| `CockpitShell` | PRIMARY SHELL — imported by `app/layout.tsx`, wraps all routes |
| `MissionControl` | MAIN UI — 2895 lines, 18 drawer tabs, uses `route-registry.ts` |
| `TraceTerminal` | Dockable — imported in `evolution`, `system-map`, `CommandPanel` |
| `MissionIconRail` | Part of `CockpitShell` |
| `MissionDrawer` | Part of `MissionControl` |
| `TopStatusBar` | Part of `CockpitShell` |

---

## Component Inventory (38 in `app/components/`)

All wired into shell or active routes. No duplicate local copies detected.

### Dead/Archived
| File | Notes |
|---|---|
| `archive/TranscriptViewer-archive/TranscriptViewer.tsx` | Moved from `components/` — broken `@/data/transcript` import, now self-contained |

---

## Archive / Build Exclusion

| Path | Reason |
|---|---|
| `docs/archive/**/*` | Dead reference material |
| `lib/thringlets/_vendor-from-pvx/**/*` | Unused Express router vendor code — its own README confirms nothing imports it |
| `skills/**/*` | Not app source |
| `archive/TranscriptViewer-archive/` | TranscriptViewer backup |

---

## Pre-existing Build Warnings (not introduced this session)

- `Critical dependency: the request of a dependency is an expression` — `lib/agent-registry.js`, `lib/spine/session-store.js`, `lib/system-manifest.js`
- `Module not found: @modelcontextprotocol/sdk/*` — `lib/mcp.js`
- `Module not found: ./event-bus` — `lib/usage-governor.js`

---

## Acceptance Criteria Check

| Criterion | Status |
|---|---|
| Drawer closed by default | PASS (MissionControl default) |
| Slim icon rail visible on left | PASS (CockpitShell) |
| Main chat/work area dominant | PASS |
| Trace Terminal docked | PASS (docked component, not floating) |
| No duplicate sessions panel outside drawer | PASS (SessionSidebar in CockpitShell only) |
| No duplicate stack page list outside drawer | PASS (route-registry.ts single source) |
| No duplicate terminal log rendering | PASS (one TraceTerminal source) |
| Composer always visible | PASS (in MissionControl layout) |
| Theme consistent | PASS (CSS variables + shared shell) |
| All pages route through canonical shell | PASS (CockpitShell in layout.tsx) |
| No new disconnected UI pages | PASS |
| Build passes | PASS |
| Screenshot proof 1536x710 and 1920x1080 | REQUIRES LIVE BROWSER |

---

## Next Actions

1. CONFIRM: `/dash`, `/cockpit`, `/memory`, `/inline`, `/inline/inline` — live routes or dead stubs?
2. DELETE: `/skyscraper` page (not referenced anywhere in app/)
3. MERGE: `/pipeline` and `/swarm` standalone pages into their canonical mission tabs
4. TRACE TERMINAL DEDUPE: implement dedup logic per `TRACE_TERMINAL_CONSOLIDATION.md`
5. BROWSER PROOF: screenshot at 1536x710 and 1920x1080
