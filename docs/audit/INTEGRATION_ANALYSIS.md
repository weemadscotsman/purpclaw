# PURPCLAW x Claude Code Hidden Features — Integration Analysis
**Date:** 2026-04-20
**Goal:** Cross-reference what's in PURPCLAW vs the newly discovered Claude Code hidden systems

---

## WHAT'S ALREADY BUILT INTO PURPCLAW ✅

### Architecture
- **18 PM2 services** across Node.js + Python neuro-symbolic stack
- **30+ agents** in SAMANTHA (Specific Autonomous Multi-Agent Network for Thoughtful Home Assistance)
- **9 divisions**: Intelligence, Engineering, Security, Infrastructure, Media Ops, Management, Science, Creative, Operations
- **Agent Tower** (agent_tower.js) — spawns via Kimi CLI/OpenClaude with role injection
- **Orchestrator** (orchestrator.js) — priority queue, self-healing, circuit breakers
- **Companion Chorus** — species-based reactions (duck, dragon, goose, etc.)
- **Neuro-symbolic brain** — memory_matrix_v2, modal_logic_engine, neuro_symbolic_bridge, symbolic_rules_engine, autonomous_diagnostics
- **Ethics module** (GLITCH_01) — mutagen, loop_of_shame, glitch_manifest

### Already Integrated (from agent-frameworks harvest 2026-04-20)
| Layer | Status | Details |
|---|---|---|
| Layer 1 — Agent Tower Registry + KIRO_AGENT_ROLES | ✅ DONE | agent_tower.js lines 26-58 |
| Layer 2 — Prompt Pipeline | ✅ DONE | buildAgentPrompt() |
| Layer 3 — Skills (5 ECC skills) | ✅ DONE | skills_registry.json |
| Layer 3b — WebDev Tool Access | ✅ DONE | spinUpAgent.js |
| Layer 4 — Context Modes | ✅ DONE | detectContextMode() |
| Layer 5 — Companion Chorus | ✅ DONE | bridge.js |
| Layer 6 — Production Loop routing | ✅ DONE | orchestrator.js AGENT_BY_INTENT |
| Steering Files (auto-include) | ✅ DONE | loadAutoSteering() |
| ECC Harvest (scripts, nanoclaw, enterprise ops) | ✅ DONE | scripts/ + skills_registry.json |

---

## NEW Claude Code SYSTEMS DISCOVERED (NOT YET in PURPCLAW) ❌

### 1. coordinatorMode.ts — Multi-Agent Swarm Orchestration ⭐ CRITICAL
**What it does:**
- Full swarm orchestration system — one coordinator agent spawns multiple worker agents
- Workers communicate via `SendMessageTool` (direct agent-to-agent messaging)
- Task notifications arrive as XML blocks (`<task-notification>`, `<task-assessment>`, `<tool-call>`)
- Scratchpad directory per swarm for shared files
- Coordinator maintains task queue, workers pick up tasks

**Why it matters for PURPCLAW:**
PURPCLAW's orchestrator.js routes tasks to single agents. coordinatorMode.ts adds **multi-agent collaboration** — e.g., a "code review" intent could spawn a coordinator that queues up robot (code-reviewer) + ghost (security-reviewer) + owl (security-scan) as workers, coordinating their findings.

**Integration point:** `orchestrator.js` — add COORDINATOR intent routing that uses coordinatorMode.ts pattern

### 2. autoDream + DreamTask — Background Memory Consolidation ⭐ HIGH VALUE
**What it does:**
- Fires `/dream` prompt as forked subagent when: 24+ hours since last dream AND 5+ sessions
- 4-phase consolidation: Orient → Gather → Consolidate → Prune
- Disabled in KAIROS mode (session continuity flag)
- DreamTask makes auto-dream state visible in UI (phase, sessions reviewing, files touched, turns)

**Why it matters for PURPCLAW:**
PURPCLAW has a Memory Matrix brain but no automatic memory consolidation. autoDream could integrate with the neuro-symbolic stack to periodically review recent events, consolidate learnings, and update agent knowledge bases.

**Integration point:** `purpclaw-memory` service or new `purpclaw-dreamer` service

### 3. verificationAgent.ts — Adversarial Verification Specialist ⭐ HIGH VALUE
**What it does:**
- Tries to BREAK code, not confirm it works
- Runs actual commands, not just reads code
- Prohibited from modifying project files
- Required output format: `### Check: [name]\n**Command run:**\n**Output observed:**\n**Result:**`
- Must run at least one adversarial probe (concurrency, boundary, idempotency, orphan ops)
- Ends with `VERDICT: PASS/FAIL/PARTIAL`

**Why it matters for PURPCLAW:**
PURPCLAW's gatekeeper.js does pre-merge validation. Adding verificationAgent as a post-build adversarial testing layer would catch the "last 20%" — half-broken buttons, state that vanishes on refresh, backend crashes on bad input.

**Integration point:** `gatekeeper.js` or new `purpclaw-verifier` service

### 4. KAIROS Feature Flag System — Session Continuity
**What it does:**
- `KAIROS` — master session continuity flag
- `KAIROS_BRIEF` — condensed session summaries
- `KAIROS_CHANNELS` — multi-channel support
- `KAIROS_DREAM` — auto-dream trigger
- `KAIROS_ACTIVE()` check gates memory consolidation in autoDream

**Why it matters for PURPCLAW:**
PURPCLAW Open Issue #1: "Companion context only reloaded at startup." KAIROS system shows the pattern — a session continuity flag that gates when auto-dream fires. PURPCLAW could adopt `KAIROS_ACTIVE()` pattern to fix context reload.

**Integration point:** `companion-chorus/bridge.js` — add KAIROS-style session state recovery

### 5. 70+ Feature Flags — Architecture Blueprints
**Key flags worth adopting:**
| Flag | What It Enables | PURPCLAW Analog |
|---|---|---|
| `AGENT_TRIGGERS` | Event-driven agent spawning | EventBus `agent.spawned` |
| `TEAMMEM` | Shared team memory across agents | Memory Matrix |
| `FORK_SUBAGENT` | Agent can spawn sub-agents | AgentTool in Tower |
| `AGENT_MEMORY_SNAPSHOT` | Snapshot agent memory on context switch | Not built |
| `ULTRAPLAN` | 30-min Opus session for planning | dragon planner |
| `ULTRATHINK` | Deep reasoning mode | neuro-symbolic stack |
| `VERIFICATION_AGENT` | Built-in adversarial tester | Not built |
| `DAEMON` | Background daemon mode | PM2 services |
| `VOICE_MODE` | Voice interaction | purpclaw-voice (7781) |

### 6. Undercover Mode — Public Repo Safety
**What it does:**
- Strips Anthropic internal info from code (model codenames Capybara/Tengu, internal repo names, Co-Authored-By lines)
- Auto-activates unless repo in allowlist

**Why it matters for PURPCLAW:**
Not immediately needed, but the `undercover.ts` utility could be integrated into `gatekeeper.js` to sanitize output before shipping.

---

## INTEGRATION PRIORITY MATRIX

| System | Priority | Effort | Value | Status |
|---|---|---|---|---|
| coordinatorMode.ts swarm system | P0 | High | Massive | NOT integrated |
| autoDream memory consolidation | P1 | Medium | High | NOT integrated |
| verificationAgent adversarial testing | P1 | Medium | High | NOT integrated |
| KAIROS session continuity pattern | P2 | Medium | Medium | Open Issue #1 |
| Feature flag architecture (AGENT_TRIGGERS, TEAMMEM) | P2 | Low | Medium | Partial |
| Undercover mode sanitization | P3 | Low | Low | Not needed yet |

---

## RECOMMENDED INTEGRATION PLAN

### Phase 1: Coordinator Mode Swarm (P0)
```
1. Copy coordinatorMode.ts → PURPCLAW/lib/
2. Create swarm_coordinator.js service (or integrate into orchestrator.js)
3. Add "swarm" intent to AGENT_BY_INTENT:
   swarm: ['coordinator'] → spawns coordinator which queues workers
4. Workers use existing SendMessage (via EventBus) for inter-agent comms
```

### Phase 2: autoDream Memory Brain (P1)
```
1. Copy autoDream/ + DreamTask/ → PURPCLAW/lib/
2. Create purpclaw-dreamer.js (PM2 service) or integrate into purpclaw-memory
3. Wire to memory_matrix_v2 for consolidation storage
4. Gate on KAIROS-style flag (optional)
5. Trigger: 24hr idle + 5 sessions
```

### Phase 3: Verification Agent (P1)
```
1. Copy verificationAgent.ts → PURPCLAW/lib/verification/
2. Integrate into gatekeeper.js as post-build adversarial check
3. Or create purpclaw-verifier.js service
4. Run after: build, test suite, deployment
```

### Phase 4: KAIROS Session Continuity (P2)
```
1. Add KAIROS_ACTIVE() check to bridge.js
2. On EventBus reconnect: reload activeAgents + recentEvents from state store 7783
3. Fixes Open Issue #1
```

---

## FILES TO COPY FROM agent-frameworks/

```
FROM: C:\Users\Admin\Desktop\agent-frameworks\
TO:   C:\Users\Admin\Desktop\PURPCLAW\

coordinatorMode.ts          → lib/coordinator_mode.ts
autoDream/                   → lib/auto_dream/
DreamTask/                   → lib/dream_task/
verificationAgent.ts         → lib/verification/agent.ts
```

---

## WHAT'S MISSING FROM THE HARVEST

Based on the 70+ feature flags found, these Claude Code systems exist but haven't been copied to agent-frameworks/:
- The full `.kiro` hidden agent framework (agents/, memory/, memoryTypes.ts)
- SleepTool (not useful)
- MoreRight stub (external builds only)
- Undercover mode utility
- The full memdir memory system (user/feedback/project/reference types)

The biggest gap: **coordinatorMode.ts** — it's a complete multi-agent swarm system that PURPCLAW doesn't have an equivalent to. SAMANTHA routes to individual agents; coordinatorMode adds a layer that coordinates multiple workers on a shared task.
