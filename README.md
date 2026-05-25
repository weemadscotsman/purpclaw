# PURPCLAW

> **A resident autonomous agent runtime with a CLI front door.**
> Open knowledge pool. 139+ skills. 44 swarm agents (animal-themed, in-tower) + 38 Claude Code agent definitions. 18 companion sprites. Governance gates that actually hold execution.

📖 **For the full architecture, philosophy, and operational maturity model:** see [docs/SYSTEM_OVERVIEW.md](./docs/SYSTEM_OVERVIEW.md)

---

## 5-minute quickstart

### Windows (PowerShell)
```powershell
git clone <your-purpclaw-repo>.git
cd purpclaw
.\install.ps1
```

### macOS / Linux
```bash
git clone <your-purpclaw-repo>.git
cd purpclaw
./install.sh
```

The install script will:
1. Verify Node.js 18+ and PM2
2. Install dependencies
3. Walk you through a wizard: pick an LLM provider, paste a key, name a companion
4. Hatch your first mochi
5. Smoke-test the LLM

Once it finishes:

```bash
purpclaw start          # boot the swarm (8 core services)
purpclaw mochi          # chat with your companion
purpclaw doctor         # health check
purpclaw run "build me a landing page about hot sauce"
```

Mission Control web UI: **http://localhost:3000**

Full first-run guide → [docs/QUICKSTART.md](docs/QUICKSTART.md)
Architecture → [docs/audit/PURPCLAW_AUTONOMOUS_CHARTER.md](docs/audit/PURPCLAW_AUTONOMOUS_CHARTER.md)
Ship plan → [docs/audit/PURPCLAW_SHIP_PLAN.md](docs/audit/PURPCLAW_SHIP_PLAN.md)

---

## What is it actually

PURPCLAW is **not** a coding assistant. It's a **personal operations runtime** for AI work — a small local Kubernetes for agents. It runs as a swarm of PM2 services that stay alive between sessions, queries an open knowledge pool any process can ask anything, routes work through animal-mascot specialists, and gates risky actions through governance approval.

Compared to other tools:

| | Claude Code / Codex / Cursor | PURPCLAW |
|---|---|---|
| Lives between turns | ❌ stateless | ✅ PM2 services |
| Knowledge pool | baked into prompt | open service, queryable mid-task |
| Multi-agent | partial | 38 specialists + 44 routing profiles |
| Voice / vision / web UI | usually one | all four |
| Companion personality | ❌ | 🐙 Mochi (18 species) |
| Governance | pre-approval allowlist | runtime approval gates |
| Local-first | depends | yes, BYO LLM key |

---

## Origin / archaeology

Originally built from **GOOP harvested from Claude Code System + Conway Ecosystem**.

---

## WHAT WE STOLE (2026-04-20)

### From E:\claude-code-system\
- **NanoClaw v2 REPL** (`scripts/nanoclaw.js`) — Zero-dependency session-aware REPL around `claude -p`
- **ECC CLI** (`scripts/ecc.js`) — Selective-install command system
- **22 Library Files** (`lib/`) — session-manager, package-manager, agent-compress, orchestration, etc.
- **5 Agent Skills**:
  - `autonomous-agent-harness` — Full autonomous loop, crons, memory, computer use
  - `agentic-engineering` — Agentic AI patterns and best practices
  - `continuous-agent-loop` — Loop patterns for persistent operation
  - `enterprise-agent-ops` — Enterprise-grade agent operations
  - `nanoclaw-repl` — NanoClaw REPL operation skill
- **16 Steering Files** (`steering/`) — coding-style, dev-mode, research-mode, patterns, security, etc.
- **Persona Forge References** — identity-tension, boundary-rules, naming-system, avatar-style

### From E:\claude-code-system\ (buddy_TAMAGOTCHI)
- **18 Companion Species** — All hex-encoded to dodge build scanners
- **Gacha Rarity System** — common 60%, uncommon 25%, rare 10%, epic 4%, legendary 1%
- **Stats System** — DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK
- **Hat System** — crown, tophat, propeller, halo, wizard, beanie, tinyduck
- **Shiny Variants** — 1% drop rate
- **TAMAGOTCHI Companion Sprite Engine** — ASCII art companions with idle animation

### Secrets Discovered
- **Tengu codename** — Internal project name, all telemetry starts with `tengu_`
- **Deepgram Nova 3** — Voice mode STT
- **472 eslint-disable comments** — "You're writing JavaScript with extra steps"
- **Ultraplan** — 30-min Opus session for remote task planning
- **Coordinator Mode** — Multi-agent swarm with workers and scratchpads
- **17 Disabled Stub Commands** — All return `isEnabled: false`

---

## STATUS
HARVEST COMPLETE. INTEGRATION PENDING.

---

## LOBSTER GACHA
Run: `python C:\Users\Admin\Desktop\PURPCLAW\gacha.py [1-5]`
Result: `C:\Users\Admin\Desktop\PURPCLAW\gacha_result.txt`

8,000,000 lobster soul combinations.
