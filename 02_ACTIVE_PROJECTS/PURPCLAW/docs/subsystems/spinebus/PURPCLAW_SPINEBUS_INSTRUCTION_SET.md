# PURPCLAW SPINEBUS Instruction Set

## Purpose

SPINEBUS is the central job-routing layer for PURPCLAW.

It makes sure every incoming chat, task, tool request, agent action, generated surface, learned skill, and dream-mode improvement flows through the same audit lane.

The goal is not to make every subsystem execute every time.

The goal is to make every subsystem get a structured chance to:

1. recognize relevance
2. add context
3. veto danger
4. suggest a better route
5. log what it knows
6. update shared memory when proof exists

## Doctrine

### One job, one envelope

Every user message becomes a `Job Envelope`.

The envelope follows the same route every time:

1. `chat.intake`
2. `intent.normalize`
3. `memory.touch`
4. `mycelium.touch`
5. `tower.match`
6. `skill.match`
7. `tool.match`
8. `execution.plan`
9. `liveforge.surface.optional`
10. `execution.gate`
11. `execute.or.respond`
12. `receipt.write`
13. `truth.audit`
14. `lesson.propose`
15. `dream.queue.optional`

No raw chat request should jump directly to tools.

No tool should execute without a job envelope, selected route, and receipt target.

### Touch versus execute

Every subsystem receives the envelope.

Most subsystems should answer with one of:

- `pass`
- `enrich`
- `warn`
- `block`
- `route`
- `request_approval`
- `execute`

Only one or a small number of selected executors should run.

### Seven-layer memory touch

SPINEBUS must touch all memory layers but not dump them into context.

Memory layers:

1. `session_memory` - current chat/job
2. `project_memory` - PURPCLAW project state
3. `user_memory` - stable user preferences and constraints
4. `agent_memory` - chosen agent history and strengths
5. `skill_memory` - known skill usage and success/failure notes
6. `tool_memory` - tool call history, errors, latency, cost, command examples
7. `mycelium_memory` - spores, colony patterns, warnings, contradictions, promoted lessons

Each layer returns a compact `Memory Touch Result`.

The result must fit a budget and include references, not raw dumps.

### Fungus Amongus role

Fungus Amongus is not the whole memory system.

It is the cross-agent mycelium network.

It stores and spreads:

- useful discoveries
- known working routes
- known bad routes
- contradictions
- tool chain shortcuts
- user/project patterns
- proof-backed improvements

It must never leak private or forbidden context across scopes.

### LIVEFORGE role

LIVEFORGE creates surfaces and event lanes.

It should be invoked when a job benefits from:

- dashboard
- generated form
- schema-backed mini-app
- visual proof surface
- tool inspector
- replay viewer
- multi-agent cockpit
- user-facing generated UI

LIVEFORGE should not become the router. It is a surface and event subsystem.

### PXPIPE role

PXPIPE stores bulky context as image artifacts when text would burn prompt budget.

Use PXPIPE for:

- long transcripts
- bulky tool manifests
- repeated context packs
- replay traces
- large generated code snippets
- evidence bundles
- dream-mode analysis payloads

Rule:

If context is too large to pass cleanly, offload it to PXPIPE and pass the artifact reference.

### Tower and division role

The Agent Tower decides who should handle the job.

The Tower must use:

- intent
- required capabilities
- skill cards
- tool permissions
- past success
- current availability
- risk level
- user preference
- token/cost budget

Every selected agent must receive a route pack containing:

- job envelope
- relevant memory nutrients
- selected skill cards
- allowed tools
- blocked tools
- expected output contract
- receipt target

### Skill card role

Every skill must become an instruction-bearing card.

A skill card must define:

- purpose
- when to load
- when not to load
- required tools
- allowed tool calls
- forbidden tool calls
- operating steps
- expected inputs
- expected outputs
- validation rules
- failure handling
- receipt requirements
- learning hooks

No skill should be only a name in a registry.

A skill without executable instructions is decorative junk.

### Tool and function registry role

PURPCLAW needs one source of truth for:

- native tools
- API routes
- CLI commands
- system commands
- PC control tools
- browser tools
- Mac/Linux/Windows variants
- function calls
- MCP tools
- skills
- agents
- permission levels

Each callable must expose:

- name
- type
- provider
- path or handler
- input schema
- output schema
- permissions
- platforms
- side effects
- estimated cost
- latency profile
- examples
- last verified timestamp
- known failure modes

### AutoLearn role

AutoLearn is not allowed to mutate core behavior instantly.

It may:

- collect lessons
- compare routes
- rank better patterns
- propose skill updates
- propose tool chain improvements
- propose prompt improvements
- create pull-request-ready patches

It may not:

- silently alter a tool schema
- silently change agent permissions
- promote an unverified lesson
- push to main without checks
- erase receipts

### Dream mode role

Dream mode runs when the user is inactive.

It should inspect:

- failed jobs
- slow routes
- duplicate tool chains
- token-heavy paths
- unused skills
- stale agents
- broken registry entries
- repeated manual corrections
- missing skill cards

Dream mode outputs:

- `Lesson Proposal`
- `Skill Patch Proposal`
- `Tool Route Proposal`
- `Agent Capability Patch`
- `Registry Cleanup Proposal`
- `Acceptance Test Proposal`

Dream mode does not execute dangerous actions without approval.

### Truth rule

Claims must match manifests.

If the truth manifest says `501` tools, the UI may say `501` tools.

If the agent manifest says `84`, the UI may not say `152` unless those agents are actually spawnable and verified.

No mascot math. No vibes accounting.

## Minimum Phase 2 Deliverable

Phase 2 is done only when:

1. every chat/job produces a job envelope
2. every envelope receives memory, mycelium, tower, skill, tool, execution, receipt, and learning touches
3. the selected route is logged
4. skill cards can be loaded from registry
5. tool/function registry snapshot can be queried
6. execution plan can be produced without executing
7. receipts prove the selected route
8. dream queue receives eligible improvement tasks

