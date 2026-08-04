# PURPCLAW MEMORY INTEGRATION AUDIT
## Code-grounded findings from the uploaded runtime files
Date: 2026-08-04

## Executive verdict

PurpClaw already contains a capable cognitive engine, but the live stack does not use it through one mandatory contract.

The current state is:

- one real cognitive service on public port 7880 with a Python backend on 7888;
- a Memory Matrix with episodic/vector recall, temporal projection, counterfactual branches, symbolic lift/ground, emotional valence, working memory and reaction patterns;
- several runtime surfaces using memory directly;
- several independent persistence paths;
- at least one explicit spine bypass;
- no single scoped memory envelope used by every action.

The architecture is therefore **cognitively capable but operationally split**.

## Actual seven-layer status

| Layer | Status | Current implementation |
|---|---|---|
| Episodic | Real | Base vector/long-term recall and task records |
| Semantic | Partial | Lifted symbolic facts surfaced as semantic recall |
| Procedural | Partial | Reaction patterns treated as procedures |
| Symbolic | Real but separate | Datalog engine and neuro-symbolic lift/ground |
| Temporal | Real but separate | Temporal projection engine and timeline endpoints |
| Counterfactual | Real | Counterfactual branches and what-if endpoints |
| Affective / interaction | Partial | Emotional valence and filters, not a governed interaction-memory layer |

Working/scratch memory also exists, but it should remain a runtime buffer rather than being counted as one of the durable seven layers.

## Critical findings

### P0-1: Agent Tower explicitly bypasses the spine path

`agent_tower.js` submits work through AgentGateway with `no_spine: true`.

The same file later manually fetches `/memory/context` and separately calls `memory.postTask()`.

That creates three competing behaviours:

1. gateway execution with the spine disabled;
2. ad-hoc context injection;
3. ad-hoc post-task persistence.

This must become one AgentGateway-owned memory lifecycle.

### P0-2: Unified API treats memory as an optional silent dependency

`unified_api.js` loads `lib/memory-client` in a try/catch and continues when it fails.

The memory tool returns friendly text when the client is missing or port 7880 is offline, while the rest of the agentic request can continue.

That is acceptable only for an explicitly stateless raw-LLM route. It is not acceptable for governed agent, tool, orchestration or durable-session routes.

### P0-3: Pool Service contains a second memory system

`pool_service.js` writes:

- `memory.jsonl`
- `failures.jsonl`
- `queries.jsonl`
- `index.json`

Its pool memory endpoints operate independently of the cognitive spine.

Reclassify them:

- query logs → raw operational events;
- pool memories → memory candidates;
- failures → counterfactual/procedural candidates;
- spring index → governed doctrine/index state.

The Pool must use a MemoryGateway adapter rather than becoming a second brain.

### P0-4: Swarm memory is direct and unscoped

`swarm_coordinator.js` recalls through `memoryClient.recall()` and records lessons through `memoryClient.postTask()`.

Those operations lack a shared envelope containing project, workspace, mission, task, run, provenance, proof, retention and sensitivity.

The registry also marks the coordinator as removed/tombstoned. Do not spend migration effort on it until a live caller proves it is active.

### P0-5: The seven layers are not returned through one recall contract

The standard recall aggregator currently labels:

- episodic;
- semantic;
- scratch;
- procedural;
- counterfactual.

Temporal memory is exposed through separate projection/timeline functions. Symbolic memory is folded into semantic results. Affective state is used as valence/filtering rather than an explicit governed layer.

The engine contains most of the mechanics, but clients do not receive a uniform seven-layer result.

### P0-6: Memory objects lack one canonical envelope

Cognitive ingest accepts content, type, valence, source, importance and metadata, and Spring validation adds trust information.

However, the cross-stack contract still lacks mandatory fields for:

- organisation/project/workspace/agent/user scope;
- session/task/run/trace lineage;
- explicit layer;
- truth state;
- evidence references;
- valid-from/valid-until;
- supersession;
- sensitivity;
- retention;
- operator approval.

### P0-7: Service truth is inconsistent

PM2 includes `purpclaw-cognitive` in the CORE set, but `service_registry.js` marks the cognitive service as `required: false`.

If memory is mandatory for governed agentic work, the registry must represent that accurately. Stateless raw model calls may remain an exception.

## Correct target architecture

```text
All surfaces and runtimes
        |
        v
packages/memory/
├── contract/
├── gateway/
├── context/
├── policy/
└── adapters/
        |
        v
lib/memory-gateway.js
temporary compatibility wrapper
        |
        v
cognitive_gateway.js :7880
        |
        v
cognitive_spine.py :7888
        |
        v
MemoryMatrixV2 and cognitive modules
```

There remains one public cognitive service and one underlying cognitive state owner.

## Canonical lifecycle

```text
recall
→ assemble governed context
→ plan
→ act
→ capture event
→ verify
→ consolidate/promote/supersede
```

## Canonical memory envelope

```json
{
  "memoryId": "mem_...",
  "layer": "episodic|semantic|procedural|symbolic|temporal|counterfactual|affective",
  "kind": "tool_result",
  "scope": {
    "organisation": "purpclaw",
    "project": "purpclaw",
    "workspace": "canonical",
    "agent": "agent-name",
    "user": "operator"
  },
  "lineage": {
    "sessionId": "ses_...",
    "taskId": "tsk_...",
    "runId": "run_...",
    "traceId": "trc_..."
  },
  "content": {
    "summary": "",
    "details": {},
    "tags": []
  },
  "truth": {
    "status": "candidate|verified|superseded|rejected",
    "confidence": 0.0,
    "sources": [],
    "evidence": []
  },
  "time": {
    "createdAt": "",
    "validFrom": "",
    "validUntil": null,
    "supersedes": []
  },
  "policy": {
    "sensitivity": "public|internal|private|secret",
    "retention": "ephemeral|session|project|durable",
    "requiresApproval": false
  }
}
```

## Patch order

### Batch 1: Gateway contract

Create one workspace package:

```text
packages/memory/
├── package.json
├── index.js
├── contract/
├── gateway/
├── context/
├── policy/
└── adapters/
```

Create `lib/memory-gateway.js` as a compatibility export while `lib/` remains live.

Expose:

- `recall()`
- `record()`
- `promote()`
- `supersede()`
- `forget()`
- `explain()`
- `health()`

### Batch 2: AgentGateway integration

Inspect and patch `lib/agent-gateway.js`.

It must own:

- pre-flight recall;
- context ranking and provenance;
- action-start events;
- tool events;
- completion/failure events;
- verification links;
- memory consolidation.

### Batch 3: Agent Tower

- Resolve the meaning of `no_spine`.
- Remove the bypass if it disables governed memory.
- Delete direct `/memory/context` HTTP assembly.
- Replace direct `memory.postTask()` with `MemoryGateway.record()`.
- Include session/task/run/trace IDs.

### Batch 4: Unified API

- Replace direct `lib/memory-client` use with MemoryGateway.
- Keep `/api/llm/raw` explicitly stateless.
- Mark agentic routes degraded or unavailable when mandatory memory is offline.
- Add explicit `memoryMode` to responses.
- Replace fake “forget” guidance with real supersede/retention operations.

### Batch 5: Pool adapter

- Stop treating pool JSONL as canonical memory.
- Import existing rows as candidates with provenance.
- Route new memories/failures through MemoryGateway.
- Retain query logs only as operational events.
- Move state into `var/memory` or `var/pool` under an explicit state contract.

### Batch 6: Seven-layer recall

Update the cognitive recall contract to return all seven layers explicitly.

Temporal and symbolic results must participate in normal recall when relevant. Affective interaction memory must be bounded, scoped and correctable. Scratch memory remains separate.

### Batch 7: Health and proof

A passing memory health check must prove:

1. write;
2. read;
3. scope isolation;
4. layer classification;
5. provenance;
6. evidence link;
7. supersession;
8. temporal retrieval;
9. counterfactual retrieval;
10. restart persistence;
11. AgentGateway retrieval;
12. cleanup of test records.

## Required files for a safe implementation patch

The uploaded files prove the architecture and bypasses, but a safe replacement patch also requires:

```text
lib/agent-gateway.js
lib/agent-loop.js
lib/memory-client.js
lib/memory/spine/**
lib/tool-runtime.js
lib/session-repository.js
lib/pipeline-registry.js
lib/proof-ledger.js
lib/context-bus.js
lib/context-engine.js
orchestrator.js
lib/timeline.js
lib/presence.js
lib/residue.js
memory_matrix.py
symbolic_rules_engine.py
modal_logic_engine.py
neuro_symbolic_bridge.py
```

## Definition of done

- No live agentic route bypasses MemoryGateway.
- No subsystem owns an undocumented private memory store.
- All seven layers can influence context through one recall contract.
- Every injected memory includes provenance and scope.
- Every durable claim has evidence or remains a candidate.
- Every task can resume from recorded state.
- Every failure can become counterfactual/procedural knowledge.
- Every memory operation is visible in audit and proof records.
- Stateless raw LLM access is explicit and never masquerades as a remembered agent run.
