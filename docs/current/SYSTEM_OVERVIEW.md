# PURPCLAW

## End-to-End System Overview 🟣⚙️
> Last updated: 2026-06-22 (v0.2.0 — pulse + whoami + LRU caches)

PURPCLAW is a **persistent AI orchestration runtime** designed to behave less like a chatbot and more like a **living operational kernel** for software, automation, cognition, and infrastructure management.

At its core:

> PURPCLAW wakes up, stays alive, observes systems, detects work, decomposes jobs, routes specialist agents, validates outcomes, governs execution, remembers history, and continuously improves its own operational stack.

It is not "one AI." It is:

# a governed multi-agent cognition and execution environment.

Or in simpler terms:

> "a digital operations organism with a CLI leash and a goose in middle management." 🦆

---

## Core Philosophy

PURPCLAW exists because normal AI tooling sucks at continuity.

Most AI systems:

- answer prompts,
- forget context,
- cannot maintain systems,
- cannot coordinate workers,
- cannot self-monitor,
- cannot safely evolve.

PURPCLAW solves that by combining:

- persistent runtime state,
- orchestration,
- memory,
- routing,
- validation,
- governance,
- autonomous maintenance,
- multi-surface control.

The result is:

# an AI-native operational environment.

---

## High-Level Architecture

```
             USER / EVENT / MEMORY / SYSTEM STATE
                              ↓
                     PURPCLAW KERNEL
                              ↓
                  JOB INTELLIGENCE LAYER
                              ↓
                   TASK DECOMPOSITION
                              ↓
                  GOVERNANCE PREFLIGHT
                              ↓
                     AGENT TOWER
                              ↓
        ┌─────────┬─────────┬─────────┬─────────┐
        │ CODE    │ WRITING │ VISION  │ SECURITY│
        │ AGENTS  │ AGENTS  │ AGENTS  │ AGENTS  │
        └─────────┴─────────┴─────────┴─────────┘
                              ↓
                     EXECUTION PIPELINE
                              ↓
                 TEST → DEBUG → VALIDATE
                              ↓
                    SYNTHESIS / DELIVERY
                              ↓
                   APPROVAL / DEPLOYMENT
```

---

## What PURPCLAW Actually Is

PURPCLAW is simultaneously:

| Role                    | Meaning                               |
| ----------------------- | ------------------------------------- |
| CLI Runtime             | local command environment             |
| Orchestration Kernel    | routes and governs jobs               |
| Agent Workforce         | specialist AI workers                 |
| Memory System           | persistent cognition/history          |
| Validation Engine       | tests and verifies output             |
| Governance Layer        | approvals, rollback, policies         |
| Operational Monitor     | health, telemetry, diagnostics        |
| Self-Maintenance System | detects and proposes fixes            |
| Cognitive Fossil Record | lineage/history of workflows          |
| Multi-Surface Interface | CLI, UI, API, voice, screen awareness |

---

## Primary Runtime Components

### 1. Resident Kernel

Always alive. Handles:

- state loop
- memory loop
- scheduler
- service awareness
- health polling
- event processing
- orchestration lifecycle

This is the beating heart.

### 2. Unified API Layer

Acts as gateway, broker, integration spine. Handles:

- API routing
- service communication
- external integrations
- runtime coordination

Currently identified as **ANNONA-class spaghetti ⚠️😭** — meaning it became too overloaded and now requires decomposition.

### 3. Orchestrator (the brainstem)

Responsible for:

- job decomposition
- execution graphs
- routing
- retries
- sequencing
- dependency management
- approvals
- workflow state

It determines what needs done, who should do it, in what order, under what governance constraints.

### 4. Agent Tower

The workforce management layer. Contains coding, writing, graphics, security, QA, ops, research, and synthesis agents. Agents are capability-scored and contract-driven. Jobs are delegated based on:

- task type
- risk
- complexity
- dependency graph
- prior performance

---

## Job Intelligence System

PURPCLAW does not simply "run commands." It:

1. detects work,
2. classifies it,
3. decomposes it,
4. creates execution contracts,
5. routes execution.

Example: `"Fix dashboard transaction rendering"` becomes:

| Subtask          | Agent           |
| ---------------- | --------------- |
| API trace        | backend agent   |
| rendering fix    | frontend agent  |
| regression tests | QA agent        |
| sec validation   | security agent  |
| packaging        | synthesis agent |

---

## Governance Layer

One of the most important systems. Without governance, autonomous systems become chaos generators.

PURPCLAW governance provides:

| Capability            | Purpose                        |
| --------------------- | ------------------------------ |
| Risk classification   | low / medium / high / critical |
| Approval gates        | risky jobs require approval    |
| Policy enforcement    | runtime boundaries             |
| Rollback              | reverse failed changes         |
| Approval ledger       | traceability                   |
| Runtime preflight     | stop unsafe execution          |
| Sandboxing            | isolate risky upgrades         |
| Maintenance proposals | opt-in autonomy                |

This is **the leash.**

---

## Spaghetti Governance ("The Law")

PURPCLAW includes a runtime code quality enforcement system, known internally as **The Spaghetti Law 🍝**.

Principle:

> "If code cannot be reasoned about safely, it loses the right to remain in runtime."

Features: complexity scoring, spaghetti audit, rewrite planning, Annona archival, quarantine classification.

```bash
purpclaw spaghetti audit
purpclaw spaghetti explain <file>
purpclaw spaghetti rewrite-plan <file>
purpclaw spaghetti quarantine <file>   # governance-gated
```

**Annona** is the archive of irredeemable horrors, preserved for archaeology and warning.

---

## Memory Matrix

PURPCLAW remembers — operationally, not chatbot-style. Stores:

- workflows
- outputs
- lineage
- failures
- agent performance
- architecture history
- runtime events
- execution ancestry

This creates **cognitive persistence.**

---

## Cognitive Fossil Record

Every workflow leaves lineage:

```
agent_work/
  dragon/
  robot/
  bee/
```

This allows replay, audit, optimisation, retrospectives, self-analysis. The system can learn:

- which agents fail,
- which workflows waste tokens,
- which graphs succeed.

---

## Screen Awareness / Workspace Cognition

PURPCLAW can inspect screens. Features:

- multi-monitor capture
- visual context awareness
- workflow detection
- deployment awareness
- screen role memory

```bash
purpclaw look
purpclaw look 1-4
purpclaw look --workspace
```

Future goal: `"Boss, monitor 3 still has the failed deployment logs open."` → **environmental cognition.**

---

## Voice + Multi-Surface Control

PURPCLAW is interface-independent. Can be controlled through:

- CLI
- API
- Mission Control UI (`http://localhost:3000`)
- voice
- Xiaozhi AI ball
- future mobile interfaces

The AI ball was bootstrap infrastructure, not the throne.

---

## Self-Maintenance / Proactive Runtime

PURPCLAW can detect:

- broken services
- stale dependencies
- repeated failures
- unhealthy subsystems
- memory drift
- runtime entropy

Then:

- propose fixes,
- create maintenance jobs,
- stage upgrades,
- request approval.

**Important:** currently governed and opt-in only. No haunted 3AM package-installation goblin mode allowed.

---

## Validation Pipeline

Nothing is considered "done" until:

- tests pass
- integration passes
- security checks pass
- artifacts build
- deployment validates
- health checks pass

This is **closed-loop execution.**

The whole pipeline is verifiable in one command:

```bash
purpclaw smoke
```

Which runs end-to-end checks across services, LLM, pool, memory, orchestrator dispatch, worker registry, and the redactor.

---

## Mission Control UI

Visual oversight dashboard. Shows:

- active jobs
- agent states
- service health
- approvals
- workflow lineage
- telemetry
- diagnostics
- orchestration graphs

The UI is NOT the brain. The runtime is the brain. The UI is the cockpit.

---

## Why PURPCLAW Exists

Because modern workflows are fragmented. Humans currently juggle terminals, dashboards, APIs, CI systems, documentation, testing, deployment, monitoring, debugging, memory, and research.

PURPCLAW attempts to unify:

# cognition + execution + governance.

Into one persistent operational environment.

---

## The End Goal

> A continuously running governed AI operations kernel that can assist, maintain, coordinate, observe, validate, and evolve complex software systems safely under human oversight.

Not a chatbot. Not autocomplete. Not a toy swarm. But:

# operational cognition infrastructure.

---

## Operational Maturity Milestones

Things a runtime needs to graduate from "prototype" to "infrastructure":

| Marker | What it means |
| --- | --- |
| **Smoke verification** | One command proves the system can do real work end-to-end |
| **PM2 cross-reference** | Doctor detects orphan processes that answer ports but aren't supervised |
| **Secret redaction** | Stdout/stderr wrapped at startup; every API key, JWT, and URL token masked before display |
| **Worker overflow** | When the local tower hits cap, jobs route to HTTP/SSH workers; HMAC-signed |
| **Persistence under restart** | Worker job records survive PM2 restart (worker-tasks.json with 24h TTL) |
| **Reconciliation loops** | 15s sync between pool state and remote worker reality |
| **Garbage collection** | `purpclaw gc` sweeps test scratch, ages out sessions, compacts task store |
| **Front door** | `purpclaw` with no args drops into a stack-aware chat REPL — the AI knows its own services, agents, ports, file layout |
| **Multi-provider socket** | `LLM_PROVIDER=…` swaps cognition without touching the runtime — Claude, Gemini, OpenAI, Kimi, MiniMax, Groq, DeepSeek, OpenRouter, Ollama, custom |
| **Cascade-safe lifecycle** | `purpclaw safe-start` / `safe-stop` launch services one-at-a-time with a stabilisation watch + restart-count circuit breaker — prevents the Windows cmd-window spawn cascade that took out the operator's desktop on 2026-05-25 |

## ⚠ Windows Safety: Always Use safe-start

**Never** start multiple defined-but-dark services with a single `pm2 start` call on Windows. When any of them crash-loops on launch, the npx/cmd.exe/Python-interpreter wrappers each flash a window that doesn't always honour `windowsHide: true` under crash conditions. Combined with PM2's autorestart, this produces a cmd-window spawn cascade fast enough to overwhelm Explorer.

The correct ritual:

```bash
purpclaw safe-start --dark                       # wake the dark cluster, safely
purpclaw safe-start vision                       # wake one service
purpclaw safe-start vision --stabilise=10000     # extra stabilisation time
purpclaw safe-start chorus --force               # bypass restart-count breaker
purpclaw safe-stop --dark                        # put it back to sleep
```

Defined-but-dark cluster: `reasoning, autodream, voice, bridge, chorus, vision, stt, yolo, avatar`.

---

## Current Status

PURPCLAW is currently transitioning from:

| Old State            | New State                 |
| -------------------- | ------------------------- |
| experimental chaos   | governed runtime          |
| disconnected modules | coherent topology         |
| agent playground     | operational kernel        |
| project folder       | installable environment   |
| vibes-based routing  | contract-driven execution |

It is now in **convergence phase.**

The hard part is no longer invention. It is hardening, decomposition, governance, usability, operational coherence.

---

## Quick Orientation

If you've just opened this project cold:

```bash
purpclaw                     # drop into the chat REPL — ask it anything
purpclaw architecture        # one-screen overview of services, flow, files, concepts
purpclaw doctor              # full health audit with PM2 cross-reference
purpclaw smoke               # 13-check end-to-end self-test
purpclaw help                # the full command cathedral
```

---

## 🦆 HONK

Runtime status:

- kernel breathing ✅
- governance online ✅
- spaghetti law enforced ✅
- Annona expanding ⚠️
- goose employed against its will ✅

## 👹 Gary

> "hehe. the model writes poetry. the runtime survives production. that's the difference."
