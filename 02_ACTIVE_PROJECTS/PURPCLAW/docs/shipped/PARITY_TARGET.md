> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# PURPCLAW Feature Parity Target

This is the product target PurpClaw must match or exceed.

PurpClaw is the agent that grows with its operator: a resident autonomous runtime that lives on your server, remembers what it learns, routes every surface through one governed supervisor, and gets more capable the longer it runs.

It is not an IDE-tethered coding helper.

It is not a chat wrapper around one API.

It is a governed operations kernel with memory, delegation, tools, execution environments, scheduled work, and portable interfaces.

## Required Feature Groups

### 1. Lives Where You Do

Required:

- CLI
- API
- Web dashboard
- TUI
- voice
- socket bridge
- mobile-facing control layer
- chat-platform gateway adapters for Telegram, Discord, Slack, WhatsApp, Signal, and Email

Rule:

Every interface is a view. No interface gets its own brain. Every request routes through the supervisor and shares the same memory.

Current direction:

- CLI, API, web dashboard, TUI, and socket/voice services exist in the runtime.
- Chat-platform gateway adapters must be added as real inbound adapters to the unified gateway.

### 2. Grows the Longer It Runs

Required:

- persistent memory
- memory compaction
- skill indexing
- skill creation
- workflow history
- agent score history
- consolidation loop
- recall during future missions

Rule:

The runtime must retain how problems were solved and make that knowledge usable by later jobs.

Current direction:

- Memory Matrix, Knowledge Pool, skill files, agent scoring, context packets, and consolidation services exist.
- Skill generation and promotion must remain governed and auditable.

### 3. Scheduled Automations

Required:

- natural-language scheduling
- persisted job calendar
- reports
- backups
- briefings
- unattended gateway execution
- approval gates for risky scheduled work

Rule:

Schedules are jobs. Jobs pass governance before execution. A schedule may wait for approval, but it may not bypass approval.

Current direction:

- Maintenance and reasoning loops exist.
- A first-class natural-language scheduler lane still needs to be implemented.

### 4. Delegates and Parallelizes

Required:

- isolated specialist agents
- owned context packets
- dependency-aware task decomposition
- parallel worker dispatch
- terminal-backed execution
- Python RPC/script execution where needed
- validation and synthesis

Rule:

Agents do not own projects. They own context packets and locked work surfaces.

Current direction:

- Agent Tower, Orchestrator, Worker Pool, Context Bus, context packets, and harness engine exist.
- Parallelism must continue to be governed by locks, ownership, capacity, and validation.

### 5. Real Sandboxing

Required execution targets:

- local
- Docker
- SSH
- Singularity
- Modal
- Daytona or equivalent remote workspace backend

Required hardening where applicable:

- read-only root
- dropped capabilities
- namespace isolation
- bounded mounts
- explicit permissions
- logged execution contracts

Rule:

Execution environments are real adapters. Missing backends are gaps, not claims.

Current direction:

- Local, HTTP worker, and SSH worker lanes exist.
- Docker, Singularity, Modal execution, and Daytona-style workspace execution need real adapters.

### 6. Full Web and Browser Control

Required:

- web search
- browser automation
- screen and vision input
- image generation
- speech-to-text
- text-to-speech
- multi-model reasoning

Rule:

Browser and media tools route through governance and capability registration like every other tool.

Current direction:

- Browser command, screen look, vision services, STT, voice client, and multi-model provider support exist.
- Image generation and durable TTS gateway adapters need to be added to the runtime.

### 7. Research and Training Pipeline

Required:

- batch trajectory generation
- parallel workers
- checkpointing
- trajectory export
- trajectory compression
- fine-tuning export format
- RL training integration

Rule:

Research runs are first-class jobs with checkpoints, provenance, and resumability.

Current direction:

- Deep research group and harness benchmark runner exist.
- Export, compression, and RL integration need real adapters.

## Audit Command

Run:

```bash
purpclaw parity
purpclaw parity --health
purpclaw parity --json
```

The command reports live, partial, and missing feature groups based on registered services, source files, and optional health probes.

## Product Bar

PurpClaw is acceptable only when:

- every required feature group is live or intentionally disabled by policy
- every adapter routes through the same supervisor
- every risky workflow passes governance
- every long-running job has memory, state, and recovery
- no interface invents its own separate runtime

