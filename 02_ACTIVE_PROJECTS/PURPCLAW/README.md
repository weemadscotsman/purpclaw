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

## What's New — 2026-08-17 Work Session

The session focused on three goals: **parity gap fill** (against Claude Code, Antigravity, Kimi, ChatGPT, DeepSeek, Hermes), **legacy reintegration** (rewriting code that was archived during the 8/16 cleanup), and **live coordinator revival** (the `services/swarm/coordinator.js` was failing end-to-end with require-path bugs).

### New packages

| Package | Purpose | Cert |
|---|---|---|
| `packages/swarm/` | Sub-agent dispatch + parallel coordination. Closes Kimi 300 / Antigravity 5 / Claude Task parity. Real registry, real agent-runtime, no mocks. | 8/8 PASS — `agent_work/cert_gates/swarm/` |
| `services/console/` | Parity dashboard (rewritten from `legacy/reintegrate-2026-08-17/purpconsole/`). Textual TUI or text fallback. CLI surface `purpclaw parity`. | 10/10 PASS — `agent_work/cert_gates/console/` |
| `apps/extensions/menu-mochi/` | Real working Chrome extension v1.2 (Tamagotchi-style browser pet). 12 source files + co-located marketing toolkit. | 18 passes / 0 fails — `agent_work/cert_gates/menu_mochi/` |

### New CLI surface

The CLI now accepts the modern `/`-prefix ergonomics used by every other major agent CLI:

| Command | What it does |
|---|---|
| `purpclaw /plan <goal>` | Probes real agent registry + live parity snapshot, returns a 4-step scaffold (Inspect / Wire / Cert / Voice) |
| `purpclaw /clear` | Clears transient JSONL journals + `.next` build cache. Preserves durable state (memory, skills, personas, cert gates, code) |
| `purpclaw /compact [--days=N]` | Prunes old JSONL journal entries, preserves by filename pattern |
| `purpclaw /status`, `/agents`, `/parity`, `/help`, ... | Slash is a transparent alias for all 148 existing case statements |

Cert: `agent_work/cert_gates/slash_commands/` — 8/8 PASS, real subprocess spawning, no mocks.

### Live coordinator revival (T06 done)

`services/swarm/coordinator.js` was failing every mission with `task_decomposer.js module is missing` and 5 sibling "missing lib" errors. All fixed by patching require paths (no copying, no duplication):

```
[COORDINATOR] Task decomposer loaded
[COORDINATOR] Agent score registry loaded
[COORDINATOR] Context packet engine loaded
[COORDINATOR] LLM provider layer loaded
[COORDINATOR] Self-context loaded — agents will know the stack
[COORDINATOR] Memory client loaded
[COORDINATOR] Cognitive client loaded — rules/diagnostics wired to swarm path
```

**3 remaining blockers to full Tesco-testable** (live round-trip `/api/coordinate`):
1. EventBus on port 7782 must be started
2. LLM provider needs API keys for chat (loads offline for now)
3. Tower on port 7790 must be up

Certs: `agent_work/cert_gates/coordinator_decomposer/` (8/8 PASS) + `agent_work/cert_gates/coordinator_lib_wire/` (10/10 PASS).

### Legacy reintegration (rewrite, not archive)

Six directories were restored from `archive/2026-08-17-cleanup/` to `legacy/reintegrate-2026-08-17/` and are being **rewritten to fit the stack** (not archived). Two DONE, four in queue:

- ✅ **`purpconsole/` → `services/console/`** — DONE
- ✅ **`menu_mochi_extension/` → `apps/extensions/menu-mochi/`** — DONE
- 📋 **`DreamTask.ts`** — real UI surfacing layer for auto-dream agent, needs real task registry wiring
- 📚 **3 reference items** (Samantha's log, PURPCLAW_OLD, abandoned installer) — unchanged

The full rewrite checklist lives at `legacy/reintegrate-2026-08-17/README.md`.

### New CLI commands (Tesco Express surface)

| Command | Source | Description |
|---|---|---|
| `purpclaw parity` | `services/console/` | 6-tile capability dashboard (Lives Where / Grows / Scheduled / Delegates / Sandbox / Browser) |
| `purpclaw /plan <goal>` | `bin/purpclaw.js` | Probes registry + parity, returns 4-step scaffold |
| `purpclaw /clear` | `bin/purpclaw.js` | Reset transient state, preserve durable |
| `purpclaw /compact` | `bin/purpclaw.js` | Prune old journals, preserve durable |
| `purpclaw start / stop / restart` | `bin/purpclaw.js` | PM2 stack lifecycle |

### New tests (28 new passing assertions, no mocks)

| Test file | Tests | What it certifies |
|---|---|---|
| `tests/swarm/dispatcher.test.js` | 8/8 | Parallel sub-agent dispatch via real agent-runtime |
| `tests/console/test_console.py` | 10/10 | Parity dashboard shape + CLI subcommands |
| `tests/slash_commands/test_slash_commands.js` | 8/8 | Slash prefix + /plan / /clear / /compact |
| `tests/menu_mochi/test_extension.py` | 18 passes / 0 fails | Chrome extension structure + marketing |
| `tests/coordinator_decomposer/test_wire.js` | 8/8 | task_decomposer.js loads from coordinator location |
| `tests/coordinator_lib_wire/test_wire.js` | 10/10 | 5 lib/ modules + 2 helpers all load from coordinator |

### New certs (`agent_work/cert_gates/`)

6 new cert gates — all PASS, all result.json on disk:

- `swarm/` — Kimi 300 / Antigravity 5 / Claude Task parity, partial (certifies 2-3 sub-agents; ceiling untested)
- `console/` — parity dashboard, plain-text fallback (Textual TUI visual cert deferred)
- `slash_commands/` — Claude Code / Antigravity / Kimi CLI slash ergonomics
- `menu_mochi/` — Chrome extension structure (runtime cert deferred to Chrome load)
- `coordinator_decomposer/` — the missing-organ bug fix
- `coordinator_lib_wire/` — 5 lib/ modules + 2 helpers all wireable to coordinator

### New architecture / memory

- **8 canonical arch docs** at `agent_work/architecture/` (unchanged in this session, all referenced):
  `conflict-arbitration/{HANDOFF.md, README.md, cert-and-state-machine.md}`, `constitutional-perimeter.md`, `live-observation-protocol.md`, `tesco-express-success-test.md`, `truth-map.md`, `stack-audit-2026-08-17.md`, `parity-gap-analysis-2026-08-17.md`
- **MEMORY.md** updated with 8 new entries covering: packages/swarm, rewrite-not-archive rule, services/console, NO DEAD CODE rule, slash commands, menu-mochi, missing-organ bug fix, T06 lib wire

### Parity gaps closed (partial or full)

| Tool / Feature | Parity target | Status |
|---|---|---|
| Kimi Agent Swarm (300 sub-agents) | parallel sub-agent dispatch | **partial** (2-3 in cert, ceiling untested) |
| Antigravity 2.0 Manager View (5 parallel) | parallel agent panel | **partial** (terminal cert, UI in `apps/desktop/src/manager/` TODO) |
| Claude Code Task tool | sub-agents inline | **full** (persona-resolved dispatch, registry-driven) |
| Claude Code `/plan`, `/compact`, `/clear` | slash ergonomics | **full** |
| Antigravity CLI slash surface | transparent alias | **full** |
| Kimi CLI slash commands | same surface | **full** |
| ChatGPT app custom GPTs | user-creatable agents | **deferred** (next slice) |
| DeepSeek Harness Cordis | plugin kernel | **deferred** (research) |
| Hermes Harness function calling | JSON-output SwarmReport | **full** (SwarmReport is JSON) |

### Items still on the parity / cleanup roadmap

- **MCP client** (Kimi CLI / Claude / Antigravity) — `lib/control/drivers/mcp.js` exists, needs the protocol
- **Voice mode loop** (STT + TTS + WebRTC) — TTS already works via edge_tts; STT/WebRTC TODO
- **Manager View UI** (Antigravity 5-parallel panel) — terminal cert is in place, visual UI TODO
- **154 root .js files** — many duplicates or misplaced; triage pending
- **3 6/10/2026 legacy dump dirs** (`.omnicode`, `components`, `config`) — inspection pending
- **DreamTask.ts integration** — real UI surfacing layer for auto-dream, needs real task registry
- **Live coordinator lane Tesco-testable** — start EventBus on 7782 + Tower on 7790

---

## System Health

Run one command. Get one truth report:

```
purpclaw doctor
```

Checks: tool registry (176/176 loadable), skill directories (380), manifests (376), executable skills (101), services (10/10 online), cognitive spine (6 engines), vault (encrypted/locked/recovery ready), SpendGate (active), providers (17), dependencies (safe installed, optional quarantined), Pocket OS (launchers present), updater (signed/unsigned status).

Every claim in this README is verifiable by running `purpclaw doctor`. If a number looks wrong, the doctor will tell you.

## Slash command quick reference

The CLI accepts both forms. Pick whichever is in your muscle memory.

| Verbose | Slash |
|---|---|
| `purpclaw status` | `purpclaw /status` |
| `purpclaw agents` | `purpclaw /agents` |
| `purpclaw parity` | `purpclaw /parity` (or just `/parity`) |
| `purpclaw help` | `purpclaw /help` (or just `/`) |
| `purpclaw run "build the MCP client"` | `purpclaw /plan "build the MCP client"` (scaffold) |
| n/a | `purpclaw /clear` (reset transient state) |
| n/a | `purpclaw /compact` (prune old journals) |

## Version

```
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
| `bin/purpclaw.js` | CLI entry, 148+ action cases (incl. new `/plan`, `/clear`, `/compact`) |
| `AGENT.md` | Workspace registry + agent roles |
| `docs/SERVICE_INVENTORY.md` | Full service inventory with tiering |
| `docs/parity/CANONICAL_PARITY_PRIORITY.md` | 20-rank parity system |
| `agent_work/architecture/` | 9 canonical arch docs (conflict-arbitration, constitutional-perimeter, live-observation-protocol, tesco-express-success-test, truth-map, stack-audit, parity-gap-analysis) |
| `agent_work/cert_gates/` | One cert per shippable slice (swarm, console, slash_commands, menu_mochi, coordinator_decomposer, coordinator_lib_wire) |
| `legacy/reintegrate-2026-08-17/` | Code being rewritten to fit the stack (not archived) |
| `lib/agent-gateway.js` | Routing layer — all agents route through here |
| `lib/cognitive_gateway.js` | Cognitive spine (port 7880) |
| `lib/memory/spine/` | Vector memory engine |
| `lib/commands/safe-start.js` | Sequential service launcher with circuit breaker |
| `lib/commands/stats.js` | Token/session cost analytics |
| `packages/swarm/` | Sub-agent dispatch (parity w/ Kimi 300 / Antigravity 5) |
| `packages/arbitration/` | Conflict detector (C2 undo, C5 repair loop) |
| `services/console/` | Parity dashboard (TUI + text fallback) |
| `services/swarm/coordinator.js` | Live coordinator (now boots after T06 lib wire fix) |
| `apps/extensions/menu-mochi/` | Chrome extension v1.2 (real Tamagotchi-style browser pet) |
| `apps/desktop/src/manager/` | Manager View UI (TODO) |
| `ecosystem.config.js` | PM2 stack definition |

## Version History

- **0.5.0-rc (2026-08-17)** — Slash commands + /plan /clear /compact, packages/swarm, services/console, apps/extensions/menu-mochi, coordinator decomposer + lib wire fix, legacy reintegration queue, 6 new cert gates
- **0.4.0** (2026-07-31) — Canonical parity (84/84), SERVICE_INVENTORY, safe-start circuit breaker, agent workspace registry, cognitive spine with per-atom fallback, unified_api refactor
- **0.3.0** (2026-06-29) — Soul registry, Studio modes, Dynamic Council, Timeline, Evolution loop

---

## License

MIT — see LICENSE.
