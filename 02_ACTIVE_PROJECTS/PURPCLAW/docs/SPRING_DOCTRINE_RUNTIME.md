# PURPCLAW Spring Doctrine Runtime

> PURPCLAW learns from verified experience, not recycled output.

This is the trust constitution for the Hivemind layer. Hivemind records work. Spring Validator decides how much that work deserves to be trusted. AutoDream promotes proven patterns during consolidation. The Cognitive Spine exposes the same trust model to Memory, Rules, Modal Logic, diagnostics, Pool and runtime agents.

## Runtime surfaces

### CLI

```bash
purpclaw hivemind status
purpclaw hivemind spring
purpclaw hivemind doctrine
purpclaw hivemind principles
purpclaw hivemind load "fix provider router fallback"
purpclaw hivemind validate '{"outcome":"success","evidence":["tests_passed"]}'
purpclaw hivemind promote
```

### Orchestrator API

```text
GET  /api/hivemind/status
GET  /api/hivemind/spring
GET  /api/hivemind/doctrine
GET  /api/hivemind/principles
GET  /api/hivemind/skills
GET  /api/hivemind/traces
POST /api/hivemind/load
POST /api/hivemind/validate
POST /api/hivemind/promote
```

### Cognitive Spine API

```text
GET  /spring/status
GET  /spring/health
GET  /spring/doctrine
GET  /spring/principles
POST /spring/validate
```

Every `/memory/ingest` response now includes a `spring` provenance block. The spine also asserts `spring_rank(memory_id, rank, label)` and `trust_score(memory_id, score)` facts into the rules engine so symbolic reasoning can see provenance.

### Pool API

```text
GET /pool/hivemind/skills
GET /pool/hivemind/spring
```

Pool indexes promoted skills, AntiSkills and Doctrine as discoverable assets.

## Learning hierarchy

| Rank | Origin | Label | Use |
|---:|---|---|---|
| 1 | `verified_execution` | Pure Spring | Top trust: tests/evidence/runtime success |
| 2 | `successful_trace` | Fresh Spring | Successful but less verified |
| 3 | `promoted_skill` | Filtered Spring | Reusable operational pattern |
| 4 | `human_documentation` | Spring Runoff | Human docs/manuals/specs |
| 5 | `external_knowledge` | River Tributary | External knowledge |
| 6 | `llm_suggestion` | River Water | Model suggestion, low trust until verified |
| 7 | `unverified_ai_output` | Stagnant River | Do not promote |
| 8 | `failed_execution` | Poisoned Well | AntiSkill material |

## Data layout

```text
.purpclaw/hivemind/
  traces/          append-only run traces
  skills/          promoted skills and AntiSkills
  doctrine/        immutable/high-trust doctrine
  principles/      seed principles
  spring-index.json
  promotion-rules.json
  skill-scores.json
  events.jsonl
```

## Stack flow

```text
Agent/Orchestrator/Swarm run
  -> Hivemind trace
  -> Spring Validator tags provenance + trust
  -> Memory ingest stores Spring metadata
  -> Rules Engine receives spring_rank/trust_score facts
  -> Pool indexes skills/doctrine
  -> AutoDream runs promotion during consolidation
  -> Future agents receive Spring Doctrine + top skills + AntiSkills in prompt context
```

## Non-negotiable invariants

- Never promote an unverified trace.
- Never treat model confidence as equivalent to execution evidence.
- AntiSkills are valuable and should be loaded when relevant.
- Doctrine is immutable by default.
- The planner must prefer Pure/Fresh Spring over River/Stagnant sources.
- Hivemind must fail open: if it crashes, the stack still runs, but no promotion occurs.

The duck drinks from the spring. Annoyingly, the duck is correct.
