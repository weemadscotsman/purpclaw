# PURPCLAW UI CONSOLIDATION FREEZE

## Mission

Stop adding new PURPCLAW UI pages, panels, drawers, nav stacks, and duplicate surfaces.

The current Mission UI has become spaghetti: Mission Drawer, Mission Sections, Mochi/outputs, Chats/Sessions, Stack Pages, Control Room, chat window, composer, and Trace Terminal are all competing in the same viewport. Logs are duplicated, panels are overcrowded, and the layout has no clear primary work surface.

This is a consolidation/deletion/wiring pass, not a feature expansion pass.

## Prime law

Do not create any new page unless it replaces at least two existing duplicate/disconnected pages and is wired into the canonical shell.

## Required final shell

PURPCLAW must have:

- one top status bar
- one slim icon rail
- one slide-in Mission Drawer
- one main work/chat canvas
- one docked Trace Terminal
- one shared theme/token system
- one route registry
- one navigation source of truth
- one session/chat surface
- one output/Mochi surface
- one log stream source

No duplicate drawers. No duplicate page menus. No duplicate chat panels. No duplicate terminal log lists. No standalone alternate UI theme.

## Canonical desktop layout

TopStatusBar:
- service count
- agent count
- event count
- active user/session
- compact mode/status chips

MissionIconRail:
- icons only
- opens drawer sections
- fixed width around 56 to 72px

MissionDrawer:
- slide-in
- closed by default
- contains navigation, sessions, stack pages, Mochi/output
- tabs or accordions inside drawer
- never permanently expanded unless pinned by user

MainWorkArea:
- dominant center area
- route content lives here
- Control Room chat lives here
- composer fixed at bottom
- no overlap with terminal

TraceTerminalDock:
- right side dock on desktop
- bottom drawer on narrow screens
- one log stream only
- dedupe repeated events
- controls: pause, auto-scroll, filter, source, copy, clear, expand, collapse

OptionalBottomRibbon:
- only for compact job/action status
- hidden unless active work exists

## Canonical route list

Keep these as the only top-level route destinations:

- Mission Spine
- Control Room
- Asher
- Execution Harness
- Agent Workforce
- Tower State
- Delegation Graph
- Workflow Flow
- Event Lens
- Live Metrics
- Raw Signals
- Dream Swarm
- Risk Gate
- Abliterator
- Cognitive Mesh
- Self-Evolution
- System Map
- Settings

Do not create alternate versions such as:
- new dashboard clone
- second control room
- separate chat page
- separate agent UI with different style
- logs page that duplicates Trace Terminal
- standalone theme demo page
- disconnected stack page menu

If an existing page overlaps another page, merge it into the canonical route.

## Drawer consolidation

MissionDrawer contains exactly:

1. Navigation
   - canonical routes grouped by Start, Build, Observe, Control

2. Sessions
   - session list
   - new/save/export
   - search/filter if already supported

3. Mochi / Outputs
   - Asher/Mochi state
   - latest output cards
   - recent status messages
   - pet/bond widget if needed

4. Stack Pages
   - stack page links
   - no duplicate of canonical navigation if the page already exists as a route

Only one section should be expanded by default.

## Main chat cleanup

The chat is the primary visible work area in Control Room.

Rules:
- composer always visible
- composer does not overlap terminal
- chat stream gets vertical space
- message controls are one compact row
- failed fetch / stream failed errors appear as normal message status, not layout-breaking boxes
- chips collapse into a horizontal toolbar or menu
- no duplicate Chats/Sessions panel beside the chat when drawer is closed

## Trace Terminal cleanup

Current terminal issue: repeated service-proxy logs appear duplicated and flood the panel.

Fix it:
- one source of truth for terminal events
- dedupe repeated identical events within a small time window
- cap rendered log lines
- virtualize if list is large
- newest visible when auto-scroll is on
- pause really stops UI updates
- clear clears UI buffer only unless backend clear is explicit
- copy copies visible filtered logs
- collapse/expand does not destroy chat state

Default desktop width: 360 to 460px.
Default narrow behaviour: collapsed bottom drawer, open height 220 to 320px.

## Theme consolidation

There must be one PURPCLAW theme provider.

All Mission UI surfaces must use shared tokens:
- background
- panel
- border
- accent
- warning
- danger
- success
- muted text
- active chip
- terminal text

Delete local hardcoded theme islands unless they are migrated into tokens.

CRT/glitch identity stays, but the layout must be readable.

## Component consolidation

Create or reuse shared components:

- MissionShell
- TopStatusBar
- MissionIconRail
- MissionDrawer
- MissionDrawerSection
- MissionRouteRegistry
- MainWorkArea
- ControlRoomChat
- ChatComposer
- TraceTerminalDock
- TerminalLogList
- StatusChip
- MetricPill
- SectionCard
- MochiOutputPanel

Do not keep multiple local copies of:
- nav item cards
- status chips
- metric cards
- terminal rows
- session rows
- theme wrappers

## Route registry rule

All route/page definitions must come from one registry object.

Each route defines:
- id
- label
- short label
- icon
- group
- component
- status source if any
- whether it can appear in drawer
- whether it can appear in icon rail

No hardcoded route arrays inside random components.

## Purge map

Codex must scan all UI files and classify every page/component as:

KEEP:
- canonical shell/component/route

MERGE:
- useful content but duplicate layout

DELETE:
- fake page, dead duplicate, disconnected surface, alternate UI clone

ARCHIVE:
- useful reference, not active runtime

Generate:
docs/generated/purpclaw-ui-consolidation-report.md

Report includes:
- every file touched
- every duplicate found
- every deleted/merged component
- final route list
- final shared component list
- build/test result

## Acceptance criteria

Not complete until:

- drawer closed by default
- only slim icon rail visible on left
- main chat/work area is dominant
- Trace Terminal docked, not floating
- no duplicate sessions panel outside drawer
- no duplicate stack page list outside drawer
- no duplicate terminal log rendering
- no overlapping panels at 1536x710
- no horizontal page overflow
- composer always visible
- theme consistent across all Mission pages
- all pages route through canonical shell
- no new disconnected UI pages
- build passes
- screenshot or Playwright proof at 1536x710 and 1920x1080

## Validation commands

Run available project commands:
- npm run build
- npm run lint if available
- npm run typecheck if available
- node bin/purpclaw.js status
- node bin/purpclaw.js bughunt

If a command does not exist, report it. Do not pretend.

## Final order

Consolidate. Delete. Merge. Reuse. Route through one shell.

No more UI spaghetti.

## Consolidation log

### 2026-07-07 — One URL per UI surface

The repo had THREE competing entry points all labeled "Control Room":

- `/mission`              → MissionControl React shell (canonical, full drawer, 18 routes)
- `/mission-control`      → redirected to legacy `/public/mission-control/index.html` (Purple Dawn static twin)
- `/ui`                   → legacy static command center (`/public/ui/`)

Plus a byte-identical twin served at `/twin-ui/*` and the dead donor folder at `app/public/ui/`.

User complaint: clicking Settings from the legacy UI loaded a stale, half-rendered version. Two start menus meant every other surface had to explain which was real. Freeze violated: "one navigation source of truth", "no alternate UI theme", "no duplicate page menus".

### Changes

| Path                            | Before                | After                          |
| ------------------------------- | --------------------- | ------------------------------ |
| `app/mission-control/page.tsx`  | redirect → legacy html | redirect → `/mission` (308)    |
| `public/mission-control/`       | served at /mission-control | moved to `public/_archive/mission-control/` |
| `public/ui/`                    | served at /ui         | moved to `public/_archive/ui/` |
| `app/twin-ui/[[...path]]/route.ts` | served twin copy    | DELETED                        |
| `app/public/ui/`                | donor, duplicate      | DELETED                        |
| `app/ui/route.ts`               | served legacy html    | DELETED                        |
| `app/ui/[...path]/route.ts`     | served legacy assets  | DELETED                        |
| `middleware.ts`                 | did not exist         | CREATED (308 redirects)        |
| `app/gallery/page.tsx`          | mixed live/archived   | status-coded (live/redirected/archived) |

### 308 redirect map

| Old URL                          | New URL                | Reason                       |
| -------------------------------- | ---------------------- | ---------------------------- |
| `/mission-control`               | `/mission`             | canonical UI                 |
| `/mission-control/index.html`     | `/mission`             | canonical UI                 |
| `/mission-control/*`             | `/mission`             | canonical UI                 |
| `/twin-ui`                       | `/gallery`             | surface killed; gallery lists variants |
| `/twin-ui/*`                     | `/gallery`             | surface killed               |
| `/ui`                            | `/mission`             | canonical UI                 |
| `/ui/index.html`                 | `/mission`             | canonical UI                 |
| `/ui/*`                          | `/mission`             | canonical UI                 |

### Result

- One operational UI: `/mission` (MissionControl React shell, own chrome, drawer tabs for all 18 routes).
- One skin option: `/dawn` and `/mission?ui=dawn` (DawnControlRoom — NOT a separate surface).
- One gallery: `/gallery` (status-coded: live / redirected / archived).
- Two archived donor folders: `public/_archive/mission-control/` and `public/_archive/ui/`.
- Five deleted route handlers: `/mission-control`, `/twin-ui`, `/twin-ui/*`, `/ui`, `/ui/*`.
- Zero duplicate settings surfaces.

### Verified

- `curl /mission` → 200 (consolidated UI renders the full drawer)
- `curl /mission-control` → 308 → `/mission`
- `curl /mission-control/index.html` → 308 → `/mission`
- `curl /twin-ui` → 308 → `/gallery`
- `curl /ui` → 308 → `/mission`
- `curl /ui/index.html` → 308 → `/mission`
- `curl /mission?tab=overview|settings|abliterator` → 200 each
- `curl /gallery` → 200 with live/archived/redirected status badges
- `curl /settings` → 200 (canonical Settings page, no dupe)

### Future routes

If a new page needs to exist, it must:
1. Replace at least two duplicates.
2. Be wired into `/mission` via the drawer OR replace an existing top-level route via the registry (`app/lib/route-registry.ts`).
3. Update the gallery to flip its status.

---

### 2026-07-29 — New surfaces added to gallery + redirect middleware wired for /skyscraper, /swarm, /cockpit

Five new surfaces appeared in `app/` since the 2026-07-07 consolidation. No redirects were broken, no routes were duplicated. This is a gallery audit + middleware parity fix, not a deletion pass.

**What was found:**
- 5 new React surfaces in `app/` not in the 9-entry gallery: `/omni`, `/awaken`, `/liveforge`, `/stream`, `/market-lab`
- `/settings` — standalone route (`inDrawer: false` in route-registry), NOT a /mission tab, NOT a duplicate
- `/skyscraper`, `/swarm`, `/cockpit` — page.tsx redirects existed but middleware entries were missing (302 vs 308 inconsistency)

**User complaint that triggered this**: (none — proactive audit triggered by `legacy-ui-consolidation` skill)

### Changes

| Path | Change |
|---|---|
| `middleware.ts` | ADDED: /skyscraper → /mission?tab=tower (308) |
| `middleware.ts` | ADDED: /swarm → /mission?tab=agents (308) |
| `middleware.ts` | ADDED: /cockpit → /mission (308) |
| `middleware.ts` | ADDED: bare routes + :path* variants to matcher for all three above |
| `app/gallery/page.tsx` | ADDED: 6 new entries (n=10..15: Omni-Surgeon, Awaken, LiveForge, IPTV Stream, Market Lab, Settings) |

### 308 redirect map (additions)

| Old URL | New URL | Reason |
|---|---|---|
| `/skyscraper` | `/mission?tab=tower` | Alternate tower view — consolidated to /mission tab |
| `/skyscraper/*` | `/mission?tab=tower` | Path variants |
| `/swarm` | `/mission?tab=agents` | Agent list duplicate — consolidated to /mission tab |
| `/swarm/*` | `/mission?tab=agents` | Path variants |
| `/cockpit` | `/mission` | Military terminal alternate shell — freeze bans alternate shells |
| `/cockpit/*` | `/mission` | Path variants |

### Gallery additions (n=10..15)

| n | Name | Route | Status | Distinct from /mission? |
|---|---|---|---|---|
| 10 | Omni-Surgeon Cockpit | /omni | live | YES — operator truth snapshot/patch review |
| 11 | Awaken | /awaken | live | YES — autonomous agent scheduler |
| 12 | LiveForge | /liveforge | live | YES — surface/patch management |
| 13 | IPTV Stream | /stream | live | YES — IPTV channel browser |
| 14 | Market Lab | /market-lab | live | YES — iframe embed, market data |
| 15 | Settings | /settings | live | YES — standalone route, not a /mission tab |

### Not consolidated (correctly kept standalone)

- `/settings` — `inDrawer: false` in route-registry, standalone page with PersonalityDial + driver/preset management. NOT a /mission tab. NOT a duplicate.
- `/omni`, `/awaken`, `/liveforge`, `/stream`, `/market-lab` — all distinct purposes, all route to real API endpoints, none duplicate MissionControl.

### Pending verification (build required)

Next.js build is running in background. These verifications are pending:

```bash
# Start Next.js (after build completes)
node node_modules/next/dist/bin/next start -p 3030 -H 127.0.0.1 &

# Verify redirects
curl -m 30 -s -o /dev/null -w "/mission=%{http_code}\n"              http://127.0.0.1:3030/mission
curl -m 30 -s -o /dev/null -w "/skyscraper=%{http_code} loc=%{redirect_url}\n" http://127.0.0.1:3030/skyscraper
curl -m 30 -s -o /dev/null -w "/swarm=%{http_code} loc=%{redirect_url}\n"   http://127.0.0.1:3030/swarm
curl -m 30 -s -o /dev/null -w "/cockpit=%{http_code} loc=%{redirect_url}\n" http://127.0.0.1:3030/cockpit
curl -m 30 -s -o /dev/null -w "/omni=%{http_code}\n"                  http://127.0.0.1:3030/omni
curl -m 30 -s -o /dev/null -w "/awaken=%{http_code}\n"                http://127.0.0.1:3030/awaken
curl -m 30 -s -o /dev/null -w "/liveforge=%{http_code}\n"            http://127.0.0.1:3030/liveforge
curl -m 30 -s -o /dev/null -w "/stream=%{http_code}\n"                http://127.0.0.1:3030/stream
curl -m 30 -s -o /dev/null -w "/market-lab=%{http_code}\n"            http://127.0.0.1:3030/market-lab
curl -m 30 -s -o /dev/null -w "/settings=%{http_code}\n"              http://127.0.0.1:3030/settings

# Gallery — all new entries should render as live (green)
curl -m 30 -s http://127.0.0.1:3030/gallery | grep -c "status.*live"

# Run audit scripts (after Next.js is live)
node scripts/audit-parity.mjs
node scripts/audit-showcase-claims.mjs
node scripts/liveforge-acceptance-smoke.js
```

### Audit scripts

```bash
node scripts/audit-parity.mjs            # expect api-gap=0 cli-gap=0
node scripts/audit-showcase-claims.mjs   # expect PASS (N/N)
node scripts/liveforge-acceptance-smoke.js # expect 32/32
```
