# OmniCode MCP Server — Tool Reference

## Server Config
```json
{
  "servers": {
    "omnicode": {
      "command": "node",
      "args": ["path/to/omnicode-mcp/dist/server.js"],
      "env": {
        "OMNICODE_ROLE": "agent",
        "OMNICODE_TOOL_MODE": "full"
      }
    }
  }
}
```

## Required env vars
- `OMNICODE_TOOL_MODE=full` — without this only 8 public tools show (not 42)
- `OMNICODE_ROLE=agent` — enables mutation tools (index_project, etc.)
- `OMNICODE_USER=purpclaw` — identifies the client

## Index location
`~/.omnicode/<sha256-hash-first-12-chars>.db`  
Init function: `initDb(repoPath)` in `dist/store/db.js`  
Hash: first 12 chars of SHA-256 of normalized (lowercase) absolute repo path

## 42 tools by category

### SkillVault (8)
| tool | description |
|---|---|
| `skill_search` | search skill index for matching skills |
| `skill_load` | load full SKILL.md body by exact name |
| `skill_pack_for_task` | pick minimal diverse skill pack for a task |
| `health_check` | returns `{"status":"healthy","version":"0.1.0"}` |
| `list_tools` | list OmniCode tools as compact metadata |
| `get_tool_schema` | get full input schema for one tool |
| `invoke_tool` | invoke any tool by name + args |
| `session_resume_brief` | get context to resume a prior session |

### Code Analysis (15)
| tool | args | description |
|---|---|---|
| `index_project` | `{repoPath, force}` | index a repo (slow, use CLI instead) |
| `search_symbols` | `{path, query, max_results, format}` | BM25 search over symbols. format=text/ocap/auto |
| `get_symbol` | `{path, name}` | get symbol details |
| `get_file_slice` | `{path, file_path, start_line, end_line}` | read a file slice. **BUG:** path uses forward slash, DB uses backslash |
| `get_file_context` | `{path, file_path, line, radius}` | context around a line |
| `file_outline` | `{path, file_path}` | function/class outline |
| `repo_map` | `{path}` | high-level map of the repo |
| `route_map` | `{path}` | API route structure |
| `test_map` | `{path}` | test structure |
| `config_map` | `{path}` | config files |
| `dependency_map` | `{path}` | dependency graph |
| `blast_radius` | `{path, file_path}` | what breaks if this file changes |
| `dead_code_scan` | `{path}` | find potentially dead code |
| `blindspot_report` | `{path}` | unresolved references |
| `get_context_bundle` | `{path, file_path, depth}` | rich context for a file |

### Safety & Refactoring (5)
| tool | description |
|---|---|
| `check_rename_safe` | check if renaming a symbol is safe |
| `check_delete_safe` | check if deleting a symbol is safe |
| `find_references` | find all references to a symbol |
| `get_hotspots` | files with highest change frequency |
| `get_churn_rate` | code churn metrics per file |

### Repair (3)
| tool | description |
|---|---|
| `spaghetti_report` | detect tangled dependencies |
| `write_repair_handoff` | write a repair plan to file |
| `repair_plan` | generate plan to untangle code |

### Planning (3)
| tool | description |
|---|---|
| `plan_turn` | plan one turn of a refactoring session |
| `get_call_hierarchy` | call graph for a function |
| `resolve_all` | resolve all unknown file references |

### Runtime (4)
| tool | description |
|---|---|
| `get_session_stats` | session metrics |
| `token_savings_stats` | token savings from using index |
| `runtime_telemetry` | performance metrics |
| `benchmark` | run benchmark |

### Other (3)
| tool | description |
|---|---|
| `clone_and_index` | clone + index a remote repo |
| `language_support` | language detection config |
| `audit_agent_config` | audit agent configuration |

## Known issues
1. `search_symbols` loads ALL 12k+ symbols into memory for BM25 scoring — slow for large repos (30s+). Use `code-search` built-in tool for fast semantic search (~3.5s).
2. `get_file_slice` LIKE query uses forward slashes but DB has backslashes on Windows. `%agent-loop.js` works, `%lib/agent-loop.js` does not. Pass just the filename.
3. MCP SDK default request timeout (~60s) — large indexing operations need the CLI instead.
4. Node native module mismatch: `better-sqlite3` `.node` file is compiled against a specific NODE_MODULE_VERSION. If Node version changes, run `npm rebuild better-sqlite3` in the omnicode-mcp directory.