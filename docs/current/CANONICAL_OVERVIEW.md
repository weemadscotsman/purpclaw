# PURPCLAW Canonical Overview
> Last updated: 2026-06-06

## Product North Star

PurpClaw is The Agent That Grows With You.

It is not a coding copilot tethered to an IDE or a chatbot wrapper around a single API. It is a resident autonomous agent runtime that lives on your server, remembers what it learns, and gets more capable the longer it runs.

## What PurpClaw Is

PurpClaw is not a chatbot.

PurpClaw is not a single agent.

PurpClaw is a local-first, governed, autonomous orchestration harness designed to coordinate specialist agents, tools, memory, workflows, and execution environments through one unified control plane.

It is the mobile and portable control claw of the wider DreamForge ecosystem.

Its purpose is to act as:

- agent orchestrator
- task dispatcher
- execution runtime
- memory-aware supervisor
- voice-to-agent router
- local and remote operations layer

Think: Claude Code + Codex + OpenAgent + Devin + OpenClaw ideas fused into a single governed runtime.

## Core Principle

One brain.

One router.

One orchestration layer.

Never multiple competing brains. Everything routes through the same supervisor.

## Runtime Architecture

```text
Supervisor
  -> Event Router
  -> Capability Registry
  -> Task Decomposer
  -> Context Graph Builder
  -> Capability Router
  -> Worker Cells
  -> Validators
  -> Synthesizer
  -> Final Output
```

## Permanent Services

Always running:

- Supervisor
- Event Router
- Capability Registry
- State Store
- Health Monitor

Everything else remains dormant until required: lazy load, execute, unload, return resources.

## Agent Model

Agents do not own projects.

Agents operate on context packets. Each packet contains:

- task
- ownership
- dependencies
- constraints
- memory references
- execution permissions

Ownership locks prevent multiple agents from editing the same surface at the same time.

## Governance

Governance is mandatory.

Every workflow passes through:

```js
governance.checkWorkflow()
```

before execution.

Blocked workflows call:

```js
requestApproval()
```

and return:

```text
waiting_approval
```

Read-only operations remain allowed. Nothing bypasses governance.

## Intelligence Spine

PurpClaw treats retrieval, context packing, model runtime policy, and safety gates as one governed spine.

The intelligence spine addresses:

- Graph RAG over Memory Matrix, Knowledge Pool memory, skills, and routing hints
- deterministic chunking with overlap and content hashes
- quantization policy tracking for local or configured runtimes
- guardrails through governance, job contracts, approval holds, and rate limits
- inference routing through the configured LLM provider layer
- KV cache policy tracking for provider-managed or local runtimes
- context window budgeting with response reserve
- context cache awareness through memory recall and context packets

Run:

```bash
purpclaw intelligence
```

to audit these layers, or:

```bash
purpclaw intelligence graph "<query>"
purpclaw intelligence chunk --source docs/CANONICAL_OVERVIEW.md
```

to inspect retrieval graph and chunking behavior directly.

## Interfaces

All interfaces connect to the same runtime: CLI, TUI, Web Dashboard, Voice, Socket Rig, API, Mobile Layer, and Xiaozi Ball Controller.

Interfaces are views. PurpClaw is the engine.

## Operating Mode

Boot once. Stay alive. Poll state and memory. Detect user requests, API jobs, file changes, failures, and drift.

Delegate. Execute. Validate. Repair. Retest. Return working result. Repeat.

## Mission

PurpClaw exists to become a governed autonomous operations kernel capable of managing projects, tools, workflows, agents, and execution environments from a single control plane.

The objective is not conversation.

The objective is completion.

## Feature Parity Target

PurpClaw must match or exceed the resident-agent feature bar defined in [PARITY_TARGET.md](./PARITY_TARGET.md).

The target is: an autonomous agent runtime that lives on your server, remembers what it learns, operates across interfaces, schedules unattended work, delegates in parallel, runs in real execution environments, controls web/browser/media tools, and keeps improving through memory and skills.

Run:

```bash
purpclaw parity
```

to audit current runtime parity against that target.
