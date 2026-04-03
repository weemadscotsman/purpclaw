# PURPCLAW Wiring Fixes — 2026-05-24 (evening session)

## What got wired this session

### 1. context-packet write path (orchestrator.js line ~1869)
**Problem:** `spawnTeamIndividually()` had `contextPacket.init()` and `contextPacket.readHandoff()` correct. Support agents (robot, bee) received prior outputs. BUT after each agent completed successfully, the orchestrator never called `contextPacket.write()`. So the write step was missing.

**Fix:** After each `result.success` check in the team agent loop:
```javascript
if (contextPacket) {
  contextPacket.write(workflowId, agentName, result.output || '', {
    intent,
    role,
    success: true,
  });
}
```
Now dragon's output is saved to `agent_work/<workflowId>/dragon.out` before robot runs.

### 2. Governance → completion ledger (completeWorkflow + failWorkflow)
**Problem:** `governance.appendApproval()` was only called for pending approval requests. Completed and failed workflows were not logged.

**Fix:** Added to `completeWorkflow()` and `failWorkflow()`:
```javascript
if (governance) {
  governance.appendApproval(__dirname, {
    id: `completed-${workflowId}`,
    workflowId, command, jobType, risks,
    status: 'completed'|'failed', agent, duration,
    decidedAt: new Date().toISOString(),
  });
}
```
Ledger at `agent_work/approval_requests.jsonl` now tracks every workflow decision.

### 3. Proactive maintenance → task lifecycle (completeWorkflow + failWorkflow)
**Problem:** `lib/proactive-maintenance.js` was loaded but `proposeMaintenanceJobs()` was never called from the orchestrator's task lifecycle.

**Fix in completeWorkflow():**
```javascript
if (proactiveMaintenance) {
  if (proactiveMaintenance.shouldRun(__dirname, 3600000)) { // 1/hr max
    const jobs = proactiveMaintenance.proposeMaintenanceJobs(__dirname, {
      failedWorkflows: workflow.delegation?.failures?.length || 0,
      queueDepth: 0,
    });
    if (jobs.length > 0) proactiveMaintenance.recordProposal(__dirname, jobs);
  }
}
```
**Fix in failWorkflow():** Same pattern with cooldown 300000 (5 min).

### 4. Companion swarm → spawnAgent (spawnAgent function)
**Problem:** `companion_swarm.js` exports `buildAgentPrompt(agentName, task, agentInfo)` which prepends AGENT.md/SKILL.md/GOALS.md/PROTOCOLS.md to the task. Was not called from spawnAgent.

**Fix:** After building `taskDesc` in spawnAgent, before ethics check:
```javascript
try {
  const companionSwarm = require('./companion_swarm.js');
  taskDesc = companionSwarm.buildAgentPrompt(agentName, taskDesc, {});
} catch (e) { /* skip — files may not exist */ }
```
Agents with a `skills/<agentName>/` directory now get personality injection.

### 5. ecosystem.config.js deduplication
**Problem:** purpclaw-diagnostics and purpclaw-rules each appeared TWICE in the array (spread across list). purpclaw-modal appeared once. Fixed to one entry per service.

### 6. Python path hardcoded in ecosystem.config.js
**Problem:** Bare `python` in Windows bash terminal resolves to Hermes venv Python (`hermes-agent/venv/Scripts/python`), NOT system Python. Python services (yolo, memory_matrix, etc.) failed with `ModuleNotFoundError` despite deps being installed — wrong Python.

**Fix:** Hardcoded in ecosystem.config.js:
```javascript
const PYTHON_BIN = 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';
```

## Python services started this session (all confirmed healthy)

| Service | Port | Status |
|---------|------|--------|
| modal_logic_engine.py | 7785 | healthy |
| autonomous_diagnostics.py | 7786 | healthy |
| symbolic_rules_engine.py | 7787 | healthy |
| yolo_service.py | 7779 | ok (yolov8n.pt loaded) |
| memory_matrix_v2.py | 7880 | healthy (no base yet) |
| neuro_symbolic_bridge.py | 7884 | healthy |

Deps installed (system Python):
```
"C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe" -m pip install numpy opencv-python
```

## Purpclaw Forge — New this session

`lib/persona-forge.js` — new forge engine wired to `bin/purpclaw.js`:
```
purpclaw forge           # interactive
purpclaw forge Riff     # non-interactive
```

5-file bundle: SOUL.md, AGENT.md, GOALS.md, PROTOCOLS.md, SKILL.md + avatar-prompt.txt
Agents land in `skills/<slug>/` and are immediately usable by tower (tower dynamically discovers new agents).

gacha.py gained `--json` flag (UTF-8 output for CLI piping).

## kiro_EXTRACTED deleted

100% identical duplicate of `.kiro/` — `diff -rq` found zero differences. Deleted, no data loss.

## openclaw-persona-forge-references → docs/persona-forge/

Moved to `docs/persona-forge/`: naming-system.md, identity-tension.md, boundary-rules.md, output-template.md, error-handling.md, avatar-style.md