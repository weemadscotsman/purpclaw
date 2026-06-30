# CANONICAL PURPCLAW UI MAP — 2026-06-30

## Active Routes

| Route | Page | Shell | Default Panel | Purpose |
|---|---|---|---|---|
| `/` | redirect → `/mission` | CockpitShell | CommandPanel | Entry point |
| `/mission` | MissionPage | MissionControl (bare) | CommandPanel | Chat-first command room |
| `/awaken` | AwakenPage + CockpitShell | CockpitShell | AWAKEN cards | Runtime control |
| `/system-map` | SystemMapPage + CockpitShell | CockpitShell | LiveSystemMap | Infrastructure topology |
| `/omni` | OmniPage + CockpitShell | CockpitShell | TruthScan | Truth, audit, governance |
| `/agents` | AgentsPage + CockpitShell | CockpitShell | AgentRoster | Workforce, divisions |
| `/memory` | MemoryPage + CockpitShell | CockpitShell | CognitivePanel | Memory, recall, weave |
| `/evolution` | EvolutionPage + CockpitShell | CockpitShell | EvolutionStatus | Self-evolution, proposals |
| `/providers` | ProvidersPage + CockpitShell | CockpitShell | ProviderList | Models, routing, sentinel |
| `/pipeline` | PipelinePage + CockpitShell | CockpitShell | PipelineRuns | Tasks, queues, traces |
| `/mochi` | MochiPage + CockpitShell | CockpitShell | MochiShell | Companion, state |
| `/voice` | VoicePage + CockpitShell | CockpitShell | VoiceBridge | Voice, STT/TTS |
| `/settings` | SettingsPage + CockpitShell | CockpitShell | SettingsPanel | Config, operator controls |

---

## Route → Panels → Backend → Status

### `/mission` — Command Room

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW logo]  LIVE ●  op:eddie  [ENTHEA●] [✦ Mochi]  │ ← header strip
│  [sidebar: RAIL_GROUPS]                                   │
│  ┌──────────┬──────────────────────────────────────────────┤
│  │ LEFT RAIL│                                              │
│  │ (floating│     COMMAND PANEL (default)                 │
│  │  tab rail│     / chat-first input / session sidebar     │
│  │  17 tabs)│     ENTHEA backdrop (opacity 0.15)         │
│  │          │                                              │
│  │ MS  CM   │     Tab = drawer spanning full canvas:       │
│  │ AS  HX   │     MS → CommandDeckOverview grid            │
│  │ AG  TW   │        (MochiWidget, AgentConstellation,     │
│  │ DG  WF   │         DelegationLens, ServiceRibbon)      │
│  │ EL  SP   │     CM → CommandPanel (chat)                 │
│  │ LG  DR   │     AS → SessionManagement                    │
│  │ GK  AB   │     HX → AutonomousHarnessPanel              │
│  │ CG  EV   │     AG → AgentRosterPanel                    │
│  │ SM  ✦    │     TW → TowerPanel                          │
│  │          │     DG → SwarmPanel                          │
│  └──────────┤     WF → PipelinePanel                       │
│             │     EL → EventTimelinePanel                  │
│             │     SP → SamplerPanel                        │
│             │     LG → LogStreamPanel                      │
│             │     DR → DreamControlPanel (ENTHEA full)     │
│             │     GK → GatekeeperPanel                     │
│             │     AB → AbliteratorPanel                    │
│             │     CG → CognitivePanel                      │
│             │     EV → SelfEvolutionLens                  │
│             │     SM → LiveSystemMap                       │
│             │     ✦  → MochiNarrator                       │
├─────────────┴──────────────────────────────────────────────┤
│  [FlowRibbon: Hello→Kernel→Job→Swarm→Agents→Result]      │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/chat`, `/api/sessions`, `/api/mission-data`, `/api/mochi`, `/api/manifest`, `/api/services`, `/api/eventbus/stream`, `/api/llm-status`, `public/enthea.html`

Status: ACTIVE — chat, sessions, ENTHEA, all 17 tabs

---

### `/awaken` — Runtime Wake Control

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / AWAKEN]           [status badge] [mode select] │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │            🔴 AWAKEN — BIG RED BUTTON               │  │
│  │         (work / auto / safe mode selector)           │  │
│  │                                                       │  │
│  │  ┌─ GROWTH ──────┐ ┌─ COMPANION COGNITIVE ─────────┐ │  │
│  │  │ growth feed   │ │ companion cognitive feed       │ │  │
│  │  │ evidence path │ │ evidence path                  │ │  │
│  │  └───────────────┘ └────────────────────────────────┘ │  │
│  │  ┌─ STRESS ──────┐ ┌─ SELF-IMPROVING ──────────────┐ │  │
│  │  │ stress feed   │ │ self-improving feed            │ │  │
│  │  │ evidence path │ │ evidence path                  │ │  │
│  │  └───────────────┘ └────────────────────────────────┘ │  │
│  │                                                       │  │
│  │  [Governor status]  [Gatekeeper status]               │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/awaken/start`, `/api/awaken/stop`, `/api/awaken/status`, `/api/governor/status`, `/api/gatekeeper-status`

Status: ACTIVE — all feeds backed by state.json reads

---

### `/system-map` — Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / SYSTEM MAP]     [refresh] [filter]           │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  LiveSystemMap (force-directed graph)                 │  │
│  │  Nodes: services, ports, agents                      │  │
│  │  Edges: flows, dependencies                          │  │
│  │  Colours: health (green/amber/red/unknown)           │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌────────────────┐ ┌───────────────────────────────────┐  │
│  │ ServiceHealth  │ │ Host Telemetry                    │  │
│  │ Grid           │ │ CPU / RAM / DISK                  │  │
│  └────────────────┘ └───────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ API Mega List                                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/services`, `/api/manifest`, `/api/host-telemetry`, `/api/api-mega-list`

Status: ACTIVE

---

### `/omni` — Truth & Governance

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / OMNI]          [run truth scan] [refresh]     │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  TRUTH SCAN RESULTS                                   │  │
│  │  files / imports / routes / services / features       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌────────────────────┐ ┌──────────────────────────────┐  │
│  │ Feature Registry   │ │ Provider Integrity             │  │
│  │ ACTIVE/PARTIAL/    │ │ ACTIVE/WARNING/UNKNOWN/        │  │
│  │ MISSING/FAKING     │ │ OFFLINE per provider          │  │
│  └────────────────────┘ └──────────────────────────────┘  │
│  ┌────────────────────┐ ┌──────────────────────────────┐  │
│  │ Patch Governance   │ │ OmniCode Status               │  │
│  │ Policy view/edit    │ │ MCP server health             │  │
│  └────────────────────┘ └──────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Abliterator (local purge / refusal weights)          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: OmniCode MCP (`omni_truth_scan`, `omni_feature_registry`, `omni_provider_integrity`), `/api/features`, `/api/governance/policy`, `/api/omnicode/status`

Status: ACTIVE

---

### `/agents` — Workforce

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / AGENTS]          [filter] [search]            │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Division Roster (CREATIVE · ENGINEERING · etc.)     │  │
│  │  9 divisions → agents → status chips                 │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WORK RADAR                                          │  │
│  │  active jobs / owners / delegation state             │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌────────────────────┐ ┌──────────────────────────────┐  │
│  │ Tower State        │ │ Delegation Graph              │  │
│  │ Active agents      │ │ Swarm delegation visual       │  │
│  └────────────────────┘ └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/manifest`, `/api/agent-scores`, `/api/tower/stream`, `/api/delegation/status`, `/api/eventbus/stream`

Status: ACTIVE (work radar PARTIAL)

---

### `/memory` — Cognitive

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / MEMORY]           [recall] [weave] [health]   │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  RECALL — vector search                              │  │
│  │  Input → search → results with similarity            │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WEAVE — ingest new memory                           │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌────────────────────┐ ┌──────────────────────────────┐  │
│  │ Spine Health       │ │ Memory Stats                  │  │
│  │ FAISS / vectors /  │ │ Total / by type / recent     │  │
│  │ health             │ │                               │  │
│  └────────────────────┘ └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/memory` (GET/POST), `/api/spine-health`

Status: ACTIVE

---

### `/evolution` — Self-Evolution

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / EVOLUTION]    [trigger research] [refresh]    │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Evolution Status                                     │  │
│  │  growth loops / auto-evo state                       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌────────────────────┐ ┌──────────────────────────────┐  │
│  │ Skill Amendments   │ │ Auto-Research                 │  │
│  │ proposals /        │ │ trigger / status             │  │
│  │ approve/reject    │ │                               │  │
│  └────────────────────┘ └──────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Donor Archaeology (reference only)                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/evolution/status`, `/api/skill-amendments`, `/api/research/group`, `/api/awaken/status`

Status: ACTIVE (auto-research UI MISSING)

---

### `/providers` — Models & Routing

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / PROVIDERS]     [refresh] [sentinel config]    │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Provider Table — all 17 providers                   │  │
│  │  Name / Status / Model / Latency / Failures / Cost  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌────────────────────┐ ┌──────────────────────────────┐  │
│  │ Model List         │ │ LLM Ledger                    │  │
│  │ Per-provider       │ │ Spend / usage / budget        │  │
│  └────────────────────┘ └──────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Sentinel Routing (PARTIAL — editor missing)         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/providers`, `/api/llm-status`, `/api/models`, `/api/llm-ledger`

Status: ACTIVE (sentinel editor MISSING)

---

### `/pipeline` — Tasks & Traces

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / PIPELINE]       [refresh]                     │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Pipeline Runs                                        │  │
│  │  queued / active / archived with status              │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Event Timeline                                        │  │
│  │ time-sorted events with type + evidence             │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Trace Viewer (deep trace MISSING)                    │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Raw Log Stream                                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/pipeline`, `/api/event-timeline`, `/api/trace/recent`, `/api/trace/stream`, `/api/logs/stream`

Status: ACTIVE (deep trace MISSING)

---

### `/mochi` — Companion

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / MOCHI]           [✦] bond: 67                 │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MOCHI SHELL (Game Boy style)                        │  │
│  │  ┌─────────────────────────────────────────────┐    │  │
│  │  │ Mood face / mood label / action animation    │    │  │
│  │  └─────────────────────────────────────────────┘    │  │
│  │  Stats: FOOD / JOY / CLEAN / REST / BOND          │  │
│  │  [FEED] [PLAY] [CLEAN] [SLEEP] [♥ PET]           │  │
│  │  Diary: action log                                 │  │
│  │  Pool: skills / agents / memories / failures      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/mochi`, `/api/mochi-action`, `/api/thringlets`, `/api/service-proxy:7885`

Status: ACTIVE

---

### `/voice` — Voice Bridge

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / VOICE]          [bridge status]               │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Voice Bridge Status                                 │  │
│  │  STT / TTS / ingress / egress                       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Voice Command (TTS broken — partial)               │  │
│  └──────────────────────────────────────────────────────┘  │
│  [WARNING: TTS not working — backend partial]           │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/bridge`, `/api/voice-command`

Status: PARTIAL (TTS broken)

---

### `/settings` — Operator Controls

```
┌─────────────────────────────────────────────────────────────┐
│  [PURPCLAW / SETTINGS]                                     │
│  [sidebar]                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Settings Panel                                       │  │
│  │  provider keys / spend limits / sovereign mode       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Preprompt Editor                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Personality Dial                                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Backend: `/api/settings`, `/api/preprompt`, `/api/personality`

Status: ACTIVE

---

## Shared Components (used everywhere)

| Component | States | Used By |
|---|---|---|
| TruthBadge | ACTIVE / WARNING / UNKNOWN / OFFLINE / ERROR / PARTIAL | All pages |
| StatusCard | metric + label + optional action | All pages |
| PageHeader | title + subtitle + actions | All pages |
| EvidenceLink | source + timestamp + path | All pages |
| EmptyState | honest empty / loading / error | All pages |
| ActionButton | primary / secondary / danger | All pages |
| SectionTabs | tab strip | All pages |

## Theme Tokens

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#030508` | Page background |
| `--panel` | `#040a10` | Panel surfaces |
| `--panel-muted` | `#030710` | Muted panels |
| `--border` | `rgba(255,255,255,0.08)` | Borders |
| `--text-primary` | `rgba(255,255,255,0.85)` | Primary text |
| `--text-muted` | `rgba(255,255,255,0.35)` | Muted text |
| `--accent-red` | `#ef4444` | AWAKEN, danger |
| `--accent-cyan` | `#22d3ee` | System, links |
| `--accent-magenta` | `#d946ef` | Mochi, companion |
| `--accent-emerald` | `#10b981` | Success |
| `--accent-amber` | `#f59e0b` | Warning |
| `--accent-violet` | `#8b5cf6` | OMNI, governance |
| `--danger` | `#ef4444` | Errors |
| `--warning` | `#f59e0b` | Warnings |
| `--success` | `#10b981` | Active |
| `--unknown` | `#6b7280` | Unknown |

---

## Missing Features (from capability map)

| Missing | Priority | Backend Route | Notes |
|---|---|---|---|
| Deep trace inspector | MEDIUM | `/api/trace/recent` | Add to `/pipeline` |
| Sentinel routing editor | MEDIUM | `/api/providers` | Add to `/providers` |
| Skill amendment approve/reject | HIGH | `/api/skill-amendments` | Add to `/evolution` |
| Auto-research trigger button | MEDIUM | `/api/research/group` | Add to `/evolution` |
| Governor policy editor | LOW | `/api/governance/policy` | Add to `/omni` |
| ZK proof panel | LOW | `/api/proof` | Add to `/omni` |
| Upload file | LOW | `/api/upload` | Add to `/settings` |
| Playwright UI | NONE | — | Developer tool, no UI needed |
| Provider selector in chat | MEDIUM | `/api/llm-config` | Wire existing selector |
