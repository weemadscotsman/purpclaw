# PURPCLAW x Claude Code — DEEP INTEGRATION ANALYSIS
**Date:** 2026-04-20
**Depth:** King-tier — architecture internals, spawn patterns, gap analysis

---

## SYSTEM ARCHITECTURE CONTRAST

### Claude Code Coordinator Mode (coordinatorMode.ts)
```
USER
  │
  ▼
COordinator Agent (isCoordinatorMode()=true)
  ├─ spawns WORKER sub-agents via AgentTool
  ├─ receives <task-notification> XML blocks back from workers
  ├─ SYNTHESIZES findings (understands before delegating)
  ├─ crafts precise implementation specs with file:line
  ├─ continues workers via SendMessageTool
  └─ reports to user
```

**Key mechanic:** The coordinator is itself an LLM agent. It receives task results as conversation messages, then decides next actions. Workers can't see the coordinator's conversation — every worker prompt must be self-contained.

**Tools the coordinator has:**
- `AGENT_TOOL_NAME` — spawn workers
- `SEND_MESSAGE_TOOL_NAME` — continue existing workers
- `TASK_STOP_TOOL_NAME` — stop workers mid-flight

**Tools workers have:**
- All standard tools (Bash, Read, Edit, Glob, Grep, Agent, etc.) minus internal tools
- Workers CAN spawn sub-agents (AgentTool) — allowing nested delegation

### PURPCLAW Orchestrator (orchestrator.js)
```
USER COMMAND
  │
  ▼
Orchestrator (HTTP API on :7784)
  ├─ parses intent via INTENT_PATTERNS
  ├─ routes to AGENT_BY_INTENT (single agent or team)
  ├─ spawns agent via agent_tower.js
  ├─ waits for completion via SSE/broadcast
  └─ responds
```

**Key mechanic:** Intent routing maps to a predetermined agent or team. Agents run independently. Results come via SSE broadcast.

**Tools agents have (via OpenClaude/Kimi CLI):**
- Standard CLI tools via spawned subprocess
- Inter-agent comms via EventBus pub/sub

**Structural difference:** PURPCLAW is a **hub-and-spoke** router. Coordinator Mode is a **two-layer LLM hierarchy** where the second layer is a manager that coordinates workers who message each other.

---

## THE ONE THING PURPCLAW CAN'T DO (AND HOW TO FIX IT)

### Gap: No Agent-to-Agent Messaging Without Coordinator

In coordinatorMode.ts, workers communicate via `SendMessageTool`:
```javascript
// Worker A reports findings
<task-notification>...result: "Found null pointer in src/auth/validate.ts:42"...</task-notification>

// Coordinator synthesizes, then continues Worker A
SEND_MESSAGE_TOOL_NAME({ to: "agent-a1b", message: "Fix the null pointer..." })

// OR spawns a new Worker B with the synthesized spec
AGENT_TOOL_NAME({ prompt: "Fix the null pointer in src/auth/validate.ts:42..." })
```

PURPCLAW agents communicate only via EventBus (pub/sub) and SSE broadcasts. There's no **direct point-to-point messaging** where Agent A can send a message to Agent B and wait for a response.

**Why this matters:** The coordinator pattern's power is:
1. Worker A does research → reports findings as XML
2. Coordinator UNDERSTANDS the findings (reads them itself)
3. Coordinator crafts a precise spec based on what Worker A found
4. Coordinator continues Worker A OR spawns Worker B with the exact spec

PURPCLAW can almost do this with EventBus — but agents broadcasting results don't guarantee the "synthesizer" role. Anyone can listen, but no one is tasked with understanding.

### Fix: Add Coordinator Mode to PURPCLAW

**Option A — Integrate into orchestrator.js:**
Add a new intent type `swarm` that triggers coordinator behavior. When intent = "swarm", orchestrator becomes the coordinator and spawns worker agents. Workers report via EventBus, orchestrator synthesizes and continues workers.

**Option B — New service `swarm_coordinator.js`:**
A standalone coordinator service (port 7793) that handles swarm workflows. orchestrator.js routes "swarm" intents to this service. This keeps orchestrator.js clean.

**Recommended: Option B** — the coordinator pattern needs a different mental model than simple task routing. Keep it separate.

### Coordinator Spawn Pattern for PURPCLAW

From coordinatorMode.ts, the coordinator uses `AGENT_TOOL_NAME` which is the standard agent spawning tool. PURPCLAW's agent_tower.js already has OpenClaude/Kimi CLI spawning. The integration point:

```javascript
// In swarm_coordinator.js
// Coordinator agent prompt built from coordinatorMode.ts system prompt
const coordinatorPrompt = buildCoordinatorPrompt(task, workers);

// Spawn coordinator as a detached agent
// Coordinator then spawns workers via SEND_MESSAGE_TOOL_NAME + AGENT_TOOL_NAME
// Worker results arrive as EventBus events or SSE
```

Workers in coordinatorMode receive task-notification XML. In PURPCLAW, worker results would come via EventBus `agent.completed` / `agent.failed` events.

---

## autoDream SYSTEM — FULL ANATOMY

### The 4-Phase Dream Prompt (consolidationPrompt.ts)

```
Phase 1 — Orient
  ls memory directory
  Read MEMORY.md (the index)
  Skim existing topic files

Phase 2 — Gather recent signal
  Daily logs (logs/YYYY/MM/YYYY-MM-DD.md)
  Existing memories that drifted (contradictions)
  Transcript grep (narrow searches only)

Phase 3 — Consolidate
  Write/update memory files
  Convert relative dates → absolute dates
  Delete contradicted facts

Phase 4 — Prune and index
  Update MEMORY.md (index, not dump)
  Remove stale pointers
  Demote verbose entries
```

### Lock File System (consolidationLock.ts)

The consolidation lock prevents double-running:
- Lock file: `.consolidate-lock` inside memory directory
- Body: PID of holder process
- mtime: IS the `lastConsolidatedAt` timestamp
- Stale after 60 minutes (HOLDER_STALE_MS)
- Rollback on failure: rewinds mtime so next cycle retries

```javascript
// Acquire lock
const priorMtime = await tryAcquireConsolidationLock()  // returns null if blocked
if (priorMtime === null) return  // another dream in progress

// Do dream work...

// On failure: rewind mtime so time-gate passes next turn
await rollbackConsolidationLock(priorMtime)
```

### The 3 Gates (autoDream.ts isGateOpen)

```javascript
function isGateOpen(): boolean {
  if (getKairosActive()) return false   // KAIROS mode: manual /dream only
  if (getIsRemoteMode()) return false   // Remote mode: no auto-dream
  if (!isAutoMemoryEnabled()) return false
  return isAutoDreamEnabled()            // GrowthBook flag: tengu_onyx_plover
}
```

### Scheduling Thresholds

```javascript
const DEFAULTS = {
  minHours: 24,      // At least 24 hours since last consolidation
  minSessions: 5     // At least 5 sessions since last consolidation
}
```

### Forked Agent Execution (autoDream.ts)

```javascript
const result = await runForkedAgent({
  promptMessages: [createUserMessage({ content: prompt })],
  cacheSafeParams: createCacheSafeParams(context),
  canUseTool: createAutoMemCanUseTool(memoryRoot),
  querySource: 'auto_dream',
  forkLabel: 'auto_dream',
  skipTranscript: true,
  overrides: { abortController },
  onMessage: makeDreamProgressWatcher(taskId, setAppState),
})
```

The dream agent runs as a FORKED subagent — meaning it's a separate process with its own context, not a continuation of the main session. `runForkedAgent` is what makes this work.

### DreamTask UI (DreamTask.ts)

Makes the forked dream agent visible in the footer pill and Shift+Down dialog:
- `phase: 'starting' | 'updating'` — flips to 'updating' when first Edit/Write lands
- `sessionsReviewing: number` — how many sessions to consolidate
- `filesTouched: string[]` — paths observed in Edit/Write blocks
- `turns: DreamTurn[]` — assistant text responses (last 30 kept)
- `abortController` — user can kill from UI

### Integration into PURPCLAW

**What's needed:**
1. A `purpclaw-dreamer.js` service (or integrate into purpclaw-memory Python)
2. Lock file at memory matrix path (`.consolidate-lock`)
3. Forked agent execution — PURPCLAW uses `spawn()` for detached CLI agents, but autoDream uses `runForkedAgent()` which is a Claude Code internal. Need to replicate the fork pattern.
4. The 4-phase consolidation prompt
5. DreamTask state tracking (phase, sessions, files touched, turns)
6. Schedule check — every N turns or on timer

**Fork pattern for PURPCLAW:**
Since PURPCLAW uses OpenClaude/Kimi CLI for agent spawning, the dream consolidation could be a spawned subagent with a special prompt that does the 4-phase consolidation. The lock file prevents double-firing.

---

## PURPCLAW GAPS — EXACT FILE LOCATIONS

### Gap 1: No Coordinator/Swarm Pattern
**File:** `orchestrator.js` lines 61-101 (AGENT_BY_INTENT)
**Problem:** Routes to single agents or static teams. No dynamic multi-agent coordination with synthesis.
**Fix:** Add `swarm` intent → `swarm_coordinator.js` service

### Gap 2: No Memory Consolidation Brain
**File:** `memory_matrix_v2.py` (existing)
**Problem:** Memory matrix stores memories but no automatic consolidation. No 24hr idle + session gates. No lock file pattern.
**Fix:** Integrate autoDream lock/consolidation logic into purpclaw-memory or new purpclaw-dreamer

### Gap 3: No Adversarial Verification Agent
**File:** `gatekeeper.js` (existing, pre-merge validation)
**Problem:** Gatekeeper checks style, imports, etc. No adversarial testing that tries to BREAK code.
**Fix:** Integrate verificationAgent.ts as post-build step in gatekeeper.js

### Gap 4: No Session Continuity (KAIROS pattern)
**File:** `companion-chorus/bridge.js` (existing)
**Problem (Open Issue #1):** "Companion context only reloaded at startup." If EventBus goes down, chorus loses activeAgents + recentEvents.
**Fix:** Add `KAIROS_ACTIVE()` check and session state recovery on EventBus reconnect

### Gap 5: No Forked Subagent (runForkedAgent)
**File:** `agent_tower.js` (existing)
**Problem:** PURPCLAW spawns detached CLI agents but not true forked subagents with message streaming back.
**Fix:** Could replicate via SSE output polling + EventBus, or add to agent_tower.js a `spawnForkedAgent()` method

---

## WHAT COORDINATOR MODE LOOKS LIKE IN PURPCLAW TERMS

If you mapped coordinatorMode.ts to PURPCLAW:

| Claude Code Concept | PURPCLAW Analog |
|---|---|
| Coordinator Agent | `swarm_coordinator.js` (new service, or orchestrator in swarm mode) |
| Worker sub-agents | Existing agents (robot, ghost, owl, etc.) |
| `AGENT_TOOL_NAME` spawn | `agent_tower.js` `spawnAgent()` |
| `SEND_MESSAGE_TOOL_NAME` | EventBus `agent.message` event + `agent_tower.js` `sendToAgent()` |
| `<task-notification>` XML | EventBus `agent.completed` / `agent.failed` events |
| Scratchpad directory | `agent_work/{swarm_id}/` shared directory |
| Worker tools (full set) | OpenClaude CLI with all tools |

**The missing piece:** `sendToAgent()` — direct agent-to-agent messaging that the coordinator uses to continue workers. Currently agents only broadcast to EventBus, not point-to-point.

---

## DEEP INTEGRATION: THE EXACT CHANGES

### Change 1: Add Direct Agent Messaging

In `agent_tower.js`, add:
```javascript
// Direct message to an active agent (continuation)
async function sendToAgent(agentId, message) {
  const agent = AGENT_TOWER.activeAgents.get(agentId);
  if (!agent) return { success: false, error: 'Agent not found' };
  
  // Write continuation message to agent's input queue
  // Agent reads from stdin or a message file
  const msgFile = path.join(agent.workDir, 'continuation.txt');
  fs.writeFileSync(msgFile, message, 'utf8');
  
  return { success: true };
}
```

This replicates `SendMessageTool` — coordinator sends a continuation message to a running worker.

### Change 2: Add Swarm Coordinator Intent

In `orchestrator.js`, add to INTENT_PATTERNS:
```javascript
{ pattern: /swarm\s+(.+)/i, intent: 'swarm', useTeam: true },
```

And route `swarm` to a new coordinator service.

### Change 3: Add Dream Consolidation to Memory Service

In `memory_matrix_v2.py` or new `purpclaw-dreamer.js`:
```javascript
// Lock file pattern
const LOCK_FILE = '.consolidate-lock';
const HOLDER_STALE_MS = 60 * 60 * 1000;

async function tryAcquireConsolidationLock() {
  // Same pattern as consolidationLock.ts
}

async function readLastConsolidatedAt() {
  // Return mtime of lock file, or 0
}
```

Then run consolidation prompt as a spawned OpenClaude subagent.

### Change 4: Integrate Verification Agent

In `gatekeeper.js`, add a post-build step:
```javascript
// Run adversarial verification
const verificationResult = await runVerificationAgent(buildOutput);
// verificationResult.verdict = 'PASS' | 'FAIL' | 'PARTIAL'
if (verificationResult.verdict === 'FAIL') {
  return { approved: false, reason: 'Adversarial probe failed', details: verificationResult };
}
```

---

## SUMMARY: WHAT'S ACTUALLY MISSING

| System | What's Built | What's Missing |
|---|---|---|
| **Swarm/Coordinator** | Agent spawning, EventBus, team templates | **Coordinator agent** that synthesizes findings and continues workers with precise specs. Direct agent messaging (`sendToAgent`). |
| **Memory Brain** | memory_matrix_v2 (storage), neuro_symbolic_bridge (reasoning) | **Auto-consolidation** (24hr idle + 5 sessions gate, lock file, 4-phase dream prompt, DreamTask UI) |
| **Verification** | gatekeeper.js (style/import checks) | **Adversarial testing** (verificationAgent.ts pattern — runs actual commands, tries to break, adversarial probes) |
| **Session Continuity** | EventBus + state store | **KAIROS pattern** — session continuity flag, auto-dream gate, context recovery on reconnect |
| **Forked Agents** | Detached CLI spawn with file polling | **True forked subagent** with message streaming back (runForkedAgent equivalent) |

The single highest-value integration is **coordinatorMode.ts** — it's a complete system for multi-agent collaboration that PURPCLAW has no equivalent for. SAMANTHA routes; coordinatorMode coordinates.
