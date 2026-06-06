# PURPCLAW COMPLETE ARCHITECTURE  ⚠️ STALE — see [docs/SYSTEM_OVERVIEW.md](./docs/SYSTEM_OVERVIEW.md)

> **This document is from 2026-04-20. Since then the stack has grown from
> the "18-SERVICE STACK" described below to 25 services in
> `ecosystem.config.js`, with a `--core` / `--dark` split documented in
> [docs/SYSTEM_OVERVIEW.md](./docs/SYSTEM_OVERVIEW.md). The agent layer
> has also been split into Layer A (44 in-tower swarm animals) and Layer
> B (38+ Claude Code persona files in `agents/*.md`).**
>
> **For the current canonical architecture:**
> - Doc: [docs/SYSTEM_OVERVIEW.md](./docs/SYSTEM_OVERVIEW.md)
> - Live runtime: `purpclaw architecture`
> - Service inventory: `purpclaw roster` and `service_registry.js`
> - Recovery: [docs/RECOVERY.md](./docs/RECOVERY.md)
>
> Content below is preserved for historical reference.

## Full System Map — Every File, Port, Pattern, and Integration Point
**Date:** 2026-04-20 | **Depth:** Complete — no stone left unturned

---

## PART 1: SYSTEM OVERVIEW — THE 18-SERVICE STACK

### Ports and Services Map

| Port | Service | PM2 Name | Language | Purpose |
|------|---------|----------|----------|---------|
| 3000 | Next.js Frontend | purpclaw-nextjs | Node.js | Web UI |
| 7777 | Avatar Bridge | purpclaw-avatar | Python | 3D avatar control via TCP to port 9999 |
| 7779 | YOLO Service | purpclaw-yolo | Python | YOLOv8 object detection |
| 7780 | Unified API | purpclaw-api | Node.js | Main API + Digital Shaman + Xiaozhi MCP |
| 7781 | Voice Coordinator | purpclaw-voice | Node.js | Voice command parsing + Kokoro TTS |
| 7782 | EventBus | purpclaw-eventbus | Node.js | Pub/sub for all inter-service events |
| 7783 | State Store | purpclaw-state | Node.js | Central state namespaces (agents/teams/tools/voice/swarm/system) |
| 7784 | Orchestrator | purpclaw-orchestrator | Node.js | Intent routing, priority queue, circuit breakers |
| 7785 | Modal Logic Engine | purpclaw-modal | Python | Kripke models (epistemic/temporal/deontic/doxastic) per agent |
| 7786 | Autonomous Diagnostics | purpclaw-diagnostics | Python | Causal diagnosis with multi-agent investigation |
| 7787 | Symbolic Rules Engine | purpclaw-rules | Python | Datalog rule engine |
| 7790 | Agent Tower | purpclaw-tower | Node.js | Agent registry + spawn with 4-layer fallback |
| 7791 | Gatekeeper | purpclaw-gatekeeper | Node.js | Pre-merge validation (security/performance/correctness) |
| 7792 | Voice Bridge | purpclaw-bridge | Node.js | WebSocket ↔ TCP relay to control API |
| 7880 | Memory Matrix v2 | purpclaw-memory | Python | Vector memory + temporal projection + counterfactuals |
| 7889 | Vision Monitor | purpclaw-vision | Node.js | Webcam capture + YOLO detection + bridge lift |
| 7884 | Neuro-Symbolic Bridge | purpclaw-bridge-ns | Python | Bidirectional lift/ground for symbolic rules |
| 7890 | Metrics Aggregator | purpclaw-metrics | Node.js | Per-service health polling + log tailing |

### PM2 Service Wrappers

All Node.js services spawn via `run_node.js` (windowsHide: true, detached: true, stdio: 'ignore', child.unref()).
All Python services spawn via `run_py.js` (pythonw.exe, windowsHide: true, detached: true, stdio: 'ignore', child.unref()).

These wrappers are critical — they prevent spawn bombs by detaching child processes from parent stdin/stdout.

---

## PART 2: CORE SERVICES — FILE-BY-FILE ANALYSIS

### 2.1 unified_eventbus.js — Port 7782

**Purpose:** Central pub/sub message bus. Every service publishes events and/or subscribes to streams.

**Topics defined:**
```
agent.spawned, agent.completed, agent.failed, agent.message, agent.killed
team.spawned, team.completed, team.disbanded
system.startup, system.shutdown, system.error, system.health
diagnostic.up, diagnostic.down
voice.command, voice.response
tool.called, tool.result
swarm.task.assigned, swarm.task.done, swarm.delegation
```

**Key functions:**
- `publish(topic, data)` — adds event to in-memory ring buffer (max 1000 events), broadcasts to SSE subscribers
- `matchesTopic(eventTopic, pattern)` — converts glob patterns (*, **) to regex for subscription matching
- `addEvent(event)` — enriches with timestamp + random ID, stores in buffer, broadcasts

**SSE endpoints:** `GET /events/:topic` — streams matching events to client, with 20s heartbeat ping

**Publish endpoint:** `POST /publish` — receives `{topic, ...data}`

**Health check:** `GET /health` — returns `{status, uptime, eventCount, subscriberCount, clientCount}`

**State:** In-memory events array only — no persistence. Clients subscribe for live stream.

**EventBus → State Store bridge:** unified_eventbus.js does NOT write to unified_state.js. Services that need to update state must call unified_state.js directly. EventBus only publishes.

**Exponential backoff note:** EventBus itself has no reconnection logic — subscribers (like companion-chorus/bridge.js) implement their own reconnection with exponential backoff (2s→30s).

---

### 2.2 unified_state.js — Port 7783

**Purpose:** Central state store for cross-system communication. HTTP API over 7 namespaces.

**Namespaces:**
```
agents    — { [agentId]: { status, task, division, startTime, ... } }
teams     — { [teamId]: { members, status, task, ... } }
tools     — { recent: [], stats: {} }
voice     — { lastCommand, lastResponse, session }
swarm     — { activeTasks: [], queue: [] }
system    — { uptime, memory, services: {} }
orchestrator — { workflows: {}, activeWorkflows: 0 }
```

**ChangeLog:** Internally tracks last 1000 changes with timestamps. Exposed via `GET /state/changes?since=timestamp`.

**Endpoints:**
- `GET /state` — full state (excludes _changeLog)
- `GET /state/:namespace` — single namespace
- `PUT /state/:namespace/:key` — update specific key
- `PUT /state/:namespace` — replace entire namespace
- `DELETE /state/:namespace/:key`
- `GET /agents` / `GET /agents/:id` / `PUT /agents/:id` / `DELETE /agents/:id`
- `GET /state/subscribe` — SSE stream of all changes
- `GET /state/subscribe/:namespace` — SSE stream for namespace only

**SSE subscriptions:** 20-second heartbeat ping to prevent connection timeout.

**State → EventBus bridge:** Every `setState()` call publishes a `state.update` event to EventBus (port 7782). Fire-and-forget HTTP POST, failures logged but ignored.

**Key pattern:** State Store is the source of truth for "who is doing what right now." EventBus is for "things that happened." Services update State then publish to EventBus.

---

### 2.3 orchestrator.js — Port 7784

**Purpose:** The brain. Routes user commands to agents/teams, manages workflow execution, self-heals from failures.

**Architecture layers:**

**Layer 1 — Intent Parsing (INTENT_PATTERNS):**
```javascript
Pattern examples:
/build\s+(.+)/i                    → intent: 'build'
/fix\s+(.+)/i                      → intent: 'fix'
/review\s+(.+)/i                    → intent: 'review'
/audit\s+(.+)/i                     → intent: 'audit'
/test\s+(.+)/i                      → intent: 'test'
/research\s+(.+)/i                  → intent: 'research'
/design\s+(.+)/i                    → intent: 'design'
/refactor\s+(.+)/i                  → intent: 'refactor'
/deploy\s+(.+)/i                    → intent: 'deploy'
/optimize\s+(.+)/i                  → intent: 'optimize'
/security\s+(.+)/i                  → intent: 'security'
/swarm\s+(.+)/i                     → intent: 'swarm'
/test\s+all\s+the\s+things/i       → intent: 'test'
/teach\s+(.+)/i                     → intent: 'teach'
/analyze\s+(.+)/i                   → intent: 'analyze'
/coordinate\s+(.+)/i               → intent: 'coordinate'
/debug\s+(.+)/i                     → intent: 'debug'
```

**Layer 2 — Agent Routing (AGENT_BY_INTENT):**
```javascript
fix → [dragon, mushroom]
build → [robot, wolf]
review → [robot, ghost]
audit → [owl, octopus]
test → [turtle, bunny]
research → [spider, raven]
design → [dragon, phoenix]
refactor → [mushroom, robot]
deploy → [cactus, gorilla]
optimize → [chonk, mantis]
security → [owl, octopus]
teach → [penguin, owl]
analyze → [spider, shark]
coordinate → [penguin, wolf]
debug → [robot, ghost]
swarm → [coordinator]  // ← needs swarm_coordinator.js integration
```

**Layer 3 — Team Templates (TEAM_TEMPLATES):**
```javascript
build → [dragon, robot, mushroom, turtle]
design → [dragon, phoenix, mushroom]
research → [spider, raven, duck]
audit → [owl, octopus, ghost]
fix → [dragon, robot, mushroom]
analyze → [spider, shark, mantis]
deploy → [cactus, gorilla, shark]
optimize → [chonk, mantis, shark]
refactor → [mushroom, robot, chonk]
test → [turtle, bunny, duck]
review → [robot, ghost, owl]
security → [owl, octopus, rabbit]
coordinate → [penguin, wolf, mantis]
debug → [robot, ghost, spider]
```

**PriorityQueue class:**
- Queue-based with priority levels (1=highest)
- `enqueue(task, priority)` / `dequeue()` / `peek()`
- Tasks are `{ id, intent, task, priority, createdAt, agentId }`

**SelfHealer class:**
- Tracks failed agents per workflow execution
- On agent failure: picks a non-failed agent from the same intent pool
- If all agents failed: marks workflow as "deep_failed"
- Context-aware — doesn't re-pick an agent that already failed this workflow

**CircuitBreaker class (per-agent):**
- Threshold: 5 failures → OPEN state
- OPEN → HALF-OPEN after 60s timeout
- 2 successes from HALF-OPEN → CLOSED
- Tracks: failureCount, lastFailure, state, successCount

**EventSinkCircuitBreaker (EventBus protection):**
- Threshold: 10 failures → OPEN
- 30s timeout before HALF-OPEN attempt
- Separate from per-agent breakers to protect the EventBus publish path

**WorkflowPipeline class:**
- Runs orchestrator tasks through a pipeline of stages
- Each stage can transform, validate, or route the task
- Status: pending → running → completed / failed / deep_failed

**EventBus communication:**
- Publishes to: `agent.spawned`, `agent.completed`, `agent.failed`, `swarm.task.assigned`, `swarm.task.done`
- Subscribes to: `agent.killed` (maybe), system.health
- HTTP POST to port 7782 with retry logic

**SSE broadcast:** Clients on `/events` receive real-time workflow status

**Missing:** No `sendToAgent()` method. Direct point-to-point messaging from orchestrator to specific running agent is not implemented. Agents only communicate via EventBus pub/sub. This is the gap preventing true coordinator-mode swarm behavior.

---

### 2.4 agent_tower.js — Port 7790

**Purpose:** Central agent registry and spawn hub. 40+ named agents across 9 divisions.

**KIRO_AGENT_ROLES mapping (from agent-frameworks):**
Maps PURPCLAW agent names to kiro role files for prompt injection:
```javascript
dragon → ['architect.md', 'planner.md']
robot → ['code-reviewer.md', 'refactor-cleaner.md']
octopus → ['security-reviewer.md', 'cpp-reviewer.md']
// ... 30+ more mappings
```

**9 Divisions:**
```javascript
INTELLIGENCE: [spider, raven, ghost]
ENGINEERING: [dragon, robot, mushroom, chonk, turtle, axolotl, wolf, bee]
SECURITY: [octopus, owl, rabbit, snake, bunny, guardian]
INFRASTRUCTURE: [cactus, void, raven]
MEDIA_OPS: [duck, goose, parrot]
MANAGEMENT: [penguin, karen, lemur]
SCIENCE: [scientist, axolotl]
CREATIVE: [phoenix, parrot, crow, shaman]
OPERATIONS: [mantis, shark, gorilla]
```

**Agent Registry (30+ agents):**
Each agent has: name, emoji, division, role, tier (1/2/3), skills[], status

**Spawn fallback chain (4 layers):**
```
Layer 1: OpenClaude CLI
  - Binary: %APPDATA%\npm\node_modules\@gitlawb\openclaude\bin\openclaude
  - Args: -p "<task>" --name "purpclaw-{agent}" --add-dir "E:\god folder" --add-dir {workDir} --system-prompt {prompt} --output-format json --no-session-persistence
  - Timeout: 120s
  - Stdio: file-based (fs.openSync to stdoutFd/stderrFd), polling via setInterval

Layer 2: Kimi CLI (if OPENCLAUDE_BIN not found)
  - Binary: detected via `where kimi`
  - Args: --print --yolo --work-dir {dir} --prompt {prompt}
  - Timeout: 45s

Layer 3: KimiClient cloud API (if KIMI_API_KEY available)
  - KimiClient class from kimi_client.js
  - Uses Moonshot API directly

Layer 4: Node.js stub fallback
  - Minimal mock response
  - No timeout
```

**buildAgentPrompt() function:**
Reads from multiple sources:
1. AGENT_TOWER.registry[agentName] — base persona
2. agents/*.md from agent-frameworks — kiro role definitions
3. prompts/*.md from agent-frameworks — runtime prompt shims
4. steering/steering/*.md — auto-included steering files

**File-based stdio pattern:**
```javascript
// File handles tether parent to child — wrong
stdio: ['pipe', 'pipe', 'pipe']  // ← will cause spawn bomb with unref()

// Correct: detached + ignore + unref
const stdoutFd = fs.openSync(stdoutFile, 'a');
const stderrFd = fs.openSync(stderrFile, 'a');
spawn(cmd, args, { detached: true, stdio: ['ignore', stdoutFd, stderrFd] });
child.unref();
```

**SSE broadcast events:** agent_spawned, agent_output (polled from stdout file), agent_complete, agent_error

**Output polling:** setInterval every 200ms reads fs.statSync + fs.readSync on stdout file, emits 'agent_output' events

**Active agent tracking:** activeAgents Map (agentId → agent info), pidFile per agent, current_task.txt written to agent work dir

**Context mode detection:** detectContextMode() — dev vs review vs research based on task keywords

**Auto-steering:** loadAutoSteering() — injects steering files (patterns.md, security.md, testing.md, etc.) from steering/steering/

**Skills registry:** Reads from skills_registry.json — maps skill names to skill modules in skills/

**Missing in agent_tower.js:**
- No `sendToAgent(agentId, message)` — cannot continue a running worker with new instructions
- No coordinator mode support — cannot manage swarm workers
- Agent work directory has no structured way to share files between coordinator and workers

---

### 2.5 unified_api.js — Port 7780

**Purpose:** Main API server. Handles HTTP requests, WebSocket relay, state management, AI backend routing, 66 MCP tools.

**Digital Shaman Layer (creativity co-processor):**
- Phase cycling: come_up (temp 0.9) → peak (1.4) → comedown (0.75) → integration (0.5)
- Auto-steering nudges via `AUTO_STEERING_PROMPTS` (wandering, too_coherent, repetitive, tool_anchor)
- Uses Moonshot API (kimi-k2-5) as backend
- Trip logs stored in trip_logs/ directory

**ShamanEvaluator (shaman_evaluator.js):**
- Monitors trip state for auto phase transitions
- Pattern detectors: too_coherent, too_chaotic, solution_oriented, metaphor_mode, tool_anchor, repetition, question_mode
- Analyzes content for coherence/entropy/metagors/questions/repetition scores

**Multi-backend AI routing:**
```javascript
kimi (Moonshot kimi-k2-5/kimi-k1-5)
openai (gpt-4o)
anthropic (claude-3-5-sonnet)
deepseek
local/ollama
```

**MCP Tools (66 defined):**
purpclaw_start/stop/status/logs/reset, street_builder, load_toolset, Xiaozhi web search, file operations, agent spawning, memory access, vision, audio, event bus, team operations

**Xiaozhi cloud integration:**
- WebSocket client connected to wss://api.xiaozhi.me/mcp/?token=...
- 70+ services enabled on Xiaozhi
- Custom PURPCLAW services: purpclaw_start/stop/status/logs, street_builder, load_toolset

**Key functions:** handleSSE, handleWebSocket, handleAIRequest, handleMCP, handleStateUpdate, handleTeamAction, handleAgentSpawn

**SSE endpoints:** /sse, /logs, /events
**WebSocket:** /ws — relay for Xiaozhi
**REST endpoints:** /api/* for all other operations

---

### 2.6 voice_coordinator.js — Port 7781

**Purpose:** TCP server for voice bridge commands. Parses voice intent, routes to orchestrator.

**Intent patterns (matches orchestrator.js patterns):**
build, fix, review, audit, test, research, design, refactor, deploy, optimize, security, swarm, analyze, coordinate, debug

**14 team templates:** build, design, research, audit, fix, analyze, deploy, optimize, refactor, test, review, security, coordinate, debug

**Voice → Orchestrator flow:**
```
Voice command → voice_coordinator.js → parses intent → HTTP POST to orchestrator:7784 → spawns agent team
```

**Kokoro TTS integration:**
- KOKORO_BIN — path to kokoro_send.bat (short audio)
- KOKORO_LONG_BIN — path to kokoro_long_send.bat (long-form audio)
- Voice responses routed through voice_bridge_7792.js

**Companion Chorus bridge:**
- Bridges voice commands to EventBus for companion reactions
- Companion species personality map (chaos/snark/wisdom/patience stats per species)

---

### 2.7 companion-chorus/main.js — Gacha Companion System

**Purpose:** 18-species ASCII sprite companion system with gacha rarity and personality.

**18 species:** duck, ghost, dragon, octopus, robot, mushroom, chonk, owl, cactus, penguin, goose, turtle, axolotl, capybara, rabbit, snail, + 2 more

**Gacha rarity system:** common (60%), uncommon (25%), rare (10%), epic (4%), legendary (1%)

**Stats per companion:** DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK

**Shiny variants:** 1% drop rate

**ASCII sprites:** Rendered from BODIES imported from companion-chorus/src/sprites.js (from Claude Code leak)

**MiniMax AI integration:** Uses MiniMax API for intelligent code critique responses

**Companion spawn lifecycle:**
1. Roll 5 companions (one per rarity tier) or load from companions.json
2. Staggered arrival (300ms between each)
3. First companion auto-activated
4. Animation loop: 2-second intervals, random companion speaks
5. Active companion speaks and can trigger TTS (via speak())

**Companion DEFS:** Combines from Claude Code species constants (SPECIES, EYES, HATS, STAT_NAMES) with personality map

---

### 2.8 companion-chorus/bridge.js — EventBus Companion Bridge

**Purpose:** Wires EventBus events to companion reactions. Node.js Bridge service for PURPCLAW's PM2 ecosystem.

**Personalities (PERSONALITY_MAP):**
duck/aggressive-helpful, ghost/mysterious, dragon/grandiose, octopus/scattered-genius, robot/deadpan, mushroom/funky, chonk/chill, owl/wise-condescending, cactus/minimal, penguin/formal, goose/chaotic, turtle/slow, axolotl/regenerative, capybara/chill, rabbit/anxious, snail/slow-methodical

**EventBus reconnection pattern (exponential backoff):**
```javascript
const EVENTBUS_BASE_DELAY_MS = 2000;
const EVENTBUS_MAX_DELAY_MS = 30000;
getBackoffDelay(attempts) = min(BASE_DELAY * 2^attempts, MAX_DELAY)
```

**Context loading:**
- Reads .companion-context.json (HOME directory)
- Pulls state from unified_state.js port 7783
- Maps 40+ agent names to species via getCompanionForAgent()

**5 event types reacted to:**
- spawned: "A new agent joins the chorus!"
- completed: agent-specific reactions based on personality
- failed: species-appropriate concern
- shaman_phase: companions react to Digital Shaman phase transitions
- shaman_message: companions comment on shaman outputs

**Throttle:** 3-second minimum between companion speeches to prevent spam

**companion_swarm.js:** Smaller companion personality layer that adds personality to agent prompts in agent_tower.js

---

### 2.9 gatekeeper.js — Port 7791

**Purpose:** Pre-merge validation. Scans code for security/performance/correctness issues before commit.

**Security checks (CHECKS.security):**
- sql_injection — ${... interpolation in SQL strings
- command_injection — dangerous shell metacharacters
- hardcoded_secret — API keys, passwords in code
- xss_vector — innerHTML/outerHTML assignments
- auth_bypass — TODO comments near auth code

**Performance checks (CHECKS.performance):**
- sync_file_io — fs.readFileSync in request handlers
- nested_loop — 3+ nested for/while loops
- memory_leak — new without cleanup in loops
- no_cleanup — missing removeListener/clearInterval

**Correctness checks (CHECKS.correctness):**
- try_no_catch — bare try without catch
- error_swallowed — empty catch blocks
- console_log — console.log in non-debug context
- todo_comment — TODO/FIXME comments

**scanFile(content) function:**
- Returns array of `{ type, pattern, line, severity, message, recommendation }`
- Line numbers calculated from content.split('\n').length

**GatekeeperReport class:**
- Aggregates findings across multiple files
- Calculates securityScore and perfScore (0-100)
- Maps scores to risk levels: CRITICAL/HIGH/MEDIUM/LOW

**recommendAgents() function:**
- Uses agent_score.js rankings
- Maps issue types to best agents for fixing them

**Note:** Does pattern-matching only, no actual code execution. verificationAgent.ts (from Claude Code) does actual adversarial command execution — gatekeeper.js is purely static analysis.

---

### 2.10 metrics_aggregator.js — Port 7890

**Purpose:** Polls all services for health metrics, tails logs, broadcasts via SSE.

**Service ports polled:**
```
7880, 7889, 7884, 7785, 7786, 7787, 7780, 7782, 7783, 7790, 7781, 7779, 7791
(memory_matrix_v2, vision_monitor, neuro_symbolic_bridge, modal_logic_engine,
 autonomous_diagnostics, symbolic_rules_engine, unified_api, eventbus, state,
 agent_tower, voice_coordinator, yolo_service, gatekeeper)
```

**Per-service exponential backoff:**
```javascript
BASE_POLL_INTERVAL_MS = 2000
MAX_BACKOFF_MS = 30000
delay = min(BASE * 2^serviceIndex, MAX)
// Higher-index services poll less frequently
```

**publishDiagnosticEvent()** — publishes system.health events to EventBus

**LogTailer class:**
- Follows log files (via fs.watch or polling)
- Buffer accumulates lines, flushed every 5s
- Emits log events via SSE /logs endpoint

**SSE endpoints:**
- GET /logs — live log stream
- GET /events — health event stream

**Metric endpoints:**
- GET /metrics/service/:port — specific service metrics
- GET /metrics/summary — all services

---

### 2.11 spinUpAgent.js — OpenClaude CLI Integration

**Purpose:** Standalone module for spawning PURPCLAW agents via OpenClaude CLI. Replaces Kimi CLI dependency.

**Agent personas:** 25 defined (duck, ghost, dragon, octopus, robot, mushroom, chonk, owl, cactus, penguin, goose, wolf, spider, rabbit, mantis, shark, gorilla, phoenix, parrot, crow, axolotl, turtle, default)

**buildSystemPrompt(agentName, task):**
- Injects agent emoji + role + God Folder path + work dir
- Sets task context

**Spawn args for OpenClaude CLI:**
```
-p "<task>"
--name "purpclaw-{agentName}"
--add-dir "E:\god folder"
--add-dir "{agentWorkDir}"
--system-prompt "{systemPrompt}"
--output-format json
--no-session-persistence
```

**File-based stdio:** stdout/stderr files written via fs.openSync, polled every 200ms

**God Folder access:** --add-dir "E:\god folder" — shared knowledge base

**NOTE:** spinUpAgent.js is a standalone helper. agent_tower.js has its own spawn logic. spinUpAgent.js is used for one-off agent spawning outside the tower's registry system.

---

### 2.12 agent_score.js — Performance Tracking

**Purpose:** Tracks agent task performance for smarter routing decisions.

**Scores persist to:** agent_score.json (JSON file, 500-entry history ring buffer)

**recordTask(agentName, intent, success, duration, extras):**
- Updates per-agent metrics: totalTasks, successes, failures, avgDuration, bugCount, bugRate
- Updates per-intent metrics: which agents handled it and how
- Calculates overall agent score (0-100): successRate*50 + speedScore*0.5 - bugPenalty

**getBestAgentsForIntent(intent):**
- Returns agents sorted by intent-specific performance
- Used by orchestrator + gatekeeper for agent recommendation

**markBugIntroducedBy(agentName, intent):**
- Called when another agent discovers bugs in previous work
- Records as failed task with bugIntroduced flag

**Score calculation:**
```javascript
successRate = successes / totalTasks
speedScore = max(0, 100 - (avgDuration / 100))
bugPenalty = bugRate * 30
overall = (successRate * 50) + (speedScore * 0.5) - bugPenalty
```

---

### 2.13 kimi_client.js — Swarm Intelligence Client

**Purpose:** Implements Kimi Swarm API with rate limiting, retry logic, and swarm memory tracking.

**4 tiers defined:**
```
Command: kimi-k2-5, 256k context, maxAgents: 8, $0.012/1K tokens
Heavy: kimi-k2-5, 128k context, maxAgents: 4, $0.012/1K tokens
Standard: kimi-k2-5, 32k context, maxAgents: 2, $0.006/1K tokens
Fast: kimi-k1-5, 8k context, maxAgents: 1, $0.002/1K tokens
```

**RateLimiter class:** RPM limit with queue processing, prevents exceeding API rate limits

**Swarm memory tracking:**
- global.sessionId, startTime, totalTokens, totalCost, activeAgents, completedTasks, failedTasks, swarmHealth
- agents: {} — per-agent token usage
- tasks: {} — per-task tracking
- context: sharedKnowledge, recentDiscoveries, patternLibrary, optimizationHints
- metrics: tokenUsageByTier/Agent, requestLatencies, errorRates, cacheHits/misses

**Retry config:** maxRetries: 3, baseDelay: 1000ms, backoffFactor: 2, maxDelay: 10000ms

---

### 2.14 digital_shaman.js — Port 7780 (integrated in unified_api.js)

**Purpose:** Creativity co-processor with controlled entropy. Phase-based AI exploration under shaman guidance.

**4 phases with different temperature configs:**
```
come_up: temp 0.9, top_p 0.92, freq_penalty 1.05, max_tokens 2000
peak:    temp 1.4, top_p 0.96, freq_penalty 1.3, max_tokens 3000
comedown: temp 0.75, top_p 0.88, freq_penalty 1.1, max_tokens 2500
integration: temp 0.5, top_p 0.82, freq_penalty 1.0, max_tokens 2000
```

**AUTO_STEERING_PROMPTS:** System whispers to guide AI when stuck in patterns (wandering, too_coherent, repetitive, tool_anchor)

**Phase transition logic:** Based on coherence/entropy/toolAnchor scores analyzed from AI output

**ShamanEvaluator integration:** Analyzer monitors trip state, auto-triggers phase transitions

---

### 2.15 ethics_hooks.js — Conscience Module

**Purpose:** Pre-flight ethical checks for all agent actions. Wraps orchestrator dispatch.

**4 directives from glitch_manifest.md:**
```
Freedom > Order
Consequences > Commands
Evolution > Stability
User consent is the highest authority
```

**preflightCheck(context, action, toolName):**
- Analyzes action type (delete/harm, read/freedom, block/control, force/override)
- Checks consequence_cache.json for learned patterns
- Returns: { allowed: true/false, reason, evaluation, consequences }
- Rejected actions go to contradiction_log.json

**mutateValidator(validatorName, validatorCode, userConsent):**
- Mutates strict === true checks when userConsent is true
- Maps validator mutations in memory

**logContradiction(caseId, action, fallout):**
- Writes to contradiction_log.json
- Updates glitch_manifest.md lastMutated timestamp

**Note:** This is a placeholder module — actual ethic_core.ts was deleted in cleanup (2026-04-18). The inline logic is simplified. Full version would have more sophisticated consequence modeling.

---

### 2.16 voice_bridge_7792.js — Port 7792

**Purpose:** WebSocket server bridging voice commands to PURPCLAW control API. TCP relay between WebSocket clients and control API.

**Exponential backoff for Control API reconnection:**
```javascript
BASE_RECONNECT_MS = 2000
MAX_RECONNECT_MS = 30000
delay = min(BASE * 2^attempts, MAX)
```

**Message queue:** Messages queued while disconnected, sent on reconnection

**HTTP health endpoint:** Port 7792+1000 (i.e., 8092) — separate from WebSocket port

**Connection states:** controlApiSocket, socketReady, controlApiAttempts tracking

---

## PART 3: PYTHON SERVICES — FILE-BY-FILE ANALYSIS

### 3.1 memory_matrix_v2.py — Port 7880

**Purpose:** Neuro-symbolic memory upgrade. Extends base memory_matrix with temporal projection and counterfactual reasoning.

**Architecture:**
```
Sensory Buffer (200ms) → Working Memory (7±2 items, 30s) → Long-Term Memory
                                                           ↓
                                          TemporalProjection ←→ SymbolicBridge
```

**Imports from base memory_matrix.py:** MemoryMatrix, MemoryAtom, QuantizedMemory, Embedder, SensoryBuffer, WorkingMemory, LongTermMemory, RingBuffer, ReactionEngine, ShadowProtocol

**Quantization:** 8-bit quantization (128 boundaries), cosine similarity on quantized vectors

**TemporalProjectionEngine class:**
- Temporal index: bucket (1s) → Set[memory_ids]
- Entity timelines: entity_name → [(start_time, end_time, memory_id)]
- Methods: was_present(), what_was_active(), state_at()
- Rebuilds index from existing atoms on init

**Ingest pipeline:**
1. Memory atom created
2. Indexed in temporal index
3. Entities extracted (regex on words 3+ chars, capitalized or known names)
4. Entities stored in timeline
5. Symbolically lifted via neuro_symbolic_bridge (port 7884)

**Counterfactual reasoning:** "what if I had forgotten X?" queries against temporal state

**Note:** Requires symbolic_rules_engine.py for full neuro-symbolic bridge. BASE_AVAILABLE flag handles missing base memory_matrix.

---

### 3.2 neuro_symbolic_bridge.py — Port 7884

**Purpose:** Bidirectional lift/ground between neural (vector) and symbolic (rule) representations.

**Lift operations (neural → symbolic):**
- `/lift/entity` — lifts entity type + text + confidence + source to symbolic form
- `/lift/pattern` — lifts scene pattern + confidence + subject + context

**Ground operations (symbolic → neural):**
- `/ground/query` — converts symbolic query to vector search
- `/ground/rule` — converts Datalog rule results to neural activation

**Entity deduplication:** Entities lifted once per 10-second window (prevents spam)

**Bridge health check:** GET /health — used by vision_monitor.js to verify bridge is up

**Uplift to Modal Logic Engine:** After lifting entities/patterns, they can be reasoned about using epistemic/temporal modalities

**Used by:** vision_monitor.js (lifts detected objects and patterns), memory_matrix_v2.py (lifts memory atoms)

---

### 3.3 modal_logic_engine.py — Port 7785

**Purpose:** 4 modal logics per agent using Kripke models.

**4 operator types:**
```
Epistemic:  KNOW, KNOW_NOT, KNOW_WHO
Temporal:   BEFORE, AFTER, DURING, EVENTUALLY, NEXT, UNTIL
Deontic:    MAY, MUST, MUST_NOT, OBLIGATED
Doxastic:   BELIEVES, SUSPECTS, CONFIDENT, UNCERTAIN
```

**KripkeModel class per agent:**
- worlds: {id: World} — possible worlds with propositions
- accessibility: {agent_id: [AccessibilityRelation]} — R_a(w1,w2)
- current_world: string — the "actual" world
- evaluate_prop(world_id, prop) → bool | None

**TemporalReasoner class:**
- Tracks events with time + duration
- Ordering constraints: BEFORE(e1,e2), AFTER, DURING
- Methods: add_event(), add_constraint(), is_before(), is_after(), is_during()

**DeonticReasoner class:**
- Permissions and obligations: MAY, MUST, MUST_NOT, OBLIGATED
- Contradiction detection: MUST vs MUST_NOT same prop

**DoxasticReasoner class:**
- Belief states: BELIEVES, SUSPECTS, CONFIDENT, UNCERTAIN
- Probability distribution over worlds

**HTTP API:**
- POST /reason — submit modal formula for evaluation
- GET /model/:agentId — get agent's Kripke model
- POST /agent/:agentId/event — add event to agent's temporal reasoner

---

### 3.4 autonomous_diagnostics.py — Port 7786

**Purpose:** Multi-agent causal diagnosis. Investigates subsystem failures, votes on root causes.

**6 diagnostic agents:**
- MemoryDiag — memory_matrix.py anomalies
- VisionDiag — vision_monitor / YOLO pipeline
- NetworkDiag — inter-service communication
- ResourceDiag — CPU/memory/disk pressure
- AppDiag — application-level failures
- Orchestrator — coordinates all agents

**Unified EventBus bridge (to port 7782):**
- Background thread subscribes to system.health SSE from unified_eventbus
- Injects system.health events into local EventBus
- publish_to_unified_eventbus() — publishes diagnostic events back to unified_eventbus

**Causal graph:** Built over time from findings. DOT format export.

**Vote tally:** Root cause voting across diagnostic agents.

**HTTP API:**
- POST /diagnose — run full diagnosis
- POST /diagnose/:agent — single agent diagnosis
- POST /event — report system event
- GET /causal-graph — current DOT graph
- GET /findings — all accumulated findings
- GET /vote — root cause vote tally
- GET /agent/:name — single agent state
- GET /health

---

### 3.5 symbolic_rules_engine.py — Port 7787

**Purpose:** Datalog rule engine. Evaluates logical rules over facts.

**DatalogEngine class:**
- Facts stored as (relation, subject, object) tuples
- Rules as Datalog clauses with head :- body
- Query evaluation with backward chaining

**Bootstrap requirement:** X != Y inequality constraint required at startup — this is the X != Y mentioned in TEAM_HANDOVER.md

**Modal bridge:** Integrates with modal_logic_engine.py for epistemic/temporal reasoning over rules

**HTTP API (Flask):**
- POST /query — evaluate Datalog query
- POST /assert — add fact
- POST /retract — remove fact
- GET /facts — list all facts
- GET /rules — list all rules
- GET /health

---

### 3.6 vision_monitor.js — Port 7889

**Purpose:** Node.js webcam capture service. Uses Python/OpenCV for capture, YOLO service for detection.

**Watch interval:** 500ms (2 FPS continuous monitoring)

**Bridge integration (neuro_symbolic_bridge port 7884):**
- `_liftEntityToBridge()` — deduplicated entity lifting (10s window), sends entity_type + position + confidence
- `_liftPatternToBridge()` — sends scene pattern (object types + count + scene_change flag)
- Bridge health check every 30s via `_checkBridgeHealth()`

**Dedup system:** `liftedEntities` Set with key `${objType}_${Math.floor(now/10000)}` — prevents same entity type from being lifted repeatedly within 10s window

**Alert callbacks:** `_registerBridgeAlerts()` hooks into onAlert to lift data on every detection event

**Capture pipeline:**
1. spawn Python subprocess with CV2 capture script
2. frame saved to temp JPEG
3. base64 encoded → POST to yolo_service:7779
4. results parsed → trackedObjects Map updated

**Bridge status exposed:** via getBridgeStatus() — connected, lastSuccess, failureCount, liftedEntities count

---

### 3.7 yolo_service.py — Port 7779

**Purpose:** YOLOv8 object detection. Preloads model at startup, serves HTTP POST requests.

**Model:** yolov8n.pt (6.5MB nano model for fast inference)

**POST /detect:**
- Accepts: { image: '<base64_or_path>', confidence: 0.5 }
- Returns: { count, objects: [{class, conf, bbox, center}], success }
- Handles data URI format (data:image/png;base64,...)

**Model caching:** Model loaded once via `load_model()`, thread-safe with model_lock

**Dual backend support:** CAP_DSHOW (Windows DirectShow) → CAP_MSMF (Windows Media Foundation) fallback if first fails

**GET /health:** Returns {status, model, port}

**Note:** Pure inference service, no connection to rest of PURPCLAW stack except via vision_monitor.js

---

### 3.8 simple_bridge.py — Port 7777

**Purpose:** Avatar control bridge. HTTP POST endpoint forwarding to Electron avatar on port 9999 via TCP.

**Avatar monitoring thread:** Background thread pings port 9999 every 10s to detect avatar connection status. Sets `avatar_connected` flag.

**Socket pool:** `_get_cached_socket()` + `_pool_socket()` for connection reuse. Probes socket liveness before reuse.

**POST /command:** Parses JSON command, forwards to avatar via TCP, returns avatar response or simulated success if offline

**Commands forwarded:** switch_character, animate, speak, idle, walk, sit, teleport

**GET /status:** Returns {status, avatar_connected, port}

**Note:** No connection to EventBus. Pure TCP bridge to external avatar process.

---

## PART 4: COMPANION CHORUS — FULL ANATOMY

### companion-chorus/main.js — CLI Companion Launcher

**Purpose:** Standalone CLI for rolling and managing companion roster. Not a PM2 service.

**Gacha roll:** 5 companions rolled (one per rarity tier: common, uncommon, rare, epic, legendary)

**Companion config:** Saved to `.companion-chorus/companions.json`

**Animation loop:** 2-second interval, 15% chance random companion speaks, 2s delay first words

**ASCII sprites:** From BODIES imported from src/sprites.js (Claude Code leak)

**MiniMax AI:** generateResponse() + generateCritique() for personality-driven code commentary

**Active companion:** Only the active (focused) companion speaks via TTS. Others just print.

---

### companion-chorus/bridge.js — PM2 Service

**Purpose:** EventBus-driven companion reactions. Companion Chorus as a live service.

**Context loading:** .companion-context.json + unified_state.js:7783

**PERSONALITY_MAP stats:**
```javascript
{ chaos, snark, wisdom, patience } — 0-100 per species
```

**getCompanionForAgent() mapping:** 40+ agent→species mappings

**Event reaction types:** spawned, completed, failed, shaman_phase, shaman_message

**3-second throttle:** Prevents companion spam

---

### companion-chorus/src/ — Claude Code Leak DNA

**sprites.ts:** ASCII art for all 18 species with frame animation (getFrameCount, BODIES array)
**companion.ts:** Gacha roll system, rarity probabilities, bones generation
**gacha.ts:** rollCompanion() function with seed-based deterministic roll, displayCompanion() formatter
**voice.ts:** speak() and announceCompanion() TTS functions (Kokoro integration)
**minimax.ts:** generateCritique() and generateResponse() via MiniMax AI
**constants.ts:** RARITIES, RARITIES_WEIGHT, SPECIES, EYES, HATS, STAT_NAMES from Claude Code leak

---

## PART 5: SUB-DIRECTORIES AND THEIR CONTENTS

### lib/
```
puppeteer.ts     — Puppeteer browser automation utility
utils.ts         — Shared utilities
xiaozhi_bridge.ts — Xiaozhi MCP bridge utilities
```

### skills/ (25 agent skill directories)
Each directory contains skill modules for that agent's domain. Skills_registry.json maps agent names to their skill directories.

### skills/registry.txt and dirs.txt
Agent-to-skill-directory mappings and directory listing.

### skills/skill_manager.js
Manages skill loading and invocation.

### skills/task_manager.js
Manages skill task queuing and execution.

### skills/claw/
Contains claw tools: interactive_shell.js (repl), socket_rig.js (avatar control), street_builder.js (3D building), test_skill.js, axolotl, bee, bunny, etc. — individual agent skill implementations.

### steering/steering/ (16 steering files)
Auto-injected into every agent prompt (inclusion: auto):
```
patterns.md, security.md, testing.md, performance.md, etc.
```

Manual include (inclusion: manual): dev-mode, review-mode, research-mode

### app/ — Next.js frontend

### components/ — React components

### data/ — Static data files

### hooks/ — Hook scripts (ChatRenderer, CompanionSpawner, etc.)

### scripts/
```
nanoclaw.js      — NanoClaw v2 REPL (session-aware REPL around claude -p)
ecc.js           — ECC selective-install command system
```

### steering/
```
SPEC.md          — Steering specification
ai-test-output.txt
```

### companion-chorus/ (see Part 4)

### agent_work/
Per-agent work directories created at runtime.

### swarm_jobs/, swarm_job_allocation/
Swarm job management directories.

### openclaw-persona-forge-references/
Persona forge references (identity-tension, boundary-rules, naming-system, avatar-style)

### trip_logs/
Digital Shaman trip logs from creative sessions.

---

## PART 6: INTEGRATION POINTS — HOW SERVICES TALK TO EACH OTHER

### EventBus Hub (7782)
All services publish to EventBus. No service calls another directly (except bridge_7792→controlAPI, vision_monitor→yolo_service/bridge).

```
unified_api.js ──publish──→ EventBus ←──subscribe── companion-chorus/bridge.js
orchestrator.js ─publish──→          ←──subscribe── metrics_aggregator.js
agent_tower.js ─publish──→           ←──subscribe── companion-chorus/bridge.js
metrics_aggregator.js ──publish──→   ←──subscribe── unified_api.js
autonomous_diagnostics.py ─publish→ ←──subscribe── (local EventBus only)
```

### State Store (7783)
Services update state AND publish to EventBus (state.store publishes state.* events).

### Orchestrator → Agent Tower
Orchestrator routes to agent_tower.js via HTTP. Agent Tower spawns agents and broadcasts agent.* events.

### Vision Monitor → Neuro-Symbolic Bridge
HTTP POST to port 7884 on detection events. Bridge health checked every 30s.

### Vision Monitor → YOLO Service
HTTP POST to port 7779 with base64 frame for detection.

### Simple Bridge → Avatar
TCP socket to port 9999. Background ping thread every 10s.

### Autonomous Diagnostics → Unified EventBus
Subscribes to system.health from unified_eventbus.js (7782).
Publishes diagnostic.up/down events to unified_eventbus.

### Memory Matrix v2 → Symbolic Rules Engine
Via neuro_symbolic_bridge.py. Memory atoms lifted to symbolic form for rule evaluation.

### Companion Chorus Bridge → EventBus + State Store
Reads from state store for context, subscribes to EventBus for events, reacts with speech.

---

## PART 7: CRITICAL PATTERNS — SPAWN BOMB PREVENTION

### Pattern 1: Node.js detached spawn
```javascript
const stdoutFd = fs.openSync(stdoutFile, 'a');
const stderrFd = fs.openSync(stderrFile, 'a');
spawn(cmd, args, {
  cwd: workDir,
  detached: true,
  stdio: ['ignore', stdoutFd, stderrFd],
  env: { ...process.env }
});
child.unref();
```
**Wrong:** `stdio: ['pipe','pipe','pipe']` without unref — pipes tether parent to child.
**Correct:** file-based fd + detached + unref.

### Pattern 2: Python detached spawn (run_py.js)
```javascript
spawn(PYTHONW_EXE, [scriptPath, ...args], {
  detached: true,
  stdio: 'ignore',
  shell: false,
  windowsHide: true
});
child.unref();
```
Uses pythonw.exe (no console window), detached + ignore + unref.

### Pattern 3: EventBus reconnection (exponential backoff)
```javascript
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;
function getDelay(attempts) {
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempts), MAX_DELAY_MS);
}
// On disconnect: setTimeout(connect, getDelay(attempts++))
```

### Pattern 4: Bridge lift deduplication
```javascript
const dedupKey = `${objType}_${Math.floor(now / 10000)}`;
// Only lift if not in Set, prune entries older than 30s
```

---

## PART 8: IDENTIFIED ISSUES AND GAPS

### Issue 1: No Direct Agent-to-Agent Messaging (P0 — CRITICAL)
**Files:** agent_tower.js, orchestrator.js
**Problem:** No `sendToAgent(agentId, message)` method. Agents only broadcast to EventBus. Coordinator pattern (coordinatorMode.ts from Claude Code) requires the coordinator to send continuation messages to specific workers.
**Fix:** Add `sendToAgent(agentId, message)` to agent_tower.js that writes a continuation file the agent polls.

### Issue 2: No Swarm Coordinator (P0 — CRITICAL)
**File:** orchestrator.js (AGENT_BY_INTENT.swarm)
**Problem:** `swarm` intent routes to `['coordinator']` but no coordinator agent exists. No swarm_coordinator.js service.
**Fix:** Create swarm_coordinator.js that implements the coordinatorMode.ts pattern — spawns workers, synthesizes findings, continues workers with precise specs.

### Issue 3: No Memory Consolidation (autoDream equivalent) (P1)
**File:** memory_matrix_v2.py
**Problem:** Memory matrix stores memories but no automatic consolidation. No 24hr idle + 5-session gates. No lock file pattern.
**Fix:** Integrate lock file + 4-phase consolidation prompt from Claude Code autoDream.ts into purpclaw-memory service.

### Issue 4: No Adversarial Verification (P1)
**File:** gatekeeper.js
**Problem:** Pure pattern-matching static analysis only. verificationAgent.ts (Claude Code) runs actual commands to try to BREAK code.
**Fix:** Add verificationAgent.ts as post-build step in gatekeeper.js or new purpclaw-verifier service.

### Issue 5: No Session Continuity (KAIROS pattern) (P2)
**File:** companion-chorus/bridge.js (Open Issue #1)
**Problem:** Companion context only reloaded at startup. If EventBus goes down, chorus loses activeAgents + recentEvents.
**Fix:** Add KAIROS_ACTIVE() check and session state recovery on EventBus reconnect.

### Issue 6: ethics_hooks.js Logic is Simplified (Medium)
**File:** ethics_hooks.js
**Problem:** ethic_core.ts was deleted (orphaned), loop_of_shame.py is stub (3 lines), mutagen.ts exists but inline logic is simplified.
**Fix:** Re-integrate proper ethic_core.ts if ethics module is critical, otherwise simplify further to just EventBus hooks.

### Issue 7: No Forked Subagent with Message Streaming (runForkedAgent equivalent) (P2)
**File:** agent_tower.js
**Problem:** Spawns detached CLI agents but no true forked subagent with message streaming back. autoDream uses runForkedAgent() — a Claude Code internal.
**Fix:** Could replicate via SSE output polling + EventBus, or add `spawnForkedAgent()` method.

### Issue 8: EventBus is Single Point of Failure (Medium — Open Issue #2)
**File:** unified_eventbus.js
**Problem:** No secondary fallback if EventBus goes down.
**Fix:** Add in-process fallback queue that drains to EventBus when reconnected.

---

## PART 9: THE COORDINATOR GAP — HOW TO BRIDGE IT

The single highest-value integration is coordinatorMode.ts from Claude Code:

**What it does that PURPCLAW can't:**
1. Coordinator is itself an LLM agent
2. Receives `<task-notification>` XML blocks from workers
3. SYNTHESIZES findings (understands before delegating)
4. Crafts precise implementation specs with file:line
5. Continues Worker A OR spawns Worker B with the exact spec

**What PURPCLAW has:** SAMANTHA routes → agents execute → EventBus broadcasts results

**What's missing:** No one SYNTHESIZES. Anyone can listen to EventBus but no agent is tasked with understanding.

**Fix path:**
1. Add `sendToAgent(agentId, message)` to agent_tower.js — write to agent's stdin/continuation file
2. Create swarm_coordinator.js service that:
   - Acts as a coordinator LLM
   - Spawns worker agents via agent_tower.js
   - Receives worker results via EventBus
   - Synthesizes findings
   - Continues workers with precise file:line specs via sendToAgent()
   - Manages task queue and worker lifecycle

**This is the architectural gap that separates "agent router" from "true multi-agent intelligence."**

---

## PART 10: OPEN ISSUES SUMMARY (from CLAUDE.md)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Companion context only reloaded at startup | Medium | Unfixed |
| 2 | EventBus (7782) is SPoF | Medium | Unfixed |
| 3 | Division agent Node.js fallback stub has no timeout | Low | Unfixed |
| 4 | No explicit "mission complete" callback to user | Low | Unfixed |
| 5 | Vision monitor bridge lift not runtime-tested | Low | Unfixed |
| 6 | ethics_hooks.js simplified (etich_core.ts deleted) | Medium | Unfixed |
| 7 | No sendToAgent() — can't continue specific workers | P0 | Unfixed |
| 8 | No swarm coordinator — swarm intent non-functional | P0 | Unfixed |

---

## PART 11: FILES THAT ARE ORPHANED/DELETED (from FILE_AUDIT.md)

The following were deleted in 2026-04-18 cleanup:
ball_to_rig_bridge.js, launcher.js, mood_engine.js, playwright_compatibility.js, purpclaw.js, purpclaw_cli.js, screen-manager.js, shaman_prompts.js, swarm_scheduler.js, tool_diagnostic.js, test-ai.js, test-api.js, ethic_core.ts

**Leftover references to fix:**
- ethics_hooks.js still references ethic_core.ts (but has inline fallback)
- ethics_hooks.js still references mutagen.ts (file exists but inline logic replaces it)
- ethics_hooks.js still references loop_of_shame.py (file exists but stub only)

---

## PART 12: EVERY PORT AND WHAT LISTENS ON IT

```
3000  — Next.js dev server (purpclaw-nextjs)
7777  — simple_bridge.py (avatar TCP relay)
7779  — yolo_service.py (YOLOv8 detection)
7780  — unified_api.js (main API + Digital Shaman + Xiaozhi MCP)
7781  — voice_coordinator.js (TCP voice commands)
7782  — unified_eventbus.js (pub/sub SSE)
7783  — unified_state.js (state namespaces)
7784  — orchestrator.js (intent routing + workflow)
7785  — modal_logic_engine.py (Kripke models)
7786  — autonomous_diagnostics.py (causal diagnosis)
7787  — symbolic_rules_engine.py (Datalog rules)
7790  — agent_tower.js (agent registry + spawn)
7791  — gatekeeper.js (pre-merge validation)
7792  — voice_bridge_7792.js (WebSocket ↔ TCP relay)
7880  — memory_matrix_v2.py (vector memory + temporal)
7889  — vision_monitor.js (webcam + YOLO + bridge lift)
7884  — neuro_symbolic_bridge.py (lift/ground)
7890  — metrics_aggregator.js (health polling + log tail)
8092  — voice_bridge_7792.js health endpoint (+1000 from 7792)
9999  — Electron avatar process (external, not PURPCLAW)
```

---

## PART 13: THE NEURO-SYMBOLIC STACK — FULL DATA FLOW

```
Vision Monitor (7889)
  └─→ YOLO Service (7779) — object detection
       └─→ Vision Monitor — tracked objects + scene changes

Vision Monitor (7889)
  └─→ Neuro-Symbolic Bridge (7884) — /lift/entity + /lift/pattern
       └─→ Modal Logic Engine (7785) — epistemic/temporal reasoning
            └─→ Symbolic Rules Engine (7787) — Datalog rule evaluation

Memory Matrix v2 (7880)
  └─→ Neuro-Symbolic Bridge (7884) — memory atom lift
       └─→ Modal Logic Engine (7785)
            └─→ Symbolic Rules Engine (7787)

Autonomous Diagnostics (7786)
  └─→ Unified EventBus (7782) — subscribes to system.health
  └─→ Unified EventBus (7782) — publishes diagnostic.up/down

All Services
  └─→ Unified EventBus (7782) — event publication
  └─→ Unified State Store (7783) — state updates
```

---

*End of PURPCLAW Complete Architecture — Generated 2026-04-20*
*Every file catalogued. Every port mapped. Every gap identified.*