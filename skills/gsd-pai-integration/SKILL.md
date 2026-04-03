---
name: gsd-pai-integration
description: "GSD + PAI + jCodeMunch integration for Hermes — spec-driven dev workflow, personal AI infra, code indexing"
version: 1.0.0
author: Eddie
platforms: [windows]
metadata:
  hermes:
    tags: [stack, integration, GSD, PAI, jCodeMunch]
---

# GSD + PAI + jCodeMunch Integration

Eddie runs a stacked AI infra: Hermes (root agent) + Codex/Lunokios + OpenClaw + GSD + PAI + custom bots.

## Repos Cloned

### GSD — `~/AppData/Local/hermes/GSD/`
- **Source:** `https://github.com/gsd-build/get-shit-done`
- **Stars:** 62k
- **Purpose:** Spec-driven dev workflow, 67 commands, 33 agents, hooks system
- **Key dirs:**
  - `commands/gsd/` — 67 workflow commands
  - `agents/` — 33 agent definitions
  - `hooks/` — pre-tool-use guards (workflow-guard, read-guard, statusline, etc.)
  - `docs/agents/` — agent reference, triage labels
  - `get-shit-done/` — the core npm package

### PAI — `~/AppData/Local/hermes/PAI/`
- **Source:** `https://github.com/danielmiessler/Personal_AI_Infrastructure`
- **Stars:** 13.6k
- **Purpose:** Human augmentation, agentic AI infra with 54 Packs, Agents, Tools
- **Key dirs:**
  - `Packs/` — 54 packs (Art, Knowledge, Browser, Delegation, Evals, etc.)
  - `Agents/` — agent definitions
  - `Tools/` — utility tools (BackupRestore, etc.)
  - `PLATFORM.md` — compatibility matrix

### jCodeMunch — `~/AppData/Local/hermes/jCodeMunch/`
- **Source:** `https://github.com/jgravelle/jcodemunch-mcp`
- **Purpose:** Tree-sitter AST code indexing — 95%+ token savings on code exploration
- **MCP server:** `uvx jcodemunch-mcp` (v1.108.8)
- **Tools:** search_symbols, get_symbol_source, find_references, get_file_outline, etc.
- **AGENTS.md loaded** — code exploration policy instructs to always use jCodeMunch tools

## Config Added

```yaml
mcp_servers:
  jcodemunch:
    command: uvx
    args: ["jcodemunch-mcp"]
    timeout: 120
    connect_timeout: 60
```

In `~/AppData/Local/hermes/config.yaml` after `toolsets:` line.

## Active Repos Summary

| Repo | Path | Purpose |
|------|------|---------|
| GSD | ~/AppData/Local/hermes/GSD/ | Spec-driven workflow, 67 commands, 33 agents |
| PAI | ~/AppData/Local/hermes/PAI/ | Personal AI infra, 54 packs |
| jCodeMunch | ~/AppData/Local/hermes/jCodeMunch/ | Code indexing, token efficiency |

## Next Steps

- [ ] Verify jCodeMunch MCP connects on next Hermes restart
- [ ] Move PAI/Agents to Hermes skills dir for discoverability
- [ ] Wire GSD hooks into Hermes agent workflow
- [ ] Test jcodemunch tools on a real codebase