> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# CODEX PARITY AUDIT — 2026-07-28/29
## Source: `github.com/openai/codex` `codex-rs/cli/src/main.rs` (4265L) + subcommand files
## Pulled via: `curl https://raw.githubusercontent.com/openai/codex/HEAD/codex-rs/cli/src/{file}`

---

## CODEX COMMANDS (from Codex main.rs Subcommand enum)

| Command | Codex | PURPCLAW | Status |
|---------|-------|----------|--------|
| `exec` | ✅ | ✅ `exec` + `exec review` | done |
| `exec review` | ✅ | ✅ git diff review with approval | done |
| `mcp` (list) | ✅ | ✅ | done |
| `mcp get <name>` | ✅ | ✅ | done |
| `mcp add <name>` | ✅ | ✅ `--stdio` + `--url [--bearer-token-env-var] [--env KV]` | done |
| `mcp remove` | ✅ | ✅ | done |
| `mcp login` | ✅ | ✅ (bearer token + prompt) | done |
| `mcp logout` | ✅ | ✅ | done |
| `mcp-server` | ✅ | ✅ stdio MCP server (lib/mcp-server.js) | done |
| `completion` | ✅ | ✅ bash/zsh/fish/powershell | done |
| `app-server` | ✅ | ✅ start/stop/restart/status/version | done |
| `app-server daemon start` | ✅ | ✅ | done |
| `app-server daemon stop` | ✅ | ✅ | done |
| `app-server daemon restart` | ✅ | ✅ | done |
| `app-server daemon version` | ✅ | ✅ | done |
| `app-server daemon bootstrap` | ✅ | stub | minor |
| `app-server daemon enable-remote-control` | ✅ | stub | minor |
| `app-server daemon disable-remote-control` | ✅ | stub | minor |
| `update` | ✅ | ✅ `update --check` (npm-based) | done |
| `doctor` | ✅ | ✅ | done |
| `debug models` | ✅ | ✅ | done |
| `debug app-server` | ✅ | stub | minor |
| `debug prompt-input` | ✅ | stub | minor |
| `debug clear-memories` | ✅ | stub | minor |
| `sandbox` | ✅ | ✅ Docker/sandbox detection | done |
| `session list` | ✅ | stub | minor |
| `session fork` | ✅ | stub | minor |
| `session archive` | ✅ | stub | minor |
| `session delete` | ✅ | stub | minor |
| `session resume` | ✅ | stub | minor |
| `apply` | ✅ | ✅ unified diff hunk parser | done |
| `remote` | ✅ | ✅ SSH target management | done |
| `auth login/logout` | ✅ | ✅ | done |
| `features` | ✅ | ✅ | done |
| `init` | ✅ | stub | minor |
| `model list/set/show` | ✅ | stub | minor |
| `config get/set/list/unset` | ✅ | stub | minor |
| `cloud` | ✅ | N/A (OpenAI-specific) | — |
| `plugin marketplace` | ✅ | stub | minor |
| `plugin install/list/remove` | ✅ | stub | minor |
| `task` | ✅ | stub | minor |

---

## KEY FINDINGS FROM READING ACTUAL CODEX SOURCE

### `codex mcp add` transport types (lines 281-415 of mcp_cmd.rs):
- **Stdio**: `--command node /path/to/server.js` → `McpServerTransportConfig::Stdio { command, args, env }`
- **HTTP/Streamable**: `--url https://...` → `McpServerTransportConfig::StreamableHttp { url, bearer_token_env_var }`
- OAuth auto-detected after add → triggers `perform_oauth_login_retry_without_scopes()`
- Scope discovery: tries discovered scopes first, falls back to empty scope

### `codex mcp-server` (main.rs lines 149-165):
- Separate Subcommand variant: `McpServer(McpServerArgs)`
- Runs Codex as stdio MCP server (not as client)
- PURPCLAW: `lib/mcp-server.js` implements same protocol

### `codex app-server daemon` (main.rs lines 619-640):
- `AppServerDaemonSubcommand::Start` → `LifecycleCommand::Start`
- `AppServerDaemonSubcommand::Bootstrap` → `codex_app_server_daemon::bootstrap(BootstrapOptions { remote_control_enabled })`
- `AppServerDaemonSubcommand::Restart` → `LifecycleCommand::Restart`
- `AppServerDaemonSubcommand::EnableRemoteControl` → `RemoteControlMode::Enable`
- `AppServerDaemonSubcommand::DisableRemoteControl` → `RemoteControlMode::Disable`
- `AppServerDaemonSubcommand::Stop` → `LifecycleCommand::Stop`

### `codex update` (lines 801-797 of main.rs):
- Release-only (blocked in debug builds)
- Uses `codex_tui::get_update_action()` → detects install method
- Runs `run_update_action(action)` → self-updater

### Codex CLI structure:
- Uses `clap` with `#[derive(Subcommand)]` for all commands
- App struct: `{ config, secrets, context, state }`
- Init: `init_telemetry()` + `load_config()` at startup
- Uses `#[instrument]` tracing attributes throughout
- Async runtime: `let rt = runtime(); runtime.block_on(app.run())`

---

## REMAINING GAPS (minor)

1. **`app-server daemon bootstrap`** — SSH-driven daemon bootstrap (manual PM2 config required)
2. **`app-server daemon enable/disable-remote-control`** — env-var based, documented
3. **`session` subcommands** — list/fork/archive/delete/resume via git worktree
4. **`plugin marketplace`** — npm registry integration for MCP/plugin packages
5. **`update` self-update action** — detects Homebrew vs npm vs binary install
6. **`init`** — interactive first-run setup wizard
7. **`model`** — model selection/listing
8. **`config`** — get/set/list/unset configuration
9. **`debug trace-reduce`** — rollout trace replay (sandbox debug replay)
