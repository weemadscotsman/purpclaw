# PURPCLAW Dormant Backends — Wire Status
**Updated:** 2026-05-24 — post-wiring session

## Status Summary

| Service | File | Port | PM2 | Wired | Notes |
|---------|------|------|-----|-------|-------|
| Symbolic Rules Engine | `symbolic_rules_engine.py` | 7787 | ✓ | ✓ | Cognitive client calls after task completion |
| Autonomous Diagnostics | `autonomous_diagnostics.py` | 7786 | ✓ | ✓ | `reportEvent` on workflow failure |
| Modal Logic Engine | `modal_logic_engine.py` | 7785 | ✓ | ✓ | Modal state updates wired |
| Context Packet | `lib/context-packet.js` | — | — | ✓ | Write path fixed 2026-05-24 |
| Memory Matrix | `memory_matrix_v2.py` | 7880 | ✓ | partial | Needs `faiss-cpu` — degrades silently without |
| Neuro-Symbolic Bridge | `neuro_symbolic_bridge.py` | 7884 | ✓ | ✗ | Not called from orchestrator |
| Companion Swarm | `companion_swarm.js` | — | — | ✓ | `buildAgentPrompt` wired in spawnAgent |
| Governance | `lib/governance.js` | — | — | ✓ | `appendApproval` called on completeWorkflow + failWorkflow |
| Proactive Maintenance | `lib/proactive-maintenance.js` | — | — | ✓ | `proposeMaintenanceJobs` + `recordProposal` on completeWorkflow + failWorkflow |
| Digital Shaman | `digital_shaman.js` | — | — | ✗ | Not imported anywhere |
| Ethics Hooks | `ethics_hooks.js` | — | — | partial | Loaded, `preflightCheck` called, result is logged not enforced |
| Locked Interfaces | `locked_interfaces.js` | — | — | partial | Loaded, not called — permissions are suggestions not gates |
| Gatekeeper | `gatekeeper.js` | 7791 | ✗ | ✗ | Runs HTTP server, not in PM2 |
| AutoDream | `autoDream.py` | — | ✗ | ✗ | Needs scheduler/cron trigger |
| Puppeteer | `lib/puppeteer.ts` | — | ✗ | ✗ | Not wired |
| Xiaozhi Bridge | `lib/xiaozhi_bridge.ts` | — | ✗ | ✗ | Not wired |

## Services Still Cold — High Value Next Targets

### gatekeeper.js — :7791
HTTP server, runs independently. Not in PM2.
```bash
node gatekeeper.js --server  # starts on 7791
```
PM2 entry needed:
```javascript
{
  name: 'purpclaw-gatekeeper',
  script: './gatekeeper.js',
  args: '--server',
  exec_mode: 'fork',
  wait_ready: false,
  kill_timeout: 5000,
  max_restarts: 2,
  restart_delay: 10000,
  max_memory: '64MB',
  autorestart: true,
  windowsHide: true
},
```

### digital_shaman.js
4-phase creativity engine (come_up → peak → comedown → integration) with temperature curves and entropy scoring. Exports `DigitalShaman`, `TRIP_CONFIGS`, `AUTO_STEERING_PROMPTS`. Not imported anywhere. Natural trigger: when agent output coherence score is too high. Architecture: evaluate coherence → if above threshold, route through shaman trip.

### ethics_hooks.js — conscience pre-flight
Loaded in orchestrator (line ~44). `preflightCheck()` called in `spawnAgent` before dispatch. Returns error and blocks dispatch if not allowed — the guard IS functional. Check `glitch_manifest.md` in PURPCLAW root for directive definitions.

### locked_interfaces.js
Tier-based tool permissions. Loaded but not called. To wire: call `lockedInterfaces.checkToolAccess(agentName, toolName)` in tool dispatch path. Permissions are currently suggestions — not enforced gates.

### autoDream.py
Memory consolidator: dedup + rule extraction + archival. No scheduler. Natural trigger: memory matrix entry count >5000. To wire: add threshold check in memory ingest path, or PM2 wrapper service polling entry count.

### companion_swarm.js — already wired this session
`buildAgentPrompt(agentName, task, agentInfo)` now called in `spawnAgent` for every single-agent dispatch. Prepends AGENT.md/SKILL.md/GOALS.md/PROTOCOLS.md. Works for all agents with a `skills/<agentName>/` directory.

## Memory Matrix — faiss installation

```bash
pip install faiss-cpu sentence-transformers
```
Without faiss, `memory_matrix_v2.py` starts but recall/ingest silently return empty results. Test:
```bash
curl -s http://127.0.0.1:7880/health
curl -s -X POST http://127.0.0.1:7880/ingest -H "Content-Type: application/json" \
  -d '{"content":"test memory","source":"test","importance":0.5}'
curl -s -X POST http://127.0.0.1:7880/recall -H "Content-Type: application/json" \
  -d '{"query":"test","limit":3}'
```

## Cognitive Services — Quick Verification

```bash
curl -s http://127.0.0.1:7787/health   # rules engine
curl -s http://127.0.0.1:7786/health   # diagnostics
curl -s http://127.0.0.1:7785/health   # modal logic

# Assert a fact
curl -s http://127.0.0.1:7787/assert -X POST -H "Content-Type: application/json" \
  -d '{"predicate":"test","terms":["hello"],"provenance":"hermes"}'

# Query facts
curl -s http://127.0.0.1:7787/query -X POST -H "Content-Type: application/json" \
  -d '{"predicate":"test","terms":[]}'

# Report an event
curl -s http://127.0.0.1:7786/event -X POST -H "Content-Type: application/json" \
  -d '{"source":"orchestrator","event":"test","severity":"info","data":{}}'
```

## Orchestrator Lifecycle Hooks — What Fires When

After `completeWorkflow()` (success path):
1. `circuitBreaker.recordSuccess(agentName)`
2. `memClient.postTask()` — if memory matrix running
3. `cogClient.assertFact('completed_task')` + `cogClient.assertFact('successful_agent')`
4. `governance.appendApproval()` — writes to approval ledger
5. `proactiveMaintenance.shouldRun()` + `proposeMaintenanceJobs()` + `recordProposal()` — max 1/hour

After `failWorkflow()` (failure path):
1. `circuitBreaker.recordFailure(agentName)`
2. `memClient.postTask()` + `memClient.react()`
3. `cogClient.reportEvent()` — reports workflow_failed with severity error
4. `governance.appendApproval()` — writes failure to ledger
5. `proactiveMaintenance.shouldRun()` + `proposeMaintenanceJobs()` + `recordProposal()` — max 1/5min on failure

## Context-Packet Write Bug (FIXED 2026-05-24)

Location: `orchestrator.js` inside `spawnTeamIndividually()`, after each `/api/spawn/await` success response.
Bug: Orchestrator read handoffs correctly but NEVER WROTE agent outputs back. Support agents got empty prior context.
Fix: Added after `result.success` check:
```javascript
if (contextPacket) {
  contextPacket.write(workflowId, agentName, result.output || '', {
    intent, role, success: true,
  });
}
```

## Ecosystem.config.js Deduplication (FIXED 2026-05-24)

Previous state: purpclaw-diagnostics and purpclaw-rules each appeared TWICE. Fixed — one entry per service, alphabetical order.