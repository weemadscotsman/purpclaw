# Snapshot-Based Rollback (PURPCLAW — 2026-05-23)

## What it does

Every workflow admitted to the orchestrator gets a pre-execution snapshot recorded in `agent_work/.snapshots/<workflowId>.snap.json` BEFORE any work begins. This gives a deterministic rollback point — if something goes wrong, the system can see exactly what changed.

## How it works

`lib/snapshot.js` provides:

```javascript
createSnapshot(workflowId, command, contractType, options) → snapFile
listSnapshots(limit = 20) → [snap]
getSnapshot(workflowId) → snap | null
diffSnapshot(workflowId) → { changed, missing, intact }
snapshotCount() → number
```

## Snapshot format

```json
{
  "workflowId": "job-12345",
  "createdAt": "2026-05-23T14:58:34.000Z",
  "command": "audit the stack and fix anything broken",
  "contractType": "code",
  "files": [],
  "configState": {
    ".env": { "hash": "a3f1...", "size": 2048 },
    "policies.json": { "hash": "b7c2...", "size": 512 },
    "service_registry.js": { "hash": "d4e8...", "size": 4096 },
    "ecosystem.config.js": { "hash": "f9a1...", "size": 1024 }
  }
}
```

- `configState` tracks SHA-256 hashes of critical runtime files at admission time
- `files` array captures custom file paths specified by the job contract
- Immutable — written once, never overwritten

## Wire point in orchestrator

```javascript
// In orchestrator.js, at workflow admission (just before activeWorkflows.set):
const snapshot = require('./lib/snapshot.js');
snapshot.createSnapshot(workflowId, actualCommand, workflow.contract?.type || 'unknown');
```

This fires at every new workflow regardless of risk classification — even read-only jobs get snapshots (low cost, high value for debugging).

## Current status

Rollback surface is implemented but rollback-undo is not yet wired to actually restore files. The `purpclaw rollback list` command reads `.snapshots/` directory. To complete the loop:

1. When a job completes successfully → mark snapshot as `deployed`
2. When governance detects a self-change failure (service health drop >30s) → auto-trigger rollback
3. `diffSnapshot(workflowId)` used to show exactly what changed before attempting restore

The architecture is complete. The auto-trigger and restore logic is the remaining piece.

## Snapshot directory location

`E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/agent_work/.snapshots/`

This directory should be added to `.gitignore` — snapshots are runtime artifacts, not source.