# PURPCLAW Hivemind Integration Spec

Status: Codex-ready implementation handoff  
Target repo: `weemadscotsman/purpclaw`  
Target branch: `master`  
Goal: Turn every PURPCLAW run into a compounding asset by tracing execution, promoting successful repeated traces into reusable skills, and loading those skills automatically into future runs.

---

## Why this belongs in PURPCLAW

PURPCLAW already has the right spine:

- CLI entrypoint: `bin/purpclaw.js`
- Job contract and verification gates: `lib/job-contract.js`
- Orchestrator workflow pipeline: `orchestrator.js`
- Knowledge Pool service: `purpclaw-pool` on port `7885`
- Context Bus service: `purpclaw-context` on port `7881`
- Metrics service: `purpclaw-metrics` on port `7890`
- Cognitive Spine: `purpclaw-cognitive` on port `7880`

So Hivemind should not start as another heavyweight daemon. Start as a thin local library that hooks into existing run/orchestrator/job-contract flow, then expose it through Pool/Context/Metrics later.

---

## Core doctrine

Every run should produce reusable operational intelligence.

```text
PURPCLAW run
  -> trace tools/files/commands/outcomes
  -> score trace
  -> promote successful repeated traces into skills
  -> load relevant skills before future runs
  -> improve next run
```

This gives PURPCLAW continual operational learning without model fine-tuning.

---

## Add files

```text
lib/hivemind/
  paths.js
  trace-recorder.js
  skill-scorer.js
  skill-promoter.js
  skill-loader.js
  hivemind-middleware.js
  index.js
```

Create storage:

```text
.purpclaw/hivemind/
  traces/
  skills/
  index.json
  promotion-rules.json
  skill-scores.json
```

Add `.purpclaw/hivemind/traces/` and `.purpclaw/hivemind/skills/` to `.gitignore` if they contain local run data. Keep default config templates tracked if useful.

---

## Trace schema

Each run writes one JSON file:

```json
{
  "schema": "purpclaw.hivemind.trace.v1",
  "run_id": "hm_2026_06_28_000001",
  "workflow_id": "wf-...",
  "task": "fix broken provider router",
  "source": "cli|orchestrator|codex|cursor|hermes|claude-code",
  "agent": "robot",
  "model": "codex",
  "intent": "fix",
  "job_type": "code",
  "route_intent": "build",
  "started_at": "ISO_DATE",
  "ended_at": "ISO_DATE",
  "duration_ms": 0,
  "tools_used": [],
  "files_touched": [],
  "commands": [],
  "verification_gates": [],
  "gate_results": [],
  "outcome": "success|failed|blocked|partial",
  "tests_passed": false,
  "rollback": false,
  "tokens": 0,
  "diff_summary": "",
  "evidence": [],
  "error": null
}
```

Trace files:

```text
.purpclaw/hivemind/traces/<run_id>.json
```

---

## Skill schema

Successful repeated traces promote into reusable skills:

```json
{
  "schema": "purpclaw.hivemind.skill.v1",
  "skill_id": "fix-provider-router-fallback",
  "title": "Fix provider router fallback failure",
  "task_type": "code",
  "intent": "fix",
  "trigger_terms": ["provider", "router", "fallback", "model routing"],
  "steps": [
    "inspect provider registry",
    "trace route resolver",
    "patch fallback priority",
    "run targeted verification gate",
    "write evidence row"
  ],
  "avoid": [
    "do not rewrite the whole router",
    "do not change provider contracts unless tests prove it is required"
  ],
  "source_trace_ids": [],
  "success_count": 0,
  "failure_count": 0,
  "score": 0,
  "created_at": "ISO_DATE",
  "updated_at": "ISO_DATE"
}
```

Skill files:

```text
.purpclaw/hivemind/skills/<skill_id>.json
```

---

## Promotion rules

```json
{
  "schema": "purpclaw.hivemind.promotion-rules.v1",
  "min_success_count": 2,
  "min_score": 0.75,
  "require_tests_passed": true,
  "allow_partial": false,
  "reject_if_rollback": true,
  "reject_if_destructive": true,
  "max_files_touched": 12,
  "max_error_count": 0
}
```

Never promote:

- failed traces
- rolled-back traces
- traces without evidence
- destructive filesystem/process/powershell actions unless explicitly approved and verified
- huge rewrites masquerading as small fixes

---

## Scoring formula

Implement `skill-scorer.js` with a boring, useful scoring model. Fancy nonsense can wait.

```js
score =
  success * 0.30 +
  testsPassed * 0.20 +
  gatesPassed * 0.20 +
  evidencePresent * 0.10 +
  lowChurn * 0.10 +
  noRollback * 0.10;
```

Return a number between `0` and `1`.

---

## Loader behaviour

Before execution, load top relevant skills.

Ranking:

1. trigger term overlap with task
2. same job type / intent
3. higher score
4. recent successful use
5. lower failure count

Return max three skills by default.

Prompt/context format:

```text
## PURPCLAW Hivemind Skills

Relevant prior successful workflows:

1. Fix provider router fallback failure
Score: 0.93
Use when: provider, router, fallback, model routing
Steps:
- inspect provider registry
- trace route resolver
- patch fallback priority
- run targeted verification gate
Avoid:
- do not rewrite the whole router
- do not change provider contracts unless tests prove it is required
```

---

## Hook points

### 1. `lib/job-contract.js`

Use existing classification instead of inventing another classifier.

Current useful functions:

- `classifyJob(text)`
- `createJobContract(command, parsed, options)`
- `formatContractForAgent(contract)`
- `runVerificationGates(rootDir, contract, options)`

Add Hivemind metadata after contract creation. Extend `formatContractForAgent(contract)` to append `HIVEMIND.formatSkillsForAgent(contract.hivemindSkills)`.

### 2. `orchestrator.js`

Do not replace the pipeline. Wrap it.

Current pipeline stages are:

```text
parse -> route -> validate -> execute -> respond
```

Add trace lifecycle:

- create trace when workflow starts
- record parse/route/validate/execute/respond events
- record selected agent/team
- record result/failure when workflow completes
- score trace
- try promotion after completion

### 3. `bin/purpclaw.js`

Add CLI command group:

```text
purpclaw hivemind status
purpclaw hivemind trace-list
purpclaw hivemind skills
purpclaw hivemind load "<task>"
purpclaw hivemind promote
```

Keep it file-backed. No server dependency in phase one.

---

## Codex implementation prompt

```text
Implement the PURPCLAW Hivemind Layer from docs/CODEX_HIVEMIND_INTEGRATION.md.

Hard constraints:
- Do not add a new daemon/service in phase one.
- Use CommonJS because package.json has type commonjs.
- Preserve existing CLI/orchestrator behaviour.
- Use existing job classification and verification gates from lib/job-contract.js.
- Store local Hivemind data under .purpclaw/hivemind/.
- Never promote failed, rolled-back, unverified, or destructive traces.
- Add CLI command group: purpclaw hivemind status|trace-list|skills|load|promote.
- Add tests or at minimum runnable smoke checks using node --check and manual CLI checks.

Acceptance checks:
1. node --check lib/hivemind/index.js
2. node --check lib/job-contract.js
3. node --check bin/purpclaw.js
4. node --check orchestrator.js
5. purpclaw hivemind status works on empty storage
6. purpclaw hivemind load "fix provider router fallback" returns JSON and readable output
7. A completed successful run creates a trace
8. purpclaw hivemind promote creates a skill only from valid repeated successful traces
```

---

## Phase two surfaces

After phase one works, expose Hivemind through existing services:

- Knowledge Pool: index skills for recall
- Context Bus: inject matched skills into active workflow context
- Metrics: expose trace count, skill count, promotion count, avg score
- UI: add Hivemind panel under Mission Control, not a whole new app

Do not build phase two until phase one has traces, skills, loader, and CLI working.
