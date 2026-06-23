# PurpClaw

**The local-first AI workstation OS.**

Run agents, tools, memory, models, voice, vision, and provider routing from your own machine or USB drive.

**Your box. Your data. Your AI.**

```
npm install -g purpclaw
purpclaw help
```

[GitHub](https://github.com/weemadscotsman/purpclaw) · [Report an Issue](https://github.com/weemadscotsman/purpclaw/issues)

---

## What It Is

PurpClaw is a **complete AI operating environment** — not just a chatbot or a Claude Code plugin. It runs its own runtime, agent tower, cognitive memory, tool registry, skill system, provider router, SpendGate budget control, voice/vision stack, and USB-portable Pocket OS.

| Product | Purpose |
|---|---|
| **PurpClaw Core** | Local-first AI workstation OS |
| **PurpClaw Pocket OS** | USB-portable private AI (launcher, vault, audio guide) |
| **PurpClaw Agent Tower** | 35+ agents across 8 divisions, native skill execution |
| **PurpClaw Doctor** | One-command system health verification |

### How It Compares

| Feature | ChatGPT | Ollama UI | Portable USB AI | **PurpClaw** |
|---|---|---|---|---:|
| Local models | ✗ | ✓ | ✓ | **✓** |
| API providers | ✓ | ⚠ | ⚠ | **17** |
| Agent tower | ✗ | ✗ | ✗ | **✓ (35 agents)** |
| Tool registry | ✗ | ✗ | ⚠ | **176 tools** |
| Skill system | ✗ | ✗ | ⚠ | **380 skills** |
| CLI | ✗ | ⚠ | ✗ | **✓** |
| TUI | ✗ | ✗ | ✗ | **✓** |
| Dashboard | ✓ | ✓ | ✓ | **✓** |
| Spend limits | ✗ | ✗ | ✗ | **✓ SpendGate** |
| Encrypted vault | ✗ | ✗ | ⚠ | **✓ (AES-256-GCM)** |
| USB Pocket OS | ✗ | ✗ | ✓ | **✓** |
| Local telemetry loop | ✗ | ✗ | ✗ | **✓** |
| User-owned memory | ⚠ | ⚠ | ⚠ | **✓ 7-layer spine** |
| Voice/vision | ✗ | ✗ | ✗ | **✓ (local stack)** |

---

## System Health

Run one command. Get one truth report:

```
purpclaw doctor
```

Checks: tool registry (176/176 loadable), skill directories (380), manifests (376), executable skills (101), services (10/10 online), cognitive spine (6 engines), vault (encrypted/locked/recovery ready), SpendGate (active), providers (17), dependencies (safe installed, optional quarantined), Pocket OS (launchers present), updater (signed/unsigned status).

Every claim in this README is verifiable by running `purpclaw doctor`. If a number looks wrong, the doctor will tell you.

---

## Quick Start

**Developer install (5 minutes):**
```
git clone https://github.com/weemadscotsman/purpclaw.git
cd purpclaw
npm install
node bin/purpclaw.js doctor
node bin/purpclaw.js help
```

**Pocket OS (USB):**
```
node bin/purpclaw.js pocket package ./pocket-build
```
Then copy `pocket-build/` to a USB drive and run `START_HERE.bat` (Windows), `START_HERE.sh` (Linux/macOS), or `START_HERE.command` (macOS double-click).

**Offline/local:**
```
# Install Ollama, pull a model
ollama pull qwen2.5:3b
# Start PurpClaw
node bin/purpclaw.js pocket init
node bin/purpclaw.js pocket mode offline
node bin/purpclaw.js pocket start
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PURPCLAW CLI                          │
│  purpclaw ask · doctor · pocket · harvest · deploy      │
│  identity · model · show · training · log · plan        │
│  30+ commands                                            │
├─────────────────────────────────────────────────────────┤
│                    THREE SURFACES                       │
│  CLI  ·  TUI (purpclaw tui)  ·  WebUI (:3030)           │
├─────────────────────────────────────────────────────────┤
│                    SERVICE RUNTIME                      │
│  API (:7780)  ·  Agent Tower (:7790)  ·  Gatekeeper     │
│  EventBus (:7782)  ·  State Store (:7783)               │
│  Orchestrator (:7784)  ·  Metrics (:7890)               │
│  Pool (:7885)  ·  Context Bus (:7881)                   │
├─────────────────────────────────────────────────────────┤
│                    COGNITIVE SPINE                      │
│  :7880 — 6 engines:  memory · rules · modal            │
│  diagnostics · neuro-symbolic · autodream               │
│  7 memory layers: episodic · semantic · procedural     │
│  symbolic · temporal · counterfactual · emotional       │
├─────────────────────────────────────────────────────────┤
│                    TOOL REGISTRY                        │
│  176 tools: 77 native + 99 skill-backed + 42 MCP        │
│  380 skill dirs · 376 manifests · 101 executable        │
│  Missing optional deps return install guidance          │
├─────────────────────────────────────────────────────────┤
│                    PROVIDER ROUTER                      │
│  17 providers: Ollama · OpenAI · Anthropic · Gemini     │
│  DeepSeek · Groq · Mistral · MiniMax · OpenRouter       │
│  GitHub Models · NVIDIA NIM · xAI · Together · Codex   │
│  Atomic Chat · Local Controller · Custom endpoints     │
│  Per-job routing · Hot-swap mid-session                 │
├─────────────────────────────────────────────────────────┤
│                    BUDGET & SECURITY                    │
│  SpendGate: per-request/daily/monthly caps             │
│  per-agent caps · per-provider caps · rate limits      │
│  Encrypted Vault: AES-256-GCM + PBKDF2 200K iterations │
│  Atomic writes · audit log · recovery key · file lock  │
│  Signed updater (Ed25519) · hash verify · rollback     │
├─────────────────────────────────────────────────────────┤
│                    POCKET OS                            │
│  USB launcher · environment detection · mode selector  │
│  Provider setup wizard · SpendGate · audio guide       │
│  Telemetry loop (local-only) · signed updater · vault  │
│  Recovery mode · backup/restore · portable identity    │
└─────────────────────────────────────────────────────────┘
```

---

## Agent Tower

35 agents across 8 divisions:

| Division | Agents |
|---|---|
| **Tier 1** | duck, goose, owl, wolf, phoenix, turtle, mantis, crow, moth, fox |
| **Media Ops** | duck, ghost, goose, parrot, phoenix, crow, MoneyPrinter (:8080) |
| **Coding** | C++/Rust, Python, JS/TS, Swift, Audit |
| **Research** | arxiv, deep-research, web, lead-intelligence, polymarket |
| **Operations** | deployer, DB ops, data-scraper, CANN.AI Turbo Terminal |
| **Security** | Smith/Neo adversarial pair, guardian, red-teaming |
| **Creative** | pixel-art, ascii, excalidraw, architecture-diagram |
| **Chaos** | raccoon QA, sticky-finger-testing, canary-watch, dogfood |

```
purpclaw ask duck "analyze this project"
purpclaw ask goose "run chaos tests"
purpclaw harvest scan E:\
purpclaw harvest run
```

---

## Commands

| Command | Purpose |
|---|---|
| `purpclaw doctor` | System health scorecard |
| `purpclaw health` | Compact diagnostic |
| `purpclaw pocket ...` | Pocket OS (init/mode/start/vault/spend/telemetry/update) |
| `purpclaw identity ...` | Portable identity (show/export/import/diff/set/reset) |
| `purpclaw harvest ...` | Data harvester (scan/run/search/status/convert) |
| `purpclaw deploy` | One-command VPS/Docker deploy |
| `purpclaw model use` | Hot-swap active LLM |
| `purpclaw show` | Stack status overview |
| `purpclaw training ...` | Training buffer (status/export/ingest) |
| `purpclaw plan` | Write implementation plans |
| `purpclaw audit` | Code review/audit |
| `purpclaw security` | Security scan |
| `purpclaw test` | Run tests |
| `purpclaw eval` | Run evaluation harness |
| `purpclaw e2e` | End-to-end tests |
| `purpclaw docs` | Documentation audit |
| `purpclaw refactor` | Code refactoring |
| `purpclaw fix` | Build fix |
| `purpclaw logs` | View service logs |
| plus 15+ more |

---

## System Requirements

**Minimum:**
- OS: Windows 10+, macOS 13+, Linux (x86_64)
- RAM: 8 GB
- Storage: 2 GB (more for local models)
- CPU: x86-64 (Sandy Bridge 2011+), no AVX2 required

**Recommended for local models:**
- GPU: 6+ GB VRAM (RTX 2060-class)
- Ollama or compatible local runtime

**Pocket OS:**
- Any USB drive (at least 8 GB recommended for models)
- No admin rights required (click-to-run launcher)

---

## Version

**Current: v0.2.0**

[CHANGELOG](CHANGELOG.md) · [CONTRIBUTING](CONTRIBUTING.md) · [SECURITY](SECURITY.md)

---

## License

MIT — do what you want with the claw. Just don't blame the raccoon when it turns out you shouldn't have given an AI framework root access to your filesystem and a credit card. 🦀🦝
