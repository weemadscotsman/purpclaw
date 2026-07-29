# P0-A Builder Brief: Restore Canonical Runtime Boot and Session Persistence

## COMPONENT
P0-A — Restore canonical runtime boot and session persistence.

---

## ORIGINAL CAMPAIGN GOAL
Make PURPCLAW's canonical runtime bootable, persistent, permission-governed and controlled by genuine provider settings.

---

## CANONICAL REFERENCES
- `AGENT.md`
- `docs/parity/CANONICAL_PARITY_PRIORITY.md`
- `docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md`
- `docs/parity/WAVE1_CAMPAIGN_GOVERNANCE.md`
- `docs/parity/WAVE1_MASTER_GOAL.md`

---

## CURRENT VERIFIED FAILURE
The canonical session repository imports `DatabaseSync` from `better-sqlite3` even though
`DatabaseSync` belongs to `node:sqlite`. Runtime construction fails, and `agent-loop`
silently falls back to null persistence.

`lib/session-repository.js:5` does `require('better-sqlite3')` and destructures
`DatabaseSync` — which is the node:sqlite builtin API, not something better-sqlite3
exports. Same wrong import in 22 modules. Verified by running: `purpclaw ask --help`
throws `DatabaseSync is not a constructor`. `lib/agent-loop.js:54` swallows it in a
try/catch and returns null, so the loop runs with **session persistence silently off**.

---

## DECISIONS ALREADY MADE
- Fix runtime boot and persistence before other Wave 1 implementation.
- Do not create a replacement runtime.
- Do not perform a blind 22-file search-and-replace.
- Classify every affected import by the API it actually uses.
- Persistence failure must be fatal or explicitly degraded, never silent.
- The acceptance bar is a persisted session surviving process restart.

---

## EXCLUSIVE WRITABLE PATHS
Begin with:
- `lib/session-repository.js`
- `lib/agent-loop.js`
- Targeted tests for session boot/persistence

Additional DatabaseSync files may be added only after proving they use the identical
API and recording them in the campaign state.

---

## READ-ONLY RELATED PATHS
- All other session stores
- CLI entry points
- API entry points
- Provider and permission modules
- `docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md`

---

## FORBIDDEN CHANGES
- `unified_api.js` permission work
- `lib/mcp-server.js` execution changes
- Provider routing changes
- Chunk 1 CLI recovery files
- New runtime/core_v2/compatibility layer
- Session lifecycle expansion beyond what is needed for the persistence proof
- Unrelated formatting or refactoring

---

## ACCEPTANCE TESTS
1. Relevant files pass `node --check`.
2. `purpclaw ask --help` reaches normal help output without DatabaseSync failure.
3. Session repository constructs successfully.
4. Create a temporary session.
5. Persist messages and metadata.
6. Terminate the process.
7. Start a fresh process.
8. Load the same session.
9. Resume and append another message.
10. Confirm the original and appended data remain.
11. Force database initialisation failure and confirm it is fatal or visibly degraded.
12. Confirm no silent null-persistence fallback.
13. Existing targeted session tests pass.
14. No unrelated files changed.

---

## PRE-EXISTING BLOCKERS
Failures in permission routing, MCP shell execution or provider routing are separate
P0 workstreams. Record them but do not repair them.

If tests fail because the canonical runtime cannot construct DatabaseSync, record them as:
`BLOCKED_BY_PREEXISTING_RUNTIME_DEFECT`
Include: exact command, exact stack trace, first repository-owned failing file:line.

---

## REQUIRED EVIDENCE
- Reproduction command and original failure
- Classified DatabaseSync import inventory
- Exact diff
- Syntax output
- Restart/resume test output
- Forced-failure output
- Changed-file list
- Known limitations

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

---

## STOP CONDITION
Stop after P0-A passes. Do not begin permissions, providers, MCP, desktop, TUI or
feature parity work.
