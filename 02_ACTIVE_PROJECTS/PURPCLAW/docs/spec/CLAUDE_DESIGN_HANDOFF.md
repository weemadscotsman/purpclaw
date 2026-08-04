# CLAUDE DESIGN HANDOFF — "Purple Dawn" Mission Control skin

**Give this whole document to Claude Design.** It defines exactly how the
Mission Control mockup must be delivered so it wires straight into the live
PURPCLAW stack. The mockup's look is approved — this is about structure.

---

## 1. What you are building (and what you are NOT)

You are building a **skin/layout for the existing canonical shell** — not a
new app, not a standalone page, not a second UI tree. PURPCLAW has a binding
UI freeze: one shell, one route registry, one chat surface, one log stream,
one theme provider. Your output gets wired into React components that already
exist and already stream live data. A previous "second UI" (/cockpit) was
deleted for violating this. Don't make me delete yours.

**Deliver:**
- One HTML file (`Mission Control.html`) — pure HTML + CSS, no frameworks.
- ALL colors/fonts/spacing as **CSS custom properties** in ONE `:root` block
  (this becomes the theme). No hardcoded hex values anywhere else in the CSS.
- Every live-data region tagged with `data-panel="<id>"` (ids in §3).
- Every metric value tagged `data-field="<name>"` with placeholder content.
- No JavaScript needed — the wiring is my job. If you include demo JS, keep it
  in one `<script>` block I can strip.

---

## 2. Theme tokens (name them EXACTLY like this)

```css
:root {
  --pc-bg-void:        /* page background */
  --pc-bg-panel:       /* card/panel background */
  --pc-bg-raised:      /* elevated surfaces (console, modals) */
  --pc-border:         /* default border */
  --pc-border-strong:  /* emphasized border */
  --pc-accent:         /* primary purple */
  --pc-accent-2:       /* magenta/fuchsia secondary */
  --pc-success:        /* green (online, pass) */
  --pc-warning:        /* amber */
  --pc-danger:         /* red (AWAKEN, errors) */
  --pc-info:           /* cyan */
  --pc-text:           /* primary text */
  --pc-text-muted:     /* secondary text */
  --pc-text-terminal:  /* mono/terminal text */
  --pc-chip-active:    /* active chip/tab background */
  --pc-glow:           /* neon glow color for shadows */
  --pc-font-ui:        /* UI font stack */
  --pc-font-mono:      /* terminal font stack */
}
```

CRT/glitch identity is wanted — scanlines, glow, the lot — but readability
wins every conflict. No overlap at 1536x710. Composer always visible.

## 3. Panel map — every region → its live data source

Tag each region `data-panel="<id>"`. This is the wiring contract; the ids
must match exactly.

| data-panel | Mockup region | Live source (already exists) |
|---|---|---|
| `top-status` | Services / Agents / Tools / Events / Errors strip | `/api/mission-data`, `/api/services` |
| `operation-banner` | Operation: PURPLE DAWN block | `/api/status` + `/api/governor/status` |
| `awaken` | AWAKEN card + button | `/api/awaken/status`, `/api/awaken/start`, `/api/awaken/stop` |
| `stat-cards` | Agent Swarm / Truth Score / Stress / Loot / Reliability / Memory | `/api/mission-data`, `/api/omnicode/status`, `/api/agent-scores` |
| `activity-stream` | ACTIVITY STREAM [LIVE] | SSE `/api/trace/stream` (THE one log stream — do not design a second one elsewhere) |
| `command-console` | COMMAND CONSOLE chat + input | `/api/chat` SSE — see §4, this is the Control Room chat |
| `recent-actions` | RECENT ACTIONS list | `/api/trace/recent` |
| `omni-truth-cards` | OMNI TRUTH CARDS row | `/api/omnicode/status` |
| `mochi` | MOCHI // COMPANION card | `/api/mochi` (species/name/eye/hat are real fields) |
| `companion-chorus` | COMPANION CHORUS row | `/api/companion-chorus/roster` |
| `service-radar` | SERVICE RADAR | `/api/services` |
| `work-radar` | WORK RADAR donut | `/api/mission-data` (agents by status) |
| `jobs-ribbon` | JOBS / QUEUE / SESSIONS / EVENT STREAM / ALERTS footer | `/api/kernel/jobs`, `/api/sessions`, `/api/event-timeline` |
| `weatherman` | Weatherman card | `lib/weatherman.js` via `/api/service-proxy` |
| `duck-observer` | Duck observer card | cosmetic — static ok |

Numbers in the mockup (32/32, 27 agents, 118 tools, 93.7%) are placeholders —
mark them `data-field` and expect them to be replaced at runtime. Do NOT bake
fake numbers into images/SVGs where code can't reach them.

## 4. Command Console = the real chat (non-negotiable)

The console in the mockup is the ONE chat surface (Control Room). It renders
these SSE events, so design message states for each:

- streaming tokens (partial reply, model/lane label visible: `routed` event)
- tool-call badges (running → success/failure)
- **delegated job bubble** — a job card inside the chat thread with id, lane,
  live status line (jobs are polled to completion IN the chat, not a side panel)
- **failure card** — title, body, hint, next-action (spine contract `card`)
- mode chips: Chat / Plan / Execute / Swarm / Mission / Research / Group —
  design as one compact row that collapses on narrow widths

## 5. Navigation must match the registry (18 routes, fixed)

Left sidebar entries come from `app/lib/route-registry.ts`. Design nav slots
for exactly these groups — do not invent new destinations:

- **Start:** Mission Spine, Control Room, Asher
- **Build:** Execution Harness, Agent Workforce, Tower State, Delegation Graph
- **Observe:** Workflow Flow, Event Lens, Live Metrics, Raw Signals, Dream Swarm
- **Control:** Risk Gate, Abliterator, Cognitive Mesh, Self-Evolution, System Map
- **System:** Settings
- **Stack Pages (collapsed group):** Providers, GOOP, Voice, OMNI, Spine Board,
  Awaken, Preprompt, Frameworks

Your mockup's sidebar labels (Agent Tower, OMNI Cockpit, Archaeology, etc.)
get remapped to these — if a mockup label has no home in this list, it becomes
a panel inside an existing route, not a new route.

## 6. Acceptance

- No overlapping panels at 1536x710 and 1920x1080; no horizontal overflow
- Composer visible at all times; terminal/log dock never covers it
- One `:root` token block; zero hex values outside it
- All §3 `data-panel` ids present
- Single HTML file, no external assets except Google Fonts

Deliver that, and it gets wired to live data as the switchable "Purple Dawn"
theme of the canonical shell — TUI/CLI variants follow the same token names.
