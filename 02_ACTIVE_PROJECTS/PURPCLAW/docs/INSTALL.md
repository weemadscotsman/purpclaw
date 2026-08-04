# PURPCLAW Install And Runtime Modes

Last verified: 2026-07-20 from live code and package metadata.

## Source Of Truth

This page is derived from:

- `package.json`
- `.env.example`
- `bin/purpclaw.js`
- `lib/commands/setup.js`
- `lib/commands/safe-start.js`
- `service_registry.js`
- `ecosystem.config.js`
- `lib/runtime/ports.js`

If another doc disagrees, trust those files first.

## Requirements

- Node.js `>=22.0.0 <25.0.0`
- npm `>=10.0.0`
- PM2 for the multi-service runtime (`npx pm2 ...` is used by the CLI)
- Python 3.11 for Python-backed optional services
- Ollama or LM Studio only if you want local/free model mode

The declared package manager is `pnpm@9.15.0`; use pnpm for reproducible workspace installs.

## One-Liner Install

PowerShell:

```powershell
git clone https://github.com/weemadscotsman/purpclaw.git; cd purpclaw; npm install; node bin\purpclaw.js setup --quick; node bin\purpclaw.js safe-start --core
```

Bash:

```bash
git clone https://github.com/weemadscotsman/purpclaw.git && cd purpclaw && npm install && node bin/purpclaw.js setup --quick && node bin/purpclaw.js safe-start --core
```

Open Mission Control at:

```txt
http://127.0.0.1:3030/mission
```

## Local Model Mode

Ollama is the default local path in `.env.example`.

```powershell
copy .env.example .env
ollama pull qwen2.5:3b
node bin\purpclaw.js setup --quick
npm run dev
```

Relevant local settings:

```txt
LLM_PROVIDER=ollama
LLM_MODEL=qwen2.5:3b
LLM_FALLBACK=ollama
LLM_FALLBACK_MODEL=qwen2.5:3b
```

LM Studio is also a first-class local provider through `purpclaw setup`.

## Hosted Provider Mode

Use the setup command to select and write provider config:

```bash
node bin/purpclaw.js setup
node bin/purpclaw.js setup --list
```

Live provider options in `lib/commands/setup.js`:

```txt
openai, anthropic, gemini, deepseek, openrouter, groq, kimi, together,
mistral, minimax, github, codex, ollama, lmstudio, atomic, custom
```

API keys are written to `.env` when required. Local providers do not require API keys.

## Runtime Modes

Registry launch profiles from `service_registry.js`:

```bash
node bin/purpclaw.js profiles
node bin/purpclaw.js start --profile=minimal
node bin/purpclaw.js start --profile=harness
node bin/purpclaw.js start --profile=voice
node bin/purpclaw.js start --profile=vision
node bin/purpclaw.js start --profile=cognitive
node bin/purpclaw.js start --profile=goop
node bin/purpclaw.js start --all
```

Sequential safe launcher from `lib/commands/safe-start.js`:

```bash
node bin/purpclaw.js safe-start --core
node bin/purpclaw.js safe-start --dark
node bin/purpclaw.js safe-start --all
node bin/purpclaw.js safe-start nextjs
node bin/purpclaw.js safe-start eventbus state api
```

Prefer `safe-start` on Windows. `ecosystem.config.js` explicitly warns against raw `pm2 start ecosystem.config.js` because safe-start launches one service at a time with a circuit breaker.

## Ports

Core verified ports:

```txt
3030  Mission Control UI
7780  Unified API
7782  EventBus
7783  State Store
7784  Orchestrator
7790  Agent Tower
7791  Gatekeeper
7881  Context Bus
7885  Knowledge Pool
7890  Metrics Aggregator
7897  Worker Service
7898  Swarm Coordinator
```

Optional ports include voice, vision, cognitive, harness, companion, and telemetry services. Use the live registry:

```bash
node bin/purpclaw.js services list
node bin/purpclaw.js services scan
```

## Cost And USD Guardrails

The research cost cap is configured in `.env.example`:

```txt
PURPCLAW_RESEARCH_COST_CAP_USD=5.0
```

The model-call governor lives in `lib/usage-governor.js` and tracks provider call pressure, token estimates, cooldowns, cache hits, and active calls. Mission Control exposes ledger data through `/api/llm-ledger`.

## Verification

After install or a runtime change:

```bash
node bin/purpclaw.js doctor
node bin/purpclaw.js services scan
node bin/purpclaw.js feature --verify --json
npm run docs:check
```
