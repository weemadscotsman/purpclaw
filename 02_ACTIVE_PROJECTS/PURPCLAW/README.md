# PURPCLAW

> Version: 0.4.0 - Updated: 2026-07-31 - Branch: `canonical-parity-clean-v2`

PURPCLAW is a local-first AI workstation OS for builders who run multiple agents, providers, and tools simultaneously.

It is not a chatbot, a dashboard, or a toy. It is a terminal-first operating environment that routes requests across 17 providers, manages agents with memory and tooling, runs a cognitive spine with vector search, and exposes a full CLI, TUI, and WebUI.

## Stack Architecture

**34 defined services across 4 tiers:**

| Tier | Count | Behaviour |
|------|-------|-----------|
| CORE | 12 | Always-on by default. Starts via `purpclaw safe-start --core` |
| DARK | 11 | On-demand via `PURPCLAW_SERVICES` env or `purpclaw safe-start --dark` |
| EXTERNAL | 6 | Telegram, Discord, Slack, Email, Xiaozhi, Next.js |
| DEV-ONLY | 5 | Harness, GOOP, Drift Watcher, CoWork, Reasoning |

Default boot: **12 CORE services**. `purpclaw safe-start --core` launches them sequentially with a circuit breaker (3-restart block). `PURPCLAW_SERVICES=all` restores all 34.

See `docs/SERVICE_INVENTORY.md` for the full inventory with ports, entry points, and state ownership.

## Quick Start

```bash
npm install
npx purpclaw help
npx purpclaw status
```

## Core Commands

```bash
# System health
npx purpclaw doctor              # 11-point system check
npx purpclaw health              # service-level health sweep
npx purpclaw health --verbose    # full verbose output

# Startup
npx purpclaw safe-start --core   # sequential boot, 12 CORE services
npx purpclaw safe-start <name>   # single service with circuit breaker
npx purpclaw safe-start --dry-run # show plan, no execution

# Parity + evidence
npx purpclaw parity all          # 84/84 surface slots wired
npx purpclaw stats              # session + token analytics

# Screen tools (look captures your actual desktop)
npx purpclaw look               # desktop screenshot
npx purpclaw screen             # same

# Memory
npx purpclaw memory status       # cognitive spine state
npx purpclaw memory ingest <path> # add files to vector store

# Provider routing
npx purpclaw providers           # show configured providers
npx purpclaw ask --provider <name> # route to specific provider

# Version
npx purpclaw --version
```

## Canonical Parity System

`docs/parity/CANONICAL_PARITY_PRIORITY.md` defines 20 ranked tiers (P0-P3). Surface parity is **84/84** (all action×surface combinations wired). Active gaps include:

- **P0-6** — Skills/commands/hooks/plugins (in progress)
- **P0-7** — Multi-agent workspace isolation (workspaces.json exists; orchestration testing pending)
- **P0-8** — Resumable tokens + replay
- **P0-9** — Verification + evidence harness (not started)
- **P0-14** — IDE extension (not started)

Full rankings and completion status in `docs/parity/CANONICAL_PARITY_PRIORITY.md`.

## Agent Workspaces

Agents operate from `E:/god folder/purpclaw-agent-hub/.purpclaw/workspaces.json`. 12 roles defined: bigboss, purpclaw, research, review, deploy, codereview, security, performance, ops, docs, test, ci.

Worktrees are **banned** — agents operate in the canonical tree unless explicitly isolated. See `AGENT.md` for the full workspace registry and role definitions.

## Provider Routing

17 providers configured: openai, claude, gemini, openrouter, ollama, kimi, deepseek, together, groq, azure, minimax, siliconflow, novita, navigaii, github, cerebras, fireworks.

Current active: **minimax** (`LLM_PROVIDER=minimax`, `LLM_MODEL=MiniMax-M3`). SpendGate active — daily cap 1M tokens, per-request cap 16k tokens.

## Tool Registry

- **520 registered tools** (as of 2026-07-31)
- **381 Hermes skills** mapped as native PURPCLAW tools
- Native spine: screen, GUI, execution, file, web, clipboard, process, music, Remotion
- `purpclaw tool --list` to enumerate

## Key Files

| File | Purpose |
|------|---------|
| `bin/purpclaw.js` | CLI entry, 21 action cases |
| `AGENT.md` | Workspace registry + agent roles |
| `docs/SERVICE_INVENTORY.md` | Full service inventory with tiering |
| `docs/parity/CANONICAL_PARITY_PRIORITY.md` | 20-rank parity system |
| `lib/agent-gateway.js` | Routing layer — all agents route through here |
| `lib/cognitive_gateway.js` | Cognitive spine (port 7880) |
| `lib/memory/spine/` | Vector memory engine |
| `lib/commands/safe-start.js` | Sequential service launcher with circuit breaker |
| `lib/commands/stats.js` | Token/session cost analytics |
| `ecosystem.config.js` | PM2 stack definition |

## Version History

- **0.4.0** (2026-07-31) — Canonical parity (84/84), SERVICE_INVENTORY, safe-start circuit breaker, agent workspace registry, cognitive spine with per-atom fallback, unified_api refactor
- **0.3.0** (2026-06-29) — Soul registry, Studio modes, Dynamic Council, Timeline, Evolution loop
