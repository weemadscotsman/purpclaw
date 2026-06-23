# PURPCLAW ARCHITECTURE OVERVIEW v8.1.1

## EXECUTIVE SUMMARY

PURPCLAW is an autonomous voice-controlled AI swarm that runs on your Windows desktop. It connects Xiaozhi AI voice ball → cloud → PC to give you a 26-agent engineering swarm you can control with your voice. The system is fully unified with central orchestration, shared state, and event-driven communication.

**Current Version: 8.1.1** - Bugfix Release

---

## SERVICE ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PURPCLAW v8.1 FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────────┐
  │ XIAOZHI  │───▶│  BRIDGE   │───▶│  BRIDGE   │───▶│   VOICE      │
  │  BALL    │    │  7779     │    │  (cloud)  │    │  COORDINATOR │
  └──────────┘    └───────────┘    └───────────┘    │    7781      │
                                                    └───────┬──────┘
                                                            │
                                              ┌─────────────┴──────────────┐
                                              │                          │
                                              ▼                          ▼
                                        ┌───────────┐            ┌───────────┐
                                        │EVENTBUS   │            │ORCHESTRATOR│
                                        │   7782    │◄──────────│    7784    │
                                        └─────┬─────┘            └─────┬─────┘
                                              │                        │
                    ┌─────────────────────────┼────────────────────────┤
                    │                         │                        │
                    ▼                         ▼                        ▼
            ┌───────────────┐         ┌───────────────┐       ┌───────────────┐
            │ UNIFIED STATE │         │  AGENT TOWER  │       │  UNIFIED API  │
            │     7783      │         │     7790      │       │     7780      │
            └───────┬───────┘         └───────┬───────┘       └───────┬───────┘
                    │                         │                        │
                    │         ┌───────────────┘                        │
                    │         │                                        │
                    │         ▼                                        ▼
                    │   ┌───────────┐                           ┌───────────┐
                    └──►│  SWARM    │◄──────────────────────────│   26      │
                        │  JOBS     │                           │  AGENTS   │
                        └───────────┘                           └───────────┘

                                    ┌───────────┐
                                    │  NEXT.JS  │
                                    │  DASHBOARD│
                                    │   3000    │
                                    └───────────┘
```

## 7 CORE SERVICES

### 1. EVENTBUS (Port 7782)
**Role:** Central nervous system - pub/sub for all services

```
Topics:
  - agent.*     → Agent spawn, complete, fail, progress
  - tool.*      → Tool calls, results, errors
  - system.*    → Startup, shutdown, errors
  - voice.*     → Voice commands, responses
  - state.*     → State changes (create, update, delete)
  - orchestrator.* → Workflow events
```

### 2. UNIFIED STATE (Port 7783)
**Role:** Single source of truth for all system state

```
Namespaces:
  - agents     → { [agentId]: { status, task, division, startTime } }
  - teams      → { [teamId]: { members, leader, status, task } }
  - tools      → { recent: [...], stats: {} }
  - voice      → { lastCommand, lastResponse, session }
  - swarm      → { activeTasks: [], queue: [] }
  - system     → { uptime, memory, services }
  - orchestrator → { workflows: {}, activeWorkflows }

API Endpoints:
  GET  /state              → Full state
  GET  /state/:namespace   → Namespace data
  PUT  /state/:namespace/:key → Update key
  GET  /state/subscribe    → SSE stream (all changes)
  GET  /state/subscribe/:namespace → SSE stream (namespace only)
```

### 3. ORCHESTRATOR (Port 7784) - NEW in v8.1
**Role:** Central command flow - voice → parse → route → execute → respond

```
Features:
  ✓ Priority Queue (urgent bypasses normal)
  ✓ Self-Healing (3x retry with exponential backoff)
  ✓ Agent Pool with load balancing
  ✓ Workflow Pipeline (parse → route → validate → execute → respond)
  ✓ Swarm Memory (context persistence across commands)
  ✓ Real-time SSE streaming responses

API Endpoints:
  POST /api/orchestrate  → Execute command (sync)
  POST /api/enqueue      → Queue command (async)
  GET  /api/workflows    → Active workflows
  GET  /api/status       → System metrics
  GET  /api/queue       → Queue depth
  GET  /api/memory      → Swarm memory context
```

### 4. VOICE COORDINATOR (Port 7781)
**Role:** Voice command parsing and intent routing

```
Input: Natural language voice commands
Output: Routes to orchestrator via EventBus

INTENT_PATTERNS:
  build/create/make → BUILD team
  design            → DESIGN team
  fix/debug         → Single agent
  research          → RESEARCH team
  analyze           → ANALYZE team
  test              → TEST team
  deploy            → DEPLOY team
```

### 5. AGENT TOWER (Port 7790)
**Role:** Agent management hub - spawn, track, coordinate

```
Features:
  - 26 specialized agents across 9 divisions
  - Team spawning with leader + members
  - SSE broadcasting to web dashboard
  - Agent registry with status tracking

Agent Divisions:
  Engineering: dragon, owl, octopus, axolotl, bee, rabbit, robot, cactus, void, mushroom, chonk, turtle
  Design: mushroom, duck, penguin
  Media Ops: duck, goose, parrot
  Security: ghost, spider, owl, rabbit, guardian, snake
  Infrastructure: void, cactus, raven
  Management: penguin, wolf, karen
  Operations: gorilla, shark
```

### 6. UNIFIED API (Port 7780)
**Role:** 66 MCP tools execution + WebSocket to Xiaozhi

```
Tools organized by category:
  Vision (5): screen_capture, screen_ocr, screen_find_object, screen_find_template, screen_info
  Webcam (3): webcam_look, webcam_detect, webcam_read
  Mouse/Keyboard (4): mouse_click, mouse_scroll, keyboard_type, find_and_click
  Window (3): window_list, window_focus, window_close
  File System (8): file_read, file_write, file_list, file_search, file_copy, file_move, file_delete, dir_create
  Browser (9): browser_open, browser_click, browser_type, browser_scroll, browser_get_content, browser_screenshot, browser_navigate, browser_tabs, browser_close_tab
  Audio (1): volume_control
  Shell (3): execute_command, process_list, process_kill
  Memory (2): memory, task_schedule
  Build (4): purpclaw_start, purpclaw_stop, purpclaw_status, purpclaw_logs

Also includes: Digital Shaman creativity layer, KimiClient for subagent spawning
```

### 7. VOICE BRIDGE (Port 7779)
**Role:** WebSocket bridge to Xiaozhi cloud

---

## ORCHESTRATION FLOW

### Voice Command Flow
```
1. "Build me a REST API" (voice)
   │
   ▼
2. Voice Coordinator (7781) parses intent
   │
   ▼
3. Publishes to EventBus: voice.command { command: "build me a rest api" }
   │
   ├──► Orchestrator (7784) receives, creates workflow wf-xxx
   │    │
   │    ▼
   │    Intent parsed: build + "REST API" + useTeam=true
   │    │
   │    ▼
   │    Route: spawn BUILD team (wolf + robot + bee)
   │    │
   │    ▼
   │    Update State: teams.build-team-{id} = { leader: wolf, members: [robot, bee] }
   │    │
   │    ▼
   │    Publish to EventBus: orchestrator.workflow.started { teamId: ..., task: "build REST API" }
   │    │
   │    ▼
   │    Publish to EventBus: agent.spawned { name: wolf, task: "build REST API" }
   │
   ▼
4. Agent Tower spawns agents with personality files
   │
   ▼
5. State Store updated: agents.wolf-xxx = { status: running, task: "build REST API" }
   │
   ▼
6. SSE broadcast to web dashboard: "🐺 Wolf leading 🐝🐝 on build REST API"
   │
   ▼
7. Orchestrator publishes: orchestrator.workflow.completed { result: "Team deployed" }
```

### State Change Flow
```
Any service calls setState("agents", "wolf-xxx", { status: "completed" })
   │
   ▼
1. State updated in memory
   │
   ▼
2. addChange() logs to _changeLog
   │
   ▼
3. notifySubscribers() pushes SSE to /state/subscribe and /state/subscribe/agents
   │
   ▼
4. publishStateToEventBus() publishes to EventBus: state.update { namespace: agents, key: wolf-xxx }
   │
   ▼
5. All subscribed services stay in sync
```

---

## AGENT SYSTEM

### 26 AGENTS BY DIVISION

**Engineering Division**
| Agent | Emoji | Role | Personality |
|-------|-------|------|-------------|
| DRAGON | 🐉 | Chief Architect | Speaks with ROYAL AUTHORITY |
| OWL | 🦉 | Security Auditor | Wise but condescending |
| OCTOPUS | 🐙 | Parallel Thinker | Handles 8 concerns simultaneously |
| AXOLOTL | 🦎 | Refactoring Optimist | Sees code regeneration potential |
| BEE | 🐝 | Pollination Specialist | Cross-pollinates ideas |
| RABBIT | 🐰 | Edge Case Specialist | Catastrophizes, produces defensive code |
| ROBOT | 🤖 | Syntax Enforcer | Deadpan, strictly factual |
| CACTUS | 🌵 | Prickly Debugger | Brief but effective |
| VOID | 🕳️ | Eldritch Philosopher | Philosophizes about null |
| MUSHROOM | 🍄 | Organic Designer | Creates mushroom-themed UI |
| CHONK | 🐈 | Simplification Expert | Streamlines complexity |
| TURTLE | 🐢 | Quality Engineer | Thorough QA |

**Security Division**
| Agent | Emoji | Role |
|-------|-------|------|
| GHOST | 👻 | Quality Guardian |
| SPIDER | 🕷️ | Intel Specialist |
| SNAKE | 🐍 | Primary Access |
| GUARDIAN | 🛡️ | Real-time Monitor |

**Management Division**
| Agent | Emoji | Role |
|-------|-------|------|
| WOLF | 🐺 | Pack Leader |
| PENGUIN | 🐧 | Project Coordinator |
| KAREN | 💅 | Quality Control |

**Operations Division**
| Agent | Emoji | Role |
|-------|-------|------|
| GORILLA | 🦍 | Heavy Lifter |
| SHARK | 🦈 | Deploy Specialist |

**Media Ops Division**
| Agent | Emoji | Role |
|-------|-------|------|
| DUCK | 🦆 | Research Accelerant |
| GOOSE | 🪿 | Chaos Catalyst |
| PARROT | 🦜 | Content Specialist |

**Infrastructure Division**
| Agent | Emoji | Role |
|-------|-------|------|
| RAVEN | 🐦‍⬛ | Signals Analyst |
| CROW | 🐦 | Data Analyst |

**Creative Division**
| Agent | Emoji | Role |
|-------|-------|------|
| PHOENIX | 🔥 | Creative Specialist |
| PANDA | 🐼 | Content Creator |

### AGENT STRUCTURE
Each agent has personality files in `/skills/{agentName}/`:
- `AGENT.md` - Persona definition
- `SKILL.md` - Capabilities and protocols
- `GOALS.md` - Mission objectives
- `PROTOCOLS.md` - Deployment rules

### TEAM TEMPLATES
```
build:     wolf (leader) + robot, bee
design:    wolf (leader) + mushroom, penguin, duck
research:  spider (leader) + raven, duck, crow
audit:     owl (leader) + ghost, snake, rabbit
fix:       cactus (leader) + robot, rabbit
analyze:   turtle (leader) + octopus, hawk
deploy:    gorilla (leader) + shark, chonk
optimize:  chonk (leader) + fox, cactus
refactor:  axolotl (leader) + mushroom, robot, void
test:      rabbit (leader) + turtle, robot
security:  spider (leader) + ghost, guardian, snake
```

---

## BOOT SEQUENCE

```
1. EventBus (7782) - Core pub/sub, starts first
2. State Store (7783) - Shared state
3. Orchestrator (7784) - Command flow orchestration
4. Unified API (7780) - 66 MCP tools
5. Voice Coordinator (7781) - Intent parsing
6. Voice Bridge (7779) - WebSocket to cloud
7. Agent Tower (7790) - Agent management
8. Next.js Dashboard (3000) - Web UI
```

---

## SWARM MEMORY

The Orchestrator maintains a persistent context:

```javascript
SWARM_MEMORY = {
  session: { id, startTime, totalTasks, completedTasks, failedTasks },
  context: {
    recentCommands: [...],      // Last 50 commands
    activeAgents: [...],        // Currently running
    completedWork: [...],       // Recent completions
    patternLibrary: [...]        // Learned patterns
  },
  metrics: {
    avgResponseTime: 0,
    agentUtilization: {...},
    byIntent: {...}
  }
}
```

This allows the swarm to maintain context across commands and learn from patterns.

---

## UPGRADE PATH

**v8.0**: Original build with separate services
**v8.1**: Unified orchestration with:
- Central orchestrator with priority queue
- Self-healing workflows
- Agent pool with load balancing
- Swarm memory persistence
- Real-time SSE streaming
- State change notifications via EventBus

---

## CAPABILITIES

- Voice control of entire PC
- 26 specialized AI agents
- 66 MCP tools for system control
- Real-time web dashboard
- Autonomous code building/refactoring
- Security auditing
- Research and analysis
- Multi-agent team coordination

---

Generated by PURPCLAW Orchestrator v2.0

---

## CHANGELOG

### v8.1.1 (2026-04-12) - Bugfix Release

**CRASH FIXES:**
- `unified_eventbus.js:144` - Fixed undefined `eventCount`, `subscriberCount`, `clientCount` in health endpoint → now correctly references `state.events.length`, `state.subscriptions.size`, `state.clientCount`
- `unified_state.js:198` - Fixed undefined `used`, `total`, `agentCount`, `teamCount` in health endpoint → now correctly uses `process.memoryUsage()` and `Object.keys()`
- `unified_state.js:63` - Fixed changeLog trim from 500 to 1000 entries

**CONFIGURATION FIXES:**
- `.env` - Updated XIAOZHI_MCP_URL with fresh token (iat: 1776010874, exp: 1807568474), added XIAOZHI_WS_URL for compatibility
- `agent_tower.js:306` - Fixed forwardSpawnToApi path from `/api/tower-spawn` to `/api/tower/spawn` (was mismatch with UnifiedApi route at line 2269)

**ARCHITECTURE:**
- 8 services: EventBus(7782), StateStore(7783), Orchestrator(7784), UnifiedApi(7780), AgentTower(7790), VoiceCoordinator(7781), VoiceBridge(7779), Next.js(3000)
- 26 agents across 9 divisions
- 65+ MCP tools