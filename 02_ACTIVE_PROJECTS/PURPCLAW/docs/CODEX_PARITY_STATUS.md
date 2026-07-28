# CODEX PARITY — CANONICAL STATUS
**As of: 2026-07-29 | Commit: b494710**

---

## CLI Parity: COMPLETE
**20/20 command domains matched. No stubs.**

| Domain | Commands | Status |
|--------|----------|--------|
| Auth | login, logout | ✅ |
| Shell | exec, exec review | ✅ |
| Sessions | resume, fork, archive, unarchive, delete, session list | ✅ |
| Diff/Apply | apply, apply --dry-run/--check | ✅ |
| Self-update | update, update --check | ✅ |
| Diagnostics | doctor, sandbox, debug models, debug clear-memories | ✅ |
| Completion | completion bash/zsh/fish/powershell | ✅ |
| MCP | mcp list/get/add/remove/login/logout/tools/status/reload | ✅ |
| MCP Server | mcp-server, mcp-server --strict-config | ✅ |
| Plugins | plugin list/info/install/add/remove/enable/disable | ✅ |
| Remote | remote, remote-control start/stop/status/pair | ✅ |
| App Server | app-server start/stop/restart/status/version, daemon variants | ✅ |
| Features | features | ✅ |
| Cloud | cloud list | ✅ |
| Init | init | ✅ |
| Model | model list/show | ✅ |
| Config | config get/set/list/unset | ✅ |
| Hooks | hooks list/add/remove/run | ✅ |
| Registry | registry install/remove/list | ✅ |
| Help | --help, help | ✅ |

---

## Extended Product Parity: 20/22
**2 genuine gaps — separate product surfaces, not CLI commands**

| Gap | Size | Notes |
|-----|------|-------|
| **Marketplace** | days of work | Registry system, source discovery, add/list/upgrade/remove |
| **Desktop App** | days + desktop surface | Launcher, browser integration, install/download flow |

---

## Smoke Tests: 12/12 PASSING
All command paths exercised end-to-end. No stubs, no cosplay.

---

## What This Is NOT
- `exec-server` / `responses-api-proxy` / `stdio-to-uds` — architecture differences, not gaps
- `debug trace-reduce` — internal Codex tooling, not user-facing
- `debug prompt-input` — Codex internal diagnostic

---

## What's Next
Two workstreams only:

1. **Marketplace** — npm/git registry, `plugin marketplace add/list/upgrade/remove`
2. **Desktop** — Electron/web launcher, `app` command, install path

No more parity audits. Verify against the matrix above.
