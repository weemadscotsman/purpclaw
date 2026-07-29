> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../docs/parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# PURPCLAW Parity Gap Tracker
*Last updated: 2026-07-29*

## Status Legend
- [✓] Done — built and working
- [⏳] In Progress — being built now
- [ ] Open — not started

---

## Codex CLI Gaps

| # | Feature | Severity | Status | Notes |
|---|---|---|---|---|
| C1 | Auto-test-fix loop (`lib/eval-auto-fix.js`) | **HIGH** | [✓] | Runs tests, feeds failures to LLM, auto-fixes, loops |
| C2 | PR inline comments (GitHub API) | **HIGH** | [✓] | `review-pr.js` full overhaul: post comments, create PR, merge |
| C3 | Diff/patch apply with dry-run | Medium | [✓] | `apply-diff.js` — parse unified diff, apply safely |
| C4 | Project scaffolding (`init-project`) | Medium | [✓] | `purpclaw init-project <type>` — generate project boilerplate + purpclaw.toml |
| C5 | purpclaw.toml (codex.toml equivalent) | Medium | [ ] | Per-repo config: ignores, tool permissions, default agent |

---

## ChatGPT App Gaps

| # | Feature | Severity | Status | Notes |
|---|---|---|---|---|
| G1 | Image generation (fal.ai) | Low | [ ] | `generate_image` tool via fal.ai MCP |
| G2 | Data analysis panel | Medium | [ ] | Upload CSV → charts + stats + export |
| G3 | Mobile voice + camera input | Medium | [ ] | Desktop equivalent: `screen` + `camera` commands |
| G4 | GPT store / agent marketplace UI | Medium | [ ] | Browse + spawn 153 agents as cards |

---

## Moat Features (Going Above)

| # | Feature | Status | Notes |
|---|---|---|---|
| M1 | Autonomous revenue agent | [ ] | Wallet monitoring, bounty scanning, invoice filing |
| M2 | Multi-provider fan-out command | [ ] | One prompt → 3+ providers → compare responses |
| M3 | Personal model fine-tuner | [ ] | `purpclaw finetune train --data user-feedback/` |
| M4 | Cross-session memory sync | [ ] | Disk-backed memory with git timeline |
| M5 | Semantic codebase fingerprint | [ ] | `purpclaw fingerprint` → architecture diagram for new agents |
| M6 | PC control daemon | [ ] | PURPCLAW PC tools as LAN API on :7890 |
| M7 | Smith + Neo red team | [ ] | Adversarial self-testing harness, runs nightly |

---

## Build Priority Order

1. [⏳ C1] `lib/eval-auto-fix.js` — auto-test-fix loop ← **START HERE**
2. [ ] C2 — `review-pr.js` GitHub inline comments overhaul
3. [ ] C3 — `apply-diff.js` with dry-run
4. [ ] C4 — `init-project.js` scaffolding
5. [ ] C5 — `purpclaw.toml` parser
6. [ ] G2 — Data analysis panel (`app/components/DataAnalysisPanel.tsx`)
7. [ ] G3 — `screen` + `camera` commands
8. [ ] G1 — fal.ai image gen tool
9. [ ] G4 — Agent marketplace UI (`apps/agent-tower/`)
10. [ ] M2 — Multi-provider fan-out command
11. [ ] M4 — Canonical memory sync
12. [ ] M5 — Codebase fingerprint
13. [ ] M1 — Autonomous revenue agent
14. [ ] M3 — Personal model fine-tuner
15. [ ] M6 — PC control daemon
16. [ ] M7 — Smith + Neo red team
