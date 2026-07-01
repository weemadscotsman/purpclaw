# UI FEATURE MERGE MATRIX — 2026-06-30

Source → [best part] → Destination → Decision + Notes

---

## `/mission` — Command Room

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| MissionControl FloatingTabRail | 17-tab nav with hover previews | Hover preview with tab purpose + live data | `/api/manifest`, `/api/mission-data` | `/mission` — left rail | view/inspect | **KEEP** | Core nav UX |
| CommandPanel | Chat-first input | Chat stream, model indicator | `/api/chat` | `/mission` — default panel | command | **KEEP** | Core interaction |
| CommandPanel | Session sidebar (10 cap) | Session list with Load More | `/api/sessions` | `/mission` — right rail | view/manage | **KEEP** | Already capped P6.2 |
| CommandPanel | Chat export | Export as markdown | `/api/output` | `/mission` — session panel | export | **KEEP** | |
| CommandDeckOverview | MochiWidget mini | Compact bond + mood + phase | `/api/mochi` | `/mission` — header strip | view | **KEEP** | Lightweight only |
| CommandDeckOverview | AgentConstellation | Visual agent dots | `/api/manifest` | `/mission` — AG tab | view | **KEEP** | |
| CommandDeckOverview | ServiceRibbon | Service health strip | `/api/services` | `/mission` — header strip | view | **KEEP** | |
| CommandDeckOverview | DelegationLens | Swarm graph thumbnail | `/api/delegation/status` | `/mission` — DG tab | view | **KEEP** | |
| MissionControl | FlowRibbon | 6-step flow: Hello→Kernel→Job→Swarm→Agents→Result | `/api/mission-data`, `/api/kernel/jobs` | `/mission` — below header | view | **KEEP** | Proven UX |
| MissionControl | ENTHEA iframe backdrop | WebGL visualizer, opacity 0.15 normally | `public/enthea.html` | `/mission` — background | view | **KEEP** | Must lazy-mount |
| MissionControl | DrawerOverlay (full canvas) | Tab panels span full canvas | various | `/mission` — drawer panels | various | **KEEP** | Full-width is right call |
| old MissionControl header | LIVE badge + operator name | Real-time badge | `/api/health` | `/mission` — header | view | **KEEP** | |
| old overview cards | fancy gradient agent cards | Visual polish | NONE (decorative) | `/mission` — AG tab | view | **DROP DECORATIVE** | No backend, replace with real data |
| SessionSidebar | unsaved indicator | Unsaved changes warning | memory state | `/mission` — session panel | warn | **KEEP** | |

## `/awaken` — AWAKEN Runtime

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| `/awaken` standalone | Big red AWAKEN button | Red button, full-width | `/api/awaken/start` | `/awaken` | control | **KEEP** | Best feature |
| `/awaken` standalone | Growth feed | 4-section structured feed | `/api/awaken/status` | `/awaken` | view | **KEEP** | Already honest |
| `/awaken` standalone | Mode selector | work / auto / safe | `/api/awaken/start` | `/awaken` | select | **KEEP** | |
| `/awaken` standalone | AWAKEN stop | Stop button | `/api/awaken/stop` | `/awaken` | control | **KEEP** | |
| `/awaken` standalone | StatusBadge | coloured status pill | `/api/awaken/status` | `/awaken` | view | **KEEP** | |
| `/awaken` standalone | Structured feed cards | Real feed data | `/api/awaken/status` | `/awaken` | view | **KEEP** | |
| old AWAKEN cards | "agents active: 152" | FAKE — registry count | NONE | `/awaken` | view | **DROP** | No live agent backing |
| `/awaken` standalone | Governor status | Governor state | `/api/governor/status` | `/awaken` | view | **KEEP** | |
| `/awaken` standalone | Gatekeeper panel | Safety gate status | `/api/gatekeeper-status` | `/awaken` | view | **KEEP** | |

## `/system-map` — System Topology

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| LiveSystemMap | Service nodes + edges | Force-directed graph | `/api/services` | `/system-map` | view | **KEEP** | |
| LiveSystemMap | Port annotations | Port numbers on nodes | `/api/services` | `/system-map` | view | **KEEP** | |
| LiveSystemMap | Health colouring | Green/amber/red by health | `/api/services` | `/system-map` | view | **KEEP** | |
| ServiceHealthGrid | Compact health grid | 4-col grid of services | `/api/services` | `/system-map` | view | **KEEP** | |
| SystemMap | Host telemetry | CPU/RAM/disk bars | `/api/host-telemetry` | `/system-map` | view | **KEEP** | |
| SystemMap | API mega list | All routes | `/api/api-mega-list` | `/system-map` | view | **KEEP** | |
| old ServiceHealthGrid | "12/12 ACTIVE" | May be fake | `/api/services` | `/system-map` | view | **VERIFY** | Check if real |
| `/spine` | Spine overview | Duplicates `/mission` | N/A | N/A | N/A | **ARCHIVE** | Donor only |

## `/omni` — Truth & Governance

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| `/omni` Cockpit | Truth scan button | Omni truth scan | OmniCode MCP | `/omni` | scan | **KEEP** | |
| `/omni` Cockpit | Feature registry | Feature state list | `/api/features` | `/omni` | view | **KEEP** | |
| `/omni` Cockpit | Integrity status | Provider integrity summary | OmniCode MCP | `/omni` | view | **KEEP** | |
| `/omni` Cockpit | OmniCode status | MCP server health | `/api/omnicode/status` | `/omni` | view | **KEEP** | |
| `/omni` Cockpit | Patch governance | Policy editor | `/api/governance/policy` | `/omni` | view/control | **KEEP** | |
| AbliteratorPanel | Local purge/redact | No backend, local state | N/A | `/omni` | control | **KEEP** | Local only |
| GatekeeperPanel | Safety gates view | Gate state | `/api/gatekeeper-status` | `/omni` + `/awaken` | view | **KEEP** | |
| MissionControl GK tab | Gatekeeper panel | Gate state with evidence | `/api/gatekeeper-status` | `/mission` — GK panel | view | **KEEP** | |

## `/agents` — Workforce

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| AgentTower | Division roster | 9 divisions with agent list | `/api/manifest` | `/agents` | view | **KEEP** | |
| AgentTower | Agent status chips | working/idle/error | `/api/manifest` | `/agents` | view | **KEEP** | |
| AgentWorkDock | Work radar | Active jobs/owners | `/api/eventbus/stream` | `/agents` | view | **PARTIAL** | Needs real-time |
| MissionControl AG tab | Agent roster | Full agent list | `/api/manifest` | `/mission` + `/agents` | view | **KEEP** | |
| MissionControl TW tab | Tower state | Tower agent management | `/api/tower/stream` | `/agents` — TW panel | view/control | **KEEP** | |
| MissionControl DG tab | Delegation graph | Swarm delegation | `/api/delegation/status` | `/agents` — DG panel | view | **KEEP** | |
| DivisionActivityPanel | Division activity | Agent activity by division | `/api/manifest` | `/agents` — divisions | view | **KEEP** | |
| AgentStatusBar | Compact health strip | Agent health line | `/api/manifest` | Shell status strip | view | **KEEP** | Not global, per-panel |

## `/memory` — Cognitive

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| CognitivePanel | Memory recall | Recall + vector search | `/api/memory` POST | `/memory` | recall | **KEEP** | |
| CognitivePanel | Memory search | Vector similarity search | `/api/memory` GET | `/memory` | search | **KEEP** | |
| CognitivePanel | Spine health | FAISS/health status | `/api/spine-health` | `/memory` | view | **KEEP** | |
| `/inline` | Inline cognitive | Duplicates `/memory` | N/A | N/A | N/A | **ARCHIVE** | Donor only |
| `/inline/inline` | Deep inline | Too deep, standalone | N/A | N/A | N/A | **ARCHIVE** | Donor only |
| MissionControl CG tab | Cognitive mesh panel | Recall + weave | `/api/memory` | `/mission` — CG panel | view | **KEEP** | |

## `/evolution` — Self-Evolution

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| `/evolution` Cockpit | Evolution status | Auto-evo state | `/api/evolution/status` | `/evolution` | view | **KEEP** | |
| MissionControl EV tab | Self-evolution panel | Same feed | `/api/evolution/status` | `/mission` — EV panel | view | **KEEP** | |
| `/evolution` Cockpit | Skill amendments | Proposals | `/api/skill-amendments` | `/evolution` | view/approve | **KEEP** | Add approve/reject UI |
| `/evolution` Cockpit | Auto-research | Research trigger | `/api/research/group` | `/evolution` | trigger | **KEEP** | Add trigger button |
| `/evolution` Cockpit | Growth loop | Loop status | `/api/awaken/status` | `/evolution` | view | **KEEP** | |
| `/evolution` Cockpit | Donor archaeology | docs/archive | skill registry | `/evolution` | reference | **DONOR** | Design reference only |
| `/evolution` Cockpit | Mutation gates | Approval workflow | `/api/skill-amendments` | `/evolution` | approve | **KEEP** | |

## `/providers` — Model Routing

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| `/providers` Cockpit | Provider list | All 17 providers | `/api/providers` | `/providers` | view | **KEEP** | |
| `/providers` Cockpit | Provider health | Per-provider status | `/api/llm-status` | `/providers` | view | **KEEP** | |
| `/providers` Cockpit | Model list | Per-provider models | `/api/models` | `/providers` | view | **KEEP** | |
| `/providers` Cockpit | LLM ledger | Spend tracking | `/api/llm-ledger` | `/providers` | view | **KEEP** | |
| `/providers` Cockpit | Sentinel routing | Routing rules | `/api/providers` | `/providers` | view | **PARTIAL** | Routing editor missing |
| `/providers` Cockpit | Fallback chain | Fallback state | `/api/providers` | `/providers` | view | **PARTIAL** | Fallback editor missing |
| CommandPanel | Provider/model selector | In-chat selector | `/api/llm-config` | `/mission` | select | **PARTIAL** | Selector exists, not wired |

## `/pipeline` — Runs, Queues, Traces

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| MissionControl WF tab | Pipeline status | Run + queue state | `/api/pipeline` | `/mission` — WF panel | view | **KEEP** | |
| `/pipeline` Cockpit | Pipeline runs | Full run list | `/api/pipeline` | `/pipeline` | view | **KEEP** | |
| MissionControl EL tab | Event timeline | Time-sorted events | `/api/event-timeline` | `/mission` — EL panel | view | **KEEP** | |
| MissionControl LG tab | Raw signal logs | Raw log stream | `/api/logs/stream` | `/mission` — LG panel | view | **KEEP** | |
| MissionControl | Trace stream | SSE trace | `/api/trace/stream` | `/mission` | view | **KEEP** | |
| MissionControl | Trace recent | Recent traces | `/api/trace/recent` | `/pipeline` | inspect | **KEEP** | Add deep trace view |
| `/pipeline` Cockpit | Pipeline abort | Abort run | `/api/pipeline` | `/pipeline` | control | **PARTIAL** | Abort endpoint missing |

## `/mochi` — Companion

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| `/mochi` standalone | Pet state | Mood/bond/phase | `/api/mochi` | `/mochi` | view | **KEEP** | |
| `/mochi` standalone | Action buttons | Feed/play/clean/sleep/pet | `/api/mochi-action` | `/mochi` | interact | **KEEP** | |
| `/mochi` standalone | Stats bars | FOOD/JOY/CLEAN/REST/BOND | `/api/mochi` | `/mochi` | view | **KEEP** | |
| `/mochi` standalone | Diary log | Action history | local state | `/mochi` | view | **KEEP** | |
| `/mochi` standalone | Pool snapshot | Skills/agents/memories | `/api/service-proxy:7885` | `/mochi` | view | **KEEP** | |
| MissionControl ✦ tab | MochiNarrator | Narrative over events | `/api/mochi` | `/mission` — ✦ panel | view | **KEEP** | |
| MissionControl MochiWidget | Mini companion | Compact bond + mood | `/api/mochi` | `/mission` — header strip | view | **KEEP** | |
| old Mochi cognitive dump | Cognitive breakdown | No backend | NONE | N/A | N/A | **DROP** | Not backed |

## `/voice` — Voice Bridge

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| `/voice` Cockpit | Voice bridge status | Bridge state | `/api/bridge` | `/voice` | view | **KEEP** | |
| `/voice` Cockpit | Voice command | STT → action | `/api/voice-command` | `/voice` | command | **PARTIAL** | TTS broken |
| `/voice` Cockpit | Ingress status | Command ingress | `/api/voice-command` | `/voice` | view | **PARTIAL** | |
| `/voice` Cockpit | STT/TTS config | Voice settings | `/api/settings` | `/voice` | configure | **PARTIAL** | TTS broken |

## `/settings` — Operator Controls

| Source | Feature | Best Part | Backend | Destination | Action | Decision | Notes |
|---|---|---|---|---|---|---|---|
| `/settings` Cockpit | Settings panel | Full config | `/api/settings` | `/settings` | view/control | **KEEP** | |
| `/preprompt` | Preprompt editor | System prompt | `/api/preprompt` | `/settings` | edit | **KEEP** | |
| PersonalityDial | Personality control | Tone/style config | `/api/personality` | `/settings` | configure | **KEEP** | |
| `/settings` | Provider API keys | Key management | env vars | `/settings` | manage | **KEEP** | |
| `/settings` | Spend limits | Budget caps | spend-config.json | `/settings` | configure | **KEEP** | |
| `/settings` | Sovereign mode | Local-only mode | env | `/settings` | toggle | **DONOR** | UI concept only |

## LEGACY UI — QUARANTINE

| Source | Reason | Decision |
|---|---|---|
| `public/ui/*` | Old static UI, duplicate skins | **QUARANTINE** |
| `app/public/ui/*` | Legacy app UI | **QUARANTINE** |
| `archive/legacy-ui/*` | Dead experiments | **QUARANTINE** |
| `app/spine/page.tsx` | Duplicates `/mission` | **REDIRECT** → `/mission` |
| `app/cockpit/page.tsx` | Redirect stub | **REDIRECT** → `/mission` |
| `app/dash/page.tsx` | Redirect stub | **REDIRECT** → `/mission` |
| `app/inline/page.tsx` | Cognitive duplicates | **ARCHIVE** |
| `app/inline/inline/page.tsx` | Too deep | **ARCHIVE** |
| `MissionControl.tsx` (as shell) | Full app inside shell | **SPLIT** — panels into shell, shell wrapper removed |

## SUMMARY

| Decision | Count |
|---|---|
| KEEP | 78 |
| PARTIAL | 9 |
| DROP / DROP DECORATIVE | 4 |
| ARCHIVE | 4 |
| DONOR | 3 |
| REDIRECT | 3 |
| SPLIT | 1 |
| **Total** | **102** |
