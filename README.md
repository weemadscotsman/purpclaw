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

## Current Local Maps

The live architecture, route, service, and build maps start here:

- [docs/CANONICAL_MAP.md](docs/CANONICAL_MAP.md)
- [docs/WHERE_THINGS_GO.md](docs/WHERE_THINGS_GO.md)
- [docs/ROUTING_AND_BUILD_SPEC.md](docs/ROUTING_AND_BUILD_SPEC.md)
- [docs/ROUTE_INDEX.md](docs/ROUTE_INDEX.md)
- [docs/SERVICE_RUNTIME_INDEX.md](docs/SERVICE_RUNTIME_INDEX.md)

If older root docs or audit notes disagree with those files, verify against the
code and update the canonical docs first.

---

## What It Is

PurpClaw is a **complete AI operating environment** — not just a chatbot or a Claude Code plugin. It runs its own runtime, agent tower, cognitive memory, tool registry, skill system, provider router, SpendGate budget control, voice/vision stack, and USB-portable Pocket OS.

| Product | Purpose |
|---|---|
| **PurpClaw Core** | Local-first AI workstation OS |
| **PurpClaw Pocket OS** | USB-portable private AI (launcher, vault, audio guide) |
| **PurpClaw Agent Tower** | 35+ agents across 9 divisions, native skill execution |
| **PurpClaw Doctor** | One-command system health verification |

### How It Compares

| Feature | ChatGPT | Ollama UI | Portable USB AI | **PurpClaw** |
|---|---|---|---|---:|
| Local models | ✗ | ✓ | ✓ | **✓** |
| API providers | ✓ | ⚠ | ⚠ | **9** |
| Auto model routing | ✗ | ✗ | ✗ | **✓ (classifies your message → best model)** |
| Agent tower | ✗ | ✗ | ✗ | **✓ (35 agents)** |
| Tool registry | ✗ | ✗ | ⚠ | **491 tools** |
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

Checks: tool registry (491 total: 455 built-in + 4 G0DM0D3 + 32 MCP), skill directories (380), manifests (375), services (11 services registered — runtime status varies, run `purpclaw doctor`), cognitive spine (6 engines), vault (encrypted/locked/recovery ready), SpendGate (active), providers (9 configured), dependencies (safe installed, optional quarantined), Pocket OS (launchers present), updater (signed/unsigned status).

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
│  purpclaw ask · doctor · pocket · harvest               │
│  identity · model · show · training · log · audit       │
│  70+ commands                                            │
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
│  491 tools: 455 built-in + 4 G0DM0D3 + 32 MCP           │
│  380 skill dirs · 375 manifests                          │
│  Missing optional deps return install guidance          │
├─────────────────────────────────────────────────────────┤
│                    PROVIDER ROUTER                      │
│  9 providers configured (21 registry keys, 9 usable):   │
│  Ollama · OpenAI · Anthropic · Gemini · DeepSeek        │
│  Groq · Mistral · MiniMax · NVIDIA NIM · Together       │
│  Codex · Atomic Chat · GitHub Models · HuggingFace      │
│  Cloudflare · Cohere · LM Studio · Kimi · GLM · Custom  │
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

35 agents across 9 divisions:

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
| `purpclaw harvest ...` | Data harvester (scan/run/search/status/convert) — module present, dispatch not yet wired (falls through to default) |
| `purpclaw model use` | Hot-swap active LLM |
| `purpclaw show` | Stack status overview |
| `purpclaw training ...` | Training buffer (status/export/backfill/clear/toggle/dedup/quality/diagnose) |
| `purpclaw audit` | Code review/audit |
| `purpclaw logs` | View service logs |
| `purpclaw model test` | Model smoke test |
| plus 60+ more (run `purpclaw help` for full list) | |

> **Note on "phantom" commands:** `deploy`, `plan`, `security`, `test`, `eval`, `e2e`, `docs`, `refactor`, `fix` either have no loader (no module) or are never dispatched in `bin/purpclaw.js` and currently fall through to the AI chat handler at the default case. They are intentionally NOT listed as runnable commands above. Wiring these is a tracked code-side follow-up.

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
