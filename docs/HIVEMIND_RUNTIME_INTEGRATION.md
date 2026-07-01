# PURPCLAW Hivemind Runtime Integration

This patch adds a real file-backed Hivemind layer to the uploaded PURPCLAW runtime set.

## What it adds

- `lib/hivemind/*` CommonJS modules
- Runtime trace capture for orchestrator workflows
- Runtime trace capture for swarm coordinator missions
- Runtime trace capture for individual tower agents
- Skill loading before execution
- AntiSkill loading for known failed patterns
- Automatic trace promotion into skills
- Pool indexing of generated Hivemind skills
- Orchestrator HTTP endpoints for status, traces, skills, load, promote
- Standalone `hivemind_cli.js`

## Runtime flow

```text
Task enters orchestrator
  -> Hivemind loads relevant skills/antiskills
  -> Hivemind opens trace
  -> Orchestrator passes context into swarm coordinator
  -> Coordinator injects skills into subtask prompt
  -> Tower appends skills to agent prompt
  -> Agent runs with tools
  -> Tower writes agent trace
  -> Coordinator/orchestrator finish workflow trace
  -> Hivemind promotes repeated successful traces into skills
  -> Pool indexes generated skills
```

## Storage

Runtime data is stored locally at:

```text
.purpclaw/hivemind/
  traces/
  skills/
  index.json
  promotion-rules.json
  skill-scores.json
  events.jsonl
```

Do not commit live traces unless intentionally creating fixtures. They are runtime learning data.

## HTTP endpoints added to orchestrator

```text
GET  /api/hivemind/status
GET  /api/hivemind/skills
GET  /api/hivemind/traces?limit=50
POST /api/hivemind/load       { "task": "..." }
POST /api/hivemind/promote    { "dryRun": false }
```

## Pool integration

`pool_service.js` now indexes generated Hivemind JSON skills from:

```text
.purpclaw/hivemind/skills/
```

and exposes:

```text
GET /pool/hivemind/skills
```

## CLI

```bash
node hivemind_cli.js status
node hivemind_cli.js trace-list 20
node hivemind_cli.js skills
node hivemind_cli.js load "fix provider router fallback"
node hivemind_cli.js promote --dry-run
node hivemind_cli.js promote
```

## Activation

No new daemon is required.

Start the normal stack. The hooks activate automatically when these processes load:

- `orchestrator.js`
- `swarm_coordinator.js`
- `agent_tower.js`
- `pool_service.js`

If `lib/hivemind` cannot load, the stack continues. Hivemind is non-fatal by design.

## Validation used while building this patch

```bash
node --check lib/hivemind/*.js
node --check hivemind_cli.js
node --check orchestrator.js
node --check swarm_coordinator.js
node --check agent_tower.js
node --check pool_service.js
node hivemind_cli.js status
node hivemind_cli.js load "fix provider router fallback"
```

## What this deliberately does not do yet

- No model fine-tuning
- No new database
- No separate Hivemind service
- No forced skill injection when no match exists
- No blind promotion of failed/destructive traces

That restraint is the feature. Otherwise the system learns garbage at scale, because apparently software likes speedrunning regret.
