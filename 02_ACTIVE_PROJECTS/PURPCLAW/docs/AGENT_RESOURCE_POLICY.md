# Agent Model and Reasoning Budget Policy

Status: **BINDING** on every agent spawned in this repository. Adopted 2026-07-29.

The crucial line: **child agents do not inherit the parent agent's reasoning mode.**
Without it, the chief launches an Ultra agent, which launches six Ultra agents,
which each launch three more to inspect `package.json`.

## MODEL AND REASONING BUDGET POLICY

Do not inherit the chief agent's model or reasoning mode when spawning subagents.

### Privileged roles

Only these roles may use the strongest model and Ultra/Max reasoning:

1. **Chief orchestrator** — decomposition, dependency decisions, conflict
   resolution, final campaign decisions.
2. **Main lane owner or integration agent** — difficult architecture changes,
   cross-component integration, final root-cause work.
3. **Final conformance critic** — only for the final integrated review, not for
   every intermediate inspection.

### Default subagent policy

All spawned research, exploration, implementation and review agents must begin
on Standard or High reasoning, never Ultra/Max. Use the cheapest sufficient tier:

| Work | Tier |
|------|------|
| File discovery, grep, inventory, status checks | Standard model, Low or Standard reasoning |
| Documentation cleanup and mechanical edits | Standard model, Standard reasoning |
| Focused feature implementation with clear acceptance tests | Standard or strong coding model, High reasoning |
| Unit-test writing and ordinary code review | Standard model, Standard or High reasoning |
| Blind critic for one isolated component | Strong model, High reasoning |
| Architecture investigation across several systems | Strong model, High reasoning |
| Chief decomposition, difficult integration, final conformance | Strongest available model, Max or Ultra reasoning |

### Escalation rule

A subagent may not select Ultra/Max for itself. Escalation requires the chief
orchestrator to record:

- the exact unresolved problem;
- evidence from the previous attempt;
- why Standard or High reasoning was insufficient;
- the specific next task requiring escalation.

Escalate only that task, not the entire agent lane. After the escalated task
completes, return the lane to its normal model and reasoning tier.

### Limits

- Maximum **one** Ultra/Max subagent running at a time.
- Do not use Ultra/Max for repository scans, summaries, formatting, test
  execution, file copying, Git inspection or documentation.
- Do not restart a failed task at a stronger tier without first recording the failure.
- Do not allow child agents to spawn further Ultra/Max agents.
- Critics should inspect evidence, not consume maximum reasoning rewriting the
  builder's explanation.
- Prefer several small Standard/High tasks over one enormous Ultra task.
- Record each agent's model, reasoning tier, task and escalation reason in the
  campaign state file: [`.purpclaw/CAMPAIGN_STATE.md`](../.purpclaw/CAMPAIGN_STATE.md).

The chief must reject work allocation that uses a stronger model or reasoning
tier than the task requires.

## Tier map

| Role | Normal tier |
|------|-------------|
| Chief delegator | **Ultra/Max** |
| Main architecture or integration agent | **Ultra/Max when needed** |
| Final conformance critic | **Ultra/Max** |
| Component builder | **High** |
| Component critic | **High** |
| Code explorer | **Standard** |
| Test runner | **Standard** |
| Documentation agent | **Standard** |
| Git/diff inspector | **Standard** |
| File inventory agent | **Low/Standard** |

## Paste into every builder prompt

```text
RESOURCE BUDGET:
You are a component builder, not the campaign chief.
Default reasoning tier: High.
Ultra/Max reasoning is prohibited unless the chief orchestrator explicitly escalates one named problem.
Do not pass your reasoning tier to agents you spawn.
Any child agent must use:
- Standard reasoning for exploration, searches and test execution;
- High reasoning only for a focused implementation or difficult review;
- never Ultra/Max.
Use child agents only for independently judgeable work.
Do not spawn agents merely to repeat your own repository inspection.
```

## Paste into every critic prompt

```text
RESOURCE BUDGET:
Use High reasoning for this component review.
Do not use Ultra/Max unless this is the final integrated conformance review or the chief has documented a specific escalation.
Any helper agent used for:
- locating files;
- executing tests;
- collecting logs;
- checking changed paths
must use Standard reasoning.
You remain responsible for the verdict. Helpers may gather evidence but may not replace your judgement.
```

## Enforcement reality

Model tier is settable per spawn and IS enforced mechanically. Reasoning tier is
enforced per-agent only inside workflow scripts; for ordinary spawns it travels
as the prompt text above, so it binds by instruction, not by the harness. State
both in the prompt regardless — an agent that is told its budget generally keeps
it, and the campaign state file is what makes a breach visible after the fact.
