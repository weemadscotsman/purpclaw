# PURPCLAW PAGE LAYOUT SPEC — every route, every zone, every wire

Companion to `CLAUDE_DESIGN_HANDOFF.md` (tokens + data-panel contract) and
`PURPCLAW_UI_CONSOLIDATION_FREEZE/FREEZE.md` (binding shell rules).
This file defines how EACH canonical route is laid out, presented, and built.

**Shared rules for every page (no exceptions):**
- Renders inside CockpitShell (rail + header + footer). Never its own chrome.
- Uses registry entry from `app/lib/route-registry.ts` for label/icon/purpose.
- Theme tokens only (`--pc-*`). Zero local hex.
- Three states designed for every panel: LIVE (data), EMPTY (honest "no data
  yet" + the command that would produce data), DEAD (upstream down → failure
  chip, never a blank box, never fake numbers).
- Desktop grid at 1536x710 minimum; panels never overlap; no horizontal scroll.
- One log stream (TraceTerminal source), one chat (Control Room), everywhere.

---

## START

### ▣ Control Room — `/mission` (THE main surface)
The room you live in. Chat IS the page.
- **Layout:** full-height chat column, center, max-width ~980px.
  Composer pinned bottom (mode chips: Chat/Plan/Execute/Swarm/Mission/
  Research/Group as ONE compact row above input). Icon rail (Mission tabs)
  far left, 56–72px. TraceTerminal docked right, 360–460px, collapsible.
- **Sub-tabs (mockup row → real bindings):**
  - ▪ **Overview** → opens Mission Spine drawer (`?tab=overview`)
  - ≋ **Live Feed** → focuses the TraceTerminal dock (`/api/trace/stream`)
  - ▸ **Commands** → composer mode chips (scrolls to composer, opens chip menu)
  - ⇉ **Missions** → opens Execution Harness drawer (`?tab=harness`)
  - ◈ **Heist Reports** → completed kernel jobs list (`/api/kernel/jobs?state=completed`)
  - ◎ **Insights** → opens Event Lens drawer (`?tab=timeline`)
  These are FILTERS/FOCUS actions on existing surfaces — not new pages.
- **Message anatomy:** avatar + name · streamed text · meta line showing
  `lane · model · agent` (from `routed` event) · tool badges row · job cards
  inline (delegated jobs poll to completion IN the thread) · failure cards
  (title/body/hint/next-action). Errors are message states, not layout boxes.
- **Build:** `CommandPanel` (exists, contract-complete as of 2026-07-03).

### ▤ Mission Spine — `/mission?tab=overview`
The 30-second "what is my system doing" answer.
- **Layout:** drawer panel. Top: operation banner (name, state, directive,
  AWAKEN control). Middle: 6 stat cards in 3x2 (Agents active / Truth score /
  System stress / Loot 24h / Reliability / Memory util) — each card: big
  number, label, 24h sparkline. Bottom: "latest job" strip with resume button.
- **Data:** `/api/mission-data`, `/api/omnicode/status`, `/api/awaken/status`,
  `/api/kernel/jobs?limit=1`.
- **Build:** `CommandDeckOverview` (exists) — restyle to card grid.

### ☻ Asher — `/mochi`
The companion's home. CRT Game Boy identity is sacred — do not flatten it.
- **Layout:** two columns. Left: CRT screen (face, blink loop, species/hat/
  rarity, shiny FX) + stats bars computed from REAL swarm state. Right:
  narrator feed (Asher's live reactions to events) + "talk to Asher" input
  that routes through `/api/chat` with companion persona.
- **Data:** `/api/mochi`, `/api/companion-chorus/roster`, event feed via
  `/api/trace/recent`.
- **Build:** `app/mochi/page.tsx` (exists) + `MochiNarrator`.

---

## BUILD

### ⚙ Execution Harness — `/mission/harness`
Mission runner with verification gates. The "watch it work" page.
- **Layout:** left third: mission list (queued/running/done, state chips).
  Center: selected mission detail — goal, plan steps as a vertical gate
  checklist (pending→running→pass/fail), live step stream. Right: artifacts
  + verification results. Top bar: Start Mission input + abort button.
- **Data:** `/api/harness/missions`, `/api/harness/missions/[id]/stream` (SSE),
  `/api/harness/start`, `/api/harness/missions/[id]/abort`.
- **Build:** `AutonomousHarnessPanel` + harness page (exist) — merge into this
  one layout; the drawer tab shows the compact version.

### ♜ Agent Workforce — `/mission?tab=agents`
Who exists, who's working, who's stuck.
- **Layout:** roster grid of agent cards (name, division color-band, status
  dot, current task one-liner, model binding from `agent_routing_matrix`).
  Filter chips by division + status. Stuck agents (>2min no heartbeat) float
  to top with warning border.
- **Data:** `/api/mission-data` (agents), `/api/agent-scores`.
- **Build:** `AgentRosterPanel` (exists).

### ⛢ Tower State — `/mission?tab=tower`
The tower runtime — spawned agents, floors, direct assignments.
- **Layout:** left: tower visual — floors stacked vertically, one per
  division, occupancy = working/total (this is where the old /skyscraper viz
  lives now). Right: spawned-agent table (pid-like rows: agent, task, age,
  kill button) + spawn form.
- **Data:** `/api/mission-data` (tower), tower stream `/api/tower/stream`.
- **Build:** `TowerPanel` + salvage floor-viz from old skyscraper page.

### ⇉ Delegation Graph — `/mission?tab=swarm`
Who got the work and what happened to it.
- **Layout:** top: delegation flow diagram (requester → coordinator →
  workers), nodes colored by outcome. Bottom: delegation ledger table —
  task, delegate, result, duration, failure reason. Click node = filter table.
- **Data:** `/api/delegation/status`, `/api/chat/swarm` history,
  `/api/kernel/jobs`.
- **Build:** `SwarmPanel` (exists) + ledger table addition.

---

## OBSERVE

### ⤳ Workflow Flow — `/mission?tab=pipeline`
Workflow state machine: queued → active → archived.
- **Layout:** three kanban-style columns (Queued / Active / Archived), each
  workflow a compact card: id, goal one-liner, state age, step count, stop
  button on active. Auto-flows left→right as state changes.
- **Data:** `/api/pipeline`, `/api/kernel/jobs`.
- **Build:** `PipelinePanel` (exists) — restyle to columns.

### ◎ Event Lens — `/mission?tab=timeline`
Exact runtime history when you need the receipts.
- **Layout:** vertical timeline, newest top. Each event: timestamp, source
  chip, type badge, message. Sticky filter bar: source / type / text search /
  time range. Dense mode toggle.
- **Data:** `/api/event-timeline`, live append via `/api/eventbus/stream`.
- **Build:** `EventTimelinePanel` (exists).

### ≋ Live Metrics — `/mission?tab=sampler`
Sampler dashboards from shell metrics.
- **Layout:** responsive grid of metric tiles (line/bar/gauge per
  `config/samplers.yml`). Each tile: title, current value big, trend chart,
  threshold coloring (success/warning/danger tokens).
- **Data:** `/api/sampler`.
- **Build:** `SamplerPanel` (exists).

### ⌁ Raw Signals — `/mission?tab=logs`
The unfiltered firehose — same stream as TraceTerminal, full-page.
- **Layout:** single full-height virtualized log list. Controls row: pause,
  auto-scroll, filter, source select, copy, clear. Dedupe identical events
  within 2s window (render "×N" counter). Cap 2,000 rendered lines.
- **Data:** `/api/trace/stream` (THE one stream — same source as the dock).
- **Build:** `LogStreamPanel` → must consume the same store as TraceTerminal
  (per TRACE_TERMINAL_CONSOLIDATION.md). No second buffer.

### ✦ Dream Swarm — `/mission?tab=dream`
The lava-lamp. WebGL swarm telemetry, altered states.
- **Layout:** full-bleed WebGL canvas, overlay HUD top-right (agent count,
  event rate), control strip bottom (intensity, palette, pause). Falls back
  to static poster + "WebGL unavailable" chip.
- **Data:** postMessage feed from mission logs (already wired in
  MissionControl iframe bridge).
- **Build:** `DreamControlPanel` + iframe (exist).

---

## CONTROL

### ⚔ Risk Gate — `/mission?tab=gatekeeper`
Safety gates and approvals.
- **Layout:** top: gate status banner (open/locked, policy name). Middle:
  pending approvals queue — each: requested action, risk class, approve/deny
  buttons. Bottom: blocked-operations log.
- **Data:** `/api/gatekeeper-status`, `/api/governance/policy`.
- **Build:** `GatekeeperPanel` (exists).

### ⊘ Abliterator — `/abliterator`
OBLITERATUS. Red-team sandbox + refusal weight excision.
- **Layout:** left: refusal-weight table (weight, layer, magnitude, excise
  toggle). Right: attack-class sandbox (8 classes from Smith/Neo pair) with
  run + result ledger. Danger-token styling throughout; destructive actions
  double-confirm.
- **Data:** `/api/rules/refusal-weights`, obliteratus endpoints,
  `/api/benchmark/ledger`.
- **Build:** `AbliteratorPanel` (exists).

### ⬡ Cognitive Mesh — `/mission?tab=cognitive`
Memory, rules, diagnostics, reasoning lenses.
- **Layout:** four stacked lens sections (accordion, one open): Memory
  (recall search + 7-layer status honest about layers 2–7 being offline),
  Rules, Diagnostics, Reasoning. Each lens: query input + result list.
- **Data:** spine :7880 via `/api/service-proxy`, `/api/spine-health`.
- **Build:** `CognitivePanel` (exists).

### ↻ Self-Evolution — `/evolution`
The ratchet: human steers, harness builds, loop improves.
- **Layout:** top row: loop status card (running/blocked, tick count, next
  tick ETA, spend today vs ceiling) + steering input. Middle: recent ticks
  timeline with diffs/outcomes. Bottom: TraceTerminal dock (shared source).
- **Data:** `/api/evolution/status|steering|skills|research`.
- **Build:** `app/evolution/page.tsx` (exists).

### ▦ System Map — `/system-map`
Services, agents, flows — the org chart of the machine.
- **Layout:** default 2D: ServiceHealthGrid (port cards with status/latency)
  + flow overview. 3D force-graph behind explicit toggle (never default —
  it black-screens on load). Stuck-jobs alert strip when detected.
- **Data:** `/api/services`, `/api/mission-data`.
- **Build:** `app/system-map/page.tsx` (exists, already canonical-2D).

---

## SYSTEM

### ⚙ Settings — `/settings`
- **Layout:** sectioned single column: Identity (operator name) · Providers
  quick-status (link to /providers) · **UI Theme (Default / Purple Dawn —
  the Claude Design skin toggles HERE)** · TTS/voice · Redaction ·
  Danger zone (reset onboarding, clear session cache).
- **Data:** `/api/settings`, `/api/llm-config`.
- **Build:** `app/settings/page.tsx` (exists) + theme toggle (new, small).

---

## Build order (when the Purple Dawn HTML lands)

1. Extract `:root` tokens → `app/theme/purple-dawn.css`; toggle in Settings
   swaps a `data-theme` attribute on `<body>`. One provider, two skins.
2. Restyle shell chrome (rail/header/footer) from tokens — no layout change.
3. Page passes in this order: Control Room → Mission Spine → Harness →
   Workforce/Tower → Observe pages → Control pages → Settings.
4. Each page pass = restyle + wire per this spec + verify LIVE/EMPTY/DEAD
   states + 1536x710 check. One page per commit.
