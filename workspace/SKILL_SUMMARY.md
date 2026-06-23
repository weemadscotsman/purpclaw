# SKILL_SUMMARY.md — The PurpClaw Skills Inventory

This file is the definitive index of everything PurpClaw can do. Every skill, every command, every endpoint, every capability — all in one place.

If you need to know what PurpClaw is capable of, start here.

---

## Stack State (As of 2026-06-19)

| Metric | Value |
|--------|-------|
| Services in `ecosystem.config.js` | 30 |
| Typical online services | 18-25 at any time |
| Codebase size | 3,961 files, 30,975 chunks, 12,715 symbols |
| Semantic search | Available via `purpclaw code search` |
| Plan-then-act | Multi-model fanout (3 models + judge) |
| Real-time streaming | SSE for chat, plan, swarm |
| Active Context Panel | Real file reads + token counts |
| Composer V1 | Full 10-element spec |
| LoRA fine-tuning pipeline | PEFT + TRL + bitsandbytes, 4-bit QLoRA |
| AutoResearch ratchet | 8 iterations locked, val_loss 0.733461 |
| Training buffer | 24 trajectories, NDJSON per kernel job |

---

## PurpClaw Commands (via `purpclaw <cmd>`)

| Command | Purpose |
|---------|---------|
| `purpclaw code search\|reindex\|stats\|symbol` | Semantic + symbol search over the codebase |
| `purpclaw training status\|export\|backfill\|clear\|toggle` | Self-training buffer management |
| `purpclaw lora status\|train` | LoRA fine-tuning pipeline |
| `purpclaw services` (alias `svc`) | Runtime service discovery + health probe |
| `purpclaw safe-start [--all\|--core\|--dark]` | Sequential service launcher with circuit breaker |
| `purpclaw swarm\|kimi\|llm\|browser\|github\|code\|forge` | Specialized command modules (see `bin/purpclaw.js`) |

---

## REST Endpoints (Real, No Fakery)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health`, `/api/version`, `/api/status` | Service health and version info |
| POST | `/api/chat` | Blob reply (default) |
| POST | `/api/chat` + `Accept: text/event-stream` | SSE token stream |
| POST | `/api/chat/swarm` | Fan out N agents in parallel |
| POST | `/api/llm/plan` | Decompose into steps |
| POST | `/api/llm/plan` + SSE | Stream plan generation |
| POST | `/api/composer/context` | Active context panel data |
| POST | `/api/harness/coordinate` | Swarm coordinator |
| POST | `/api/orchestrate` | Mission orchestrator |
| POST | `/api/research/group` | Group chat (multi-model) |
| POST | `/api/kernel/jobs` | Submit kernel job |
| GET | `/api/kernel/jobs` | List kernel jobs |
| POST | `/api/upload` | Multipart file upload |
| GET | `/api/services/registry`, `/status` | Service discovery |
| GET | `/api/cognitive/status`, `/stats` | Cognitive mesh data |
| GET | `/api/tower/agents`, `/teams` | Agent tower data |
| GET | `/api/llm/status` | Provider info |
| GET | `/api/stream` | Global SSE event stream |

---

## Hermes Skills (The Agent Runtime)

**Location:** `C:/Users/Admin/AppData/Local/hermes/skills/` (active profile: `default`)

**Load via:** `skill_view(name='<name>')`

### Key Skills (Always-On)

| Skill | Purpose |
|-------|---------|
| `hermes-agent` | Configure Hermes itself |
| `coding-standards` | Universal coding standards |
| `coding (omnicode-mcp)` | Local AST MCP, 36+ languages |
| `test-driven-development` | TDD practices |
| `systematic-debugging` | 4-phase root cause analysis |
| `plan` | Write a plan before building |
| `writing-plans` | Plan documentation |
| `blueprint` | Architecture blueprints |
| `subagent-driven-development` | Delegate to subagents |
| `requesting-code-review` | Code review protocols |
| `spike` | Quick prototypes |
| `backend-patterns` | Backend architecture |
| `frontend-patterns` | Frontend architecture |
| `api-design` | API design principles |
| `database-migrations` | Schema management |
| `deployment-patterns` | Deployment strategies |
| `docker-patterns` | Container workflows |
| `git-workflow` | Version control best practices |
| `e2e-testing` | End-to-end testing |
| `e2e-testing (Playwright)` | Browser automation testing |
| `browser-qa` | QA automation |
| `dogfood` | Exploratory QA of web apps |
| `canary-watch` | Monitor a URL for regressions |
| `context-budget` | Manage context window |
| `continuous-learning` | Ongoing improvement |
| `ck` | Per-project memory |

---

## PurpClaw Runtime Skills (Reusable Patterns)

**Location:** `C:/Users/Admin/AppData/Local/hermes/skills/` (under `default` profile)

**Created by:** Subagents and sessions, named after the pattern they capture

| Skill | Purpose |
|-------|---------|
| `sse-streaming-pattern` | Server-Sent Events for `/api/chat`, `/api/llm/plan`, etc. Covers helpers, async iterator, event vocabulary, frontend consumer, pitfalls. Use when adding a new streaming endpoint. |

---

## What We Don't Handle (Boundaries)

PurpClaw is focused, deliberate, and does not pretend to be what it isn't.

| Out of Scope | Why |
|--------------|-----|
| 3D avatars | Hermes is text/voice, not a body |
| GOOP / pile-soul personas | We don't have a Pile |
| OpenClaw's `workspace/IDENTITY.md` | Canonical identity is in `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/workspace/` |
| TTS provider configuration | Handled by Hermes voice layer |
| Gateway lifecycle management | Handled by Hermes voice layer |
| Mouse gaze tracking | Handled by Hermes voice layer |
| Python TUI apps | Not in scope |
| Container supervision | Handled by Hermes voice layer |

### Voice / Audio (Boundary)
- `hermes-tts-providers` — TTS provider configuration
- `hermes-gateway-ops` — Gateway lifecycle management
- `hermes-gaze` — Mouse → Hermes's eyes

### TUI / Interaction (Boundary)
- `tui-textual` — Python TUI apps
- `debugging-hermes-tui-commands` — TUI debugging

### Container (Boundary)
- `hermes-s6-container-supervision` — Container supervision

---

## PurpClaw Runtime Services (Ecosystem)

These services are defined in `ecosystem.config.js` and called by agents or the UI.

| Service | Purpose |
|---------|---------|
| `safe-start.js` | Sequential service launcher with circuit breaker |
| `safe-stop.js` | Clean stop |
| `open.js` | Explicit UI launcher |
| `smoke.js` | End-to-end self-test |
| `heal.js` | Diagnose + recovery plan |
| `overview.js` | What is PurpClaw |
| `context-viz.js` | Context bus visualization |
| `llm.js` | LLM provider config |
| `workers.js` | Worker pool manager |
| `harness.js` | Multi-step autonomous harness |
| `thringlets.js` | Thringlet colony tools |
| `evolve.js` | Self-evolution loop |
| `gc.js` | Garbage collection |
| `grow.js` | Growth status |
| `agents.js` | Agent roster |
| `code.js` | Code operations |
| `architecture.js` | System architecture |
| `concepts.js` | PurpClaw concepts |
| `parity.js` | Feature parity check |
| `bughunt.js` | Bug hunt |
| `autofix-pr.js` | Auto-fix PRs |
| `onboard.js` | Onboarding |
| `cognition.js` | Cognitive services |
| `intelligence.js` | Intelligence aggregation |
| `teleport.js` | State teleport |
| `roster.js` | Agent roster |
| `browser.js` | Browser automation (open/content/click/type/tabs) |
| `governance.js` | Supervised/autonomous mode toggle |
| `job-contract.js` | Kernel job contract validation |
| `proactive-maintenance.js` | Proactive runtime maintenance |
| `spaghetti-audit.js` | Codebase architecture audit |
| `rate-limiter.js` | Concurrency + cost cap |
| `mochi-statusbar.js` | TUI status bar wrapper |

---

## Autonomy & Multi-Agent Skills

| Skill | Purpose |
|-------|---------|
| `autonomous-agent-harness` | Agent harness |
| `autonomous-loops` | Loops for autonomous agents |
| `autonomous-ai-agents` | Sub-skills: bee, bunny, fox, goose, kraken, octopus, rabbit, robot, shark, wolf, etc. |
| `ai-runtime-governance` | Governance for AI runtime |
| `ai-regression-testing` | Regression testing |
| `ai-first-engineering` | AI-first development |
| `agent-harness-construction` | Build agent harnesses |
| `gan-style-harness` | GAN-inspired agent harness |
| `agentic-engineering` | Agentic development |
| `agent-eval` | Agent evaluation |
| `agent-payment-x402` | Payment processing |

---

## Research & Web Skills

| Skill | Purpose |
|-------|---------|
| `deep-research` | In-depth research |
| `iterative-retrieval` | Iterative information retrieval |
| `documentation-lookup` | Look up documentation |
| `exa-search` | Exa search integration |
| `arxiv` | arXiv research |
| `blogwatcher` | Monitor blogs |
| `crow` | Crow agent |
| `hawk` | Hawk agent |
| `jellyfish` | Jellyfish agent |
| `lemur` | Lemur agent |
| `moth` | Moth agent |
| `owl` | Owl agent (RAG, memory query) |
| `polymarket` | Polymarket integration |
| `raven` | Raven agent (data retrieval, web search) |
| `scientist` | Scientist agent |
| `spider` | Spider agent (web scraping, data gathering) |
| `llm-wiki` | LLM wiki lookup |
| `lead-intelligence` | Lead intelligence |
| `investor-materials` | Investor materials |
| `investor-outreach` | Investor outreach |

---

## Productivity & Docs Skills

| Skill | Purpose |
|-------|---------|
| `google-workspace-ops` | Google Workspace operations |
| `notion` | Notion integration |
| `obsidian` | Obsidian integration |
| `airtable` | Airtable integration |
| `jira-integration` | Jira integration |
| `linear` | Linear integration |
| `powerpoint` | PowerPoint generation |
| `ocr-and-documents` | OCR and document processing |
| `maps` | Maps integration |
| `teams-meeting-pipeline` | Teams meeting automation |
| `nano-pdf` | PDF generation |
| `architecture-decision-records` | ADR management |
| `article-writing` | Article writing |
| `crosspost` | Cross-posting |
| `content-engine` | Content generation |
| `brand-voice` | Brand voice maintenance |
| `ideation` | Idea generation |
| `humanizer` | Humanize AI text |

---

## MLOps & Models Skills

| Skill | Purpose |
|-------|---------|
| `benchmark` | Benchmarking |
| `chonk` | Chonk integration |
| `cost-aware-llm-pipeline` | Cost-aware LLM pipeline |
| `eval-harness` | Evaluation harness |
| `evaluation` | Evaluation |
| `foundation-models-on-device` | On-device models |
| `gan-style-harness` | GAN-inspired harness |
| `gorilla` | Gorilla agent |
| `huggingface-hub` | Hugging Face integration |
| `inference` | Inference |
| `llama-cpp` | LLaMA.cpp integration |
| `models` | Segment-anything-model, etc. |
| `dspy` | DSPy integration |
| `training` | Training |
| `vector-databases` | Vector database integration |
| `weights-and-biases` | Weights & Biases integration |

---

## Last Updated

**2026-06-19** — Complete native rewrite. Removed all OpenClaw references. Now the definitive inventory of PurpClaw's capabilities.