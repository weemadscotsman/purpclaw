# PURPCLAW Quickstart
> Last updated: 2026-06-06

You should be running PURPCLAW within 5 minutes of opening this page.

---

## What you need

- **Node.js 18 or newer** — `node -v` should show `v18+`
  Install: <https://nodejs.org/> (LTS recommended)
- **A terminal** — PowerShell on Windows, bash/zsh on macOS/Linux
- **An LLM API key** — any of these works:
  - MiniMax (recommended — generous tier, has the M2.7 model)
  - Anthropic Claude
  - OpenAI
  - Kimi / Moonshot
  - Groq, DeepSeek, OpenRouter (all OpenAI-compatible)
  - Or **none** — run Ollama locally for free
- **Optional but recommended:** Python 3.11 — enables cognitive services (memory matrix, neuro-symbolic bridge)

---

## Install

### Windows
```powershell
cd path\to\purpclaw
.\install.ps1
```

### macOS / Linux
```bash
cd path/to/purpclaw
./install.sh
```

If you'd rather run the steps by hand:
```bash
npm install
npm install -g pm2     # if not installed
node bin/purpclaw.js init --wizard
```

---

## The wizard

The first-run wizard asks you three things:

1. **Which LLM provider?** — Pick by number. MiniMax (1) is what we've been using.
2. **Your API key** — input is hidden as you type; press Enter when done.
3. **A seed for your companion** — anything. Your username, your favorite word, the date. The seed determines species, eye, hat, and rarity deterministically. Same seed = same companion forever.

The wizard then:
- Writes your choices to `.env`
- Hatches your mochi
- Sends a single test message to the LLM to confirm the key works
- Tells you what to do next

---

## First commands

### Boot the swarm
```bash
purpclaw start
```

You'll see a live animated table — 8 core services come online one by one (eventbus, state, api, tower, orchestrator, gatekeeper, metrics, pool, mission-ctrl). The whole stack typically lights up in 5–10 seconds.

### Chat with your companion
```bash
purpclaw mochi
```

Your companion will appear, blink at you, and wait. It knows what's in the knowledge pool — you can ask things like:

> who would handle a memory leak?
> what skills do you have for security audits?
> what did I work on last?

Type `bye` to leave. Your companion remembers; come back any time.

### Run an agent
```bash
purpclaw run "build me a one-page landing site about hot sauce"
```

This dispatches the right specialist (probably `dragon` for architecture + `mushroom` for UI feel) through the orchestrator. They query the pool for relevant skills, do the work in their own workspace under `agent_work/<agent>/`, and report back.

If the job is risky (deploy, delete, secret changes), the orchestrator will pause and ask you to approve. List pending approvals with `purpclaw approve list` and approve with `purpclaw approve yes <id>`.

### Health check
```bash
purpclaw doctor
```

A read-only check of every service, dependency, and config. Run this whenever something feels off.

### Mission Control
Once the swarm is up, open <http://localhost:3000> in your browser for the visual dashboard.

---

## Troubleshooting

| Symptom | Try |
|---|---|
| `node` not found | Install Node.js 18+ from nodejs.org |
| `pm2: not found` | `npm install -g pm2` (on macOS/Linux may need `sudo`) |
| `purpclaw doctor` reports a service offline | Look at logs: `npx pm2 logs <purpclaw-servicename> --lines 30 --nostream` |
| Mission Control (port 3000) doesn't load | Run `npm run build` once to populate `.next/`, then `purpclaw restart purpclaw-nextjs` |
| Mochi says "offline · set X_API_KEY" | Either no key is in `.env`, or auto-detection didn't pick yours — re-run `purpclaw init --wizard` |
| LLM responses contain `<think>...</think>` | MiniMax-M2.7 reasoning leaks — mochi strips these automatically; if you see them elsewhere it's the raw model output |

For anything else: open an issue with the output of `purpclaw doctor` attached.

---

## What to explore next

| Command | What it shows you |
|---|---|
| `purpclaw pool` | Knowledge-pool stats (139 skills, 38 agents, 44 routing profiles) |
| `purpclaw pool query "<text>"` | Keyword-search the skill library |
| `purpclaw pool routing "<task>"` | Which specialist would handle a task |
| `purpclaw agents` | The full mascot roster with success rates |
| `purpclaw status` | Live dashboard: services + leaderboard + breakers |
| `purpclaw workflows` | Active and recent agent workflows |
| `purpclaw spaghetti audit` | Code-health scoring across the repo |
| `purpclaw introspect` | Read-only self-inspection of the runtime |
| `purpclaw policies` | The current governance policy |
| `purpclaw config` | Interactive config editor (arrow keys to navigate) |

---

## Architecture in one paragraph

PURPCLAW runs as **five layers**: Perception (screen + workspace awareness) → Knowledge Pool (open, queryable, persistent) → Reasoning (proactive scanner, not yet running) → Execution (orchestrator + agent tower + job contracts) → Governance (approval gates + rollback). Every layer reads and writes through the pool. Spawned agents are told to query the pool whenever uncertain — no closed-loop context injection.

Full spec: [`docs/audit/PURPCLAW_AUTONOMOUS_CHARTER.md`](audit/PURPCLAW_AUTONOMOUS_CHARTER.md)
