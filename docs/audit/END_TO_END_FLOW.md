# PURPCLAW End-to-End Flow
## Boot → Runtime → Shutdown — All Layers, All Connections, All Breakages

---

## 1. SERVICE BOOT SEQUENCE

### 1.1 Startup Order (as managed by ecosystem.config.js)

```
PM2 Start Order:
  Tier 1 ( foundational):
    unified_eventbus.js      (port 7782) — EventBus pub/sub, all services subscribe here
    unified_api.js           (port 7780) — Main HTTP/WebSocket/API entry point
    orchestrator.js          (port 7784) — Intent routing + workflow pipeline
    state.js                 (port 7783) — Key/value state store
    companion-chorus/bridge.js (port 7792) — Companion personality layer

  Tier 2 (agent execution):
    agent_tower.js           (port 7790) — Agent spawning via OpenClaude/Kimi CLI
    gatekeeper.js            (port 7791) — Pre-build security/adversarial checks

  Tier 3 (specialized):
    voice_coordinator.js     (port 7781) — Voice command preprocessing
    memory_matrix_v2.py      (port 7884) — Neuro-symbolic memory brain
    symbolic_rules_engine.py (port 7787) — Logic/constraint engine
    vision_monitor.py        (port 7881) — Screen/context monitoring
    metrics_collector.py    (port 7890) — System metrics
    autonomous_diagnostics.py (port 7785) — Self-healing diagnostics

  Tier 4 (UI):
    Next.js app              (port 3000) — React frontend

  Ball connection:
    Xiaozhi ball             — WebSocket to api.xiaozhi.me (xiaozhiUrl)
    Kokoro TTS               — C:\Users\Admin\.openclaw\kokoro_send.bat
```

### 1.2 Service Init Sequence (what each service does at startup)

#### unified_eventbus.js (7782) — FIRST TO START
```
- Creates HTTP server on port 7782
- In-memory topic → [callbacks] map
- Subscribes to EventBus itself (self-health check)
- SSE endpoint: GET /events/:topic — clients subscribe for real-time events
- POST /publish — receives events from any service, fans out to subscribers
- No database — purely in-memory pub/sub
- Status: HEALTHY ✓
```

#### unified_api.js (7780) — SECOND (depends on EventBus)
```
- HTTP server on port 7780
- Connects TO EventBus (7782) via HTTP long-poll or SSE
- Loads 66 MCP tools from tools/ directory
- Connects WebSocket to Xiaozhi cloud (XIAOZHI_WS_URL)
- If XIAOZHI_MCP_URL set → also connects to MCP endpoint for ball
- Registers SSE endpoint GET /api/sse — streams events to clients
- Routes: /api/chat, /api/spawn, /api/status, /api/orchestrate (→ orchestrator:7784)
- Ball messages come in via xiaozhi cloud WebSocket → connectWS()
- connectWS() also sends keepalive pings to xiaozhi
- Status: HEALTHY ✓ (token refreshed 2026-04-18)
```

#### orchestrator.js (7784) — THIRD (depends on EventBus + Tower)
```
- HTTP server on port 7784
- Subscribes to EventBus (7782) topics: agent.*, orchestrator.*, tool.*
- Uses PriorityQueue for workflow ordering
- Loads agent_score.js if available (smart routing)
- Loads ethics_hooks.js if available (pre-flight checks)
- AGENT_BY_INTENT map: routes intents → agent candidates (35+ entries)
- TEAM_TEMPLATES: static team definitions for coordinated tasks
- INTENT_PATTERNS: regex → intent mapping (20+ patterns)
- Circuit breakers: per-agent (5 failures → OPEN, 2 successes → CLOSED)
- Self-healer: 3 retries with exponential backoff
- SWARM_MEMORY: session-scoped in-memory state for swarm coordination
- Subscribes to EventBus agent.* events to track completion/failure
- Status: HEALTHY ✓ (SWARM intent pattern now added)
```

#### state.js (7783) — FOURTH
```
- HTTP server on port 7783
- Key/value store: GET/PUT /state/:namespace/:key
- No persistence (in-memory) — lost on restart
- Used by: orchestrator (agent state), agent_tower (team state)
- Status: HEALTHY ✓
```

#### companion-chorus/bridge.js (7792) — FIFTH (depends on EventBus)
```
- Connects TO EventBus (7782)
- Loads companions.json at startup (personality definitions)
- Registers SSE endpoint for streaming companion responses
- Subscribes to EventBus agent.* events
- Responds to agent.* with companion personality commentary
- KAIROS session continuity: NOT IMPLEMENTED — state lost on EventBus reconnect
- Status: KNOWN ISSUE — context only loaded at startup
```

#### agent_tower.js (7790) — SIXTH (depends on EventBus + API)
```
- Connects TO EventBus (7782) for agent.* event publishing
- Connects TO unified_api (7780) for SSE broadcast
- Connects TO state (7783) for team/agent state
- Connects WebSocket to xiaozhi ball (if XIAOZHI_WS_URL)
- Loads agent registry from companions.json
- Spawn methods available: spawnAgent(), spawnTeam()
- sendToAgent() — writes continuation file to agent workDir + EventBus notification
- interAgentMessage() — broadcast only (SSE), no point-to-point delivery
- Circuit breaker: per-agent, 5 failures trips
- SSE endpoint: GET /tower/events — streams agent events
- HTTP API: /api/spawn, /api/kill, /api/status, /api/team/spawn
- OpenClaude CLI: uses --settings with MiniMax API config (OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL)
- Status: HEALTHY ✓ (sendToAgent() added)
```

#### gatekeeper.js (7791) — SEVENTH
```
- Standalone HTTP server on port 7791
- Pre-build security checks via PatternMatcher (sql_injection, command_injection, etc.)
- No command execution-based verification — STATIC ANALYSIS ONLY
- Adversarial verification: NOT IMPLEMENTED
- Status: KNOWN GAP — no post-build adversarial testing
```

#### voice_coordinator.js (7781) — EIGHTH
```
- Connects to orchestrator (7784) via HTTP POST /orchestrate
- Routes voice commands to orchestrator for intent parsing
- Status: HEALTHY ✓ (stale comment fixed previously)
```

#### memory_matrix_v2.py (7884) — NINTH
```
- Flask/JSON server on port 7884
- Memory storage and retrieval
- Lock file pattern for consolidation: NOT IMPLEMENTED
- 24hr idle + 5 session gate: NOT IMPLEMENTED
- 4-phase consolidation (Orient→Gather→Consolidate→Prune): NOT IMPLEMENTED
- Status: KNOWN GAP — memory degrades, no automatic consolidation
```

#### symbolic_rules_engine.py (7787) — TENTH
```
- HTTP server on port 7787
- X != Y inequality constraint at bootstrap — requires correct fact order
- If facts asserted wrong order → crash on startup
- Status: KNOWN ISSUE (documented, edge case)
```

---

## 2. RUNTIME FLOW — HOW A COMMAND TRAVERSES THE SYSTEM

### 2.1 Voice Command (Ball → Orchestrator → Tower → Agent)

```
[BALL] User speaks to ball
  ↓ Voice captured by xiaozhi cloud
[XIAOZHI_CLOUD] → WebSocket → unified_api.js connectWS() [port 7780]
  ↓ Receives: { type: 'voice_text', text: "build me a login form" }
[UNIFIED_API] broadcast({ type: 'ball_voice_command', command })
  ↓ Previously: directly spawned agents via keyword matching ✗ BYPASSED ORCHESTRATOR
  ↓ NOW (2026-04-18): routes to orchestrator:7784/api/orchestrate ✓
[ORCHESTRATOR] parseCommand() → { intent: 'build', useTeam: true, target: 'a login form' }
  ↓ Intent matches: /build\s+(.+)/i → intent='build', useTeam=true
  ↓ Circuit breaker: checks wolf, robot, bee availability
  ↓ Agent score: if agent_score.js loaded, picks best candidate
  ↓ ethics_hooks.preflightCheck() — ethics gate
  ↓ orchestrator → towerRequest('POST', '/api/spawn', { agentName, task })
[AGENT_TOWER] spawnAgent() → spawns OpenClaude CLI child process
  ↓ Child: node openclaude_script -p "task prompt" --name purpclaw-wolf --add-dir ...
  ↓ Agent process runs detached (stdio: 'ignore', unref())
  ↓ stdout/stderr → workDir/agent_<id>_out.log (polled)
[AGENT] OpenClaude CLI executes task using MiniMax API
  ↓ (OPENAI_BASE_URL=https://api.minimax.io/v1, OPENAI_API_KEY=<key>, OPENAI_MODEL=MiniMax-M2.7)
  ↓ Writes output to workDir
[AGENT_TOWER] Polls output log, broadcasts progress via SSE
  ↓ Publishes EventBus agent.completed or agent.failed
[ORCHESTRATOR] Receives agent.* event via EventBus subscription
  ↓ Updates workflow status, streams result to SSE clients
[UNIFIED_API] Forwards to xiaozhi ball via WebSocket
[BALL] Speaks result to user
```

### 2.2 Chat Message (UI → Orchestrator → Tower → Agent)

```
[BROWSER] User types in React UI (port 3000)
  ↓ POST /api/chat { message: "fix the login bug" }
[UNIFIED_API] Receives → previously: direct AgentTower.spawnAgent keyword matching ✗
  ↓ NOW: routes to orchestrator:7784/api/orchestrate ✓
[ORCHESTRATOR] parseCommand() → intent='fix', useTeam=false, target='the login bug'
  ↓ circuit breaker checks cactus, rabbit availability
  ↓ spawnAgent('fix', 'the login bug')
  ↓ towerRequest → agent_tower:7790
[AGENT_TOWER] spawns agent (cactus or rabbit)
  ↓ Same flow as voice command from here
```

### 2.3 Explicit Agent Spawn (Ball or API)

```
[BALL/API] Command: "spawn wolf" or "agent dragon"
  ↓ Matches: /spawn (\w+)|agent (\w+)|launch (\w+)/i
[UNIFIED_API] DIRECT to AgentTower.spawnAgent() — explicit commands BYPASS orchestrator
  ↓ For speed — explicit agent requests don't need intent parsing
[AGENT_TOWER] spawnAgent(agentName, task)
  ↓ No orchestrator routing needed
```

### 2.4 Swarm Command (Coordinator Pattern)

```
[BALL/API] Command: "swarm build a feature"
  ↓ Matches: /swarm\s+(.+)/i (NEW 2026-04-18)
[ORCHESTRATOR] parseCommand() → intent='swarm', useTeam=false, target='build a feature'
  ↓ Case 'swarm': spawnAgent('swarm', target)
  ↓ AGENT_BY_INTENT.swarm = ['wolf', 'spider', 'snake']
  ↓ Wolf is coordinator — spider + snake are workers
  ↓ Wolf spawns via OpenClaude CLI with swarm task context
  ↓ Wolf can continue workers via agent_tower.sendToAgent(workerId, continuationMessage)
  ↓ Continuation writes to agent's workDir/continuation_<timestamp>.txt
  ↓ EventBus agent.continuation event published for coordinator tracking
```

---

## 3. WHAT GETS TURNED ON AND OFF AT EACH LAYER

### EventBus (7782)
```
ON:  Starts in-memory topic map. All services subscribe on boot.
OFF: No shutdown — PM2 keeps it running.
CLEAR: topic map is in-memory only. Cleared on restart (no persistence).
RECORD: Events flow through but EventBus doesn't record — it's a relay.
```

### Orchestrator (7784)
```
ON:  PriorityQueue empty. SWARM_MEMORY session starts (swarm-<timestamp>).
     EventBus subscriptions registered for agent.*, orchestrator.*, tool.* topics.
OFF: activeWorkflows map cleared (in-memory).
CLEAR: SWARM_MEMORY.context = { recentCommands:[], activeAgents:[], completedWork:[] }
RECORD: SWARM_MEMORY.metrics tracks agent utilization, queue depth, tool usage, by-intent counts.
     Completed workflows stored in completedWorkflows map (last 100).
```

### AgentTower (7790)
```
ON:  Registry loaded (35+ agents from companions.json).
     Ball WebSocket connected.
     SSE clients map initialized.
OFF: activeAgents map cleared.
     Ball WebSocket closed.
     All child agent processes — orphaned (detached, unref'd).
CLEAR: teams map cleared. agent pool cleared.
RECORD: Agent spawn/kill/completion tracked in activeAgents map.
     Output logs written to workDir/agent_<id>_out.log
```

### UnifiedAPI (7780)
```
ON:  MCP tools loaded (66 tools). Xiaozhi cloud WebSocket connected.
     SSE clients map initialized.
OFF: SSE clients disconnected.
     Xiaozhi WebSocket closed.
     MCP tools unloaded.
CLEAR: SSE clients map cleared.
RECORD: MCP tool usage not explicitly tracked.
```

### CompanionChorus Bridge (7792)
```
ON:  companions.json loaded. EventBus subscription registered.
     activeAgents = [], recentEvents = [].
OFF: EventBus subscription closed.
CLEAR: activeAgents and recentEvents cleared on EventBus disconnect.
     KAIROS session continuity: NOT IMPLEMENTED — no reload on reconnect.
RECORD: Companion reactions to agent.* events tracked in recentEvents.
```

### State (7783)
```
ON:  Empty key/value store initialized.
OFF: All state lost (no persistence).
CLEAR: Entire store cleared on restart.
RECORD: State updates from orchestrator (agent state, team state).
```

---

## 4. INTEGRATION MAP — WHAT CALLS WHAT

```
BROWSER (3000)
  ├──→ unified_api (7780)    HTTP REST + WebSocket
  │       ├──→ orchestrator (7784)   /api/orchestrate, /api/enqueue
  │       ├──→ agent_tower (7790)   /tower/events (SSE), /api/spawn, /api/kill
  │       ├──→ xiaozhi cloud        WebSocket (ball commands)
  │       ├──→ eventbus (7782)      HTTP publish
  │       └──→ state (7783)          HTTP PUT/GET
  │
XIAOZHI BALL
  └──→ xiaozhi cloud WebSocket
          └──→ unified_api (7780)   connectWS()
                  └──→ orchestrator (7784)   /api/orchestrate

ORCHESTRATOR (7784)
  ├──→ eventbus (7782)         HTTP publish (agent.*, orchestrator.*)
  ├──→ agent_tower (7790)      HTTP /api/spawn, /api/team/spawn, /api/kill
  ├──→ state (7783)            HTTP PUT/GET
  ├──→ ethics_hooks.js         require() — pre-flight ethics checks
  ├──→ agent_score.js          require() — smart agent routing
  └──→ locked_interfaces.js    require() — tool access control

AGENT_TOWER (7780)
  ├──→ eventbus (7782)         HTTP publish (agent.*)
  ├──→ unified_api (7780)      HTTP broadcast (SSE)
  ├──→ state (7783)            HTTP PUT/GET
  ├──→ xiaozhi ball (WS)       Ball WebSocket
  └──→ OpenClaude CLI          child_process spawn

VOICE_COORDINATOR (7781)
  └──→ orchestrator (7784)     HTTP POST /orchestrate

COMPANION-CHORUS BRIDGE (7792)
  ├──→ eventbus (7782)         HTTP subscribe (agent.*)
  └──→ companion personalities   In-memory (companions.json)

GATEKEEPER (7791)
  └──→ Called by agent_tower pre-spawn   (no persistent connection)

MEMORY_MATRIX (7884)
  └──→ Called by agents via OpenClaude CLI (no persistent connection)
```

---

## 5. MISSING INTEGRATIONS

### M1 — Orchestrator Bypass (FIXED 2026-04-18)
```
Problem:  Ball voice + chat messages went DIRECT to agent_tower.spawnAgent,
          bypassing orchestrator entirely. AGENT_BY_INTENT and production loops
          were dead code.
Fix:      unified_api.js now proxies voice/chat → orchestrator:7784/api/orchestrate
Status:   FIXED ✓
```

### M2 — SWARM Intent Handler (FIXED 2026-04-18)
```
Problem:  No pattern for "swarm <task>" in INTENT_PATTERNS.
          AGENT_BY_INTENT.swarm = ['wolf', 'spider', 'snake'] existed but was unreachable.
Fix:      Added { pattern: /swarm\s+(.+)/i, intent: 'swarm', useTeam: false }
          Added case 'swarm' handler in executeWorkflowSteps
Status:   FIXED ✓
```

### M3 — sendToAgent() Missing (FIXED 2026-04-18)
```
Problem:  agent_tower.js had interAgentMessage() (broadcast-only) but no
          point-to-point continuation for specific running workers.
          Coordinator pattern impossible without this.
Fix:      Added sendToAgent(agentId, continuationMessage):
          - Writes continuation file to agent's workDir
          - Publishes EventBus agent.continuation event
          - Returns { success, agentId, continuationFile }
Status:   FIXED ✓
```

### M4 — KAIROS Session Continuity (FIXED 2026-04-20)
```
Problem:  companion-chorus/bridge.js only loads companions.json at startup.
          On EventBus disconnect/reconnect, activeAgents + recentEvents cleared.
          No recovery of companion state.
Fix:      Added kairosSession state object (wasActive, disconnectCount, persistedCompanions).
          On each agent.* event: snapshot companions array.
          On EventBus reconnect: restore companions from persistedCompanions before loadContext().
          Companion state (def, bones, messages, lastSpoke) preserved across disconnects.
Status:   FIXED ✓
```

### M5 — AutoDream Memory Consolidation (FIXED 2026-04-20)
```
Problem:  memory_matrix_v2.py stores and retrieves but never consolidates.
          No 24hr idle + 5 session gate.
          No lock file pattern.
          No 4-phase (Orient→Gather→Consolidate→Prune).
Fix:      Added _autodream_check() with lock file at /tmp/memory_matrix_v2_lock.
          Gate: 24hr idle AND 5+ sessions since last consolidation.
          State in /tmp/memory_v2_autodream_state.json (last_consolidation, sessions_since).
          _run_consolidation_subagent() forks Python subprocess for 4-phase consolidation.
          Checked every 5 minutes in _start_background worker.
          Session count increments on get_active_context() non-empty calls.
Status:   FIXED ✓
```

### M6 — Adversarial Verification (FIXED 2026-04-20)
```
Problem:  gatekeeper.js does STATIC PATTERN MATCHING only.
          No command execution, no boundary probing, no idempotency checks.
          Claude Code's verificationAgent does actual adversarial testing.
Fix:      Added verificationAgent(buildPath) async function with:
          - 8 boundary tests: empty, max length, shell chars, unicode bomb,
            SQL injection, path traversal, newlines, null bytes
          - 3 orphan checks: unclosed_stream, missing_process_exit, unref_child_no_exit
          - POST /api/verify-build endpoint in gatekeeper HTTP server
Status:   FIXED ✓
```

### M7 — Symbolic Rules Engine Bootstrap (NOT FIXED)
```
Problem:  X != Y inequality constraint requires correct fact assertion order.
          If facts asserted wrong order at startup → crash.
Fix:      Add bootstrap sequence that ensures facts are asserted in correct order.
          Or add a isInitialized() guard that re-asserts if needed.
Status:   OPEN — Low priority (documented edge case)
```

### M8 — EventBus Single Point of Failure (NOT FIXED)
```
Problem:  EventBus (7782) has no secondary fallback.
          If it goes down, all services lose real-time coordination.
Fix:      Add secondary EventBus instance on alternate port.
          Services maintain subscription to both, merge events.
Status:   OPEN — Medium priority (noted in CLAUDE.md Open Issues)
```

### M9 — Xiaozhi Token Expiry (FIXED 2026-04-18)
```
Problem:  XIAOZHI_MCP_URL token expired (iat: 1776163700).
          Ball showed "Not Connected" in MCP UI.
Fix:      Updated .env with fresh token from MCP UI (iat: 1776539094).
          Token valid until ~2026-09-20.
Status:   FIXED ✓ — restart unified_api to apply
```

### M10 — OpenClaude CLI MiniMax Config (FIXED 2026-04-18)
```
Problem:  Agents spawned via OpenClaude CLI didn't explicitly pass MiniMax API config.
Fix:      Added --settings flag to OpenClaude CLI spawn args:
          { provider:'openai', baseURL:OPENAI_BASE_URL, apiKey:OPENAI_API_KEY, model:OPENAI_MODEL }
Status:   FIXED ✓ — restart agent_tower to apply
```

---

## 6. BROKEN INTEGRATIONS (runtime failures, not just gaps)

### B1 — Stub Template Literal Bug (FIXED 2026-04-18)
```
File:     agent_tower.js lines 561-574
Problem:  stubScript used ${agentInfo.emoji} inside a single-quoted JS string.
          Would literally print "${agentInfo.emoji} ${agentInfo.name}" instead of values.
Fix:      Replaced template literals with concatenation: emoji='${agentInfo.emoji}'
Status:   FIXED ✓
```

### B2 — Orchestrator Direct Tower Calls (NOT an issue — by design)
```
Some orchestrator.js code paths call agent_tower directly (spawnAgent, spawnTeam)
via towerRequest() HTTP calls rather than going through unified_api.
This is BY DESIGN — orchestrator is the router, agent_tower is the executor.
No fix needed.
```

---

## 7. END-TO-END BOOT VERIFICATION CHECKLIST

After restarting all services, verify each layer:

```
□ EventBus (7782) — curl http://localhost:7782/events/test (should connect)
□ State (7783) — curl http://localhost:7783/health
□ Orchestrator (7784) — curl http://localhost:7784/api/health
□ UnifiedAPI (7780) — curl http://localhost:7780/api/health
□ AgentTower (7790) — curl http://localhost:7790/tower/status
□ Gatekeeper (7791) — curl http://localhost:7791/health
□ VoiceCoordinator (7781) — curl http://localhost:7781/health
□ CompanionChorus (7792) — curl http://localhost:7792/health
□ MemoryMatrix (7884) — curl http://localhost:7884/health
□ SymbolicRules (7787) — curl http://localhost:7787/health
□ Metrics (7890) — curl http://localhost:7890/health
□ Vision (7881) — curl http://localhost:7881/health
□ Autodiagnostics (7785) — curl http://localhost:7785/health

□ Ball connected — MCP UI should show "Connected" (apply .env token fix first)
□ Next.js UI — http://localhost:3000 should load

□ Voice test — speak to ball: "swarm status" → should route to orchestrator
□ Chat test — POST localhost:7780/api/chat { message: "swarm build a login" }
              → should get workflowId back from orchestrator

□ Production loop test — "fix the memory leak"
              → should route to orchestrator → circuit breaker → agent tower
              → orchestrator tracks workflow via EventBus agent.* events
```

---

## 8. WHAT TO DO WHEN A LAYER GOES DOWN

```
EventBus (7782) DOWN:
  → All EventBus subscribers stop receiving events
  → Orchestrator stops tracking agent completions
  → Companion chorus stops reacting
  → Fix: PM2 restart eventbus, subscribers auto-reconnect via EventBus reconnect logic

UnifiedAPI (7780) DOWN:
  → Ball disconnects, UI can't reach API
  → Fix: PM2 restart unified_api

Orchestrator (7784) DOWN:
  → Voice/chat commands get 502
  → Workflows in queue lost (in-memory)
  → Fix: PM2 restart orchestrator, queue is lost

AgentTower (7790) DOWN:
  → Can't spawn new agents, existing agents continue
  → Fix: PM2 restart agent_tower

State (7783) DOWN:
  → Agent/team state updates fail silently
  → Orchestrator continues with stale state
  → Fix: PM2 restart state

CompanionChorus (7792) DOWN:
  → No companion reactions, no personality layer
  → Fix: PM2 restart bridge

Xiaozhi Ball DISCONNECTED:
  → Token expired — update .env XIAOZHI_MCP_URL, restart unified_api
  → Network issue — check internet connection
```
