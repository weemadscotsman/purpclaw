> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# PURPCLAW vs Codex CLI — Parity Gap Report
Generated: 2026-07-27
Source: Codex at /tmp/codex (cloned from github.com/openai/codex)

══════════════════════════════════════════════════════════
CODEX ARCHITECTURE (what we're matching against)
══════════════════════════════════════════════════════════

Codex is a Rust monorepo (~1858 .rs files) with these layers:

  ┌─────────────────────────────────────────────────────┐
  │  CLI (bin/codex.js wrapper → Rust binary)          │
  │  TUI (Rust/ratatui)     │ Desktop App launcher     │
  │  Doctor, Login, MCP, Plugin, Marketplace commands   │
  ├─────────────────────────────────────────────────────┤
  │  CORE (codex-core)                                    │
  │  Agent loop + tools + context management             │
  │  Apply-patch (safe code editing)                    │
  ├─────────────────────────────────────────────────────┤
  │  EXTENSIONS                                          │
  │  Skills, MCP, Memories, Guardian, Web-Search        │
  ├─────────────────────────────────────────────────────┤
  │  EXEC SERVER (isolated process)                      │
  │  Shell commands, sandboxed execution                 │
  ├─────────────────────────────────────────────────────┤
  │  APP SERVER (JSON-RPC, multi-user)                   │
  │  Thread store, collaboration, session persistence    │
  ├─────────────────────────────────────────────────────┤
  │  MODEL PROVIDER abstraction                          │
  │  model-provider, ollama, lmstudio, chatgpt crates  │
  ├─────────────────────────────────────────────────────┤
  │  SANDBOXING                                          │
  │  bwrap (Linux), seatbelt (macOS), win-sandbox-rs    │
  └─────────────────────────────────────────────────────┘

PURPCLAW ARCHITECTURE (what we have):

  ┌─────────────────────────────────────────────────────┐
  │  bin/purpclaw.js (Node.js CLI, 7148 lines)          │
  │  ~20 commands: start, chat, ask, run, agents, etc.  │
  ├─────────────────────────────────────────────────────┤
  │  Next.js WebUI (:3000) — MissionControl panel       │
  │  Services: orchestrator, tower, api, eventbus, etc. │
  ├─────────────────────────────────────────────────────┤
  │  lib/agent-loop.js + cognitive spine + memory matrix │
  │  501 tools across 152 agents                         │
  ├─────────────────────────────────────────────────────┤
  │  MCP client (native)                                │
  │  Voice bridge (:7792), metrics, vision monitor      │
  └─────────────────────────────────────────────────────┘

══════════════════════════════════════════════════════════
GAP 1: DESKTOP APP LAUNCHER
CODEX: codex app → opens platform-specific desktop window
        cli/src/desktop_app/{mac,windows,linux}.rs
PURPCLAW: ❌ No desktop app. Only :3000 WebUI browser tab.
══════════════════════════════════════════════════════════
GAP 2: TUI (TERMINAL USER INTERFACE)
CODEX: Full Rust TUI in codex-rs/tui/ (~100+ .rs files)
        ratatui-based, snapshot testing via insta
        Agent navigation, history, replay, file viewer
PURPCLAW: Basic Node.js TUI in scripts/nanoclaw.js
        No visual snapshot testing, less sophisticated
══════════════════════════════════════════════════════════
GAP 3: PROCESS SANDBOXING
CODEX: Isolated execution per platform
        bwrap/ (Linux), seatbelt (macOS),
        windows-sandbox-rs/ — shell commands run sandboxed
PURPCLAW: ❌ No sandboxing. Shell commands run as current user.
        HIGH RISK: malformed commands execute directly.
══════════════════════════════════════════════════════════
GAP 4: SAFE CODE EDITING (apply-patch)
CODEX: codex-rs/apply-patch/ — dedicated crate
        Writes files via structured patch, not raw fs.writeFile
        Handles conflicts, partial writes, backup
PURPCLAW: ❌ lib/agent-tools-file.js uses raw fs.writeFile
        No conflict detection, no atomic writes, no backup
══════════════════════════════════════════════════════════
GAP 5: FORMAL SKILLS SYSTEM
CODEX: .codex/skills/{name}/SKILL.md + agents/openai.yaml
        Each skill: trigger conditions, instructions, agents YAML
        Skill registry with validation
PURPCLAW: Skills are .md files in skills/ directory
        No formal schema, no YAML agent definitions,
        No trigger conditions, no validation framework
══════════════════════════════════════════════════════════
GAP 6: CONTEXT MANAGEMENT RULES
CODEX (from AGENTS.md):
  - No history rewrite — incremental context build
  - Hard cap: nothing >10K tokens
  - Nothing unbounded injected into model context
  - All fragments defined as structs implementing
    ContextualUserFragment trait
  - Bounded size per injected item
PURPCLAW: ❌ No formal context budget rules
        Token counting exists but no hard caps enforced
        Risk of unbounded context growth per session
══════════════════════════════════════════════════════════
GAP 7: SESSION / THREAD PERSISTENCE
CODEX: codex-rs/thread-store/ — full thread persistence
        Sessions saved to disk, resumable
        Rollback on failure, version history
PURPCLAW: ❌ Session state in memory only
        Cognitive spine has memory but not thread-store
        persistence. No session resumption after restart.
══════════════════════════════════════════════════════════
GAP 8: SNAPSHOT / VISUAL TESTING
CODEX: cargo insta — snapshot testing for TUI
        Every UI change requires snapshot update
        Snapshots stored in repo, reviewed in PR
PURPCLAW: ❌ No snapshot testing anywhere
        No automated visual regression tests
══════════════════════════════════════════════════════════
GAP 9: MCP SERVER (codex runs AS an MCP server)
CODEX: codex-rs/mcp-server/ — Codex exposes MCP tools
        Also codex-rs/codex-mcp/ — MCP client connection mgmt
PURPCLAW: MCP client only (connects to external servers)
        Does NOT expose itself as an MCP server
══════════════════════════════════════════════════════════
GAP 10: MODEL PROVIDER ABSTRACTION
CODEX: codex-rs/model-provider/ + models-manager/
        Ollama, LM Studio, ChatGPT all as first-class providers
        Clean abstraction over API differences
PURPCLAW: llm-provider.js handles multiple providers
        but no formal model-provider crate abstraction
══════════════════════════════════════════════════════════
GAP 11: GIT ATTRIBUTION
CODEX: codex-rs/git-utils/ + ext/git-attribution/
        Knows which commits/lines came from Codex vs human
        Tracks agent-authored changes separately
PURPCLAW: ❌ No git attribution tracking
        All changes appear as from current user
══════════════════════════════════════════════════════════
GAP 12: COLLABORATION / MULTI-USER
CODEX: app-server + thread-store — multi-user sessions
        JSON-RPC API, real-time collaboration
PURPCLAW: ❌ Single-user only
        No multi-user session support
══════════════════════════════════════════════════════════
GAP 13: PLUGIN MARKETPLACE
CODEX: marketplace_cmd.rs — `codex marketplace` command
        Browse and install plugins from marketplace
PURPCLAW: ❌ No marketplace
        Plugins installed manually
══════════════════════════════════════════════════════════
GAP 14: AUTOMATED CODE REVIEW
CODEX: .codex/skills/code-review/ — full skill
        code-review-breaking-changes, code-review-context,
        code-review-change-size, code-review-testing
        Automated PR review as a built-in skill
PURPCLAW: No automated code review skill
══════════════════════════════════════════════════════════
GAP 15: WEB SEARCH INTEGRATION
CODEX: ext/web-search/ — web search as a tool
        Agent can search the web live
PURPCLAW: ❌ No live web search
        No search integration in agent loop
══════════════════════════════════════════════════════════
GAP 16: SECRETS / KEYRING STORE
CODEX: codex-rs/keyring-store/ — OS keychain integration
        API keys stored in system keyring, not .env files
PURPCLAW: API keys in .env file
        No OS keyring integration
══════════════════════════════════════════════════════════
GAP 17: FILE WATCHER (live reload)
CODEX: codex-rs/file-watcher/ — watch files for changes
        Agent reacts to file changes in real-time
PURPCLAW: ❌ No file watcher service
══════════════════════════════════════════════════════════
GAP 18: EXEC SERVER (isolated shell process)
CODEX: exec-server/ — separate process for shell commands
        Isolated from main CLI, sandboxed, monitored
PURPCLAW: Shell commands run directly in agent-loop process
        No isolation
══════════════════════════════════════════════════════════
GAP 19: ANALYTICS / TELEMETRY
CODEX: codex-rs/analytics/ — usage analytics
        Events, facts, reducer pattern
PURPCLAW: metrics_aggregator.js exists but basic
        No event/fact/reducer analytics pattern
══════════════════════════════════════════════════════════
GAP 20: DOCTOR COMMAND (system diagnostics)
CODEX: cli/src/doctor.rs — full system check
        Background, git, runtime, system, updates, threads
PURPCLAW: purpclaw doctor NOT IMPLEMENTED
        Only `purpclaw status` basic health check
══════════════════════════════════════════════════════════
GAP 21: COMPACT / CONTEXT COMPRESSION
CODEX: codex-rs/compact*.rs — context compression
        compact_remote_v2, compact_token_budget
        Proactively reduces context to stay under limits
PURPCLAW: Basic context compression in agent-loop.js
        No formal compact/token-budget system
══════════════════════════════════════════════════════════
GAP 22: CODE EDITOR INTEGRATION
CODEX: VS Code, Cursor, Windsurf plugins
        Agents operate IN the editor alongside human
PURPCLAW: ❌ No editor plugin
        Only CLI + WebUI
══════════════════════════════════════════════════════════
GAP 23: UPDATE / INSTALLER SYSTEM
CODEX: curl/powershell install scripts
        codex updater, managed installation
        cli/src/app-server-daemon/managed_install.rs
PURPCLAW: Manual npm install / pm2 restart
        No self-update command
══════════════════════════════════════════════════════════

══════════════════════════════════════════════════════════
GAP SUMMARY — Priority Order
══════════════════════════════════════════════════════════

TIER 1 — CRITICAL (security/risk):
  [ ] GAP 3:  Sandbox execution (bwrap/seatbelt/Windows sandbox)
  [ ] GAP 4:  Safe code editing (apply-patch crate)
  [ ] GAP 16: Secrets keyring store (not .env in plain text)

TIER 2 — CORE parity (what makes it a real CLI):
  [ ] GAP 10: Model provider abstraction (formal crate)
  [ ] GAP 11: Git attribution tracking
  [ ] GAP 18: Exec server (isolated shell process)
  [ ] GAP 20: Doctor command (system diagnostics)
  [ ] GAP 23: Self-update / installer system

TIER 3 — PRODUCT FEATURES:
  [ ] GAP 6:  Context management rules (hard caps, 10K limit)
  [ ] GAP 7:  Session/thread persistence
  [ ] GAP 9:  MCP server (expose PURPCLAW as MCP server)
  [ ] GAP 15: Web search integration
  [ ] GAP 17: File watcher service

TIER 4 — DIFFERENTIATORS (PURPCLAW ADVANTAGE):
  [x] GAP 21: Cognitive spine / memory matrix (Codex lacks this)
  [x] GAP 21: Voice bridge (Codex lacks this)
  [x] GAP 21: Training buffer / Karpathy ratchet
  [x] GAP 21: Agent scoring
  [x] GAP 21: WebUI vs TUI (both have strengths)

══════════════════════════════════════════════════════════
CODEX HAS, PURPCLAW MISSING (complete list):
══════════════════════════════════════════════════════════
• Desktop app launcher (macOS/Windows/Linux)
• Rust TUI with ratatui + snapshot testing
• Process sandboxing (bwrap/seatbelt/windows-sandbox)
• Safe code editing (apply-patch crate)
• Formal skills YAML schema
• Context management hard caps (10K token limit rule)
• Thread/session persistence (thread-store)
• Snapshot/visual regression testing
• MCP server (Codex exposes tools via MCP)
• Model provider abstraction crate
• Git attribution tracking
• Multi-user collaboration (app-server)
• Plugin marketplace
• Automated code review skill
• Web search integration
• OS keyring secrets store
• File watcher service
• Isolated exec-server process
• Analytics event/fact/reducer pattern
• Doctor command (system diagnostics)
• Context compression (compact_remote_v2)
• Editor plugins (VS Code/Cursor/Windsurf)
• Self-update / managed install system
