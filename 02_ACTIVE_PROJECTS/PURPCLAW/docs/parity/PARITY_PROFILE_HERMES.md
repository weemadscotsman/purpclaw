---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](./CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# PARITY PROFILE — Hermes Agent (Nous Research)

**Date:** 2026-07-18
**Subject:** Hermes Agent, the agent harness this session runs in
**Authoritative docs:** https://hermes-agent.nousresearch.com/docs (Docusaurus; sitemap crawled)
**Local install inspected:** `C:/Users/Admin/AppData/Local/hermes/` (read-only)
**Purpose:** Ground-truth capability inventory of Hermes Agent so PURPCLAW can define, measure, and claim feature parity across CLI / TUI / WebUI / Desktop surfaces.

---

## 0. Sources & method

1. **Live docs** — Crawled `sitemap.xml` (~380 doc URLs) and extracted content from the high-signal pages: `features/{tools, skills, plugins, memory, cron, delegation, computer-use, browser, tts, voice-mode, mcp, tool-gateway, code-execution}`, `reference/tools-reference`, `user-guide/{profiles, configuration, sessions, messaging/*}`.
2. **Local install** — `C:/Users/Admin/AppData/Local/hermes/` enumerated read-only: `config.yaml` (full), `skills/` (230 installed skill directories), `cron/`, `memories/`, `sessions/` (~1,638 files), `gateway-service/`, `hermes-agent/tools/` (~80 tool implementation files). No writes performed.
3. **Running harness** — The active session's own toolset (~25 callable tools visible to this agent) cross-referenced against the docs registry.

---

## 1. Capability inventory by category

### 1.1 Core agent loop & built-in tools

Hermes ships a **code-derived registry of ~73 built-in tools** (`reference/tools-reference`), grouped into toolsets. Toolsets are the unit of enablement: `hermes chat --toolsets "web,terminal"`, `hermes tools` (interactive picker), or persisted in `config.yaml`. Platform presets exist: `hermes-cli`, `hermes-telegram`, etc.

The ~25 tool families this session can actually call (a practical subset of the 73):

| Tool | What it does |
|---|---|
| `terminal` | Execute shell commands on local / docker / ssh / singularity / modal / daytona backends. Persistent shell, per-command timeout, workdir support. |
| `process` | Manage background processes: list / poll / log / wait / kill / write / submit / close. |
| `read_file` | Read text files with line numbers + pagination; auto-extracts `.ipynb`, `.docx`, `.xlsx`. |
| `write_file` | Overwrite/create files with parent-dir creation; auto-runs syntax checks on `.py/.json/.yaml/.toml`. |
| `patch` | Fuzzy find-and-replace edits (9 strategies) or V4A multi-file patches; auto syntax-checks. |
| `search_files` | Ripgrep-backed content search + glob file search. |
| `web_search` | Web search via configured backend (Firecrawl default; Nous Tool Gateway optional). |
| `web_extract` | Extract clean page content (markdown) from up to 5 URLs; PDF support; head+tail windowing for long pages. |
| `browser_navigate` | Open URL in controlled browser, return a11y-tree snapshot with `@eN` refs. |
| `browser_snapshot` | Re-snapshot current page (compact or full). |
| `browser_click` | Click element by ref ID. |
| `browser_type` | Type into element by ref ID. |
| `browser_press` | Press keyboard key (Enter/Tab/Escape/…). |
| `browser_scroll` | Scroll page up/down. |
| `browser_back` | Navigate history back. |
| `browser_console` | Read console logs + evaluate JS in page context. |
| `browser_get_images` | List page images with URLs/alt for vision. |
| `browser_vision` | Screenshot + AI vision analysis of current page. |
| `computer_use` | **Background desktop control** (macOS AX+SkyLight, Windows UIA+SendInput, Linux AT-SPI+XTest) via `cua-driver` MCP — actions don't steal cursor/focus. Capture modes: `som` (numbered overlays), `vision`, `ax`. |
| `vision_analyze` | Load image (URL/path/data-URL) into context; native vision or auxiliary model fallback. |
| `video_analyze` | Send video (≤50 MB) to multimodal model for Q&A. |
| `text_to_speech` | TTS with 10 providers (Edge free default, ElevenLabs, OpenAI, MiniMax, Mistral, Gemini, xAI, NeuTTS/KittenTTS/Piper local). |
| `memory` | Persistent memory CRUD: `add` / `replace` / `remove` against `MEMORY.md` (2,200 chars) and `USER.md` (1,375 chars). Frozen snapshot in system prompt. |
| `session_search` | FTS5 full-text search over SQLite session store: discovery (FTS), scroll (windowed), read (full dump), browse (chronological). |
| `skills_list` / `skill_view` / `skill_manage` | List installed skills, load SKILL.md + linked files, create/patch/edit/delete skills, write/remove supporting files. |
| `cronjob` | Unified cron tool: `create` / `list` / `update` / `pause` / `resume` / `run` / `remove`. Skill-attached jobs, no-agent (script-only) mode, delivery to origin chat / files / platform targets. Disabled *inside* cron sessions (no recursive scheduling). |
| `delegate_task` | Spawn child `AIAgent` with fresh context, inherited tools, own terminal session. Single or parallel batch (default 3 concurrent). Runs in background, result posted back as new message. |
| `todo` | Session task list: write (replace or merge), read. One `in_progress` at a time. |
| `execute_code` | **Programmatic tool calling**: agent writes Python using `from hermes_tools import …`; script runs in child process, tool calls travel over Unix-socket RPC back to Hermes; only `print()` output enters context. Massive token saver for 3+-call workflows. |
| `clarify` | Pause the agent and ask the user a structured question (gateway-delivered, timeout-configurable). |

Also present in the registry but not loaded in this session: `image_generate`, `video_generate`, `x_search`, `ha_*` (Home Assistant ×4), Spotify ×7, Yuanbao ×5, Feishu ×5, kanban ×9 (dispatcher-spawned), project tools ×3 (desktop/GUI), Discord ×2, `read_terminal`, CDP-gated browser extras.

**Terminal backends** (6): `local`, `docker`, `ssh`, `singularity`, `modal`, `daytona` — with persistent containers, volume mounts, env passthrough, per-backend image config.

**Tool loop guardrails**: warnings + optional hard stops on repeated exact failures, same-tool failures, idempotent-no-progress loops. **Tool output limits**: 50 KB / 2,000 lines / 2,000 chars-per-line caps. **Compression**: automatic context compression at 95% threshold → 20% target ratio, protected head/tail, 400-message hygiene hard limit, optional session splitting with parent-session linkage.

### 1.2 Skills system

- **Location of truth:** `~/.hermes/skills/` — bundled skills copied on install; hub-installed and agent-created skills land here too. Local install has **230 skill directories** (plus loose `.md` skill-spec files at the root).
- **Format:** `SKILL.md` with YAML frontmatter (name, description) + markdown body; supporting files under `references/`, `templates/`, `scripts/`, `assets/`. Compatible with the **agentskills.io open standard**. Progressive disclosure: frontmatter always visible, body loaded on demand via `skill_view`, linked files loaded via `skill_view(file_path=…)`.
- **Discovery:** every skill is a slash command (`/gif-search funny cats`); up to 5 skills stackable per message; natural-language triggers too; `skills_list` + `skill_view` tools for programmatic access.
- **Management:** `skill_manage` tool (create / patch / edit / delete / write_file / remove_file) — the agent authors its own skills. Pinned skills protected from delete; `absorbed_into` forwarding for consolidation vs pruning. Skill curator CLI: `hermes curator unpin <name>`.
- **Seeding control:** `--no-skills` install flag, `hermes skills opt-out [--remove]` / `opt-in --sync`, `.no-bundled-skills` marker per profile. Opt-out never deletes user-modified skills.
- **Skill hub:** `skills_hub` auxiliary provider for AI-assisted skill generation; `skills_sync`, `skills_ast_audit`, `skills_guard`, `skill_provenance`, `skill_usage` modules in `tools/`.
- **External directories:** additional scan paths beyond `~/.hermes/skills/`.
- **Plugin-namespaced skills:** `plugin:skill` qualified names via `ctx.register_skill`.
- **Catalogs:** bundled + optional skills documented per-category (creative, mlops, research, productivity, devops, security, finance, gaming, health, blockchain, payments…).

### 1.3 Plugins

- **Layout:** `~/.hermes/plugins/<name>/` with `plugin.yaml` manifest + `__init__.py` (`register(ctx)`) + `schemas.py` + `tools.py`.
- **Plugin API (`ctx.*`):**
  - `register_tool(name, toolset, schema, handler)` — tools appear alongside built-ins
  - `register_hook("post_tool_call", cb)` — lifecycle hooks
  - `register_command(name, handler, description)` — slash commands in CLI + gateways
  - `register_cli_command(...)` — `hermes <plugin> <subcommand>` CLI extensions
  - `dispatch_tool(name, args)` — invoke tools with parent context
  - `inject_message(content, role)` — push messages into the session
  - `register_skill(name, path)` — bundle skills as `plugin:skill`
  - Gateway platform registration (Discord, Telegram, IRC, …)
- **Distribution:** pip entry-points (`hermes_agent.plugins`), `requires_env` gating with install-time prompting.
- **Project-local plugins** under `./.hermes/plugins/` — disabled by default, `HERMES_ENABLE_PROJECT_PLUGINS=true` opt-in.
- **Provider plugins:** documented extension points for model, memory, browser, image-gen, video-gen, web-search, secret-source, context-engine, and LLM-access plugins.

### 1.4 Memory

- **Two curated stores**, both injected as **frozen snapshots** at session start (preserves prefix cache):
  - `MEMORY.md` — agent's notes: environment, conventions, learnings. **2,200-char cap** (~800 tokens).
  - `USER.md` — user profile: preferences, style, expectations. **1,375-char cap** (~500 tokens).
- **`memory` tool actions:** `add`, `replace` (substring match), `remove` (substring match). No `read` — content is already in the system prompt. Overflow returns an error; agent must consolidate in-turn. Live state always shown in tool responses; disk writes immediate; prompt reflects changes next session.
- **Honcho** cross-session memory available as a memory-provider plugin.
- Local evidence: `memories/MEMORY.md`, `USER.md` + 100+ timestamped `.bak` files (history retention on write).

### 1.5 Session storage & search

- **SQLite `state.db`** with **FTS5** full-text index: session ID, source platform, user ID, title, model, system-prompt snapshot, full message history (roles, tool calls, tool results), token counts, timestamps, parent-session ID (compression splits).
- **`session_search` tool shapes:** discovery (FTS query, deduped, bookends + ±5 window), scroll (±N window around anchor), read (full dump by ID), browse (recent chronological). Cross-profile read via `profile=` arg for `@session:<profile>/<id>` links.
- **Session sources tracked:** cli, telegram, discord, slack, whatsapp, signal, matrix, teams, etc.
- **Session UX:** `/new [name]`, `/compress`, `/resume <name>`, `/sessions` picker, `hermes sessions prune`. Media attachments are turn-scoped (not re-sent); verbose text identified as the real context-growth driver.
- Local evidence: `sessions/` holds **~1,638** JSONL/request-dump artifacts; `state.db` + WAL/SHM present.

### 1.6 Scheduling (cron)

- **Unified `cronjob` tool** with action verbs; also `/cron` slash command and `hermes cron` CLI.
- **Capabilities:** one-shot + recurring (natural language "every 2h" or cron expressions); pause/resume/edit/trigger/remove; **attach 0..N skills per job** (loaded in order, prompt layered on top); delivery to origin chat / local files / platform targets; fresh agent session per run with static tool list; **no-agent mode** (pure script on schedule, stdout delivered verbatim, zero LLM).
- **Safety:** unpinned jobs snapshot provider+model at creation and **fail closed** if the global default changes (prevents silent paid-provider spend); cron sessions can't create more cron jobs (no runaway loops); project-directory scoping.
- Local evidence: `cron/jobs.json`, `cron/output/`, heartbeat + last-success tickers.

### 1.7 Delegation / subagents

- **`delegate_task`** spawns child `AIAgent` instances: isolated fresh context (subagents know *nothing* of parent history — everything passed via `goal` + `context`), inherited tool access, own terminal sessions.
- **Parallel batches:** up to 3 concurrent by default, configurable, no hard ceiling. Background execution: handle returned immediately, result posted as new message; orchestrator subagents wait for their workers.
- Structured-summary contract: what was done, found, files modified, issues.
- Docs guide `delegation-patterns` covers parallel research, review+fix, multi-file refactors.

### 1.8 Messaging gateways

**31 documented platform adapters** under `user-guide/messaging/`:

Telegram, Discord, Slack, WhatsApp (+ WhatsApp Cloud), Signal, Matrix, Teams (+ Teams Meetings), IRC, Email, SMS, SimpleX, Ntfy, Mattermost, Google Chat, Feishu, DingTalk, WeCom (+ callback), Weixin, QQBot, Yuanbao, Line, BlueBubbles (iMessage), Home Assistant, Open WebUI, Photon, Raft, generic Webhooks, MS Graph webhook.

- **Gateway service** runs as a supervised daemon (`gateway-service/`, `gateway.pid`, `gateway.lock`, `gateway_state.json` locally) with auto-restart, drain timeouts, notify intervals.
- **Multi-profile gateways:** each profile can run its own set of platform bots.
- **Voice in gateways:** Telegram voice bubbles (Opus .ogg), Discord voice messages + **Discord voice-channel listening/speaking**, WhatsApp audio attachments.
- **Outbound delivery** for cron/alerts handled by gateway notifier + `hermes send` CLI.
- Local evidence: `send_telegram.py`, `channel_directory.json`, `pairing/` state.

### 1.9 Computer use

- **Background desktop control** on **Windows, macOS, Linux** via `cua-driver` (MCP over stdio): real cursor never moves, focus never stolen, no Space switching.
- **Per-platform stacks:** macOS = AX + private SkyLight SPIs + `SLPSPostEventRecordTo`; Windows = UIAutomation + `SendInput`/`PostMessage`; Linux = AT-SPI (X11+Wayland) + XTest/virtual-keyboard.
- **Capture modes:** `som` (screenshot + numbered element overlays + AX tree), `vision` (plain screenshot), `ax` (tree only). Click by element index preferred; raw coords last resort.
- **Actions:** capture, click, double/right/middle click, drag, scroll, type, key combos, `set_value` (selects/sliders without opening native menus), wait, list_apps, list_windows, focus_app (no raise by default).
- **Health:** `hermes computer-use doctor` runs `health_report` MCP tool — per-check matrix of permissions/display/AX reachability.
- Model-agnostic: works with any tool-capable model, no Anthropic-native schema.

### 1.10 Browser automation

**Six backends:** Browserbase cloud (stealth, CAPTCHA solving, residential proxies), Browser Use cloud, Firecrawl cloud, Camofox local (Firefox fingerprint spoofing), local Chromium via CDP (`/browser connect` to running Chrome/Brave/Edge), local Chromium via `agent-browser` CLI.

- **A11y-tree page model** with `@eN` refs; vision analysis; hybrid routing (cloud for public URLs, auto-spawned local sidecar for private/LAN/loopback); session isolation + inactivity-timeout cleanup; dialog policy (`must_respond`, 300 s timeout); session recording optional.
- **10 core browser tools** + 2 CDP-gated extras (see §1.1).

### 1.11 Voice (TTS/STT)

- **TTS — 10 providers:** Edge (free default, 322 voices / 74 languages), ElevenLabs, OpenAI, MiniMax, Mistral Voxtral, Gemini (30 voices + audio tags), xAI, and **3 local options**: NeuTTS, KittenTTS (25–80 MB int8 models), Piper.
- **STT:** faster-whisper local (zero keys), Groq Whisper, OpenAI Whisper.
- **CLI voice mode:** Ctrl+B push-to-talk, silence auto-detect, beeps, configurable thresholds (`voice.record_key`, `max_recording_seconds`, `auto_tts`, `silence_threshold`).
- **Platform delivery:** Telegram voice bubble, Discord voice bubble + VC, WhatsApp MP3, CLI saves to `~/.hermes/audio_cache/`.
- **Full voice conversations** in Discord voice channels (bot listens + speaks).

### 1.12 MCP native client

- **Built-in MCP client** — stdio + HTTP servers in the same config (`mcp_servers:` in config.yaml).
- Auto-discovery + registration at startup; tools appear as `mcp_<server>_<tool>`; per-server include/exclude filters; MCP resources/prompts wrappers.
- **Curated catalog** (`hermes mcp` picker / `catalog` / `install <name>`): Nous-reviewed entries under `optional-mcps/`; credential prompting (API keys → `.env`, OAuth flows); **tool-selection checklist at install time** (probe server, pick exposed tools, persisted in `mcp_servers.<name>.tools.include`).
- OAuth manager + stdio watchdog modules in `tools/`. Local evidence: `mcp_servers.omnicode` configured to a local Node MCP server.

### 1.13 Profiles

- **Profile = separate Hermes home**: own `config.yaml`, `.env`, `SOUL.md`, memories, sessions, skills, cron, state DB under `~/.hermes/profiles/<name>/`.
- **Auto command alias:** `hermes profile create coder` → immediately `coder chat`, `coder setup`, `coder gateway start`.
- **Clone options:** `--clone` (config+skills+SOUL), `--clone-all` (everything incl. memories/cron/plugins; excludes history/state), `--clone-from <src>`.
- **`--description` at create** feeds kanban orchestrator routing; `hermes profile describe` (LLM auto-generate).
- Honcho integration: per-profile AI peers sharing a user workspace.
- Profile export/backup; profile distributions doc.

### 1.14 Configuration system

- **Layout:** `~/.hermes/{config.yaml, .env, auth.json, SOUL.md, memories/, skills/, cron/, sessions/, logs/}`.
- **Precedence:** CLI args > config.yaml > .env > built-in defaults. Secrets → `.env`; everything else → `config.yaml`.
- **CLI:** `hermes config [get|set|unset|edit|check|migrate]` — `set` auto-routes secrets to `.env`.
- **`${VAR}` substitution** in config.yaml (multiple refs per value; unset vars kept verbatim).
- **Managed scope:** org admins can pin config/secret values users can't override.
- Local config.yaml confirms ~60 top-level sections: model, fallback_providers, toolsets, agent (max_turns, personalities, reasoning_effort, tool_use_enforcement, clarify_timeout, image_input_mode), terminal (all 6 backends), web, browser (+camofox), checkpoints, compression, kanban, prompt_caching, openrouter, bedrock, auxiliary (10 auxiliary LLM roles: vision, web_extract, compression, skills_hub, approval, mcp, title_generation, tts_audio_tags, triage_specifier, kanban_decomposer, profile_describer…), tts, voice, delegation, mcp_servers, tool_loop_guardrails, tool_output limits.

### 1.15 Additional surfaced features (from sitemap)

ACP (Agent Communication Protocol) adapter + registry, API server mode, batch processing, checkpoints & rollback (local: `checkpoints/` with 20-snapshot/500 MB caps), context files & context references (`@session:`, `@file:`), credential pools, curator (skill lifecycle), deliverable mode, fallback providers, goals, hooks, image generation (9 models via Tool Gateway: FLUX 2 Klein/Pro, Z-Image, Nano Banana Pro, GPT Image 1.5/2, Ideogram V3, Recraft V4 Pro, Qwen Image), kanban (+ worker lanes, orchestrator, auto-decompose — local `kanban.db` present), LSP integration, mixture-of-agents, personality system (`agent.personalities.*` in config + SOUL.md identity slot), pets, provider routing, skins, Spotify, subscription proxy, tool search, web dashboard (extensible), web search, X search, git worktrees, Windows-native + WSL support, Docker deployment, Nix/Termux installs.

---

## 2. Capability table

| Category | Capability | Notes |
|---|---|---|
| Agent loop | Multi-turn tool-use loop | `max_turns: 190`, tool_use_enforcement auto, task-completion + parallel-call guidance |
| Agent loop | Context compression | Auto at 95% → 20% target, protected head/tail, session splitting w/ parent linkage |
| Agent loop | Prompt caching | 5-min TTL; OpenRouter response cache |
| Agent loop | Fallback providers | Ordered failover list (`["minimax-oauth","nvidia-nim"]` locally) |
| Agent loop | Reasoning effort + personalities | `xhigh`; 5 named personalities in local config |
| Agent loop | Clarify tool | Gateway-delivered user questions, 600 s timeout |
| Agent loop | Loop guardrails | Warn/hard-stop on repeated failures & no-progress loops |
| Tools | ~73 built-in tools, ~30 toolsets | See §1.1; platform presets per surface |
| Tools | 6 terminal backends | local/docker/ssh/singularity/modal/daytona, persistent shells |
| Tools | execute_code (programmatic calling) | Unix-socket RPC, only stdout enters context |
| Tools | Tool output caps | 50 KB / 2,000 lines / 2,000 char-line |
| Tools | Checkpoints & rollback | 20 snapshots, 500 MB, auto-prune, 7-day retention |
| Skills | SKILL.md + frontmatter, agentskills.io standard | Progressive disclosure; references/templates/scripts/assets |
| Skills | 230 installed locally; bundled + optional catalogs | Seeded per profile; opt-out marker supported |
| Skills | Slash-command invocation, 5-stack | Also natural-language triggers |
| Skills | skill_manage self-authoring | create/patch/edit/delete + pin protection + curator |
| Skills | Skill hub + AST audit + provenance + usage tracking | AI-assisted generation, safety scanning |
| Plugins | plugin.yaml + register(ctx) | tools, hooks, slash cmds, CLI cmds, skills, gateways |
| Plugins | Provider plugin points ×9 | model/memory/browser/image/video/web-search/secrets/context-engine/LLM-access |
| Plugins | pip entry-point distribution | `requires_env` gating |
| Memory | MEMORY.md 2,200 + USER.md 1,375 | Frozen snapshot; substring replace/remove; fail-on-overflow |
| Memory | Honcho cross-session plugin | Per-profile AI peers |
| Sessions | SQLite state.db + FTS5 | Full history, tokens, parent splits |
| Sessions | session_search 4 shapes | discovery/scroll/read/browse; cross-profile read |
| Sessions | Multi-source tagging | cli + all messaging platforms |
| Cron | Unified cronjob tool | NL + cron expr; skill-attached; no-agent mode |
| Cron | Fail-closed provider pinning | Prevents silent paid spend |
| Cron | No recursive scheduling | Cron sessions can't create jobs |
| Delegation | delegate_task subagents | Fresh context, parallel ≤3 default, background results |
| Gateways | 31 platform adapters | Telegram→Yuanbao; supervised daemon; multi-profile |
| Gateways | Voice in gateways | TG bubbles, Discord VC listen+speak, WA audio |
| Computer use | Background control Win/mac/Linux | cua-driver MCP; no focus steal; SOM overlays; doctor |
| Browser | 6 backends incl. stealth cloud | a11y-tree refs; hybrid LAN routing; dialog policy |
| Voice | 10 TTS providers (3 local) | Edge default; platform-native delivery formats |
| Voice | STT: whisper local/Groq/OpenAI | Ctrl+B CLI voice mode; silence detect |
| MCP | Native stdio+HTTP client | Auto-discovery; per-server filters; curated catalog; OAuth |
| Media | image_generate (9 models) | Via Tool Gateway or direct keys |
| Media | video_generate + video_analyze | fal/xAI backends; ≤50 MB analyze |
| Media | vision_analyze | Native or auxiliary-model fallback |
| Profiles | Full home-dir isolation | Auto alias; clone/clone-all/clone-from; routing descriptions |
| Config | config.yaml + .env + auth.json | Precedence; ${VAR}; managed scope; migrate/check |
| Config | Auxiliary LLM roles ×11 | vision, compression, approval, title-gen, triage, kanban-decomposer… |
| Kanban | DB-backed board + worker lanes | Orchestrator auto-decompose; 9 kanban tools when dispatched |
| Security | Managed scope, URL safety, website policy, threat patterns, OSV check, tirith | `tools/` modules confirm |
| API surface | API server mode, ACP adapter, programmatic Python lib | `guides/python-library` |
| Tool Gateway | Nous subscription routing | web/image/TTS/browser via one OAuth |

---

## 3. WHAT PARITY MEANS FOR PURPCLAW

Checklist of **42 capabilities** PURPCLAW must demonstrate — across CLI / TUI / WebUI / Desktop where applicable — to credibly claim Hermes parity. Status legend: **[likely]** = probably present via known PURPCLAW assets (380+ ported skills, `unified_api.js`, `agent-loop.js`, `lib/tools/index.js`); **[verify]** = must be proven in audit phase with a live test; **[gap?]** = no known PURPCLAW equivalent.

### A. Agent loop core
1. **[verify]** Multi-turn tool-call loop with configurable `max_turns` and enforcement modes (`agent-loop.js` exists — confirm parity of turn accounting + stop conditions).
2. **[verify]** Automatic context compression with threshold/target ratio + protected head/tail + parent-session linkage on split.
3. **[verify]** Prompt caching (provider-side) + response cache for repeat turns.
4. **[verify]** Fallback provider chain with automatic failover on errors/rate limits.
5. **[verify]** Tool loop guardrails (repeat-failure / no-progress detection, warn + hard-stop).
6. **[verify]** Clarify/ask-user mechanism that pauses the loop and resumes on answer (gateway + CLI).
7. **[verify]** Reasoning-effort / verbosity / personality slots injected into system prompt.

### B. Tool surface
8. **[likely]** Tool registry with named toolsets enableable per surface (`lib/tools/index.js` — confirm toolset grouping + per-platform presets).
9. **[verify]** ≥6 terminal backends or documented subset (local + docker + ssh minimum to claim parity; modal/daytona/singularity optional).
10. **[verify]** Background process management tool (list/poll/log/wait/kill/write/submit).
11. **[likely]** File tools: read (paged, office-doc extraction), write (syntax-checked), fuzzy patch, ripgrep search.
12. **[verify]** execute_code-style programmatic tool calling (RPC child process, stdout-only context return) — **biggest token-economy feature to match**.
13. **[verify]** Tool output caps + spill-to-disk behavior.
14. **[verify]** Checkpoints/rollback of workspace state (snapshot caps + retention).

### C. Skills
15. **[likely]** SKILL.md format compatible with agentskills.io (frontmatter + progressive disclosure + linked files).
16. **[likely]** ≥380 skills installed and loadable (PURPCLAW already ports Hermes catalog).
17. **[verify]** Slash-command invocation incl. multi-skill stacking (≤5) on every chat surface.
18. **[verify]** Agent self-authoring: skill create/patch/edit/delete from inside a session, with pin protection + consolidation forwarding.
19. **[gap?]** Skill seeding lifecycle: bundled-catalog sync on update, opt-out marker, never-delete-user-edits guarantee.
20. **[gap?]** Skill hub (AI-assisted generation) + AST audit + provenance + usage tracking.

### D. Plugins
21. **[verify]** Drop-in plugin dir with manifest + register(ctx) equivalent (tools, hooks, slash commands).
22. **[gap?]** CLI extension registration from plugins (`purpclaw <plugin> <cmd>`).
23. **[gap?]** Provider plugin points (model/memory/browser/image/video/web-search/secrets/context-engine).
24. **[gap?]** pip/entry-point style distribution + `requires_env` install-time prompting.

### E. Memory & sessions
25. **[verify]** Two-store curated memory (agent notes + user profile) with char caps, frozen-snapshot injection, substring replace/remove, fail-closed overflow.
26. **[verify]** SQLite session store with FTS5 full-text search across all sources.
27. **[verify]** session_search tool with discovery/scroll/read/browse shapes + cross-profile reads.
28. **[verify]** Session resume/new/compress/prune UX on CLI + gateways; turn-scoped media handling.

### F. Automation
29. **[verify]** Unified cron tool: NL + cron schedules, pause/resume/edit/run/remove, file+chat delivery.
30. **[verify]** Skill-attached cron jobs (multi-skill, ordered load).
31. **[gap?]** No-agent (script-only) cron mode with verbatim stdout delivery.
32. **[gap?]** Fail-closed provider/model pinning per job + no-recursive-scheduling invariant.
33. **[likely]** Subagent delegation with fresh-context children, parallel batching, background result posting (`agent-loop.js` spawn patterns — confirm isolation + concurrency cap).
34. **[gap?]** Kanban: DB-backed board, orchestrator auto-decompose, worker lanes, dispatcher-spawned kanban tools.

### G. Gateways & surfaces
35. **[verify]** Messaging gateway daemon with supervised lifecycle; count adapters vs Hermes' 31 — **minimum parity bar: Telegram, Discord, Slack, WhatsApp + generic webhook**.
36. **[verify]** Voice delivery per platform (TG bubble, Discord VC listen+speak, WA audio).
37. **[verify]** Web dashboard + API server mode (`unified_api.js` — confirm endpoint coverage vs Hermes API server + ACP).
38. **[verify]** TUI surface with full tool/skill/cron/memory parity (not a reduced client).
39. **[verify]** Desktop app parity incl. project tools + worktree UI.

### H. Media, browser, computer use
40. **[verify]** Browser toolset: a11y-tree snapshots with ref IDs, click/type/scroll/press/console/vision, ≥2 backends (local CDP + one cloud), hybrid LAN routing.
41. **[verify]** Computer use: background (no focus steal) desktop control on Windows + macOS, SOM-overlay capture, doctor/health command.
42. **[verify]** TTS (≥3 providers incl. 1 free + 1 local), STT (local whisper path), image generation (≥2 models), vision_analyze, video_analyze; MCP native client (stdio+HTTP, per-server tool filters, curated install flow).

**Audit rule:** every **[likely]** and **[verify]** line must be backed by a live exercise (call the tool, run the flow, paste the output) before the parity claim is upgraded to **[confirmed]** in the audit phase. No capability is claimed on documentation alone.

---

*Generated from live docs crawl (Docusaurus sitemap, ~380 URLs), read-only inspection of `C:/Users/Admin/AppData/Local/hermes/`, and the running harness's own toolset. Hermes Agent © Nous Research.*
