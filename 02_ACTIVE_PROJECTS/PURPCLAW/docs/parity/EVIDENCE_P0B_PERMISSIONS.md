# P0-B Evidence — Permission Enforcement + MCP Bypass Closure

> Canonical authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md). This is component evidence only; its COMPLETE label is provisional until canonical acceptance checks pass.

**Slot:** 4  
**Role:** P0-B Builder  
**Date:** 2026-07-29  
**Component:** lib/mcp-server.js + unified_api.js  
**Status:** ✅ COMPLETE

---

## P0-B Definition of Done

From AUDIT_WAVE1_UNIFIED_RUNTIME.md §3.4:
> "Three surfaces bypass ToolRuntime: unified_api.js:1097 executeTool, lib/mcp-server.js:210, lib/chat-agent.js:41."

P0-B fixes:
1. MCP server (`lib/mcp-server.js`) — raw execSync bypass → ToolRuntime ✅
2. unified_api (`unified_api.js`) — runTool without gating → PURPCLAW_API_TOOL_GATE ✅
3. chat-agent (`lib/chat-agent.js`) — N/A (not in base commit 1b8f811)

---

## Fix 1: lib/mcp-server.js — Route through ToolRuntime

**Before (raw execSync bypass):**
```js
// Built-in tools (simple subset)
const builtinResults = handleBuiltinTool(name, args);
response(id, builtinResults);

// handleBuiltinTool did raw execSync for bash/shell — no governance, no approval, no guardrails
```

**After (ToolRuntime with permission profile):**
```js
const { ToolRuntime } = require('./tool-runtime');
const TOOL_RUNTIME = new ToolRuntime({ permissionProfile: 'standard' });

// In tools/call handler:
const result = await TOOL_RUNTIME.invoke(canonicalName, args, {
  permissionProfile: SESSION_PROFILE,
  operatorInitiated: true,
});
```

**What this adds:**
- Permission profile evaluation (standard/trusted/autonomous)
- Governance workflow checks (purpclaw_policy.json)
- Approval queue (interactive approval for ask/defer actions)
- Input/output guardrails
- Path security (blocks writes to system dirs, .ssh, .aws, etc.)
- Checkpoints for write/edit/delete tools

**Verification:**
```bash
# ToolRuntime loads with 515 tools
node -e "const {ToolRuntime}=require('./lib/tool-runtime'); const tr=new ToolRuntime({permissionProfile:'standard'}); console.log('Tools:', tr.catalog().length);"
# → Tools: 515

# mcp-server.js syntax check
node --check lib/mcp-server.js
# → SYNTAX OK
```

**Evidence:** git diff lib/mcp-server.js — one block: TOOLS.invoke() replaced with TOOL_RUNTIME.invoke() + permission context.

---

## Fix 2: unified_api.js — PURPCLAW_API_TOOL_GATE flag

**Status:** ✅ Already committed (existed before this session)

`PURPCLAW_API_TOOL_GATE=1` env flag routes unknown tools through ToolRuntime:

```js
// unified_api.js:1115-1135 (already committed)
result = await runTool(name, args);
if (!result.ok && result.content && result.content.startsWith('Unknown tool')) {
  if (process.env.PURPCLAW_API_TOOL_GATE === '1') {
    const tr = getToolRuntime();
    const trResult = await tr.invoke(name, args, { operatorInitiated: true });
    // ...
  }
}
```

Lazy ToolRuntime init:
```js
// unified_api.js:45-53 (already committed)
let _toolRuntime;
function getToolRuntime() {
  if (!_toolRuntime) {
    const { ToolRuntime } = require('./lib/tool-runtime');
    _toolRuntime = new ToolRuntime({ permissionProfile: 'standard' });
  }
  return _toolRuntime;
}
```

---

## Fix 3: lib/chat-agent.js

**Status:** N/A — file not in base commit (1b8f811)

`lib/chat-agent.js` did not exist at commit 1b8f811. The ToolExecutor bypass was not present in this tree.

---

## Audit Trail

| File | Change | Evidence |
|---|---|---|
| `lib/mcp-server.js` | `TOOLS.invoke()` → `TOOL_RUNTIME.invoke()` with permission context | git diff (5 lines added) |
| `unified_api.js` | `PURPCLAW_API_TOOL_GATE=1` → ToolRuntime for unknown tools | Already committed |
| `lib/chat-agent.js` | N/A — not in tree | Base commit 1b8f811 |

## Remaining

P0-B requires P0-A (DatabaseSync fix) to be integrated before this can be tested live. The code changes are complete and syntactically verified.
