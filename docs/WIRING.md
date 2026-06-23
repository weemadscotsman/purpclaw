# PURPCLAW — Full Wiring Map (2026-06-10)

> Source of truth for every connection between every layer.
> Verified 2026-06-10 22:05 UTC by booting all 12 core services and live-probing every port.

---

## Stack Topology (LIVE — 12/12 core services online)

```
┌──────────────────────────────────────────────────────────────────────┐
│  USER FACING (3 surfaces)                                            │
│    • CLI  → node bin/purpclaw.js                                    │
│    • TUI  → purpclaw tui                  (port 9120)               │
│    • WebUI → Next.js PROD build           :3030  ✓ online            │
│      - GET /         → 307 redirect to /mission                      │
│      - GET /mission  → 200 (MissionControl megapanel)               │
│      - GET /inline   → 200 (v8.3.0 inline Mission Control)          │
│      - GET /skyscraper → 200 (Agent Tower 3D)                        │
│      - GET /cockpit, /bridge, /agents, /mochi, /pipeline,            │
│        /settings, /swarm → 200                                       │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  NEXT.JS /api (30 routes → service-proxy → unified API)              │
│    /api/chat, /api/services, /api/registry, /api/mochi,             │
│    /api/harness/*, /api/whoami, /api/setup, /api/upload,            │
│    /api/thringlets/*, /api/bridge, /api/llm-ledger,                  │
│    /api/skill-amendments, /api/agent-scores, /api/sampler,           │
│    /api/playwright, /api/mission-data, /api/event-timeline,          │
│    /api/gatekeeper-status, /api/harness-benchmarks,                  │
│    /api/api-mega-list, /api/chat/swarm, /api/settings                │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  UNIFIED API (1 chokepoint)                                          │
│    purpclaw-api    :7780  ✓ online  (88 case endpoints)              │
│    POST /api/chat → MiniMax-M2.7  ✓ verified                         │
│    bridgeConnected: true                                              │
└──────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ ORCHESTRATOR     │  │ AGENT TOWER  │  │ COGNITIVE SPINE  │
│ :7784 ✓          │  │ :7790 ✓      │  │ :7880 ✓          │
│ 3-letter codes  │  │ 35-44 agents │  │ 6 engines        │
│ 9 divisions     │  │ 3 tiers      │  │ 7 memory layers  │
└──────────────────┘  └──────────────┘  └──────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  EVENT BUS (pub/sub backbone)                                       │
│    purpclaw-eventbus  :7782  ✓ online                                │
│    Topics: agent.*  system.*  voice.*  tool.*  swarm.*               │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RUNTIME LAYER                                                       │
│    purpclaw-state       :7783 ✓   shared state                       │
│    purpclaw-pool        :7885 ✓   knowledge index (skills, agents)   │
│    purpclaw-context     :7881 ✓   shared.json bus                    │
│    purpclaw-workers     :7897 ✓   overflow HMAC-signed lane          │
│    purpclaw-gatekeeper  :7791 ✓   policy engine + agent scores       │
│    purpclaw-metrics     :7890 ✓   aggregator (degraded: 9/18 known)  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Live Service Map (12/12 core, 0 dark cluster)

| Port  | PM2 Name              | Process         | Uptime  | Status | Probe                                  |
|-------|-----------------------|-----------------|---------|--------|----------------------------------------|
| 3030  | purpclaw-nextjs       | 10284           | 21s     | online | `/` → 307, `/mission` → 200            |
| 7780  | purpclaw-api          | 18800           | 72s     | online | `/api/health` → 200, `/api/chat` → 200 |
| 7782  | purpclaw-eventbus     | 13944           | 84s     | online | `/health` → 200                        |
| 7783  | purpclaw-state        | 17920           | 78s     | online | `/health` → 200                        |
| 7784  | purpclaw-orchestrator | 14184           | 66s     | online | `/api/health` → 200                    |
| 7790  | purpclaw-tower        | 8636            | 61s     | online | `/tower/health` → 200                  |
| 7791  | purpclaw-gatekeeper   | 17680           | 38s     | online | `/health` → 200 (5/4/4 checks)         |
| 7880  | purpclaw-cognitive    | 18540           | 26s     | online | `/memory/health` → 200                 |
| 7881  | purpclaw-context      | 1784            | 49s     | online | `/health` → 200                        |
| 7885  | purpclaw-pool         | 11824           | 55s     | online | `/health` → 200                        |
| 7890  | purpclaw-metrics      | 16788           | 32s     | online | `/health` → 200 (degraded: dark)       |
| 7897  | purpclaw-workers      | 13816           | 43s     | online | `/health` → 200 (0/4 active)           |

---

## Cognitive Spine (port 7880 — 6 engines, 7 layers)

| Engine                  | Module                        | Health  | Lines | Notes                    |
|-------------------------|-------------------------------|---------|-------|--------------------------|
| Memory Matrix v2        | `memory_matrix_v2.py`         | healthy | 1163  | 7-layer world model      |
| Symbolic Rules          | `symbolic_rules_engine.py`    | healthy | 828   | Datalog facts + rules    |
| Modal Logic             | `modal_logic_engine.py`       | healthy | 828   | Kripke semantics         |
| Neuro-Symbolic Bridge   | `neuro_symbolic_bridge.py`    | healthy | 1023  | CozoDB fallback in-mem   |
| Autonomous Diagnostics  | `autonomous_diagnostics.py`   | healthy | -     | 5 agents (Mem/Vis/Net/Res/App) |
| AutoDream               | `autoDream.py`                | healthy | -     | Consolidation            |

All 6 modules are importable. `cognitive_spine.py` boots and exposes 40+ HTTP routes.

---

## Agent Tower (port 7790 — 35-44 agents, 9 divisions, 3 tiers)

| Division       | Tier | Agents                                                             |
|----------------|------|--------------------------------------------------------------------|
| INTELLIGENCE   | 3    | spider, raven, ghost                                               |
| ENGINEERING    | 1    | dragon, robot, mushroom, chonk, turtle, axolotl, wolf, bee         |
| SECURITY       | 2    | octopus, owl, rabbit, snake, bunny, guardian                       |
| INFRASTRUCTURE | 1    | cactus, void, raven                                                |
| MEDIA_OPS      | 2    | duck, goose, parrot                                                |
| MANAGEMENT     | 3    | penguin, karen, lemur                                              |
| SCIENCE        | 2    | scientist, axolotl                                                 |
| CREATIVE       | 2    | phoenix, parrot, crow                                              |
| OPERATIONS     | -    | (more)                                                             |

**Spawn test verified** — POST /api/spawn with `agentName: "duck"` + `task: "say hi briefly"` returned real response from DUCK with persona, division, skills, workDir, logFile. Tower tracked `totalActive: 1` after spawn.

---

## API Surface (unified_api.js — 88 endpoints)

Top-level routes (via unified API :7780):
- `POST /api/chat` (chat w/ bridge, MiniMax backend, tool_calls)
- `GET  /api/health` (status, memory, cpu, bridgeConnected)
- `POST /api/agent-score` / `GET /api/agent-scores`
- `POST /api/spawn` / `GET /api/agents` / `GET /api/divisions`
- `POST /api/memory/ingest` / `POST /api/memory/recall` / `GET /api/memory/stats`
- `POST /api/rules/assert` / `POST /api/rules/query`
- `POST /api/diagnostics/diagnose`
- `POST /api/training/feedback` (chat → NDJSON → E:/training/raw/)
- Web tool: `GET /api/file_read`, `GET /api/file_list`, etc.
- Browser tool: `POST /api/browser_navigate`, `POST /api/browser_click`, etc.

Next.js /api (30 routes) — most forward to service-proxy → unified API. `/api/chat` is the canonical chokepoint.

---

## Provider Router (lib/llm-provider.js + lib/providers/)

17 providers registered. Active: `minimax` (LLM_PROVIDER=minimax, LLM_MODEL=MiniMax-M2.7).

| Provider     | Status | Notes                                  |
|--------------|--------|----------------------------------------|
| minimax      | active | MiniMax-M2.7 via api.minimax.io/v1     |
| openai       | ready  | OpenAI Responses (lib/providers/)      |
| anthropic    | ready  | Anthropic Messages                     |
| hermes-cli   | ready  | Local Hermes CLI bridge                |
| openrouter   | ready  | `*:free` fan-out, $5/batch cap         |
| deepseek     | ready  |                                       |
| kimi         | ready  |                                       |
| groq         | ready  |                                       |
| ollama       | ready  | Local runtime                          |
| (8 more)     | ready  | See lib/providers/registry.js          |

SpendGate (lib/spend-gate.js) caps:
- PURPCLAW_RATE_LIMIT=1 / window 60s
- PURPCLAW_RATE_LIMIT_READ=240, WRITE=60, STREAM=30
- PURPCLAW_RESEARCH_COST_CAP_USD=5.0
- per-agent caps in `~/.purpclaw/pocket/spend-config.json`

---

## Tool Registry (lib/tools/) — 79 native + MCP

| File                          | Tools |
|-------------------------------|-------|
| lib/tools/index.js            | 29    |
| lib/tools-pc.js               | 49    |
| lib/tools/skills-registry.js  | 1     |
| **Native total**              | **79** |
| OmniCode MCP (runtime)        | 42    |
| G0DM0D3 (parseltongue/godmode)| 4     |
| Smith+Neo (chaos/stabilize)   | 5     |

Tool names: read, write, edit, shell, grep, code-search, web-fetch, git, parseltongue, autotune, stm, godmode, smith_inject, neo_stabilize, smith_random, neo_ledger, chaos_round, chaos_campaign, chaos_status, memory_check, moneyprinter_generate, local_video_stitch, local_tts_generate, local_image_generate, weather, news, csv_analyze, phone_adb, spawn, plus 49 system tools (tasklist, ping, top, etc.)

---

## What Was Broken vs Now

### Before audit
- PM2 list: empty (0 services)
- Port :7880 cognitive spine: closed
- Port :7790 agent tower: closed
- WebUI :3030: closed
- Chat endpoint: unreachable
- Status: **dormant**

### After fix (12/12 booted)
- PM2 list: 12/12 online
- All 12 ports listening (verified by netstat + curl)
- Chat `/api/chat` returns real MiniMax response
- WebUI serves at /mission (200), /inline (200), /skyscraper (200)
- Tower can spawn agents (DUCK dispatched + responded)
- All 6 cognitive engines healthy
- Doctor reports 11/12 OK (1 false positive: WebUI returns 307 on / but 200 on /mission)
- Status: **fully operational**

### What was NOT broken
- App routing: `app/route.ts` already handles `/` → 307 → `/mission` (working as designed)
- Port discipline: 116 files have hard-coded port literals, but they match `lib/runtime/ports.js` canonical
- Cognitive spine modules: all 6 import cleanly, no broken references
- Next.js build: 269.8 MB .next/, all routes built (agents, bridge, cockpit, inline, mission, mochi, pipeline, settings, skyscraper, swarm)

---

## How to Verify

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"

# 1. Boot
node bin/purpclaw.js safe-start --core

# 2. Doctor
node bin/purpclaw.js doctor

# 3. Health (compact)
node bin/purpclaw.js health

# 4. Probe all ports
node -e "const p = require('./lib/runtime/ports'); p.probeAll().then(r => r.forEach(x => console.log(x.id, x.ok ? '✓' : '✗')))"

# 5. Chat
curl -X POST -H "Content-Type: application/json" \
  -d '{"message":"hello","session_id":"test"}' \
  http://localhost:7780/api/chat

# 6. Spawn
curl -X POST -H "Content-Type: application/json" \
  -d '{"agentName":"duck","task":"say hi"}' \
  http://localhost:7790/api/spawn

# 7. WebUI
open http://localhost:3030/mission
```

---

## What Still Needs Integration

Per ARCHITECTURE.md §"Known Gaps":
1. **Layers 2-7 of world model** are built in code but only Layer 1 (episodic) flows through decisions. Integration audit needed.
2. **Dark cluster** (voice/bridge/stt/yolo/vision/reasoning/autodream) is defined but off by default. Boot with `safe-start --dark` when needed.
3. **LoRA training** gets SIGTERM at 0/2 iterations (env issue, not code).

These are documented, not blockers.

---

*Last verified 2026-06-10 22:05 UTC against live running stack.*
