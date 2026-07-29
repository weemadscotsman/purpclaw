# P0-B Builder Brief: Close Execution-Policy Bypasses

## COMPONENT
P0-B — Close execution-policy bypasses across all runtime surfaces.

---

## ORIGINAL CAMPAIGN GOAL
Make PURPCLAW's canonical runtime bootable, persistent, permission-governed and controlled by genuine provider settings. P0-A restored boot and persistence. P0-B closes the three remaining execution-policy bypasses that allow tools to run without going through ToolRuntime.

---

## CANONICAL REFERENCES
- `AGENT.md`
- `docs/parity/CANONICAL_PARITY_PRIORITY.md`
- `docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md`
- `docs/parity/WAVE1_CAMPAIGN_GOVERNANCE.md`
- `docs/parity/WAVE1_MASTER_GOAL.md`
- `.purpclaw/P0A_BUILDER_BRIEF.md`

---

## CURRENT VERIFIED FAILURES (from AUDIT_WAVE1_UNIFIED_RUNTIME.md)

### Failure 1 — `unified_api.js:1097` executeTool bypasses ToolRuntime
`executeTool` dispatches all 515 tools with no ToolRuntime. The path is:
`executeTool` (:1097) → `runTool` (:1151) → fallthrough `require('./lib/tools').invoke` — no permission profile, no approval, no path-security.

### Failure 2 — `lib/mcp-server.js:210` handleBuiltinTool raw execSync
`handleBuiltinTool` uses raw `execSync('bash ...')` for bash and `fs.writeFileSync` for write — no `lib/path-security.js`, no `lib/exec-policy.js`, no approval queue, no ToolRuntime at all.

### Failure 3 — `lib/chat-agent.js:53` double-executes tools
`chatWithTools` (:53) delegates to `runAgent` (:68) — but `runAgent` has already invoked the tool through ToolRuntime (`lib/agent-loop.js:627`) before emitting the `tool-call` event. `chat-agent.js` then runs it a **second** time at `:83` via `executor.execute(...)` → `TOOLS.invoke(...)` (:41), which bypasses ToolRuntime entirely: no permission profile, no path-security, no approval, no checkpoint, no guardrails.

Verified by reading: `lib/chat-agent.js:41`, `lib/agent-loop.js:627`, `lib/agent-loop.js:355-364`.

---

## DECISIONS ALREADY MADE
- Do not replace the runtime with a new abstraction.
- Fix one surface at a time, verifiable before moving to next.
- After each fix, run a denial test to prove the restriction works.
- ToolRuntime default profile is `'standard'`; gateway sets `'trusted'` or `'autonomous'`.
- `unified_api.js:1097` executeTool route through ToolRuntime (or mark as BLOCKED if not isolatable from P0-A dependency chain).
- Raw MCP execSync in `lib/mcp-server.js:210` must be replaced with the canonical command tool.
- Double tool execution in `lib/chat-agent.js:53` must be removed.
- Denial tests must prove restricted commands fail consistently across every surface.

---

## EXCLUSIVE WRITABLE PATHS
Begin with, in order:
1. `lib/chat-agent.js` — remove double execution (surface 1, smallest blast radius)
2. `unified_api.js` — point executeTool through ToolRuntime (surface 2)
3. `lib/mcp-server.js` — replace raw execSync with canonical command tool (surface 3)
4. Denial tests proving each surface restricts correctly

---

## READ-ONLY RELATED PATHS
- All DatabaseSync / session-repository files (P0-A handled; do not touch)
- `lib/tool-runtime.js` and `lib/tools/index.js` (the canonical target, not to be modified)
- `lib/agent-loop.js` (upstream caller, not the bypass)
- `lib/permission-manager.js`, `lib/governance.js`, `lib/path-security.js`, `lib/exec-policy.js`
- Provider routing modules

---

## FORBIDDEN CHANGES
- `lib/session-repository.js` or any DatabaseSync fixes (P0-A complete)
- Provider routing (P0-C)
- The 22 DatabaseSync files already fixed in P0-A
- P0-C or any Chunk work
- New runtime, core_v2, or compatibility layer
- Unrelated formatting or refactoring

---

## WORK ORDER

### Step 1 — `lib/chat-agent.js`: Remove double tool execution
**Why first:** smallest blast radius, no flag needed, strictly a correctness fix.
- Locate `executor.execute(...)` at `:83` and the `executor` declaration at `:41`.
- Remove the `ToolExecutor` instantiation and the second execution at `:83`.
- Keep the allow-list (`opts.tools` / `opts.allow`) — these filter what is passed to `runAgent`, which is the correct gate.
- After removal, tools execute exactly once: through `runAgent` → `ToolRuntime`.
- Verify: `chat-agent.js` still exports its functions; no `TOOLS.invoke` call remains.

### Step 2 — `unified_api.js`: Point executeTool through ToolRuntime
**Blocker check:** if `unified_api.js` depends on P0-A's `lib/agent-loop.js` being bootable before `executeTool` can be safely gated, mark this step BLOCKED and note the exact dependency. Otherwise:
- At `unified_api.js:1097` executeTool, replace the bare `require('./lib/tools').invoke` fallthrough with a module-level `ToolRuntime` instance: `new (require('./lib/tool-runtime').ToolRuntime)({ permissionProfile: 'standard' })`.
- Leave the 70 hardcoded desktop/screen/browser/Playwright tools in `runTool` (:1005–:1151) alone for now.
- The 515-tool surface reachable via fallthrough becomes permission-gated.
- **Ship behind `PURPCLAW_API_TOOL_GATE=1`** for one release; document that calls previously accepted will now be denied or queued.

### Step 3 — `lib/mcp-server.js`: Replace raw execSync with canonical command tool
**Why last:** changes tool names for MCP clients (`read_file` → `read`, `write_file` → `write`, `list_directory` → `list`).
- Delete `handleBuiltinTool` at `:210`+.
- Route `tools/call` through the `lib/tools` registry as in Step 2.
- Ship tool-name aliases in the same commit so existing MCP clients do not break silently.
- The MCP stdio interface gains the full 515-tool surface and loses ungated `execSync`.

### Step 4 — Denial tests
After each surface fix, run a denial test proving restricted commands fail consistently:
- `write` to a path outside `PURPCLAW_ALLOWED_WRITES` → must be denied
- `bash` with a dangerous command (`rm -rf`, `curl | sh`, etc.) → must be denied or require approval
- Direct `execSync` equivalent over the MCP stdio interface → must be denied
- Each surface (unified_api `/api/tool`, MCP `tools/call`, chat-agent fallback) must produce the same denial decision for the same command.

---

## ACCEPTANCE TESTS
1. Relevant files pass `node --check`.
2. `lib/chat-agent.js` contains no `TOOLS.invoke` call after edit.
3. `unified_api.js` executeTool path creates or uses a ToolRuntime instance.
4. `lib/mcp-server.js` contains no raw `execSync('bash` or `fs.writeFileSync` after edit.
5. Denial test: `write` to `/etc/passwd` via unified_api `/api/tools/call` → denied.
6. Denial test: `bash rm -rf /` via MCP `tools/call` → denied or approval-required.
7. Denial test: double execution removed — confirm tool side-effects occur exactly once.
8. Existing targeted tool-execution tests pass.
9. No unrelated files changed.

---

## PRE-EXISTING BLOCKERS
Failures in provider routing, session store consolidation, or chunk work are separate
P0 workstreams. Record them but do not repair them.

If `lib/tool-runtime.js` fails to construct (e.g. DatabaseSync not resolved), record as:
`BLOCKED_BY_PREEXISTING_RUNTIME_DEFECT`
Include: exact command, exact stack trace, first repository-owned failing file:line.

---

## REQUIRED EVIDENCE
- Reproduction of each original bypass failure (command + output)
- Exact diff for each of the three files
- Syntax check output
- Denial test output for each surface
- Changed-file list

---

## MODEL AND REASONING BUDGET
- **Builder**: High reasoning
- **Search/test helpers**: Standard reasoning
- **Ultra/Max prohibited** unless the chief records a specific escalation
- Child agents may not inherit the parent's reasoning mode

---

## COMMIT RULES
- Stage explicit paths only
- Show staged diff before commit
- Commit only after an independent critic returns PASS
- Ship Step 2 (unified_api) behind `PURPCLAW_API_TOOL_GATE=1` flag

---

## STOP CONDITION
Stop after P0-B passes. Do not begin P0-C (provider routing), Chunk work, or any other Wave 1 implementation work.
