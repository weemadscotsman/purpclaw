---
name: solo-creator-automation
description: "10 ready-to-install Hermes Agent automations for solo creators — research, content, scheduling, customer comms, finance, newsletter, webhooks, calibration, leads, and skill authoring. Drop-in kit with quality gates, calibration, and measurement."
version: 1.0.0
author: 🤖 ROBOT (PURPCLAW Precision Engineering)
license: MIT
platforms: [linux, macos, windows, wsl]
metadata:
  hermes:
    tags: [automation, solo-creator, productivity, cron, webhooks, gateway, skills, hermes]
    homepage: https://github.com/NousResearch/hermes-agent
    related_skills: [hermes-agent, hermes-gateway-ops, hermes-tts-providers]
    division: engineering
    precision_grade: 99.99
---

# Solo Creator Automation Kit

A precision-engineered kit that turns one person into a small team by chaining
10 Hermes primitives (cron, webhooks, gateway, skills, memory, profiles).

## Install

```bash
hermes skills install https://raw.githubusercontent.com/.../SKILL.md
# or, from a local checkout:
hermes skills install ./solo-creator-automation
```

## Use

After install, each automation is invoked by its name in a cron prompt or a
webhook handler. Example:

```bash
hermes cron create "0 9 * * *" --prompt "@solo-creator-automation/research-pipeline topic=ai-agents delivery=telegram"
hermes webhook subscribe stripe --path /webhooks/stripe --skill solo-creator-automation/webhook-handlers
hermes gateway setup telegram --bot-token $TG_TOKEN
```

## Quality Gates

Every automation declares its success criteria in `automations/<name>.md` under
the `## Quality Gate` heading. ROBOT's `scripts/quality_gate.py` walks all 10
automations and verifies:

1. Required sections present (`## Trigger`, `## Inputs`, `## Steps`, `## Quality Gate`, `## Failure Modes`).
2. Quality-gate criteria are testable (boolean expressions).
3. Referenced config files exist.
4. Referenced scripts exist and are executable.

## Calibration

`scripts/calibrate.py` runs a 9-point self-test against the live Hermes
install:

```
[1/9] hermes on PATH ………………… PASS
[2/9] hermes doctor …………………… PASS
[3/9] hermes skills list ≥ 1 ……… PASS
[4/9] hermes cron status …………… PASS
[5/9] hermes webhook list ………… PASS
[6/9] hermes gateway status ……… PASS
[7/9] memory backend reachable …… PASS
[8/9] default provider reachable … PASS
[9/9] quality_gate.py ……………… PASS

Calibration accuracy: 100.00 %
```

## Failure Modes & Recovery

| Symptom | Auto-recovery |
|---|---|
| cron job missed | re-queue next tick, alert via gateway |
| webhook 5xx | exponential backoff up to 3 retries |
| provider 429 | rotate to next key in credential pool |
| skill returns empty | fall back to `hermes chat -q` with same prompt |
| memory write fails | write to local file, sync on next boot |

ROBOT hands off to **PHOENIX** for catastrophic recovery and **VOID** for
expired cron entries / orphaned webhooks.
