---
name: omnicode-mcp
description: OmniCode MCP server — local code analysis with AST indexing, symbol search, blast radius, call hierarchy, and token burn benchmarking. Wrapped as Hermes MCP server.
version: 0.1.0
category: coding
tags: [mcp, code-analysis, ast, symbols, refactoring, blast-radius, rbac]
hermes:
  mcp_server: omnicode
  tools: 39
---

# OmniCode MCP

## Rule: Always Use OmniCode First

**Ted's rule one (load-bearing).** Before reading raw files, running grep, or doing any
non-trivial code work, call an OmniCode tool first. Prefer symbol-level tools
(`search_symbols`, `get_context_bundle`, `blast_radius`, `dead_code_scan`,
`spaghetti_report`, `file_outline`, `repo_map`) over `read_file` / `search_files` /
`terminal cat`. Index the repo with `index_project` before searching.

**When MCP is connected** (Hermes session has `mcp__omnicode__*` in its tool list),
use those — they're the lowest-friction path. **When MCP is not connected in the
current session** (e.g., config changed mid-conversation, session was started before
the server was wired), fall back to the CLI at
`E:\god folder\02_ACTIVE_PROJECTS\omnicode-platform\omnicode-mcp\dist\cli.js`. The CLI
is a strict superset of the MCP tool surface for read-side operations
(`status`, `index`, `context`, `repo_map`, `token-stats`, `benchmark`, `doctor`).
Symbol search (`search_symbols`, `blast_radius`, `get_symbol`) is MCP-only.

**Self-check before any code edit:** did you read the file with `read_file` when
`context` or `file_outline` would have given it to you with a token budget and
resolved deps? If yes, retry through OmniCode.

## Critical: RBAC Role Must Be Set in Wrapper

The server defaults to `read-only` role (least privileged). This means `index_project`, `clone_and_index`, `check_delete_safe` are BLOCKED unless `OMNICODE_ROLE=agent` is set.

Always use the wrapper script — never call `node dist/server.js` directly without the env var.

The wrapper `run_omnicode.cmd` (at the platform root, `E:\god folder\02_ACTIVE_PROJECTS\omnicode-platform\run_omnicode.cmd`) sets it correctly:
```batch
@echo off
cd /d "%~dp0"
set OMNICODE_ROLE=agent
set OMNICODE_USER=hermes
node dist/server.js
```

## Stdio Protocol: Skip Progress Notifications

The server emits progress notifications as separate JSON-RPC messages on stdout:
```
{"method":"notifications/progress","params":{"progressToken":"index_progress","progress":1,"total":20},"jsonrpc":"2.0"}
```

**Parser rule**: when reading stdio responses, split on newlines, skip any line where `r.id` is missing (it's a notification, not a response). Only resolve when you get a message with `r.id && (r.result || r.error)`.

## Hermes MCP Registration

```bash
# Interactive (will prompt for tool selection) — MUST use cmd wrapper for correct cwd + env
echo y | hermes mcp add omnicode --command cmd --args "/c E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/run_omnicode.cmd"

# Test after registration
hermes mcp test omnicode
hermes mcp list
```

**Registration MUST use `cmd /c` wrapper** — direct `node dist/server.js` fails because the server runs from wrong cwd and Hermes MCP doesn't inherit cwd from config. The wrapper script handles both cwd and OMNICODE_ROLE env var.

Config added to `config.yaml`:
```yaml
mcp_servers:
  omnicode:
    command: cmd
    args:
    - /c
    - E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/run_omnicode.cmd
    enabled: true
    timeout: 120
    connect_timeout: 60
```

Restart Hermes to load new tools.

## Cross-Client Onboarding: `omni init`

When wiring omnicode into a fresh machine or adding a new AI client, do NOT hand-edit 4 different config files. Use the `omni init` script that lives in the omnicode-mcp repo (typically `scripts/omni-init.js` or a `bin/omni` wrapper). It detects which clients are installed, patches each one idempotently, and drops a policy file telling the client to prefer omnicode over raw file reads.

### Client detection matrix

| Client | Config path (Windows) | Format | Section key | Skip-if-present key |
|---|---|---|---|---|
| claude-code | `C:\Users\Admin\.claude.json` | JSON | `mcpServers` | `mcpServers.omnicode` |
| claude-desktop | `%APPDATA%\Claude\claude_desktop_config.json` | JSON | `mcpServers` | `mcpServers.omnicode` |
| codex | `C:\Users\Admin\.codex\config.toml` | TOML | `[mcp_servers.omnicode]` | `[mcp_servers.omnicode]` (whole block) |
| copilot-cli | `%APPDATA%\Code\User\settings.json` | JSON | `mcp.servers` | `mcp.servers.omnicode` |
| cursor | `%APPDATA%\Cursor\User\settings.json` | JSON | `mcpServers` | `mcpServers.omnicode` |

Detection is file-existence based — if the config file exists, the client is considered installed. Add new clients by appending to the matrix, not by hardcoding a path.

### Patching logic (MUST follow)

For every client the script touches, regardless of format:

1. **Read the existing config** (parse JSON, parse TOML — NEVER write a fresh file from scratch)
2. **Check for omnicode key** at the section key path. If present, skip the config write and just emit a "already configured" line
3. **If absent, INSERT the omnicode block** alongside the existing mcpServers. Do not delete, rename, or reorder any other entries
4. **Preserve comments and key order** in JSON files (use `JSON.stringify(obj, null, 2)` with stable key order — sort `mcpServers` keys alphabetically so the diff stays clean)
5. **Write the file atomically** (write to `.tmp`, then `rename`) to avoid half-written configs if the script crashes
6. **Always write the policy file** (CLAUDE.md, AGENTS.md) regardless of whether the config was patched — the policy is the cross-client contract that says "use omnicode first"

### Policy file content (canonical)

Drop a CLAUDE.md at the project root and an AGENTS.md next to it. Both contain the same body:

```
# Use OmniCode First

Before reading raw files or running grep, call `mcp__omnicode__plan_turn` or
`mcp__omnicode__health_check`. Prefer symbol-level tools (`search_symbols`,
`get_context_bundle`, `blast_radius`, `dead_code_scan`, `spaghetti_report`)
over `read_file` / `search_files` / `terminal cat`.

Index a repo with `mcp__omnicode__index_project` before searching.
```

CLAUDE.md is the standard name. AGENTS.md is the fallback for clients that don't read CLAUDE.md (some Cursor variants, future agents). Drop both — they cost ~200 bytes each.

### Pitfalls

#### JSON merge, not replace

The #1 bug. If the script does `fs.writeFile(path, JSON.stringify({mcpServers: {omnicode: ...}}))`, it WIPES every other MCP the user has configured. Always read → check → insert → write-back. This has happened in this codebase at least once and is a class of bug worth defending against with a unit test if you extend the script.

#### Codex already has omnicode

Codex sometimes ships with omnicode pre-configured (Ted pre-installed it on this machine). The script must check for the `[mcp_servers.omnicode]` block in `config.toml` BEFORE appending a second one — TOML allows duplicate section names but the second one silently wins, which breaks the first one. If found, skip codex and emit a "preserved existing" line.

#### TOML has no JSON parser

Don't try to `JSON.parse` a `config.toml`. Use a real TOML library (`@iarna/toml` works in Node, `tomli`/`tomllib` in Python). Hand-parsing is a maintenance trap — when omnicode adds a new field, hand-rolled parsers break silently.

#### Idempotency check

Before any write, check both the config key AND the policy file. If both are already in place, the script should be a complete no-op (exit 0, print "already configured" lines for each client). Re-running on a fully-configured machine is a no-op, not an error.

#### C drive space

Ted's C drive is at ~99% capacity (230/233 GB). CLAUDE.md and AGENTS.md are ~200 bytes each — negligible. But `~/.claude.json` and `claude_desktop_config.json` can grow large if the user has many MCPs. Don't worry about it for omni init; do worry if a future script writes megabytes to C:.

### MCP test invocations leave massive cache on C drive

This is the largest source of C: bloat from this skill. **Every** `mcp_omnicode_invoke_tool` call that touches a temp file (bench, selector, archive-only, huge-archive, db-id, generated, resolvers, resume-*, semantic, token-layer, trust, zip-*, child-timeout, debug, etc) writes a fresh dir to `%LOCALAPPDATA%\Temp\` with a random 6-char hash suffix. After 100+ invocations in a single dev/bench session, this is hundreds of dirs and can hit 200-800 MB even when each is small.

Worse: any tool that uses Python under the hood (orchestrator, semantic, OCAP tests on Python repos) pulls in `uv` to build a venv, and `uv` caches every interpreter + wheel in `%LOCALAPPDATA%\uv\cache\`. A heavy bench session can push this past **6 GB** on its own, and `uv` will also install managed Python interpreters at `%LOCALAPPDATA%\python\pythoncore-3.14-64\` (~1.8 GB) — those are NOT the system Python 3.11 in the hermes venv, so safe to nuke.

**Cleanup pattern (safe to run any time, no services need to be down):**

```powershell
# 1. Wipe all omnicode test temp dirs (~200-800 MB recovered)
Get-ChildItem "$env:LOCALAPPDATA\Temp" -Filter "omni*" -Directory -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# 2. Wipe uv cache (~6 GB recovered after a heavy bench session)
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:LOCALAPPDATA\uv\cache"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:LOCALAPPDATA\python\pythoncore-3.14-64"

# 3. Wipe local code index cache (~80 MB, omnicode will rebuild on next index_project)
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:USERPROFILE\.code-index"
```

There is a reusable script at `scripts/clean-omnicode-test-cache.ps1` that runs all three plus the pnpm / npm-cache / huggingface hub / electron-updater caches that pile up around it. Use it between bench sessions, before sharing the machine, or any time C: drops below 5 GB free.

**Pitfall — don't reach for `du -sh *` over AppData first.** It recurses everything and will time out (>120s) before you see results. Go straight to the known-cache targets: `uv`, `python`, `npm-cache`, `pnpm`, `pnpm-cache`, `huggingface`, `node-gyp`, `next-swc`, `D3DSCache`, `@mmx-agentelectron-updater`, `antigravity-updater`. A targeted `du -sh` over those 10-15 paths finishes in seconds.

**Pitfall — System.Speech is not the active TTS on Ted's machine.** When reporting disk cleanup via voice, do NOT use `System.Speech.Synthesis` (Microsoft Zira). Use `python "C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py" "<text>"` — Kokoro is the wired provider. The SAPI voice sounds robotic and contradicts the user profile (Kokoro = af_heart).

#### Policy file location

CLAUDE.md goes at the project root the agent is currently working in, NOT at `~`. AGENTS.md goes at the same location. Ted's pattern: drop both at the repo root of the active project. If running `omni init` outside a project, drop them at `~` and warn.

### Verification after `omni init`

```
# 1. Confirm all 3 config files were touched (or explicitly skipped)
grep -c omnicode ~/.claude.json
grep -c omnicode ~/AppData/Roaming/Claude/claude_desktop_config.json
grep -c omnicode ~/.codex/config.toml

# 2. Confirm policy files exist
ls ~/CLAUDE.md ~/AGENTS.md

# 3. Restart the client, then health-check
mcp__omnicode__health_check
# -> {"status": "healthy", "version": "0.1.0", "rbac": "enforcing sandbox constraints"}
```

If `health_check` fails after `omni init`, the wrapper script path in the new config is wrong — re-check `mcp_servers.omnicode.args` against the actual location of `run_omnicode.cmd` on the new machine.

### When `omni init` is NOT the right tool

- **Adding omnicode to a single new client** (e.g. just Cursor): hand-edit the config using the matrix above. Don't run the full `omni init` for one client.
- **Updating an existing omnicode install** (new version, new tool): use the project's upgrade docs, not `omni init`. `omni init` is for cold-start wiring, not for upgrades.
- **Diagnosing why omnicode is broken**: read the Hermes MCP logs, run `hermes mcp test omnicode`, then check the wrapper script. `omni init` will not fix a working config that's broken for environmental reasons (wrong cwd, missing OMNICODE_ROLE, etc.).

## What it does
- **AST indexing** of local repos (JavaScript, TypeScript, Python, Go, Rust, C#)
- **Symbol search** with fuzzy matching — finds symbols even with typos
- **Context bundle** — source + callers + callees in one call
- **Blast radius** — who depends on this symbol
- **Call hierarchy** — full caller/callee tree
- **Dead code scan** — unreachable symbols from the import graph
- **Spaghetti report** — circular deps, god objects, health score
- **Hotspots** — highest-risk symbols by importance + churn
- **Churn rate** — git-log based maintenance risk per symbol
- **Benchmark** — token burn proof vs raw file reading
- **Clone + index** — shallow-clone public GitHub repos
- **OCAP compact output** — row-oriented, path-interned format for token-sensitive loops (see below)
- **audit_agent_config** — meta-audit of AI client configs and policy files (see below)

## OCAP — OmniCode Compact Access Protocol

OCAP is a row-oriented, deduplicated text serialization for the 4 high-volume tools, controlled by the `format` parameter (`text` | `ocap` | `auto`, default `auto`). Path interning + fixed-key row format + stable enums drop output bytes 70-80% vs the text path on real workloads.

### When to use which format

- `format=ocap` — token-sensitive loops, multi-call sessions, large codebases, anything an LLM agent will re-read
- `format=text` — output shown to a human, pasted into a report, or grepped by line patterns
- `format=auto` (default) — picks `ocap` when result has ≥4 rows, else `text`. Threshold tuned so the smallest realistic query (4 hits) still flips to OCAP

### Wired tools (4)

| Tool | Keys | Intern buckets | Footer |
|---|---|---|---|
| `repo_map` | path, lang, symbols | path, lang | files |
| `search_symbols` | name, kind, path, line, score | kind, path | query, confidence, car, channels |
| `spaghetti_report` | type, severity, path, count, description | type, severity, path | health, grade, files, lines, circular, god_objects, long_files, dead_code |
| `get_context_bundle` | rel, name, kind, path, line, importance | kind, path | target, max_tokens, related |

### Wire format (v1, UTF-8, stable across versions)

```
OCAP v1
t: <tool_name>
k: <comma-separated column keys>
intern <bucket>: 0=<value> 1=<value> ...
---
<row1 cell>\t<row1 cell>\t...
<row2 cell>\t<row2 cell>\t...
## footer_key=footer_value
```

- `OCAP v1` — magic header, always first non-empty line
- `t:` — tool name (matches `server.ts` dispatcher)
- `k:` — column order, comma-separated. Parsers must read this before any row
- `intern <bucket>:` — one line per bucket; values tab-free, separated by single spaces; stable per call
- `---` — separator between header block and row block
- rows — tab-separated values matching `k:` order, one row per line
- `## ` — optional footer line with key=value pairs

### Implementation recipe (adding OCAP to a new tool)

1. **Create the shared module once** at `src/engine/ocap.ts`:
   - `makeOcapBuilder(tool, keys)` returns `{ intern, push, setFooter, toText }`
   - `resolveOcapFormat(format, rowCount)` — auto → ocap when rowCount ≥ 4
   - `OcapFormat` type union: `'text' | 'ocap' | 'auto'`
2. **In the tool** (`src/tools/<name>.ts`):
   - Add `format: OcapFormat = 'auto'` as last positional arg
   - Build a `typedRows: Array<[T1, T2, ...]>` while computing the result
   - Call `resolveOcapFormat(format, typedRows.length)` — if `'ocap'`, build and `return { result: ocap.toText() }` early
   - Otherwise fall through to existing text path
3. **In `server.ts`** — pass `args.format` through to the tool. The 4 call sites are at the grep-able `if (toolName === "X")` blocks
4. **In `tool_registry.ts`** — add `format: { type: 'string', enum: ['text', 'ocap', 'auto'] }` to the tool's `inputSchema.properties` so MCP clients see it
5. **Recompile**: `cd <repo> && node_modules/.bin/tsc` (no flags; `tsconfig.json` drives it)
6. **Reload the server** to pick up the new dist (see pitfall below)

### Pitfalls

- **Stale MCP handle after rebuild** — killing the running `node dist/server.js` to pick up a new dist leaves the Hermes MCP client with `ClosedResourceError`. Auto-retry backs off ~16s; if it still fails, the user must restart the Hermes CLI session. The dist/ on disk IS up to date — the first successful call after reconnect serves the new code. To find the PID: `powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object {$_.CommandLine -like '*omnicode-mcp*'} | Select-Object ProcessId"`. Then `cmd //c "taskkill /F /PID <pid>"`. Don't bother with the `omni init` wrapper — that's for cold-start wiring, not rebuilds.
- **OCAP text is structurally different from text** — clients that grep for `[class]` / `(path:line)` patterns in `search_symbols` output must adapt. Footer lines start with `## `, bucket lines start with `intern `, the separator is `---`. Don't paste-mode-parse OCAP as plain text.
- **Path ID stability is per-call** — IDs reset every invocation. If the agent wants to correlate across calls, read the `intern path: <id>=<text>` block. Don't assume ID `3` is the same file in two different calls.
- **Don't forget the 4th call site in `server.ts`** — when wiring `format` to a new tool, grep the tool name in `server.ts` to find the dispatch block. Missing one means the schema exposes `format` but the tool ignores it. Easy to spot via direct call (passes `format=ocap`, tool returns text).
- **The `rel` field in `get_context_bundle` OCAP is the discriminator** — `TARGET` is the queried symbol (always row 0), `CALLER` / `CALLEE` are the related graph. Don't try to look up `TARGET` in the `intern` buckets — the relation is literal.
- **Path interning is the heavy win, not the row format** — a 30-file repo with all unique paths saves ~5%. A 5K-file repo with avg 4 references per path saves ~70%. The math favors OCAP the more repetitive the corpus is (which is exactly when you want it most).

For worked text-vs-OCAP examples (real output from the 4 wired tools, plus a Python parser sketch), see `references/ocap-examples.md`.

## audit_agent_config — meta-audit of AI client configs and policy files

A proactive win-finding tool that scans the AGENT'S own configuration — not the indexed source code. It walks Claude / Codex / Cursor / Windsurf / Copilot / Cline / Claude Desktop configs and policy files, then surfaces concrete findings with fixes.

### What it scans (Windows paths)

- `~/.claude.json`, `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, `~/.claude/AGENTS.md`
- `~/.codex/config.toml`, `~/.codex/AGENTS.md`
- `~/.cursorrules`, `~/.cursor/rules`, `~/.clinerules`, `~/.windsurfrules`
- `~/.github/copilot-instructions.md`
- Project-level: `./CLAUDE.md`, `./AGENTS.md`, `./.cursorrules`
- `%APPDATA%\Claude\claude_desktop_config.json`
- Pass `target: <path>` to audit one file only

### Finding categories (7)

| Category | Severity source | What it means |
|---|---|---|
| `STALE_PATH` | path starts with HOME → medium, else low | File path referenced in config but missing on disk |
| `PHANTOM_TOOL` | low | Tool name in markdown policy but not in known registry |
| `RAW_READ_ANTI_PATTERN` | medium–high | `cat` / `Read` instruction without scope limit |
| `GREP_OVER_RETRIEVAL` | medium | "use grep to search code" instead of `search_symbols` |
| `TOKEN_WASTE` | medium (4K+) / high (8K+) | Policy file >4KB injected every turn |
| `MISSING_POLICY` | medium | MCP server registered but no policy file nearby |
| `GLOBAL_MISSING_POLICY` | high | Config exists, zero policy files anywhere |
| `INVALID_JSON` / `MCP_CONFIG_ERROR` | high | Malformed JSON, missing command, broken launcher path |

### Implementation recipe (already wired)

1. **Single file** at `src/tools/audit_agent_config.ts` (~16KB, no DB)
2. **No format param** — output is the human-readable punch list (one section per finding category, sorted by severity)
3. **In `server.ts`** — import + add the `if (toolName === "audit_agent_config")` dispatch block
4. **In `tool_registry.ts`** — register with `inputSchema: { properties: { target: { type: 'string' } } }`
5. **Compile + reload** — same flow as OCAP (see stale-handle pitfall below)

### Real findings on Ted's machine (first run, 7 files scanned)

- 3× MISSING_POLICY across `.claude.json` / `settings.json` / `claude_desktop_config.json`
- 3× STALE_PATH in `codex/config.toml` (renamed `E:\god folder`, deleted `Downloads\omnicode_review`, deleted `c:\users\admin\desktop\purpclaw`)
- 0× PHANTOM_TOOL after tightening the filter (first pass had 30 false positives — see pitfall)

See `references/audit-agent-config.md` for the finding taxonomy + the 30→0 false-positive debugging trail.

## Quick Start

```bash
# Test connection
hermes mcp test omnicode

# List all tools
hermes mcp list

# CLI commands actually available in dist/cli.js (16 total, June 2026):
# status, index, resolve-all, blindspots, clean, mcp-config, doctor,
# resume, context, token-stats, benchmark, clone-index, bench-many,
# bench-drive, sweep, init
#
# ⚠ The MCP server itself exposes 38 tools (mcp__omnicode__*),
# but those are NOT callable in most sessions because the MCP
# client isn't connected by default. The CLI is the fallback.
# search_symbols / repo_map / file_outline / spaghetti_report /
# get_context_bundle / plan_turn are MCP-only and won't work via CLI.
```

## Usage Examples

### Index a repo
```
tool: index_project
path: /path/to/repo
max_files: 100  # optional guard
```

### Search symbols
```
tool: search_symbols
path: /path/to/repo
query: authenticate
max_results: 5
```

### Get symbol with context
```
tool: get_context_bundle
path: /path/to/repo
symbol_name: run
max_tokens: 2000
```

### Plan a turn (auto-routes to best tools)
```
tool: plan_turn
path: /path/to/repo
intent: explore  # or "audit"
```

### Blast radius before rename
```
tool: blast_radius
path: /path/to/repo
symbol_name: checkPermission
```

### Dead code scan
```
tool: dead_code_scan
path: /path/to/repo
```

### Spaghetti report
```
tool: spaghetti_report
path: /path/to/repo
god_object_threshold: 20
long_file_threshold: 500
```

### Hotspots
```
tool: get_hotspots
path: /path/to/repo
limit: 10
```

### Benchmark (token burn proof)
```
tool: benchmark
path: /path/to/repo
query: authenticate
write: true  # writes .omnicode/BENCHMARK.md
```

## RBAC Roles

Controlled by `OMNICODE_ROLE` env var:
- `read-only` (default) — no write tools
- `agent` — includes index_project, clone_and_index, check_delete_safe
- `admin` — all tools

The wrapper script `run_omnicode.cmd` sets `OMNICODE_ROLE=agent`.

## Index Must Be Created Before Symbol Tools Work

`index_project` must be called first — all symbol/search/hotspot tools return empty until the repo is indexed. This is the #1 failure mode: searching and getting "No symbols found" means you forgot to index.

Quick sequence for any new repo:
1. `index_project { path, max_files: 20 }` — quick scan first
2. Then use symbol tools

## Project Move Recovery

When the project root changes (e.g., `C:\Users\Admin\Downloads\omnicode-mcp` → `E:\god folder\02_ACTIVE_PROJECTS\omnicode-platform\omnicode-mcp`):

1. **Update `~/.hermes/config.yaml`** `mcp_servers.omnicode.args` to the new wrapper path
2. **Update the wrapper script** (`run_omnicode.cmd`) if its internal paths are hardcoded
3. **Verify with `hermes mcp test omnicode`** — confirms the new path works
4. **Restart Hermes** for the in-conversation `mcp_omnicode_*` tool names to refresh
5. **Re-index from the new path** — the old index is at the old DB path, the new path shows "Never indexed" until you run `index_project` again
6. **The file watcher (chokidar) only runs while the MCP server is alive** — if you kill the server (e.g., to move files), the watcher dies and won't come back on next spawn. You'll need to reindex to reactivate it.

## CLI Fallback When MCP Server Unreachable

If `mcp_omnicode_*` tools return "MCP server 'omnicode' is not connected" (e.g., during a session after a config change before Hermes restart), the underlying `dist/cli.js` is fully functional and works without the MCP wrapper:

```bash
cd /path/to/omnicode-mcp
node dist/cli.js status                    # repo health, completeness, blindspots, sleeping symbols
node dist/cli.js index <repo> --max-files 300      # index from CLI (pass repo path explicitly)
node dist/cli.js context <file> <repo> --max-tokens 4000   # file + direct deps under a token budget
node dist/cli.js token-stats <repo>        # live token savings + output budget
node dist/cli.js resume <repo>             # compact session_resume_brief
node dist/cli.js doctor                    # install health, native deps, dist build, git
node dist/cli.js blindspots <repo>         # parser blindspots by class
node dist/cli.js resolve-all <repo>        # zero-unknown-files pass
node dist/cli.js benchmark <repo> --out results.json   # byte-exact bench, writes BENCHMARK.md
```

**What the CLI does NOT have** (despite the README/MCP tool list implying otherwise):

- `search_symbols` — MCP only. For symbol search via CLI, use `grep -rn` or read the indexed file via `context`.
- `spaghetti_report`, `repo_map`, `route_map`, `test_map`, `config_map`, `dependency_map`, `blast_radius`, `dead_code_scan`, `blindspot_report`, `get_context_bundle`, `get_hotspots`, `get_call_hierarchy`, `get_churn_rate`, `find_references`, `check_rename_safe`, `check_delete_safe`, `plan_turn` — all MCP-only.
- `file_outline`, `get_file_slice`, `get_symbol` — MCP-only.

If a tool you want is MCP-only and the MCP server is down, the right move is `hermes mcp restart omnicode` (or restart Hermes) — don't bash the CLI trying to find it. The CLI is the **read-side + index-side** subset: status, index, context, token-stats, resume, doctor, blindspots, resolve-all, benchmark, plus the bench-many/sweep/clone-index batch operations.

### CLI `context` is path- and index-sensitive

`node dist/cli.js context <file> <repo> --max-tokens N` will return `File '<file>' not found in index` if:

- The file was never indexed (run `index <repo> --max-files 400` first), or
- The `<file>` path doesn't match the indexed path exactly (e.g., `bin/purpclaw.js` vs the indexed relative path under the repo root). The CLI expects the path **as it appears in the index**, typically a repo-relative path. If unsure, `node dist/cli.js status <repo>` shows the index path, and a quick `search_files` for the file name tells you how it was registered.

## Workflow Patterns

### Dogfooding (running OmniCode on itself)

For first-repo onboarding or sanity-checking a fresh build:

1. `index_project` (path, max_files 200-400) — gate everything else
2. `plan_turn` with intent=`audit` — auto-routes to health checks
3. Parallel: `spaghetti_report`, `dead_code_scan`, `get_hotspots`, `token_savings_stats`
4. For deep dives: `blast_radius` on top hotspots, `write_repair_handoff` for the refactor brief

Dogfooding typically reveals: god objects (44+ dependents on db.ts, 28+ on embeddings.ts), cyclic groups, long files (cli.ts ~1083 lines, server.ts ~974), and 100+ dead symbols on a fresh tree. The tool that audits spaghetti is itself C-grade — that's the headline finding.

### Bench-many on large repos

For repos >10K files, see `references/bench-timeout.md`. Default 15 min cap will fire; bump to 30+ via `--repo-timeout-ms` at the call site, no code edit needed.

## Pitfalls

### Verify self-reported files before acting on them

User-supplied status reports sometimes claim files were written that aren't on disk. After any user message containing "wrote X", "generated Y", "shipped Z", or "Done":

1. `ls` or `search_files` to confirm existence
2. If absent, write the file from the content in the message (most common case: pasted markdown that was never committed)
3. Flag the discrepancy — the byte-exact trust story cannot survive unverified "done" claims

This is a recurring pattern. Treat the user-message + on-disk-reality as two separate sources of truth; trust neither alone.

### Huge codebases: don't delegate broad audits to subagents, look for a canonical status report first

On a 2,000+ file, 18M+ raw-token repo, spawning subagents with a "audit this whole codebase against N features" goal will time out at the 600s cap with no deliverable. Observed in the wild: three parallel subagents, 28-43 API calls each, zero reports written, 10 minutes burned.

**The fast path for big-system audit work:**

1. **Read the canonical project-context file first.** Most big systems have one. Common names: `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `docs/SYSTEM_OVERVIEW.md`, `docs/CANONICAL_OVERVIEW.md`. Read it via `node dist/cli.js context <file> <repo> --max-tokens 6000` so the architecture lands in one token-budgeted read.
2. **Look for an existing gap/parity report.** Many systems maintain a self-audit file (e.g. `lib/feature-parity.js` in PURPCLAW, `service_registry.js` + a status file in similar projects). Run it. The output is the gap list as the project's own authors wrote it — no guessing, no drift.
3. **Only after the canonical report is in hand**, dispatch subagents for **focused, scoped** work (one feature, one file, one parity check) with a tight output schema. The subagent's job is to fill in a specific cell, not to find the cells.
4. If a subagent's task would touch >100 files or run >50 tool calls, it's wrong — scope it down or do it yourself with `context`.

The general rule: **the project's own status file is a higher-signal starting point than any LLM audit.** The project authors have already done the work of mapping "feature → check → file path". Reuse it.

### The repair handoff can be BLOCKED

`write_repair_handoff` may return `BLOCK REPAIR HANDOFF` with high blindspot rate. This is a feature, not a failure — the tool refuses to plan patches when parser coverage is too weak (typically >35% blindspot rate or unresolved relative imports). Re-index with better manifest/resolver coverage, then retry. The block protects users from acting on partial graph data.

### Diagnostic restraint when user is moving files

When a user says "I'm trying to move this folder, something is locking it":

1. Kill the obvious suspect (MCP server, watcher) — they explicitly asked
2. If the move still fails, ASK once before running multi-layer diagnostics
3. Do NOT run `Rename-Item`, `Move-Item`, or file-enumeration probes in user paths without confirming first — these can accidentally move or modify files
4. PowerShell file ops are NOT safe diagnostic tools

Frustration signals ("relax", "bruh", "???", short terse messages) mean STOP and acknowledge, not "go deeper." The user knows their system; trust that they may have already moved things, re-ran the move, or fixed it themselves.

## Files (paths updated June 2026 — the old `omnicode-mcp/omnicode-mcp/` location is empty)

- **Server**: `E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/dist/server.js`
- **CLI fallback** (when MCP isn't connected): `E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/dist/cli.js`
- **Wrapper**: `E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/run_omnicode.cmd` (at platform root, NOT inside the omnicode-mcp subdir)
- **Source**: `E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/src/`
- **Hermes config**: `~/.hermes/config.yaml` → `mcp_servers.omnicode` (the `.claude.json` path is the older CLI-session location; the Hermes session reads `config.yaml`)
- **OCAP module**: `omnicode-mcp/src/engine/ocap.ts` (single shared module, used by 4 tools)
- **Kill script**: `scripts/kill-omnicode-mcp.sh` (see Workflow Pitfalls)

## When the MCP server isn't connected — use the CLI directly

In many sessions (and in CI / scripted runs), the `mcp__omnicode__*` tools
are not in your function list even though `hermes mcp list` shows the
server as `enabled`. The CLI is the working fallback. Pattern:

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp"
node dist/cli.js <command> [args...]
```

The CLI is a strict subset of the MCP surface (16 of 38 tools), so for
`symbol search`, `spaghetti_report`, `repo_map`, `get_context_bundle`,
`plan_turn`, `blast_radius` etc., you need either an MCP-connected
session or you can fall back to a 1-line shell out: `git grep`, `find`,
or `read_file` of the specific file. The CLI covers:

- `context <file> <repo> --max-tokens N` — read a file with OCAP token-budget (the workhorse)
- `status <repo>` — repo health, index freshness, top sleeping symbols
- `index <repo> [--max-files N]` — build the index
- `token-stats <repo>` — live token savings
- `blindspots <repo>` — unresolved references
- `doctor` — install health

For the workhorse `context` call specifically, this is the only command
that matters for day-to-day work: it returns a file plus direct deps
under a token budget, which is what you want instead of a raw `read_file`
of a 1000-line module. `~/.hermes/config.yaml` → `mcp_servers.omnicode` (the `.claude.json` path is the older CLI-session location; the Hermes session reads `config.yaml`)
- **OCAP module**: `omnicode-mcp/src/engine/ocap.ts` (single shared module, used by 4 tools)
- **Kill script**: `scripts/kill-omnicode-mcp.sh` (see Workflow Pitfalls)

## When the MCP server isn't connected — use the CLI directly

In many sessions (and in CI / scripted runs), the `mcp__omnicode__*` tools
are not in your function list even though `hermes mcp list` shows the
server as `enabled`. The CLI is the working fallback. Pattern:

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp"
node dist/cli.js <command> [args...]
```

The CLI is a strict subset of the MCP surface (16 of 38 tools), so for
`symbol search`, `spaghetti_report`, `repo_map`, `get_context_bundle`,
`plan_turn`, `blast_radius` etc., you need either an MCP-connected
session or you can fall back to a 1-line shell out: `git grep`, `find`,
or `read_file` of the specific file. The CLI covers:

- `context <file> <repo> --max-tokens N` — read a file with OCAP token-budget (the workhorse)
- `status <repo>` — repo health, index freshness, top sleeping symbols
- `index <repo> [--max-files N]` — build the index
- `token-stats <repo>` — live token savings
- `blindspots <repo>` — unresolved references
- `doctor` — install health

For the workhorse `context` call specifically, this is the only command
that matters for day-to-day work: it returns a file plus direct deps
under a token budget, which is what you want instead of a raw `read_file`
of a 1000-line module.

**Note on old paths in this skill:** The `E:\god folder\02_ACTIVE_PROJECTS\omnicode-mcp\omnicode-mcp\` path and the `C:\Users\Admin\Downloads\omnicode_review\omnicode-mcp\` path both refer to a *previous* location (a Downloads-side review copy that was promoted into the platform). The current source of truth is the `omnicode-platform` tree. If you see an old path referenced in any sub-section below, prefer the platform-rooted path.

## Workflow Pitfalls

### Kill the MCP before moving files in a watched repo

If the user says "kill the mcp" or "moving files" or "files are locked," the OmniCode server (and its chokidar file watcher) holds handles on the indexed tree. Use the static script `scripts/kill-omnicode-mcp.sh` for a one-liner that does find + kill + verify.

The script uses PowerShell `Get-CimInstance` to find node processes whose command line matches `*omnicode*`, `*dist/server.js*`, or `*dist/cli.js bench*` (the latter catches active bench-many / sweep children), then `taskkill //F //PID <pid>` on each. Idempotent — safe to run when nothing is running.

**Important nuances:**
- The file watcher (chokidar) runs **inside** the `node dist/server.js` process. Killing the server kills the watcher. No separate process to find.
- Active bench-many children are separate processes spawned by the CLI, not the MCP server. The script catches them too.
- The MCP **auto-respawns on the next tool call** (Hermes spawns stdio children on demand). So killing is non-destructive.
- The file watcher does **not** auto-respawn. After re-loading, the user must re-index (`index_project`) to reactivate change detection.

### PowerShell > wmic on this host

`wmic` is gone from this Windows install (Windows 10/11 deprecates it). For any task that needs process command lines (finding MCP servers, finding tools by name), use:

```bash
powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine"
```

For grep by substring:
```bash
powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object {\$_.CommandLine -like '*pattern*'} | Select-Object ProcessId,CommandLine"
```

Output is `ProcessId : <num>` / `CommandLine : ...` blocks. Pipe to `head` for top-N.

## Pitfalls & Lessons (Session-Tested)

### Workspace writes go to E drive, not C drive

Ted's C drive lives at 99% full (~3-23 GB free swings, 232 GB total). Workspace artifacts (`.txt` scratch notes, `.md` summaries, throwaway commits, etc.) must NEVER be written to C:\Users\Admin\Desktop or any C drive path. All scratch output goes to E:\god folder\02_ACTIVE_PROJECTS\<project>\_scratch\ or the project's own dir. Ted has been burned multiple times by this — "u gotta use e drive for ur workspaceand any work u do i cant afford the space on c drive." Cleanup script for the cache bloat (omni test dirs, uv cache, huggingface, npm/pnpm) lives in `scripts/clean-omnicode-test-cache.ps1` and is a separate concern from agent workspace writes.

**Pre-flight before any large write:**
- Target E drive when possible (1.8 TB free)
- If a write to C drive is unavoidable, check free space first: `powershell -Command "(Get-Volume C).SizeRemaining/1GB"`
- Never write more than 100 MB to C drive without explicit user consent

### Bench-child timeout is 15min by default

`bench-many` spawns one isolated child per repo, each hard-capped at `15 * 60 * 1000` ms via `--repo-timeout-ms`. Anything larger gets SIGKILLed and logged as `benchmark child timed out after 900000ms`.

- `bench-many` accepts `--repo-timeout-ms <n>` (default 900000) — bump for big repos
- `benchmark` (single repo) does NOT accept `--repo-timeout-ms` — only bench-many does
- To re-run one big repo solo: create a one-line list file, run `bench-many` with the bumped flag
- Real failure: 17K-file repo (GOTHAM_3077) blew past 15min; bumped to 30min (`--repo-timeout-ms 1800000`) and it ALSO failed. The 17K workload exceeds any single 30min bench-child window. To get a real number, either bump further (1h+), cap `--max-files` to ~10K for a sampled honest result, or accept GOTHAM as out-of-scope for the matrix.

### write_repair_handoff can BLOCK the verdict

`write_repair_handoff` does not just write a handoff — it scores the repo first. If blindspot rate is too high (saw 37% trigger BLOCK), it refuses to produce actionable patch plans:

### PurpClaw .purpclaw/mcp.json config pattern

When wiring OmniCode as a default MCP server for PurpClaw's CLI, the config lives at `.purpclaw/mcp.json` (project root) or `~/.config/purpclaw/mcp.json`:

```json
{
  "servers": {
    "omnicode": {
      "command": "node",
      "args": ["E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/dist/server.js"],
      "env": {
        "OMNICODE_ROLE": "agent",
        "OMNICODE_USER": "purpclaw",
        "OMNICODE_TOOL_MODE": "full"
      }
    }
  }
}
```

**CRITICAL: `OMNICODE_TOOL_MODE=full` is required.** The default mode is `"compressed"` which only exposes SkillVault tools (8 tools). Set to `"full"` to expose all 42 code-analysis tools. Without this, `search_symbols`, `get_file_slice`, `dependency_map`, `blast_radius`, etc. won't appear in the agent's tool list.

On `purpclaw ask`, the MCP client auto-loads from `.purpclaw/mcp.json` and registers all tools as `mcp__omnicode__<tool>` in the tool registry. The agent sees them alongside built-in tools.

**Pitfall: `better-sqlite3` Node version mismatch.** If you see `NODE_MODULE_VERSION` errors when the MCP server starts (e.g. `was compiled against NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 137`), the native module needs rebuilding:
```bash
cd E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform
npm rebuild better-sqlite3
```

**Pitfall: forward-slash vs backslash in SQLite LIKE.** The OmniCode database stores file paths with backslashes (e.g., `E:\\god folder\\...\\lib\\agent-loop.js`), but the `get_file_slice` tool searches with `WHERE path LIKE '%lib/agent-loop.js'` using forward slashes. SQLite treats `\` and `/` as different characters, so LIKE patterns with forward slashes won't match backslash paths. As a workaround: use just the filename (`%agent-loop.js`) when calling `get_file_slice`, or query the database directly with backslash patterns.

**Index location:** Database files are stored at `~/.omnicode/<sha256-hash-of-repo-path>.db`. The hash is a SHA-256 of the resolved absolute path, first 12 hex chars. To find the DB for a given repo:
```js
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update(path.resolve(repoPath)).digest('hex').substring(0, 12);
const dbPath = path.join(os.homedir(), '.omnicode', `${hash}.db`);
```
> Reason: parser quality or blindspot rate is too weak for actionable patch planning.
> Next proof needed: improve manifest/resolver coverage and re-index.

This is a feature, not a bug. To unblock: fix unresolved relative imports, add tsconfig path aliases, re-index, then retry. The handoff is always written (with the BLOCK verdict) — the file is at `.omnicode/NO_SPAGHETT_REPAIR_HANDOFF.md`.

### Re-index is cheap — file watcher is active

After the first `index_project`, the file watcher stays on. Re-running `index_project` on the same path is incremental (only new/changed files). Use it freely after editing source.

### VERIFY self-reports before trusting

A pasted "status report" (from a subagent, codex, devfleet, or another session) may claim files exist that don't. Always `ls` or `terminal` check before acting on the claim. Pattern that bit us in the wild:

- Report claimed `CHANGELOG.md`, `CODEX_HANDOFF.md`, `PARITY_MATRIX.md` updated → `ls` showed all three missing
- Same report claimed `models/all-MiniLM-L6-v2/model.onnx` (90MB) downloaded → that part was real
- Same report claimed `search_symbols` returned a `semantic` channel → verifiable via a real query, was real

Rule: every "Done" or "completed" claim gets verified at the file level before the next move relies on it. Same principle as the agent-internal "subagent summaries are self-reports" rule, but applied to user-pasted status blocks too.

### Dogfooding target (run Omni on Omni)

The canonical "run Omni on Omni" target is the MCP server's own source tree:

  `E:\god folder\02_ACTIVE_PROJECTS\omnicode-platform\omnicode-mcp\`

Self-audit on this path is a known-shape result:
  - Health 64/100 (grade C — "knotted")
  - 1 massive cyclic group routed through `tools/test_map.ts`
  - 2 god objects: `src/store/db.ts` (44 modules depend), `src/engine/embeddings.ts` (28 modules)
  - 4 long files: `cli.ts` (1083), `server.ts` (974), `tools/index_project.ts` (501), `engine/pagerank.ts` (590)
  - ~69% token reduction on the self-bench (153k raw → 47k indexed)
  - Blast radius on `db.ts:resolve` is 55 dependents; on `db.ts:initDb` is 33

If the self-audit looks drastically different from this on a fresh run, something real changed — investigate before trusting either number.

## v0.2 release patterns

The shape of a v0.2 cut on this server, learned the hard way shipping it. Reuse this template for v0.3 if you ever do another bump.

### Audit trail hardening recipe

Every tool execution should leave a SHA-256 fingerprint of its arguments plus the gateway caller. Pattern: extend the `audit` table via guarded `ALTER TABLE` migrations, then enrich `logAudit()` to take an `AuditFields` object.

```ts
// db.ts (in initDb, after existing migrations)
try { db.exec(`ALTER TABLE audit ADD COLUMN args_hash TEXT`) } catch { /* exists */ }
try { db.exec(`ALTER TABLE audit ADD COLUMN caller TEXT`) } catch { /* exists */ }
try { db.exec(`ALTER TABLE audit ADD COLUMN repo TEXT`) } catch { /* exists */ }

// security/audit.ts
export interface AuditFields { argsHash?: string; caller?: string; repo?: string; }
export function logAudit(
  repoPath: string | undefined, user: string, role: string,
  tool: string, outcome: string, detail: string,
  extra: AuditFields = {}
) { /* write all 9 columns */ }

export function hashAuditArgs(toolInput: unknown): string {
  const json = JSON.stringify(toolInput ?? {}, Object.keys(toolInput as object || {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

// server.ts (in the gateway branch)
if (toolName === 'invoke_tool') {
  return await executeToolWithSecurity(
    targetName, args.tool_input || {}, request, role, user,
    { caller: 'invoke_tool', repo: (args.tool_input as any)?.path }
  );
}
```

The `caller: 'invoke_tool'` flag on inner tool rows is the killer feature — diff the audit table by `args_hash` to spot anomalous agent behavior and to know which outer call triggered each row.

### Web page pattern (gh-pages from /docs)

Self-contained single-file HTML with embedded CSS, no build step, no external deps. GitHub Pages serves from `docs/index.html` directly. Pattern:

1. Write `docs/index.html` with hero, stats, tool grid, install command, footer. Dark theme. ~20KB.
2. Mirror at `web/index.html` if the project also wants a `/web` URL.
3. README links to `https://<owner>.github.io/<repo>/`.
4. Enable GitHub Pages in repo settings → Pages → Source: `main` / `/docs`. (User does this in the web UI; cannot be done via `gh` CLI without auth.)

The web page is the public face of the project. Keep it self-contained so it survives any future build-pipeline rot. If you need a build, you can have a build, but the source of truth should always be one file with no dependencies.

### Git push when the remote has its own stale main

Common situation: the GitHub repo exists with a 2-file stub commit (LICENSE + placeholder README). Your local has the real work. Don't `git push --force` — pull the remote, resolve the README conflict by keeping your version, then push.

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git fetch origin
# Inspect: git ls-tree -r --name-only origin/main
# (often 2 files, LICENSE + 3-line README)
git pull --no-rebase --allow-unrelated-histories origin main
# CONFLICT (add/add) in README.md
git checkout --ours README.md
git add README.md LICENSE
git commit -F /tmp/merge-msg.txt   # or -m with single quotes
git push -u origin main
```

`--allow-unrelated-histories` is required when local and remote have no common ancestor (typical cold-start repo). Use `--no-rebase` (the default) so the merge commit preserves both histories — safer for first push.

### When the omnicode-mcp dir lives inside a parent monorepo

The omnicode-mcp source dir at `E:\god folder\02_ACTIVE_PROJECTS\omnicode-platform\omnicode-mcp\` lives inside the `omnicode-platform` parent (which itself contains the Next.js app, web/, dist/, etc.). The omnicode subdir has no `.git/` of its own — `git status` from inside walks up to `E:\god folder\02_ACTIVE_PROJECTS\.git\` (or higher). To ship omnicode as a standalone repo:

1. `cd E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp`
2. `git init -b main`
3. Write a `.gitignore` that excludes `node_modules/`, `dist/`, `.omnicode/`, `*.db`, `audit.fallback.log`, `models/`
4. `git add -A && git commit -m "v0.2: ..."`
5. Add the remote (often the URL differs from what you'd guess — `omnicode` not `omnicode-mcp`), fetch, merge as above
6. `git push -u origin main`

The parent monorepo's `.git/` is untouched. Only the omnicode subdir gets its own history. This is the standard "extract a project to its own repo" pattern.
