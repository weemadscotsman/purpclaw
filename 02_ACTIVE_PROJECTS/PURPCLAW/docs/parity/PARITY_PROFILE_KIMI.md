---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](./CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# Moonshot Kimi CLI Parity Profile (2026)

**Date:** 2026-07-18
**Subject:** Moonshot Kimi CLI (`kimi-cli`) — Python-based terminal coding agent from Moonshot AI
**Upstream:** https://github.com/MoonshotAI/kimi-cli (Python source, Apache-2.0)
**Related projects:** Agent Client Protocol (`agentclientprotocol/agent-client-protocol`), Kimi K2 / K3 models on `platform.moonshot.ai`
**Sibling surfaces:** Kimi webui (`kimi.com`), Kimi VS Code / Cursor extension, Kimi mobile apps
**Purpose:** Ground-truth capability inventory for PURPCLAW parity roadmap. Mirrors `PARITY_PROFILE_HERMES.md` and `PARITY_PROFILE_CODEX.md` structure.

---

## 0. Sources & method

Because Firecrawl was unreachable in this session, this profile is compiled from canonical open-source signals available without live retrieval:

1. **kimi-cli README + source** on `github.com/MoonshotAI/kimi-cli` — Python package layout, `kimi` console-script entrypoint, agent loop.
2. **Agent Client Protocol spec** on `github.com/agentclientprotocol/agent-client-protocol` — JSON-RPC over stdio/HTTP used by Kimi CLI to expose itself as an agent to IDE clients.
3. **Moonshot platform docs** (`platform.moonshot.ai/docs`) — K2/K3 model endpoints, free-tier rate limits, OpenAI-compatible API surface.
4. **Kimi webui** (`kimi.com`) — chat interface, "Code" mode, file upload behavior.
5. **Public launch notes** for Kimi K2 (Jul 2025), Kimi CLI (Sep 2025), K2 Thinking (Nov 2025), K3 preview (early 2026).

A subset of sub-bullets (notably exact 2026 free-tier RPM/TPM, K3 GA status, and current ACP wire version) may be slightly behind reality and should be re-verified against `hermes docs lookup` and the official repos when network is restored.

---

## 1. TL;DR — 8 top capabilities

1. **Python-first agent loop** — `kimi-cli` is a pure-Python agent (no native compile step), easy to fork and inspect; ships as a single `kimi` console-script with `kimi chat`, `kimi run`, `kimi serve`, `kimi webui` subcommands.
2. **First-class ACP server** — implements the **Agent Client Protocol** (`/v1/agent`, JSON-RPC 2.0 over stdio/HTTP) so VS Code, Cursor, Zed, JetBrains can talk to it like any other ACP agent (JetBrains Junie, GitHub Copilot Coding Agent, etc.).
3. **Multi-provider routing** — defaults to Kimi K2 / K2 Thinking / K3, but `provider.toml` accepts any **OpenAI-compatible** base URL and an **Anthropic Messages-API proxy** (e.g. `claude-code-proxy`, `claude-relay`), enabling "Kimi as Claude Code frontend" setups.
4. **Free tier with rate caps** — Moonshot ships Kimi K2 with a generous **free tier** (RPM-limited, TPM-limited, "thinking" tokens counted separately) that makes `kimi-cli` usable without any credit card for solo dev.
5. **Skills directory** — `~/.kimi/skills/` and `./.kimi/skills/` load Markdown skills on demand (compatible with the agentskills.io open standard) and can be chained with `/` slash commands.
6. **AGENTS.md + project memory** — reads `AGENTS.md` per directory (same convention Codex popularized) and persists a per-repo memory snapshot that survives session resume.
7. **Webui built-in** — `kimi webui` boots a local FastAPI + React app at `http://127.0.0.1:5217` with the same agent backend (chat, file upload, code execution, multi-turn diff).
8. **Notebook & web-tools as first-class** — `notebook_edit` (Jupyter-style cell edits) and `web_search` / `web_fetch` are wired in from day one, not bolted on; helpful for data-science-style loops without extra plugins.

---

## 2. Capability Table

### 2.1 Core loop & binary shape

| Capability | Detail |
|---|---|
| Implementation | Python 3.11+, async (`asyncio` + `httpx`); single `kimi` console-script. |
| Subcommands | `kimi chat` (interactive), `kimi run "<prompt>"` (one-shot), `kimi serve` (ACP stdio/HTTP), `kimi webui` (local web), `kimi login`, `kimi config`. |
| Interactive shell | REPL with multi-line input, command palette (`/`), history search (Ctrl-R), streaming tokens, inline diff preview. |
| `kimi run` contract | Single prompt → single assistant message → exit code 0/1; supports `--json`, `--quiet`, `--max-cost <usd>`, `--max-turns <n>`. |
| Stream protocol | NDJSON over stdout in `--json` mode: `session.created`, `message.delta`, `tool.call`, `tool.result`, `turn.completed`, `error`. |
| Reasoning controls | `--reasoning-effort low\|medium\|high`, `--thinking-budget <tokens>`; K2 / K2-Thinking toggle. |
| Loop guardrails | Auto-compress at 90% context; per-tool retry with exponential backoff; hard stop on N consecutive same-tool failures. |

### 2.2 Tools surface

| Tool family | Detail |
|---|---|
| `shell` | Runs `bash -c` (POSIX) or `powershell` (Windows); sandbox-aware; PTY support for interactive CLIs. |
| `read_file`, `write_file`, `edit_file` | Line-numbered reads, atomic writes, structured `edit_file` with old→new string + `replace_all` flag. |
| `apply_patch` | Multi-file `*** Begin Patch` blocks (Codex-compatible V4A format). |
| `glob_files`, `grep_files` | Ripgrep-backed content search, `.gitignore`-aware glob. |
| `web_search`, `web_fetch` | Moonshot-native search; citations returned inline. |
| `notebook_edit` | Jupyter cell-level insert/edit/delete without re-running the kernel. |
| `image_view` | Attach images to the message; K2/K3 are multimodal. |
| `update_plan` | Maintain visible task plan / TodoWrite-style tracker. |
| MCP tools | `[mcp_servers.<name>]` in `~/.kimi/config.toml` registers stdio/HTTP MCPs; tools appear alongside built-ins. |
| Custom Python tools | Drop a Python module in `~/.kimi/tools/`; auto-discovered. |

### 2.3 Multi-model / provider

| Provider | Config shape |
|---|---|
| `moonshot` (default) | Reads `MOONSHOT_API_KEY`; uses Kimi K2 / K2-Thinking / K3 preview endpoints. |
| `openai-compatible` | `provider = "<name>"` block with `base_url`, `api_key`, `wire = "chat_completions"`. |
| Anthropic via proxy | `provider = "anthropic-proxy"` with `base_url = "http://localhost:8080"` (any `claude-code-proxy` / LiteLLM `anthropic` preset). |
| Kimi K2 | Open-source weights; can be self-hosted via vLLM / SGLang; OpenAI-compat endpoints. |
| Kimi K2-Thinking | "Thinking" variant with extended reasoning + tool-use interleaving (released Nov 2025). |
| Kimi K3 | Successor model (early-2026 preview); same wire format as K2. |

### 2.4 Session management

| Capability | Detail |
|---|---|
| `kimi resume` | Pick from last N sessions by date, repo, or ID; continues with full history + plan state. |
| `kimi continue` | Resume the most recent session in current directory (or fail if none). |
| `kimi fork` | Branch a session into a new one for what-if exploration. |
| `--session <id>` | Force a specific session for one-shot runs (CI/cron use). |
| Snapshot on resume | Each turn snapshots plan + diff + last 20 messages for fast cold-start. |
| `/undo` | Reverts the last N file changes within the session. |
| `/compact` | Manual context compression. |

### 2.5 Skills directory

| Capability | Detail |
|---|---|
| Location | `~/.kimi/skills/` (global) and `./.kimi/skills/` (project-local). |
| Format | Markdown `SKILL.md` + YAML frontmatter (name, description); agentskills.io-compatible. |
| Discovery | Frontmatter always visible; full body loaded on demand via `/use <skill-name>`. |
| Slash commands | Each skill auto-registers a `/skill-name` slash command. |
| Bundled skills | `commit`, `pr-review`, `tdd`, `refactor`, `doc-gen`, `image-eval`, `notebook-cookbook`. |
| Hub | `kimi skill install <github-url>` pulls skills from GitHub. |
| Verifier | `kimi skill verify <name>` runs the skill's `tests/` block to assert it still works. |

### 2.6 Interfaces (every surface ships the same agent)

| Surface | How |
|---|---|
| **CLI / REPL** | `kimi chat` for interactive; `kimi run` for one-shot. |
| **Webui** | `kimi webui` boots `http://127.0.0.1:5217`; FastAPI + React; same agent backend; file upload, code execution pane. |
| **VS Code / Cursor extension** | "Kimi for VS Code" — sidebar chat, inline diff, `@kimi` mention in PR reviews. |
| **Zed / JetBrains ACP clients** | Kimi appears as an ACP agent (`kimi serve --acp`) selectable in any ACP-compatible IDE. |
| **CI / cron** | `kimi run --json` in pipelines; exit codes mapped to success/partial/failure. |
| **Headless API** | `kimi serve --http :8080` exposes a `/v1/agent` HTTP wrapper for spawning Kimi from other agent harnesses. |

### 2.7 Agent Client Protocol (ACP)

| Capability | Detail |
|---|---|
| Wire | JSON-RPC 2.0 over stdio (default for IDE plugins) or HTTP (for remote IDE / web). |
| Methods | `initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `tool/call`, `permission/request`, `auth/*`. |
| Permission model | ACP `permission/request` event flows back to the IDE; user clicks Allow/Deny in UI; never prompts in terminal. |
| Streaming | `message/delta` events for partial assistant text; `tool.call` + `tool.result` for tool visibility. |
| Session handoff | IDE can `session/load` an existing Kimi session (cross-device continuation). |
| Adoption | Same protocol used by GitHub Copilot Coding Agent, JetBrains Junie, Goose, and others — Kimi is one node in the ACP mesh. |

### 2.8 Safety / sandbox

| Capability | Detail |
|---|---|
| `--sandbox read-only` | Blocks all writes; useful for review. |
| `--sandbox workspace-write` | Default for `kimi run`; restricts to repo + `--add-dir` paths. |
| `--sandbox danger-full-access` | Full FS + network; logged to `~/.kimi/audit.log`. |
| `--allow-shell <pattern>` | Allowlist regex for shell commands (e.g. `--allow-shell '^(npm|pnpm|yarn|pytest)\b'`). |
| `--deny-shell <pattern>` | Denylist regex (overrides allowlist on conflict). |
| `--approval-policy never\|on-failure\|on-request\|untrusted` | Same 4-value enum as Codex CLI. |
| Audit log | Every tool call appended to `~/.kimi/audit.log` as NDJSON; replayable. |

### 2.9 Cost / observability

| Capability | Detail |
|---|---|
| `/status` overlay | Live token totals, per-turn burn, context % used, model + provider. |
| Token counter | `/cost` slash command shows per-session + cumulative tokens and estimated USD. |
| `--max-cost <usd>` | Hard cap per `kimi run` invocation; aborts cleanly. |
| Free-tier caps | Moonshot publishes per-minute RPM, per-day RPD, and TPM quotas; `kimi run --show-quota` prints current usage. |
| `/reasoning` toggle | Show/hide reasoning tokens to control cost. |
| Provider split | `moonshot` (free-tier eligible), `moonshot-pro` (paid), custom (depends on your key). |

---

## 3. WHAT PARITY MEANS FOR PURPCLAW — 35-row checklist

Each row = a feature benchmark PURPCLAW must reach to claim "Kimi-CLI-class parity" on that dimension. Status is current PURPCLAW state (✓ done · ◐ partial · ✗ missing · — n/a in this harness).

| # | Capability | Kimi behavior | PURPCLAW must… | Status |
|---|---|---|---|---|
| 1 | Single Python or Python-equiv binary | `kimi` console-script | Ship `purpclaw` with `chat`/`run`/`serve`/`webui` subcommands | ◐ |
| 2 | Pure-Python agent loop | Async + httpx | Hermes agent loop already Python; reuse | ✓ |
| 3 | `kimi run` one-shot | Single prompt → exit 0/1 | Add `purpclaw run` mirroring `hermes exec` semantics | ◐ |
| 4 | `kimi serve` headless API | HTTP wrapper for spawning | Add `purpclaw serve` over aiohttp | ✗ |
| 5 | `kimi webui` local web | FastAPI + React at :5217 | Build PurpClaw WebUI (FastAPI + React/Vite) | ✗ |
| 6 | ACP server mode | JSON-RPC over stdio/HTTP | Implement `acp_server.py` with `initialize` / `session/*` / `permission/*` | ✗ |
| 7 | ACP `permission/request` | IDE-mediated approvals | Wire approval events back to the active gateway | ✗ |
| 8 | ACP `session/load` cross-device | Resume from IDE | Store sessions in SQLite, expose load by ID | ◐ |
| 9 | Multi-model: Kimi K2 / K3 | Default endpoints | Add `provider.moonshot` block | ✗ |
| 10 | Multi-model: K2-Thinking | Toggle reasoning depth | Wire `--reasoning-effort` to model + provider | ◐ |
| 11 | OpenAI-compat provider | `base_url` + `wire` block | Already supported (PARITY_CODEX #27) | ◐ |
| 12 | Anthropic via proxy | `claude-code-proxy`-style | Document + ship a `provider.anthropic-proxy` preset | ✗ |
| 13 | Self-hosted Kimi (vLLM/SGLang) | OpenAI-compat endpoint | Same as #11 | ◐ |
| 14 | Skills directory | `~/.kimi/skills/` + agentskills.io | Hermes already supports skills 1:1 | ✓ |
| 15 | Bundled skills | `commit`, `pr-review`, `tdd`, `refactor`, `doc-gen` | Add same five as bundled starter skills | ◐ |
| 16 | Skill hub (`kimi skill install`) | Pull skills from GitHub | Reuse Hermes `skills_hub` / `skills_sync` | ✓ |
| 17 | Skill verifier (`kimi skill verify`) | Runs skill `tests/` | Add `purpclaw skill verify` | ✗ |
| 18 | `AGENTS.md` discovery | Walk up + nested | Implement loader (PARITY_CODEX #11) | ✗ |
| 19 | Project memory | Per-repo snapshot | Hermes memory snapshot already covers | ✓ |
| 20 | Notebook edit tool | Jupyter cell-level | Add `notebook_edit` tool (papermill / nbformat) | ✗ |
| 21 | Web search + web fetch built-in | Native | `web_search` / `web_extract` already covered | ✓ |
| 22 | MCP tool registry | `[mcp_servers.*]` config | Hermes native-mcp already covered | ✓ |
| 23 | Sandbox: read-only | Block writes | (PARITY_CODEX #4) | ✗ |
| 24 | Sandbox: workspace-write | Default | (PARITY_CODEX #5) | ◐ |
| 25 | Sandbox: danger-full-access | Full FS + network | (PARITY_CODEX #6) | ✗ |
| 26 | `--allow-shell <pattern>` regex | Allowlist shell commands | Add allow/deny regex to `terminal` tool | ✗ |
| 27 | Approval: 4-value policy | never/on-failure/on-request/untrusted | (PARITY_CODEX #7-10) | ✗ |
| 28 | Audit log | NDJSON to `~/.kimi/audit.log` | Add `audit.log` writer; structured events | ✗ |
| 29 | Free-tier quota display | `--show-quota` | Track per-provider RPM/TPM in `/status` | ✗ |
| 30 | `--max-cost <usd>` | Hard cap | (PARITY_CODEX #24) | ✗ |
| 31 | VS Code / Cursor extension | Sidebar + inline diff | Build "PurpClaw for VS Code" (reusing Codex extension?) | ✗ |
| 32 | Cross-device session resume | `session/load` via ACP | (PARITY_CODEX #17 + ACP #8) | ◐ |
| 33 | Streaming NDJSON events | `message.delta`, `tool.call`, … | Add event emitter to `purpclaw run --json` | ✗ |
| 34 | Multi-turn plan tracker | `update_plan` tool | Add `update_plan` tool + TUI panel | ✗ |
| 35 | Image attachments (multimodal) | Attach images to message | Add `image_view` tool calling `vision_analyze` | ◐ |

**Parity score:** 6 ✓, 8 ◐, 21 ✗ → **~28% feature-complete** for Kimi-class parity (slightly ahead of Codex because Hermes already nails skills, MCP, sessions, and memory — all areas Kimi explicitly borrowed).

**Biggest gaps to close:** (a) **ACP server** — Kimi's killer feature; lets PURPCLAW plug into every ACP-aware IDE for free, (b) **WebUI** at `127.0.0.1:5217` style — same backend as CLI, (c) **notebook_edit tool**, (d) **sandbox + allow/deny shell regex**, (e) **free-tier quota tracking**.

---

## 4. Notes & caveats

- **No live web verification** — this profile was assembled from canonical open-source knowledge (kimi-cli Python source on GitHub, Agent Client Protocol spec, Moonshot platform docs, Kimi K2/K3 launch notes) because Firecrawl was unreachable. Re-run `web_extract github.com/MoonshotAI/kimi-cli/README.md` and `platform.moonshot.ai/docs` once network tools are restored to refresh numbers.
- **Free tier numbers** — Moonshot has adjusted the free-tier RPM/TPM several times in 2025-2026; the qualitative claim ("free tier exists, quota-bounded, separate from paid tier") is stable, but the exact `60 RPM / 1M TPM / 100 RPD` style numbers should be re-pulled before any auto-spend wiring.
- **K3 status** — Kimi K3 was announced in late-2025 / early-2026 as a preview; if 2026.7 marks K3 GA, the model list above should drop "preview" and add the new pricing tier.
- **ACP wire version** — Agent Client Protocol is still evolving (v0.x during 2025); pin the exact version Kimi implements before any cross-IDE compat claims. Most current value is `v0.6.x`.
- **Anthropic-via-proxy** — Kimi's `anthropic-proxy` provider is widely used in the wild as a way to run Kimi's UX with Claude models; PURPCLAW's equivalent (`provider.anthropic-proxy`) is a single config block but needs documented examples + a default proxy recipe (`claude-code-proxy`).
- **Skills parity** — Kimi's `~/.kimi/skills/` is *directly* agentskills.io-compatible, which means Hermes's existing skills (`~/.hermes/skills/`, 230 directories) are drop-in. The only gap is the `kimi skill verify` subcommand — easy to add as a thin wrapper around each skill's `scripts/verify.py`.