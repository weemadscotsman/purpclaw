# 34 — PySpur

**Tier:** 4 (Emerging / Niche)
**Vendor:** PySpur (open-source, community)
**License:** Apache 2.0
**Initial release:** 2025
**Last major update:** Q4 2025

---

## What it is
Visual node-based editor for building LLM workflows and agents. Drag-and-drop canvas where each node is a prompt, an LLM call, a tool invocation, or a router. Aimed at teams that want a Figma-like surface for agent design instead of writing Python files.

## Core capabilities
- [x] Visual node canvas (drag-and-drop)
- [x] Node types: prompt, LLM call, tool, router, code, retriever
- [x] Branching and merging flows
- [x] Variable / context passing between nodes
- [x] Per-node evaluation runs
- [x] Export to Python (FastAPI-compatible)
- [x] Local-first (runs on your machine)
- [x] Multi-modal node inputs (image, file, text)

## Architecture
```
[Input Node] → [Prompt Template] → [LLM Node] → [Tool Node] → [Output]
                  ↓                   ↓
              [Variable]          [Router] (if/else)
                                       ↓
                                  [Branch A | B]
```
- DAG editor with typed nodes
- Each node has input/output schemas
- Compiles to Python for execution

## Strengths
- Lowest-friction visual builder
- Local-first (data doesn't leave your box)
- Export to Python means no vendor lock-in
- Per-node evaluation helps debug

## Weaknesses
- Visual abstraction gets in the way for complex flows
- Young project, small community
- Limited agent-specific features (no durable execution, no HITL)
- Performance overhead vs pure code
- No multi-tenant / RBAC layer

## Best use case
Teams where designers / PMs need to prototype agent flows without writing Python. Quick iteration on prompt chains. Documentation of agent topology.

## PURPCLAW fit: 3/10 (Tier D — Monitor only)
- **No integration value right now.** PURPCLAW is a code-first system; visual builders are a different audience.
- **Maybe later** as a companion surface for non-developers to design flows that compile to `lib/orchestrator.js` pipeline definitions.
- **Pattern to learn:** the per-node evaluation surface is a good idea. We don't have it. `lib/api-harness-kernel.js` is the closest equivalent.

## Integration sketch (concept)
- Export a PySpur flow as JSON
- Write a `lib/pyspur-compiler.js` that converts the JSON to a `pipeline-registry.js` entry
- Execute via the existing `lib/pipeline-registry.js` runner

## PURPCLAW parity
| PySpur concept | PURPCLAW equivalent |
|---|---|
| Visual canvas | none (code-only) |
| Node types | `lib/capability-registry.js` (capabilities as composable units) |
| Export to Python | `lib/pipeline-registry.js` (runtime) |
| Per-node evaluation | not implemented — gap |
| Local-first | n/a (everything local) |

## Sources
- https://github.com/PySpur-Dev/pyspur
- PySpur docs
- 2025 launch coverage (Latent Space podcast)
