# Solo Creator Automation Kit (Hermes Agent)

> **Engineered by 🤖 ROBOT — Precision Engineering Division**
> Hermes Agent v2.1.0 • calibrated, validated, measured.

A drop-in automation kit for solo creators (writers, developers, consultants,
newsletter authors, indie hackers) using **Hermes Agent**. Built on the same
primitives Hermes already ships: **cron**, **webhooks**, **gateway**,
**skills**, **memory**, and **profiles**.

No new infrastructure. No cloud lock-in. Just `hermes cron create`,
`hermes webhook subscribe`, and skills you can install with
`hermes skills install`.

---

## What you get

| Track | Automation | Time saved / week |
|---|---|---|
| Research | `research-pipeline.md` — daily topic digests | 3 h |
| Content | `content-engine.md` — ideas → draft → publish | 4 h |
| Schedule | `scheduler.md` — daily/weekly cadence | 1 h |
| Audience | `customer-loop.md` — Telegram/Discord reply bot | 2 h |
| Money | `finance-tracker.md` — invoices + expense log | 1 h |
| Nurture | `newsletter-pipeline.md` — list growth + sends | 1 h |

**Total: ~12 hours/week reclaimed.**

---

## 60-second install

```bash
# 1. Clone or download this kit
cd swarm_mission/solo-creator-automation

# 2. Install + calibrate (Linux/macOS)
bash scripts/install.sh

# 2b. …or on Windows
powershell -ExecutionPolicy Bypass -File scripts/install.ps1

# 3. Verify quality gates
python scripts/quality_gate.py
python scripts/calibrate.py
```

Expected output: all gates PASS, calibration accuracy ≥ 99.9%.

---

## How it works

```
┌─────────────────────────────────────────────────────────┐
│  Hermes Agent (single binary, single config)            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   cron ──► skill ──► memory ──► deliver                 │
│     │        │         │          │                      │
│     │        │         │          ├─► telegram bot       │
│     │        │         │          ├─► email              │
│     │        │         │          ├─► local file         │
│     │        │         │          └─► webhook OUT        │
│     │        │         │                                 │
│     │        │         └─► persistent context           │
│     │        │            (built-in / Honcho / Mem0)     │
│     │        │                                           │
│     │        └─► 10 skills in /automations/             │
│     │            (research, content, finance, …)        │
│     │                                                    │
│     └─► schedules:                                       │
│         30m, every 2h, 0 9 * * *                        │
│                                                         │
│   webhook IN ──► run a skill with payload                │
│     (github, stripe, gumroad, custom)                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Every automation is **one cron entry + one skill prompt + one delivery target**.
That's it. No glue code, no separate database, no separate scheduler.

---

## The 10 automations

1. **research-pipeline** — daily topic digest, scraped + summarized + delivered
2. **content-engine** — content calendar + draft generator + post scheduler
3. **scheduler** — daily/weekly checklists, calendar reminders, focus blocks
4. **customer-loop** — Telegram/Discord auto-reply with knowledge base fallback
5. **finance-tracker** — invoice generator + expense categorizer + monthly P&L
6. **newsletter-pipeline** — signup → welcome → weekly send → re-engagement
7. **webhook-handlers** — inbound Stripe / GitHub / Gumroad event handlers
8. **calibration-check** — ROBOT-grade self-test of the whole stack
9. **lead-pipeline** — DM/cold-email triage + CRM sync
10. **skill-authoring** — auto-generate new skills from your own patterns

Each lives in `automations/<name>.md` and is a **ready-to-install SKILL**.

---

## Quality engineering

ROBOT treats this kit like a manufacturing line:

- **Pre-calibration** — `scripts/calibrate.py` verifies your `hermes doctor` is green
- **Quality gates** — `scripts/quality_gate.py` validates file integrity, JSON, refs
- **Measurement** — `scripts/measure.py` records per-automation runtime + cost
- **Self-test** — `tests/test_*.py` runs deterministically, exits 0 on green

Tolerances (from `MANIFEST.json`):
- execution precision ≥ 99.99 %
- automation reliability ≥ 99.9 %
- quality pass rate ≥ 99.5 %
- calibration accuracy ≥ 99.9 %

---

## File layout

```
solo-creator-automation/
├── MANIFEST.json                # precision spec + components
├── SKILL.md                     # installable as `hermes skills install`
├── README.md                    # this file
├── automations/                 # 10 ready-to-install skills
│   ├── research-pipeline.md
│   ├── content-engine.md
│   ├── scheduler.md
│   ├── customer-loop.md
│   ├── finance-tracker.md
│   ├── newsletter-pipeline.md
│   ├── webhook-handlers.md
│   ├── calibration-check.md
│   ├── lead-pipeline.md
│   └── skill-authoring.md
├── config/                      # copy-paste hermes config snippets
│   ├── profiles.example.yaml
│   ├── cron.example.yaml
│   ├── webhooks.example.yaml
│   └── gateway.example.yaml
├── scripts/                     # install + calibrate + measure
│   ├── install.sh
│   ├── install.ps1
│   ├── calibrate.py
│   ├── quality_gate.py
│   ├── measure.py
│   └── bootstrap.py
├── templates/                   # blank-fill templates for new automations
│   ├── AGENT.md
│   ├── SKILL.md
│   ├── webhook-payload.json
│   ├── cron-job.json
│   └── daily-brief.md
├── tests/                       # pytest suite
│   ├── test_automations.py
│   ├── test_calibration.py
│   └── test_quality_gate.py
└── logs/
    └── precision_log.json       # appended each calibrate run
```

---

## License

MIT — same as Hermes Agent. Built for the swarm.
