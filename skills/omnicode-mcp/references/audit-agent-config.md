# audit_agent_config — Finding taxonomy + false-positive debugging

Side-by-side docs for the `audit_agent_config` tool. Use this when adding new finding categories, debugging high false-positive rates, or explaining the tool to a user who's never run it.

## Finding categories — full taxonomy

### STALE_PATH
- **What:** File path appears in a config or policy file but `fs.existsSync` returns false.
- **Severity:**
  - `high` — if path is a launcher referenced from `mcpServers` and the wrapper script is gone
  - `medium` — if path starts with `HOME` (user-configured, very likely intentional)
  - `low` — anything else
- **Skip rules:** path contains `${` / `{{` / `<` / `*` (template/glob), or starts with `http` / `/github.com` (URL, not a file)
- **Why it matters:** The agent builds a mental model of what files exist. Stale refs train it to expect dead paths and burn retries.

### PHANTOM_TOOL
- **What:** Snake-case or PascalCase identifier appears in a policy file but is not in the known registry.
- **Severity:** `low` (always — these are policy hints, not broken configs)
- **Skip rules:** length < 6, common JS/Python keywords (`true`, `function`, `import`, etc.)
- **Why it matters:** Renamed/removed tools leave policy files that train the agent to call non-existent tools.

### RAW_READ_ANTI_PATTERN
- **Patterns flagged:**
  - `\b(cat|head|tail|less|more)\s+[^\n]{0,80}\.(ts|js|py|tsx|jsx|go|rs|java|kt)\b`
  - `\balways\s+read\s+the\s+entire\s+file\b` → severity HIGH
  - `\b(read|cat)\s+every\s+file\b` → severity HIGH
- **Severity:** medium (or high if the pattern says "always" / "every")
- **Fix shape:** Replace with `get_file_slice` (bounded line range) or `file_outline` (one-symbol-at-a-time).

### GREP_OVER_RETRIEVAL
- **Pattern:** `\buse\s+(grep|ripgrep)\s+to\s+search\s+code\b`
- **Severity:** medium
- **Fix shape:** Use `search_symbols` (OCAP, ranked retrieval, path interning).

### TOKEN_WASTE
- **Threshold:** any policy file > 4,000 bytes
- **Severity:** medium (4K–8K), high (>8K)
- **Fix shape:** Trim to the rules the agent actually needs. Move long examples to a `references/` file.

### MISSING_POLICY
- **What:** `mcpServers` section exists in a JSON config, but no `CLAUDE.md` / `AGENTS.md` found in:
  - the config's parent directory
  - `~/.claude/CLAUDE.md` or `~/.claude/AGENTS.md`
- **Severity:** medium
- **Fix shape:** "Add a CLAUDE.md / AGENTS.md that tells the agent WHEN to call these MCPs."

### GLOBAL_MISSING_POLICY
- **What:** At least one JSON config found (so an MCP client IS installed), but zero policy files anywhere
- **Severity:** high (the agent is fully unbounded — no policy contract)
- **Fix shape:** "Create ~/.claude/CLAUDE.md (or project-level equivalent) with: (1) which MCP to prefer, (2) anti-patterns, (3) max token budget."

### INVALID_JSON / MCP_CONFIG_ERROR
- **What:** JSON parse error, or `mcpServers.<name>.command` is missing, or `cmd /c` launcher path doesn't exist
- **Severity:** high (silent failure — the MCP doesn't start)
- **Fix shape:** Validate JSON, add `command` + `args`, fix the launcher path.

## The 30→0 false-positive debugging trail (this is the key lesson)

The first run of `audit_agent_config` against Ted's machine produced **30 PHANTOM_TOOL findings**, all in `~/.codex/config.toml`. Every single one was a TOML config key (`model_reasoning_effort`, `trust_level`, `use_memories`, etc.) being mistaken for a tool name.

The original `extractToolMentions` regex matched any backtick-wrapped or snake_case identifier in any text-like file. The problem: TOML config files use snake_case keys everywhere, and the tool should only flag identifiers in **policy** files (markdown/text), not in **config** files (JSON/TOML).

**Fix (in 3 steps):**
1. **Split the file-kind gates.** Phantom detection now runs only for `markdown` / `text`; TOML gets its own branch that only checks for stale paths.
2. **Filter URLs and package paths.** `p.startsWith('http')` and `p.startsWith('/github.com')` skip the URL paths in `config.toml` (e.g. the jcodemunch wheel URL).
3. **Add the full tool registry.** The original `KNOWN_TOOL_NAMES` had only 9 omnicode tools. After loading the full `TOOL_DEFINITIONS` from `tool_registry.ts` and adding bare-name variants (the omnicode tools WITHOUT the `omnicode__` prefix), all legitimate mentions resolve.

**Result:** 6 real findings, 0 false positives.

**Generalized principle:** Config files use keys; policy files use mentions. Never run the same extraction on both — they have different semantics and different false-positive shapes.

## When `audit_agent_config` is NOT the right tool

- **First-time setup of a new client** — use `omni init` (it does the cold-start wiring AND writes a policy file in one step)
- **Auditing indexed source code** — use `blindspot_report`, `spaghetti_report`, or `dead_code_scan` instead
- **Diagnosing a single broken MCP** — read the Hermes MCP logs, run `hermes mcp test omnicode`, then check the wrapper script. `audit_agent_config` won't fix a working config that's broken for environmental reasons.

## Workflow

```bash
# Quick sweep of all known client configs
mcp__omnicode__audit_agent_config

# Audit a single project-level file
mcp__omnicode__audit_agent_config { target: "./CLAUDE.md" }
```

Output is a human-readable punch list, sorted by severity. No OCAP — this tool's output is meant to be read by a human or pasted into a GitHub issue, not consumed by an LLM in a loop.
