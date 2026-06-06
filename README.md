# PurpClaw

> **The AI Workstation OS.**
> Terminal-first, multi-agent, self-improving. 17 providers · 178 tools · 35 deployable agents · 380 skill directories · 9 core services · 3 surfaces (CLI, TUI, WebUI)

PurpClaw is an **operating system for AI work** — the CLI is the shell, agents are processes, the world model is persistent storage, the event bus is IPC, the orchestrator is the scheduler, the providers are CPUs, the swarm is multiprocessing.

**Honest numbers:** 35 agents are deployable at runtime. 380 skill directories (101 with executable code). 178 registered tools. 9 core services running (25 total defined). The 7-layer world model (1,133 lines across 6 modules) exists in code — episodic memory is online via the cognitive spine, layers 2-7 are built but awaiting integration. The training buffer fills but LoRA fine-tuning needs ≥10 examples to start — the pipeline exists, it needs fuel.

---

## Why PurpClaw

| Problem | Everyone Else | PurpClaw |
|---|---|---|
| **Provider lock-in** | One vendor | 17 providers, switch mid-session |
| **World Model** | Session-only | 7-layer: episodic, semantic, procedural, symbolic, temporal, counterfactual, emotional |
| **Tools** | Fixed set | 178 native + unlimited MCP servers |
| **Agents** | One or none | 35 runtime agents, swarm mode |
| **Self-improvement** | None | Karpathy ratchet pipeline — needs more training data |
| **Interface** | Chat or CLI | CLI + TUI + WebUI + Skyscraper theme |
| **Voice** | Cloud-only | Local: Whisper STT → Kokoro TTS |
| **Memory** | Session | Cognitive spine with 6 engines on one port |
| **Privacy** | Telemetry by default | No telemetry, self-hosted |

---

## Quick Start

```bash
npm install -g purpclaw
purpclaw setup           # pick provider, set API key
purpclaw show            # full stack overview
purpclaw ask "hello"     # one-shot agent chat
```

---

## CLI Commands

| Command | What it does |
|---|---|
| `purpclaw ask "..."` | One-shot agent chat (any of 17 providers) |
| `purpclaw chat` | Interactive session |
| `purpclaw show` / `purpclaw stack` | Full stack health + model routing |
| `purpclaw model use <p>/<m>` | Hot-swap provider/model |
| `purpclaw model list` | Show 17 providers |
| `purpclaw model current` | Show per-job routing table |
| `purpclaw harvest scan D:\` | Crawl drive for file index |
| `purpclaw harvest run` | Extract + index scanned files |
| `purpclaw deploy` | One-command VPS deploy (Docker) |
| `purpclaw safe-start --core` | Boot 9 core services |
| `purpclaw training ingest <dir>` | Load files into training buffer |
| `purpclaw training search <q>` | Search ingested content |
| `purpclaw tui` | Full-screen TUI |
| `purpclaw skill list` | List all 380 skill directories |
| `purpclaw logs <service>` | Stream PM2 logs |
| `purpclaw heal` | Auto-recovery |
| `purpclaw chaos campaign` | Run Smith+Neo attack pack |

---

## 178 Tools

### 77 Native Tools
File read/write/edit, shell, grep, code-search, web-fetch, git, weather, news, CSV analysis, ADB phone control, local TTS, local image gen, local video stitch, MoneyPrinter video gen, Smith+Neo chaos tools (5), G0DM0D3 red-team tools (4), memory check, podcast start, music analyze, and all Hermes skill tools.

### 42 OmniCode MCP Tools (auto-loaded)
Symbol search, AST indexing, blast radius, call hierarchy, dependency graph, dead code scan, spaghetti report, repo map, route map, test map, config map, benchmark, and more.

### 99+ Skill-Backed Tools
Auto-registered from Hermes skills with executable code. Covers blockchain (EVM, Solana), finance (stocks, DCF models), research (arXiv, Polymarket, DuckDuckGo), creative (ComfyUI, p5.js, excalidraw, pixel art), security (web pentest, OSINT), media (youtube transcripts, meme gen), and 90+ more.

---

## 3 Surfaces

### CLI
`purpclaw ask`, `purpclaw chat`, 30+ subcommands. Provider switching mid-session. Streaming tokens.

### TUI
`purpclaw tui` — full-screen terminal UI with slash commands, service health grid, event stream.

### WebUI
`http://localhost:3000` — Next.js dashboard with 27 components. Also `/skyscraper/` for the alternate isometric tower theme.

---

## 17 LLM Providers

OpenAI · Anthropic · Gemini · GitHub Models (free) · Codex · Codex OAuth · Ollama (local) · LM Studio (local) · OpenRouter · Groq · DeepSeek · Kimi · Together · Mistral · MiniMax · Atomic Chat · Custom (any OpenAI-compatible endpoint)

Switch mid-session: `purpclaw model use openrouter/anthropic/claude-sonnet-4`

---

## Services

### Core (9 always running)
| Service | Port | What |
|---|---|---|
| Unified API | 7780 | Main gateway |
| EventBus | 7782 | Pub/sub |
| State Store | 7783 | Key/value state |
| Orchestrator | 7784 | Workflow engine |
| Agent Tower | 7790 | Agent spawner (35 agents) |
| Gatekeeper | 7791 | Safety gate |
| Metrics | 7890 | Health polling |
| Pool | 7885 | Agent pool |
| Context Bus | 7881 | Context handoff |

### Cognitive Spine (1 process, 6 engines)
`cognitive_spine.py :7880` — Memory Matrix v2, Symbolic Rules, Modal Logic, Neuro-Symbolic Bridge, Diagnostics, AutoDream. One port. No port soup.

### Optional
Harness (:7798), Thringlet Bridge (:7799), Voice Coordinator (:7781), Voice Bridge (:7792), STT (:7896), Vision Monitor (:7889), YOLO (:7779), Avatar (:7777), Reasoning (:7892).

---

## Agent Breakdown

| Category | Count | Description |
|---|---|---|
| Skill directories | 380 | Total dirs under `skills/` |
| With manifests | 376 | Have `SKILL.md` |
| Executable code | 101 | Have runnable scripts |
| Runtime deployable | 35 | In agent_tower registry |
| Swarm animals | 44 | Duck, goose, dragon, owl, etc |

---

## 7-Layer World Model

1. **Episodic** — raw event storage
2. **Semantic** — concept extraction + entity linking
3. **Procedural** — skill/pattern recognition
4. **Symbolic** — Datalog facts + rules
5. **Temporal** — entity timelines + state reconstruction
6. **Counterfactual** — "what if" branches
7. **Emotional** — valence-weighted priority routing

All 6 modules import into `cognitive_spine.py` as one process on :7880.

---

## Voice Pipeline

```
Microphone → Whisper STT (:7896) → LLM → Kokoro TTS → Speaker
```

Full local. No cloud dependency.

---

## Self-Improvement (Karpathy Ratchet)

The pipeline exists:
- Training buffer auto-records kernel jobs to `E:/training/raw/YYYY-MM-DD.ndjson`
- LoRA fine-tuning with QLoRA 4-bit (fits 6GB VRAM, 1.5B base model)
- Export: LoRA → merge → GGUF q4_k_m → Ollama import → .env update

**Current state:** The buffer needs fuel. Run the stack, let agents work, then:
```bash
purpclaw training ingest D:\projects  # load data
python scripts/lora-train.py --epochs 1
```

---

## Immune System (Smith + Neo)

204 total attacks, 144 detected (71%), 62 repaired (30%).

| Attack | Detection | Repair |
|---|---|---|
| Refusal | 100% | 100% |
| Hallucination | 100% | 100% |
| Null Output | 100% | 0% |
| Truncation | 100% | 0% |
| Delay | 0% | 0% (needs code targets) |
| Reorder | 0% | 0% (needs code targets) |
| Swap Args | 0% | 0% (needs code targets) |

```bash
purpclaw chaos campaign output   # 20 attacks
purpclaw chaos status            # reliability ledger
```

---

## Data Harvester

```bash
purpclaw harvest scan D:\ --preview   # crawl drive
purpclaw harvest run --limit=5000     # extract + index
purpclaw harvest search "query"       # search indexed content
purpclaw harvest status               # index stats
purpclaw harvest convert file.pdf     # test a single file
```

Scans 45+ file types. Extracts text (PDF, DOCX, XLSX, OCR for images). Fingerprints (SHA-256). Pushes to training buffer + cold archive ledger.

---

## Deploy

```bash
purpclaw deploy setup     # configure VPS
purpclaw deploy            # Docker build → transfer → run → health check
purpclaw deploy status     # check deployed instance
```

---

## Stack Overview

```
purpclaw show

🔥 CORE:       9 services all green
🧠 SPINE:      6 engines healthy
🧠 MODEL:      deepseek / deepseek-v4-pro
📊 AGENTS:     35 deployable
🔧 TOOLS:      178 (77 native + 42 MCP + 99 skill-backed)
🏗️  PROVIDERS: 17
🌐 UI:         :3000 + /skyscraper/
💰 MONEYPRINTER: :8080
📦 v0.1.6 — github.com/weemadscotsman/purpclaw
```

---

## Install

```bash
npm install -g purpclaw
```

Or from source:
```bash
git clone https://github.com/weemadscotsman/purpclaw.git
cd purpclaw && npm install
```

---

## What PurpClaw Is Not

- Not a SaaS. Runs entirely on your hardware.
- Not a chatbot framework. It's an agent runtime.
- Not production-ready for enterprise. It's a workshop.
- Not done. The world model is partially online, the training buffer is underfed, and the docs are a fossil record held together by a raccoon with good intentions. 🦝

---

Built by Eddie & the swarm. 🟣
