# Codex Handoff - Implement SPINEBUS Phase 2

## Objective

Implement SPINEBUS Phase 2 as PURPCLAW's central job-routing substrate.

Do not build Phase 3 execution automation yet.

Phase 2 must create envelopes, touch all subsystems, generate route plans, write receipts, expose CLI/API, and queue lessons/dream tasks.

## Current known runtime truth from handoff

Use current repo truth, not stale marketing claims:

- tools: 501 callable tools
- skills: 379 skills
- agents: 152 currently claimed in latest status handoff
- providers: 21 provider configs
- PXPIPE: native
- LIVEFORGE Phase 1: implemented
- invocation registry snapshot: `agent_work/liveforge/invocation-registry.json`

If repo manifests disagree, prefer actual runtime audit results.

## Create files

Suggested runtime files:

- `lib/spinebus.js`
- `lib/commands/spinebus.js`
- `scripts/spinebus-phase2-smoke.js`

Suggested API routes:

- `app/api/spinebus/health/route.ts`
- `app/api/spinebus/envelope/route.ts`
- `app/api/spinebus/route/route.ts`
- `app/api/spinebus/registry/route.ts`
- `app/api/spinebus/lesson/route.ts`
- `app/api/spinebus/dream-queue/route.ts`

Suggested storage:

- `agent_work/spinebus/jobs.jsonl`
- `agent_work/spinebus/routes.jsonl`
- `agent_work/spinebus/touches.jsonl`
- `agent_work/spinebus/receipts.jsonl`
- `agent_work/spinebus/lessons.jsonl`
- `agent_work/spinebus/dream_queue.jsonl`
- `agent_work/spinebus/registry-cache.json`

## Do not duplicate LIVEFORGE

Use existing LiveForge helpers if present.

SPINEBUS should call or write compatible receipts, not create a competing receipt format.

## Required module functions

Implement:

- `createJobEnvelope(input)`
- `normalizeIntent(envelope)`
- `touchMemoryLayers(envelope)`
- `touchMycelium(envelope)`
- `matchTowerAgents(envelope)`
- `matchSkillCards(envelope)`
- `matchToolsAndFunctions(envelope)`
- `createRoutePlan(envelope)`
- `writeRouteReceipt(routePlan, status)`
- `queueLessonProposal(input)`
- `queueDreamTask(input)`
- `getSpinebusHealth()`
- `loadInvocationRegistry()`

## Touch implementation for Phase 2

If real subsystem adapters are not ready, use safe adapters that return structured placeholder touches.

Do not pretend execution happened.

Valid statuses:

- `pass`
- `enrich`
- `warn`
- `block`
- `route`
- `request_approval`
- `execute`
- `error`

Each touch must include:

- subsystem
- status
- confidence
- timestamp
- summary
- refs
- warnings

## Skill cards

Add initial skill card loading.

Look for skill cards in:

- `skills/**/skill-card.json`
- `skills/**/skill-card.md`
- `docs/skills/**`
- fallback from invocation registry

If no card exists, create a virtual incomplete card and mark it `unverified`.

Do not select an unverified skill for execution without warning.

## Tool registry

Unify callable lookup from:

- `agent_work/liveforge/invocation-registry.json`
- `lib/tools/index.js`
- API route scan
- CLI command scan
- agent registry / tower manifest
- skills registry

Do not inflate counts. Count unique callable ids.

## Execution gate

Phase 2 is plan-first.

Default gate should be:

`plan_only`

unless explicitly called with safe dry-run mode.

Any command with file write, shell, browser, PC control, network, or repo mutation must require an approval or explicit execution path in later phases.

## CLI

Add:

- `purpclaw spinebus health`
- `purpclaw spinebus route "message text"`
- `purpclaw spinebus registry`
- `purpclaw spinebus dream-queue`

The route command should print:

- job id
- selected intent
- selected agent
- selected skills
- selected tools
- gate status
- touched subsystems
- receipt id

## API

`POST /api/spinebus/envelope`

Input:

```json
{
  "text": "user message",
  "source": {
    "type": "chat",
    "sessionId": "local"
  }
}
```

Output:

```json
{
  "ok": true,
  "envelope": {}
}
```

`POST /api/spinebus/route`

Input:

```json
{
  "text": "build me a route",
  "source": {
    "type": "chat",
    "sessionId": "local"
  },
  "planOnly": true
}
```

Output:

```json
{
  "ok": true,
  "job": {},
  "route": {},
  "receipt": {}
}
```

## Acceptance requirements

Run:

- `node --check lib/spinebus.js`
- `node --check lib/commands/spinebus.js`
- `node scripts/spinebus-phase2-smoke.js`
- `purpclaw spinebus health`
- `purpclaw spinebus route "turn this transcript into a tool workflow"`

Expected:

- job envelope created
- all required subsystem touches present
- route plan created
- receipt written
- registry loads
- no execution performed
- dream queue accepts safe improvement task

## Hard boundary

Do not implement autonomous repo mutation yet.

Do not make dream mode push to main.

Do not let tools execute directly from chat.

Do not claim "all agents live" unless verified.

The result should be boringly reliable. Tragic, but necessary.

