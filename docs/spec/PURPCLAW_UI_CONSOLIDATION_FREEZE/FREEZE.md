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
