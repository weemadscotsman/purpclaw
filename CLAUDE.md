# PURPCLAW — Project Context for Claude Code

> Last updated: 2026-05-25 (post-STABILITY-7).
> Canonical narrative: **[docs/SYSTEM_OVERVIEW.md](./docs/SYSTEM_OVERVIEW.md)**
> Recovery runbook: **[docs/RECOVERY.md](./docs/RECOVERY.md)**

---

## What Is This?

PURPCLAW is a persistent AI orchestration runtime — a 25-service distributed agent platform that runs locally under PM2 supervision, dispatches to a 44-agent swarm tower, falls back to an HMAC-signed HTTP/SSH worker pool when capacity hits, and presents itself through a CLI front door (`purpclaw`), a Next.js Mission Control UI (:3000), and a full-screen TUI cockpit (`purpclaw tui`).

It is **not** a chatbot. It is a governed operational kernel for software, automation, and cognition workflows.

## Stack Topology

### Two agent layers (these are distinct — do not conflate)

- **Layer A — Swarm agents (in-tower)**: 44 animal-themed agents defined in-code in `agent_tower.js` (penguin, dragon, wolf, owl, karen, etc.). Divisions: ENGINEERING, SECURITY, INTELLIGENCE, OPERATIONS, MANAGEMENT, MEDIA_OPS, SCIENCE, CREATIVE, INFRASTRUCTURE.
- **Layer B — Persona files**: 38+ `agents/*.md` files. Some are Claude Code agent definitions (architect, code-reviewer); one (`karen.md`) mirrors a Layer-A swarm animal. Most Layer-A animals **don't yet have** persona files — see `purpclaw roster --missing`.

### Service ports (25 PM2 entries, 16 core + 9 dark)

**Core (always-on baseline):**

| Port | Service | PM2 Name |
|---|---|---|
| 3000 | Mission Control UI | purpclaw-nextjs (dev mode) |
| 7780 | Unified API | purpclaw-api |
| 7782 | EventBus | purpclaw-eventbus |
| 7783 | State Store | purpclaw-state |
| 7784 | Orchestrator | purpclaw-orchestrator |
| 7785 | Modal Logic | purpclaw-modal |
| 7786 | Diagnostics | purpclaw-diagnostics |
| 7787 | Rules Engine | purpclaw-rules |
| 7790 | Agent Tower | purpclaw-tower |
| 7791 | Gatekeeper | purpclaw-gatekeeper |
| 7880 | Memory Matrix | purpclaw-memory |
| 7881 | Context Bus | purpclaw-context |
| 7884 | Neuro-Symbolic Bridge | purpclaw-bridge-ns |
| 7885 | Knowledge Pool | purpclaw-pool |
| 7890 | Metrics Aggregator | purpclaw-metrics |
| 7897 | Worker Pool (overflow lane) | purpclaw-workers |

**Defined-but-dark cluster (off by default — `purpclaw safe-start --dark` to wake):**
voice (7781), bridge (7792), chorus, vision (7889), reasoning (7892), autodream (7895), stt (7896), yolo (7779), avatar (7777).

## ⚠️ CRITICAL — Windows Safety Rule

**On 2026-05-25 the operator's desktop crashed** from a cmd-window spawn cascade triggered by starting multiple PM2 services simultaneously. The chain was: `pm2 start ecosystem.config.js --only A,B,C,D` → one service crash-loops → each restart flashes a cmd window because `windowsHide: true` doesn't always survive the Python-interpreter crash path → Explorer chokes.

**Never run `pm2 start` directly on multiple services.** Always use:

```bash
purpclaw safe-start --core         # 16 stable services, one-at-a-time
purpclaw safe-start --dark         # the flaky cluster, one-at-a-time
purpclaw safe-start <name>         # a single named service
```

`safe-start` has a stabilisation watch (3.5s) and a circuit breaker (refuses anything with >3 historical restarts unless `--force`). This is structural — the cascade is no longer reachable via the CLI.

## Key CLI Commands (the AI should know these by heart)

```bash
purpclaw                           # drop into chat REPL (stack-aware, session-persistent)
purpclaw help                      # full command cathedral
purpclaw architecture              # live runtime overview
purpclaw overview                  # canonical doc (docs/SYSTEM_OVERVIEW.md)
purpclaw doctor                    # health check with PM2 cross-reference
purpclaw smoke                     # 13-check end-to-end self-test (CI-ready)
purpclaw heal                      # diagnose stack state, print recovery plan
purpclaw heal --execute            # apply the plan via safe-start
purpclaw safe-start --core         # wake the 16-service baseline
purpclaw safe-stop --dark          # put the dark cluster back to sleep
purpclaw status                    # live dashboard
purpclaw run "<task>"              # dispatch to the swarm (streams progress live)
purpclaw roster                    # tower agents vs persona files
purpclaw gc                        # garbage-collect agent_work/
purpclaw workers status            # worker pool state
purpclaw workers secret            # generate fresh HMAC worker secret
purpclaw pool query "<text>"       # keyword-search the skill index
purpclaw memory [query]            # recall from memory matrix
purpclaw spaghetti audit           # code quality enforcement
purpclaw teleport create [name]    # bundle state for handoff
purpclaw tui                       # full-screen cockpit
purpclaw mochi                     # chat with the companion
purpclaw forge [name]              # gacha-style agent generation
```

## Critical Patterns

### Spawn pattern (prevent spawn bomb)

Any fire-and-forget child process MUST be:

```javascript
spawn(cmd, args, {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,    // critical on Windows — see cascade above
  env: { ... }
});
child.unref();
```

**Wrong**: `stdio: ['pipe','pipe','pipe']` without `unref()` — pipe handles tether parent to child, causing process accumulation across PM2 restarts.

### PM2 invocation from CLI

The `pm2()` wrapper in `bin/purpclaw.js` uses `cmd.exe /c npx pm2 ...` on Windows with `windowsHide: true`. `lib/commands/safe-start.js` and `safe-stop.js` do the same. **Never bypass these** — direct `npx pm2 start` calls don't get the same wrapping and can spawn visible windows.

### Secret redaction

`process.stdout` and `process.stderr` are wrapped at CLI startup by `lib/secret-redactor.js`. Every print goes through pattern matchers that mask API keys, JWTs, hex blobs, bearer tokens, and URL-embedded tokens. Opt out with `PURPCLAW_NO_REDACT=1` for debugging.

### EventBus reconnection (prevent DOS)

Services connecting to EventBus (:7782) MUST use exponential backoff:

```javascript
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;
// delay = min(BASE * 2^attempts, MAX)
```

Fixed-delay reconnects in companion-chorus historically caused EventBus DOS — fixed by this pattern.

## Environment Variables

`.env` must exist at project root. Key vars:

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | minimax / anthropic / gemini / openai / kimi / groq / deepseek / openrouter / ollama / custom |
| `LLM_API_KEY` | Provider API key (auto-sanitised by wizard) |
| `LLM_MODEL` | e.g. `MiniMax-M2.7` |
| `XIAOZHI_MCP_URL` | Optional, for the AI ball |
| `WORKER_SECRET` | HMAC secret for worker pool auth |
| `PYTHON_BIN` | Python 3.11 path (auto-detected if unset) |

`purpclaw init --wizard` walks through setup with key sanitisation (catches doubled paste, asterisk bleed, etc.) — see `lib/secret-redactor.js`.

## Operational Rules (for the agent working in this repo)

- **You CAN kill processes** if you can verify they're not the agent's own process or PM2's daemon. Use `taskkill /F /PID <pid>` on Windows after confirming PID identity via `tasklist /FI "PID eq <pid>"`. Some processes may be elevation-protected — those need an admin terminal.
- **NEVER skip git hooks** (`--no-verify`, `--no-gpg-sign`) unless explicitly asked.
- **NEVER commit `.env` or `agent_work/`** — both are in `.gitignore`.
- **PREFER `purpclaw safe-start` over `pm2 start`** — always, no exceptions.
- **VERIFY with `purpclaw smoke`** after any service-state change.

## Recent Major Work (last session — 2026-05-25)

Seven `STABILITY-*` commits banked:

```
STABILITY-7: RECOVERY runbook, TUI hint sanitised, roster command
STABILITY-6: heal recovery command + karen persona file
STABILITY-5: --core profile, doctor + ask now recommend safe-start
STABILITY-4: safe-start guardrail — prevent Windows cmd-window cascade
STABILITY-3: enshrine System Overview, render in terminal, refresh README
STABILITY-2: smoke test, agent-layer fix, untrack runtime cruft
STABILITY-1: front door, secret redaction, self-knowledge, housekeeping
```

If picking up where things left off: read `docs/RECOVERY.md` first, then run `purpclaw heal` to see what state the stack is in.

## Documentation Index

| File | Status | Purpose |
|---|---|---|
| `docs/SYSTEM_OVERVIEW.md` | ✅ CURRENT | Canonical architecture + philosophy + maturity model |
| `docs/RECOVERY.md` | ✅ CURRENT | Operator runbook for crash recovery |
| `README.md` | ✅ CURRENT | Top-level pointer + 5-minute quickstart |
| `CLAUDE.md` (this file) | ✅ CURRENT | What every future Claude session reads on entry |
| `TEAM_HANDOVER.md` | ⚠️ partially stale | Handover notes, may predate STABILITY commits |
| `QUICKSTART.md` | ⚠️ may be stale | Quick-start guide, may need refresh |
| `CAPTAINS_LOG.md` | ⚠️ partially stale | Session history (26KB — large, last updated 2026-05-24) |
| `PURPCLAW_Runbook.md` | ❌ DEPRECATED | Replaced by `docs/RECOVERY.md` |
| `PURPCLAW_COMPLETE_ARCHITECTURE.md` | ❌ STALE | 2026-04-20 — describes 18-service stack; we now have 25 |
| `agent-frameworks-INTEGRATION.md` | ❌ STALE | 2026-04-20 — historical reference only |
| `HARVEST_MANIFEST.txt` | ❌ STALE | 2026-04-20 — one-off, can be removed |
| `agent_profiles.json` | ⚠️ partially stale | 2026-04-25 — predates Layer-A/B reconciliation |

## Known Gaps (as of 2026-05-25)

1. **43 swarm animals lack persona files.** User has them in Codex (43 agents / 222 skills, 30-at-a-time load cap). Migration plan: use `purpclaw roster --json` to drive a controlled extraction.
2. **YOLO (:7779) + Avatar (:7777) are orphan processes** — they answer their ports but PM2 doesn't supervise them. They were started with elevation; need an admin terminal to clean up.
3. **Dark cluster intentionally dark.** Voice, vision, autodream, reasoning, stt, chorus stay off by default. `safe-start --dark` to wake when needed.

## What NOT To Do (updated)

- **Never** call `pm2 start ecosystem.config.js --only ...` directly — use `purpclaw safe-start`. (The original CLAUDE.md said "never kill running processes" — that rule has been relaxed by the operator: you CAN stop processes you verify aren't your own or PM2's daemon, but you should still ask before killing anything ambiguous.)
- **Never** commit secrets, agent_work/, or untracked vendored projects without operator confirmation.
- **Never** start the dark cluster without `safe-start --dark` (or single-service safe-start) — direct `pm2 start` on those is the exact pattern that crashed the desktop.
- **Never** trust port reachability alone — always cross-reference with `pm2 jlist` to catch orphans.
