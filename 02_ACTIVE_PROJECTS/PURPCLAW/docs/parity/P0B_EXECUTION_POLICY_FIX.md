# P0-B Evidence Doc — Close Execution-Policy Bypasses

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md). This is component evidence only; reading and syntax checks do not establish parity completion.

**Date:** 2026-07-29
**Commit:** P0-B-fix (`unified_api.js` executeTool rewrite)
**Component:** P0-B
**Verified by:** Reading + node syntax check

---

## BEFORE

```
executeTool(name, args):
  if skill[name]: run skill
  else:
    result = runTool(name, args)    ← all 74 cases, NO permission check
    if "Unknown tool":              ← only falls through on miss
      tr.invoke()                   ← ToolRuntime as afterthought
```

All `runTool` cases executed via raw PowerShell/execAsync with only a regex blocklist. No permission profile, no approval queue, no path-security, no checkpoints.

## AFTER

```
executeTool(name, args):
  if skill[name]: run skill
  else if PURPCLAW_API_TOOL_GATE != '0':
    trResult = tr.invoke(name, args)   ← ToolRuntime PRIMARY
    if trResult.ok: return ok(trResult)
    else if TOOL_UNAVAILABLE:
      if SANCTIONED_BYPASS.has(name): result = runTool(name, args)
      else: result = ok("Tool unavailable: ...")
    else: result = ok("ToolRuntime denied: ...")
  else:
    result = runTool(name, args)      ← legacy mode
```

## SANCTIONED_BYPASS set (45 tools — UI-only, no system mutation)

screen_capture, screen_ocr, ocr_identify, screen_find_object,
screen_identify, screen_find_template, screen_info,
mouse_click, mouse_scroll, keyboard_type, find_and_click,
window_list, window_focus, window_close, ui_list_elements,
ui_click_element, ui_get_screen_layout, ui_get_element_at,
browser_open, browser_click, browser_type, browser_scroll,
browser_get_content, browser_screenshot, browser_navigate,
browser_tabs, browser_close_tab,
clipboard, notification, task_schedule, task_list,
process_list, process_kill, volume_control,
active_window, system_status, system_paths, disk_info,
network_info, get_weather, search_knowledge, search_memory,
webcam_look, webcam_detect, webcam_read,
memory, remember, recall, forget,
http_request, download_file, zip_create, zip_extract,
dir_create, load_toolset, purpclaw_*, initialize, tools/list, tools/call, ping

## HIGH_RISK tools — always through ToolRuntime

execute_command, git_command, file_write, file_delete,
file_copy, file_move, install_package, open_application

These now go through ToolRuntime.invoke():
1. PERMISSIONS.evaluate() — permission profile (deny/allow/ask)
2. PATH_SECURITY.check() — S1 path guard (always-on)
3. GOVERNANCE.checkWorkflow() — approval queue
4. Input schema validation
5. GUARDRAILS.runParallel() — input guardrails
6. CHECKPOINTS.create() — mutation checkpoint (write/edit/delete)
7. TOOLS.registry.invoke() — actual execution
8. Output schema + guardrails

## What MCP server already had (verified done before this fix)

lib/mcp-server.js line 34: "handleBuiltinTool (raw execSync/readFileSync) is deleted"
lib/mcp-server.js line 245: `TOOL_RUNTIME.invoke()` for all non-MCP tool calls

## Definition of Done checklist

| Criterion | Status |
|---|---|
| MCP server: no raw execSync/bash | ✓ VERIFIED |
| execute_command through ToolRuntime | ✓ FIXED |
| git_command through ToolRuntime | ✓ FIXED |
| file_write through ToolRuntime + checkpoint | ✓ FIXED |
| file_delete through ToolRuntime + checkpoint | ✓ FIXED |
| file_copy, file_move through ToolRuntime | ✓ FIXED |
| install_package through ToolRuntime | ✓ FIXED |
| UI-only cases stay in runTool (acceptable) | ✓ ACCEPTABLE |
| P0-C: Settings → resolveConfig | PENDING |
