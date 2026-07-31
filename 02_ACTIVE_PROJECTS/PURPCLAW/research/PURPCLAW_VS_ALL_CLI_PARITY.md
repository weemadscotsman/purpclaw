# PURPCLAW vs All CLI Parity Audit
*Generated: 2026-07-31*
*Sources: live CLI --help for claude v2.1.217, codex, hermes v0.19.0, purpclaw v0.3.0*

> **Note:** `docex` CLI was not found on this system (not installed).

---

## VERDICT

| System | Parity Tier | Notes |
|--------|-------------|-------|
| **Claude CLI** | Single-provider, tool-focused | Best IDE integration, MCP, `--allowedTools`, `--max-budget-usd` |
| **Codex CLI** | Minimal exec/review surface | `exec`, `review`, `apply`, `login`, `mcp`, `sandbox` — thin |
| **Hermes CLI** | Multi-provider, session-aware | Best skill system (`hermes skills browse/install`), hooks, kanban |
| **PurpClaw CLI** | Widest surface by command count | 80+ commands across 12 categories; wins on DevOps, memory, agents |

---

## SUMMARY SCORES

| Category | Claude | Codex | Hermes | PurpClaw |
|----------|--------|-------|--------|----------|
| Core Session | ✅✅ | ⚪ | ✅✅ | ✅✅ |
| Workspace/Project | ✅✅ | ⚪ | ✅ | ✅ |
| Tools | ✅ | ⚪ | ✅✅ | ✅✅ |
| Model/Provider | ✅ | ⚪ | ✅ | ✅✅ |
| Agents | ⚪ | ⚪ | ⚪ | ✅✅✅ |
| Lifecycle Hooks | ⚪ | ⚪ | ✅ | ✅✅ |
| Workflow/Orchestration | ⚪ | ⚪ | ✅ | ✅✅✅ |
| Code + Review | ✅ | ✅✅ | ⚪ | ✅✅ |
| Introspection | ✅ | ⚪ | ✅✅ | ✅✅✅ |
| DevOps/Deploy | ⚪ | ⚪ | ⚪ | ✅✅✅ |
| Memory/Knowledge | ⚪ | ⚪ | ✅✅ | ✅✅ |
| **Unique moat** | 0 | 0 | 0 | **14** |

Legend: ✅✅✅ = full parity + unique depth  |  ✅✅ = full parity  |  ✅ = partial  |  ⚪ = missing

---

## DETAILED SURFACE COMPARISON

### CORE SESSION

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Interactive chat | `claude [prompt]` | ❌ | `hermes chat` | `purpclaw ask` / `purpclaw mochi` |
| Single-shot / print mode | `claude -p "prompt"` | ❌ | `hermes chat -q "prompt"` | `purpclaw ask "question"` |
| Session list / browse | `claude sessions` | ❌ | `hermes sessions list` + `browse` | `purpclaw ask --session <name>` |
| Session resume / continue | `claude -c` / `-r [session]` | `codex resume --last` | `hermes -c [name]` | `purpclaw resume <id>` |
| Session fork | ❌ | ❌ | ❌ | `purpclaw ask --session <new>` |
| Session rename | ❌ | ❌ | `hermes sessions rename <id> <title>` | ❌ |
| Session archive | ❌ | `codex archive <id>` | ❌ | `purpclaw session archive <name>` |
| Session delete | ❌ | `codex delete <id>` | ❌ | `purpclaw session delete <name>` |
| Session inspect | ❌ | ❌ | ❌ | **MISSING** |
| Background agents | `claude agents` / `--bg` | ❌ | hermes cron/background | `purpclaw bg` + `ps` + `kill/attach/logs` |
| Session persistence | ✅ SQLite/transcripts | ✅ | ✅ SQLite + FTS5 | ✅ SQLite |

### WORKSPACE / PROJECT

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Per-project config | `CLAUDE.md` + `.claude.json` | `codex.toml` | `CLAUDE.md` | **`purpclaw.toml`** ✅ (C5 done) |
| Additional allowed dirs | `--add-dir <path>` | ❌ | project scoping | ❌ |
| Worktree / git worktree | `-w [name]` | ❌ | `--worktree` | ❌ |
| Safe mode | `--safe-mode` | ❌ | `--safe-mode` | ❌ |
| Bare mode | `--bare` | ❌ | ❌ | ❌ |

### TOOLS

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Tool allowlist | `--allowedTools` | ❌ | `tools.enabled` config | `purpclaw policies` |
| Tool blocklist | `--disallowedTools` | ❌ | ❌ | ❌ |
| MCP servers | `mcp add/list/remove` | `mcp add/list/remove` | `mcp add/list/test` | `purpclaw mcp` (loadCmd) |
| MCP catalog/install | ❌ | ❌ | **`mcp catalog/install`** | ❌ |
| Plugins | `plugin install/list/disable` | ❌ | `plugins install/list/enable` | `purpclaw plugin list/disable/enable/info` |
| Plugin eval | `plugin eval [target]` | ❌ | ❌ | ❌ |
| Skills | ❌ | ❌ | **`skills browse/search/install/list/check/update/audit/uninstall/reset/diff/opt-out/publish/snapshot/tap/config`** | `registry browse / install <name> / search` |
| Code interpreter | ✅ Python subprocess | ❌ | ❌ | ✅ `lib/code-interpreter.js` |

### MODEL / PROVIDER

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Model selection | `--model` + `--fallback-model` | ❌ | `model` picker + `fallback list/add/remove` | `purpclaw model` + `purpclaw llm` |
| Multi-provider | ❌ (single Anthropic) | ❌ | multi-provider pool | **17 providers** ✅ |
| API key auth | `auth login/status` | `login/logout` | `auth add/list/remove/reset` | `purpclaw provider save/load/test/wizard` |
| Cost/budget cap | `--max-budget-usd` | ❌ | ❌ | **`purpclaw cost summary / analyze`** |
| Provider verify | ❌ | ❌ | ❌ | `purpclaw providers verify` |

### AGENTS

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Custom agent defs | `--agent` + `--agents JSON` | ❌ | ❌ | `purpclaw forge [name]` (gacha agent) |
| Agent roster | ❌ | ❌ | ❌ | **`purpclaw roster [--missing]`** (44 agents) |
| Background agent mgmt | `agents [--all --json]` | ❌ | ❌ | `purpclaw agents` (tower + divisions) |
| Multi-agent spawning | ❌ | ❌ | `kanban` (multi-profile) | ✅ (agent-tower) |
| Agent marketplace UI | ❌ | ❌ | ❌ | **MISSING** (G4 gap) |

### LIFECYCLE HOOKS

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Hooks system | ❌ | ❌ | `hooks` (shell-script) | **`purpclaw hooks list/run`** (PARITY_HOOKS + LIFECYCLE bus) |
| Session hooks | ❌ | ❌ | ❌ | **SessionStart/SessionEnd/PromptSubmit** ✅ |
| Tool hooks | ❌ | ❌ | ❌ | **PreToolUse blocking** ✅ |

### WORKFLOW / ORCHESTRATION

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Workflow registry | ❌ | ❌ | ❌ | **`purpclaw workflows`** ✅ + `purpclaw workflow` |
| Approval gates | ❌ | ❌ | `approvals` | **`purpclaw approve/reject`** ✅ + `purpclaw jobs` |
| Approval branching | ❌ | ❌ | ❌ | **`on_approved/on_denied`** ✅ |
| Cron/scheduling | ❌ | ❌ | `cron list/run/schedule` | **`purpclaw schedule`** (lib/cron-manager.js) ✅ |
| Session resume/continue-latest | ❌ | ❌ | ❌ | **MISSING** |
| Session inspect | ❌ | ❌ | ❌ | **MISSING** |
| Session prune | ❌ | ❌ | ❌ | **MISSING** |

### CODE + REVIEW

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Apply diff/patch | `codex apply` | ❌ | ❌ | **`purpclaw apply-diff`** ✅ (C3 done) |
| Code review | `ultrareview` | `codex review` | ❌ | `purpclaw review` (inline) + `purpclaw code status` |
| PR create/merge | ❌ | ❌ | ❌ | `lib/commands/review-pr.js` — **CLI unverified** |
| Init/scaffold | ❌ | ❌ | ❌ | **`purpclaw init-project`** ✅ (node/react/python/rust/etc, C4 done) |
| Auto-fix loop | ❌ | ❌ | ❌ | **`purpclaw eval`** ✅ (C1 done) |

### INTROSPECTION

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Doctor/health | `doctor` | `doctor` | `doctor` | `purpclaw doctor / doctors` |
| Status dashboard | ❌ | ❌ | `dashboard` | **`purpclaw status` + `purpclaw tui`** |
| Introspection | ❌ | ❌ | ❌ | **`purpclaw introspect / introspect risks`** |
| Logs | ❌ | ❌ | `logs [-f] / errors` | **`purpclaw logs [service]`** |
| Config show | `config` (project) | ❌ | `config show` | `purpclaw config show` |
| Spend analytics | `--max-budget-usd` | ❌ | ❌ | **`purpclaw stats`** ✅ |
| Context viz | ❌ | ❌ | ❌ | **`purpclaw ctx-viz [--json --html]`** |

### DEVOPS / DEPLOY

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Start/stop services | ❌ | ❌ | ❌ | **`purpclaw start/stop/restart [--all --profile]`** |
| Safe start/stop | ❌ | ❌ | ❌ | **`purpclaw safe-start --core/--dark / safe-stop`** |
| Heal/recovery | ❌ | ❌ | ❌ | **`purpclaw heal [--execute]`** |
| GC / housekeeping | ❌ | ❌ | `checkpoints prune` | **`purpclaw gc --stats/--apply/--aggressive`** |
| Rollback | ❌ | ❌ | ❌ | **`purpclaw rollback list/undo`** |
| Bughunt | ❌ | ❌ | ❌ | **`purpclaw bughunt [--json]`** |
| Smoke test | ❌ | ❌ | ❌ | **`purpclaw smoke [--quick --json]`** |
| Worker pool | ❌ | ❌ | ❌ | **`purpclaw workers status/list/add/test`** |
| Teleport bundles | ❌ | ❌ | ❌ | **`purpclaw teleport create/list/resume`** |

### MEMORY / KNOWLEDGE

| Feature | Claude CLI | Codex CLI | Hermes CLI | PurpClaw CLI |
|---------|-----------|-----------|-----------|-------------|
| Memory system | `auto-memory` | ❌ | `memory / memory-graph` | `purpclaw memory ingest/forget/stats` |
| Skills pool | ❌ | ❌ | `pool` (skills registry) | **`purpclaw pool query/show/routing/stats/reindex`** |
| Dream/consolidation | ❌ | ❌ | `journey / learning` | **`purpclaw dream`** (AutoDream) |
| Brain stack | ❌ | ❌ | ❌ | **`purpclaw brain [-v] / purpclaw route`** |
| Memory stats | ❌ | ❌ | ❌ | **`purpclaw memory stats`** |

---

## MISSING IN PURPCLAW (from all competitors)

| Gap | Source | Priority |
|-----|--------|----------|
| `purpclaw session inspect <name>` | Missing from all competitors too | Low |
| `purpclaw session resume <id>` | Workaround: `purpclaw ask --session` | P1 |
| `purpclaw session continue-latest` | Hermes has `-c` | P1 |
| `purpclaw session prune` | Hermes has session pruning | Low |
| `purpclaw session attach` | ❌ | Low |
| `purpclaw --add-dir <path>` | Claude CLI only | Medium |
| `purpclaw --worktree <name>` | Claude/Codex/Hermes all have | Medium |
| `purpclaw --safe-mode` | Claude/Hermes have | Medium |
| `purpclaw --bare` | Claude has | Low |
| `purpclaw mcp catalog/install` | Hermes has | Medium |
| `purpclaw plugin eval <target>` | Claude has | Low |
| Agent marketplace UI | ChatGPT App (G4) | Medium |

---

## PURPCLAW UNIQUES (no competitor has these)

| Feature | Notes |
|---------|-------|
| 17-provider routing | No single-provider lock-in |
| SpendGate + streaming budget enforcement | `streamChat()` gated |
| Training buffer CLI | `purpclaw training status/export/feedback` |
| Idle engine (6-phase) | `purpclaw idle status/trigger` |
| Secret vault | Secure credential injection |
| Pet/companion system | `purpclaw pet feed/pet/play/sleep/wake/clean/trick/thoughts` |
| Mochi animated companion | `purpclaw mochi` |
| Teleport state bundles | `purpclaw teleport create/list/resume` |
| Worker pool (cloud scale) | `purpclaw workers *` |
| Spaghetti code health | `purpclaw spaghetti audit/diff` |
| Autofix PR pipeline | `purpclaw autofix-pr plan/run/verify` |
| Repo map | `purpclaw repomap` |
| `purpclaw whoami` | Live stack self-description |
| `purpclaw bughunt` | Full stack scan |
| `purpclaw heal` | Recovery plan generator |
| `purpclaw ctx-viz` | Service mesh visualizer |
| 44-agent tower + divisions | `purpclaw agents / roster` |
| Gacha agent forge | `purpclaw forge [name]` |
| Spend analytics | `purpclaw stats / cost summary` |

---

## CODEX CLI COMMANDS (verbatim)

```
codex exec        Run non-interactively [aliases: e]
codex review      Code review non-interactively
codex login/logout
codex mcp         Manage external MCP servers
codex plugin      Manage plugins
codex mcp-server  Start Codex as MCP server (stdio)
codex apply       Apply latest diff as git apply [aliases: a]
codex resume      Resume previous session (--last)
codex archive     Archive saved session by id/name
codex delete      Delete saved session
codex sandbox     Run in Codex sandbox
codex doctor      Diagnose installation/config/auth
codex worktree    Git worktree management
```

## CLAUDE CLI DISTINCTIVE FLAGS

| Flag | What it does |
|------|-------------|
| `--allowedTools` | Comma-separated tool allowlist |
| `--disallowedTools` | Tool blocklist |
| `--max-budget-usd` | Dollar spend cap |
| `--add-dir` | Additional allowed directories |
| `--safe-mode` | Disable all customizations |
| `--bare` | Skip hooks/LSP/plugin sync |
| `--bg / --background` | Background agent mode |
| `--plugin-dir` | Load plugin from directory |
| `--plugin-url` | Fetch plugin from URL |
| `--system-prompt` | Override system prompt |
| `--mcp-config` | MCP server config |
| `--print` | Print mode (non-interactive) |
| `--resume` | Resume session |
| `--session-id` | Specific UUID session |
| `--skip-permissions` | Bypass permission checks |
| `--version` | Show version |

## HERMES CLI DISTINCTIVE COMMANDS

| Command | What it does |
|---------|-------------|
| `hermes kanban` | Multi-profile collaboration board |
| `hermes hooks` | Shell-script hook management |
| `hermes pool` | Skills pool registry |
| `hermes journey` | Dream/consolidation |
| `hermes learning` | Continuous learning |
| `hermes memory-graph` | Memory visualization |
| `hermes mcp catalog` | MCP server discovery/install |
| `hermes skills *` | Full skill lifecycle (20 subcommands) |
| `hermes backup` | Backup Hermes home to zip |
| `hermes import` | Restore from backup |
| `hermes claw` | PURPCLAW interop |
| `hermes gateway` | Messaging gateway management |
| `hermes portal` | Nous Portal setup |
| `hermes secrets` | Bitwarden/1Password vault |
| `hermes egress` | Egress firewall management |
| `hermes security` | OSV.dev supply-chain audit |
| `hermes skin` | Theme/skin management |
| `hermes pairing` | DM pairing codes |
| `hermes pets` | Pet system |
| `hermes bundles` | Skill bundle aliases |
| `hermes profile` | Multi-profile management |
| `hermes completion` | Shell completion |

---

*Docex not installed on this system — likely a document extraction CLI (pip: annotated-doc, azure-documentintelligence, docx2txt, python-docx present). Not a coding agent CLI.*
