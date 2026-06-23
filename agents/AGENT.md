# `agents/` — AGENT.md

40 persona cards, one per `.md` file. These are NOT the runtime topology — that lives in `docs/spec/AGENT_MATRIX.md` (canonical). The cards here are runtime *persona prompts and skill bindings* that get loaded into the agent loop when a session spins up that agent.

If your task touches an agent's behavior, prompts, skill set, tier, or triggers — start here.

---

## Two card templates in use

There are two card shapes in this directory. **Both are valid** — they bind to the same canonical agents declared in `AGENT_MATRIX.md` §1, but they generate personas differently.

### A. Claude-sub-agent template (most files)

Front-matter:

```yaml
---
name: <agent-id>
description: <one-sentence when-to-use>
tools: ["Read", "Grep", "Glob", "Bash", "Edit", "Write"]
model: opus | sonnet | haiku
---
```

Body: role, processes, examples, constraints. Loaded into a Claude sub-agent session.

### B. PURPCLAW division template (a few)

Front-matter:

```yaml
---
name: <agent-id>
title: <display name>
division: <div-id>           # ENGINEERING, MANAGEMENT, INFRASTRUCTURE, OPERATIONS, MEDIA_OPS, CREATIVE, INTELLIGENCE, SCIENCE, SECURITY
role: <one-line>
tier: <1|2|3>
emoji: <symbol>
status: <idle|active|degraded>
skills: [...]
triggers: [...]
---
```

Body: full mission, scope, triggers, escalation rules, signature phrases, sample responses. Loaded into a PURPCLAW custom-loop agent.

The two shapes co-exist because the project boots both Claude sub-agents and PURPCLAW native agents from the same roster. The matrix is the bridge — same agent ID, two prompts, one routing.

---

## Card → AGENT_MATRIX mapping (sample anchor)

Cards here must reference their division in `AGENT_MATRIX.md` §1. Examples verified by Read of the card itself:

| Card file | `name` | `division` | `model` |
|---|---|---|---|
| `architect.md` | `architect` | (sub-agent: ENGINEERING-flavoured) | opus |
| `chief-of-staff.md` | `chief-of-staff` | MANAGEMENT | opus |
| `karen.md` | `karen` | MANAGEMENT | (PURPCLAW native) |
| `python-reviewer.md` | `python-reviewer` | ENGINEERING | (sub-agent) |
| `database-reviewer.md` | `database-reviewer` | ENGINEERING | (sub-agent) |
| `security-reviewer.md` | `security-reviewer` | SECURITY | (sub-agent) |
| `gan-evaluator.md`, `gan-generator.md`, `gan-planner.md` | GAN trio | SCIENCE | (sub-agent) |
| `video.md` | `video` | MEDIA_OPS | (sub-agent) |
| `planner.md`, `doc-updater.md`, `docs-lookup.md`, `e2e-runner.md`, `tdd-guide.md`, `loop-operator.md`, `refactor-cleaner.md`, `harness-optimizer.md`, `performance-optimizer.md`, `build-error-resolver.md` | OPERATIONS/ENGINEERING ops | ENGINEERING | (sub-agent) |
| 11 language-specific reviewers + 7 language-specific build-resolvers | (Python, JS/TS, Rust, Go, Java, C++, C#, Kotlin, Dart, Flutter, Pytorch …) | ENGINEERING/SECURITY | (sub-agent) |
| `opensource-forker.md`, `opensource-packager.md`, `opensource-sanitizer.md` | OPERATIONS/FORK ops | (sub-agent) |

(Authoritative map: `docs/spec/AGENT_MATRIX.md` §1; if you find a card whose `division` doesn't match the matrix, that card and the matrix both need a sync.)

---

## New-agent onboarding slot (2026-06-19)

Three agents were added to `AGENT_MATRIX.md` §9 on 2026-06-19. Their persona cards are pending:

- `ab_tester` — OPERATIONS, A/B Experiment Conductor, REASON lane
- `quality_assessor` — ENGINEERING, Quality Gatekeeper, REVIEW lane (with NIM fallback)
- `code_review` — ENGINEERING, PR Reviewer, REVIEW lane (with NIM fallback)

These IDs are reserved in `agent_routing_matrix.js`. When the persona cards land in `agents/`, they MUST use the same `name` so `purpclaw ab testing …` / `purpclaw qa …` / `purpclaw review …` resolves. (See `feedback_purpclaw_review_lane_env_sentinel_2026-06-19.md`.)

---

## When you change something here

- Editing a card body: keep the YAML front-matter intact. Don't rename `name:`. Don't change the `tools` list unless the matrix code-coupling has changed.
- Adding a card: pick a `name:` that matches an `AGENT_MATRIX.md` row. If you can't find one, you've found a new agent — that's a topology decision, escalate.
- Removing a card: zero the matrix row first. A live matrix entry + missing card → 502 on agent spawn.

---

## Critical gotcha

- **The matrix is canonical.** This directory is the persona layer. Run any cross-check through `docs/spec/AGENT_MATRIX.md` first.
- **3 sessions === 3 sources.** PURPCLAW has 3 simultaneous OpenClaude sessions; edits by one may collide with the matrix. Cross-check `agent_routing_matrix.js` and `model_registry.json` before changing routing-affecting cards.
- **Do NOT re-style cards inconsistently.** Pick template A or template B for the entire card. Mixing creates bootstrapping failures.

---

## Things to NOT do

- Do NOT bake a `division:` into a card that contradicts the matrix.
- Do NOT remove a card without zeroing its `name:` in `agent_routing_matrix.js` first.
- Do NOT bypass this folder and try to redefine an agent in a sibling `lib/agents/...` file. Use this folder.

---

Last updated 2026-06-19.
