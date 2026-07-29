# P0-B Builder Brief: Close Execution-Policy Bypasses

## COMPONENT
P0-B — Close HTTP/MCP tool permission bypasses and force all execution through ToolRuntime.

---

## P0-A STATUS
Verified PASS. Commit fd5af98 fixed all DatabaseSync imports. Session create/persist/restart/resume works end-to-end.

---

## ORIGINAL CAMPAIGN GOAL
"Every surface shares one agent loop, tool registry, provider layer, session store, permission engine, skills, hooks, memory and configuration."

---

## P0-B FINDINGS (verified by reading)

### Architecture as-built

`lib/tool-runtime.js` (114 lines) — correct canonical implementation:
- PERMISSIONS.evaluate() → permission profile (deny/allow/ask)
- GOVERNANCE.checkWorkflow() → approval queue
- PATH_SECURITY.check() → S1 path guard (always-on, blocks .ssh/.aws/.gnupg/system dirs)
- Input/output guardrails, schema validation, checkpoints for mutations
- approvalCache per session

`lib/mcp-server.js` (346 lines) — P0-B ALREADY FIXED:
- Line 36: `const TOOL_RUNTIME = new ToolRuntime({ permissionProfile: 'standard' })`
- Line 245: `const result = await TOOL_RUNTIME.invoke(canonicalName, args, { permissionProfile: SESSION_PROFILE, operatorInitiated: true })`
- Direct shell exec (bash/execSync) removed at line 34: "handleBuiltinTool (raw execSync/readFileSync) is deleted"

**MCP server path: VERIFIED SECURE.**

### The actual bypass: `unified_api.js executeTool`

`executeTool` (line 1102):
1. Try `runTool` first — if it returns "Unknown tool" → fall through to ToolRuntime
2. ToolRuntime is only a fallback, not the primary gate

`runTool` (line 1147–2505) has 74 hardcoded `case` blocks. ALL execute via raw PowerShell/execAsync with zero permission evaluation:

**HIGH RISK** (raw shell injection possible):
- `execute_command` (1920): `execAsync(args.command, { shell: 'powershell.exe' })` — user-supplied command string passed directly to shell. Has a regex blocklist but no permission gate.
- `git_command` (1906): `cmd('git ' + args.command)` — user-supplied git args. Has a blocklist but no permission gate.
- `open_application` (1925): `trackedSpawn(app, [])` — arbitrary app name.

**MEDIUM RISK** (raw file mutation, no approval queue):
- `file_write` (1659): `fs.writeFileSync(args.path, args.content)` — system path blocklist only.
- `file_delete` (2196): `ps('Remove-Item ...')` — system path blocklist only.
- `file_copy` (2171): `robocopy` or `Copy-Item` — no permission gate.
- `file_move` (2183): `robocopy /MOV` + `fs.rmSync` — no permission gate.
- `install_package` (2289): `execAsync('pip install ...')` — arbitrary package install.

**LOW RISK** (UI-only tools, no file/system access):
- `screen_capture`, `screen_ocr`, `mouse_click`, `window_list`, `ui_list_elements`, `browser_*`, `webcam_*`, `process_list`, `volume_control`, `clipboard`, `notification`, `task_schedule`, `get_weather`, `search_knowledge`, `search_memory`, `memory`, `dir_create`, `download_file`, `disk_info`, `network_info`, `system_status`, `system_paths`, `active_window`, `window_focus`, `window_close`, `purpclaw_*`.

---

## DEFINITION OF DONE

| Criterion | Status |
|---|---|
| MCP server: no raw execSync/bash — verified | ✓ DONE |
| `execute_command` goes through ToolRuntime permission gate | REQUIRED |
| `git_command` goes through ToolRuntime permission gate | REQUIRED |
| `file_write` goes through ToolRuntime + checkpoint | REQUIRED |
| `file_delete` goes through ToolRuntime + checkpoint | REQUIRED |
| `file_copy`, `file_move` go through ToolRuntime | REQUIRED |
| `install_package` goes through ToolRuntime | REQUIRED |
| Remaining UI-only cases (screen/mouse/browser) — keep runTool | ACCEPTABLE |
| P0-C: Settings UI → `resolveConfig()` env mapping | REQUIRED |

---

## FIX STRATEGY

### Step 1: Flip the dispatch order in `executeTool`

**Before (line 1120–1135):**
```
runTool first → fallback to ToolRuntime
```

**After:**
```
ToolRuntime first → fall back to runTool for known UI-only cases
```

This makes ToolRuntime the primary gate. `runTool` becomes the fallback for UI-only cases that don't need governance.

### Step 2: Define UI-only bypass set

Tools in this set are safe to execute directly (read screen, move mouse, list windows — no file/network/system mutation). They still go through `runTool` without a ToolRuntime round-trip, but AFTER ToolRuntime is tried first for permission-checked tools.

### Step 3: High-risk tools always through ToolRuntime

`execute_command`, `git_command`, `file_write`, `file_delete`, `file_copy`, `file_move`, `install_package`, `open_application` — force through `TOOL_RUNTIME.invoke()` with appropriate context.

### Step 4: P0-C wiring

Settings UI → `provider-config.json` → consumed by `resolveLane()`. Need to make `resolveConfig()` in `lib/llm-provider.js` read from the same config file. OR: make `lib/runtime/provider-router.js:resolveLane()` the single canonical resolver and update all agent loop callers to use it.

---

## FIRST STEP
Fix `executeTool` (unified_api.js:1102) to call ToolRuntime FIRST, then fall through to `runTool` only for UI-only cases. Add the SANCTIONED_BYPASS set. Commit the P0-B findings doc and the fix.
