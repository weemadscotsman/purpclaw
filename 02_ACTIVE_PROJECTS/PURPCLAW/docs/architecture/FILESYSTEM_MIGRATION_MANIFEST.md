# FILESYSTEM_MIGRATION_MANIFEST
**PURPCLAW Canonical Filesystem Reorganisation**
Generated: 2026-08-04
Phase: PHASE 0 — Inventory and Ownership

---

## MIGRATION CONTRACT

**Live runtime**: `lib/` — current working implementation, NOT to be bulk-moved.
**Destination architecture**: `packages/core/`, `packages/tools/` — migration targets.
**Migration model**: copy one owned subsystem → add compatibility wrapper in lib → update explicit callers → run tests → commit → remove wrapper after zero callers remain.

**Constraint**: `lib/` is frozen for bulk moves. Individual files may be migrated using the batch protocol.

---

## CLASSIFICATION SUMMARY

| Classification | Count | Destination | Batch |
|---|---|---|---|
| tool-runtime | 98 | packages/tools/lib/ | A |
| orchestration | 25 | packages/core/ | C |
| core-runtime | 18 | packages/core/ | B |
| compatibility | 9 | packages/shared/ | A |
| tool-implementation | 6 | packages/tools/ | B |
| memory | 4 | packages/core/ | C |
| harness | 4 | packages/core/ | C |
| routing | 2 | packages/core/ | B |
| session | 2 | packages/core/ | C |
| test-helper | 2 | tests/fixtures/ | A |
| service-adapter | 1 | packages/core/ | B |
| provider | 1 | packages/core/ | B |
| **TOTAL** | **172** | | |

---

## BATCH DEFINITIONS

### Batch A — ZERO-RISK (move generated/temp/non-runtime)
Files: tool-runtime (98 commands), compatibility (9), test-helper (2)
Approach: Move directly. No callers depend on command path.
Risk: LOW. No import breakage.
Status: Ready to execute.

### Batch B — LOW-RISK (provider, routing, core-runtime, service-adapter)
Files: core-runtime (18), routing (2), service-adapter (1), provider (1), tool-implementation (6)
Approach: Copy to destination → add compatibility shim in lib/ → update callers → test → remove shim.
Risk: MEDIUM. Some import dependencies.
Status: Requires import graph analysis before execution.

### Batch C — HIGH-RISK (orchestration, memory, harness, session)
Files: orchestration (25), memory (4), harness (4), session (2)
Approach: One file at a time. Copy → wrapper → update callers → test → commit.
Risk: HIGH/CRITICAL. Dense import dependencies. Do not bulk-move.
Status: Requires case-by-case analysis.

---

## PHASE 1 — ZERO-RISK STRUCTURE (READY TO EXECUTE)

Create directories only. No file moves. No runtime impact.

```
purpclaw/
  var/          # runtime state (exists, populate)
  logs/
  reports/
  sessions/
  checkpoints/
  cache/
  artifacts/
  memory/
  events/
  indexes/
  candidates/
  snapshots/
  quarantine/
  tmp/
    codex/
    hermes/
    kiro/
    omnicode/
  docs/
    architecture/
    operations/
    product/
    security/
    parity/
    releases/
    research/
    archive/
  tests/
    unit/
    integration/
    contract/
    parity/
    smoke/
    stress/
    fixtures/
  tools/
    scripts/
    deployment/
    diagnostics/
    migrations/
    release/
  research/
    donors/
    references/
    experiments/
    evaluations/
```

**Action**: Create empty directory structure. No files moved.

---

## CRITICAL FILES — DO NOT TOUCH

| File | Reason |
|---|---|
| lib/llm-provider.js | CRITICAL risk — dense provider abstraction, 64KB, all agents depend on it |
| lib/tools/index.js | CRITICAL risk — 101KB, every tool call goes through this |
| lib/harness/engine.js | HIGH risk — legacy adapter, new canonical in packages/harness-core |
| lib/agent-gateway.js | CRITICAL risk — memory spine, cognitive gateway |
| lib/api-harness-kernel.js | CRITICAL risk — job execution kernel |
| lib/memory-client.js | CRITICAL risk — memory gateway client |

---

## MIGRATION BATCH ORDER

1. **Batch A** — var/ dirs + directory structure creation
2. **Batch A** — Move lib/commands/ to packages/tools/lib/commands/ (98 files, independent)
3. **Batch B** — Move lib/routing-decisions.js, lib/model-router.js (2 files)
4. **Batch B** — Move lib/tts/, lib/trace-manager.js, lib/telemetry/ (low-risk tool-runtime)
5. **Batch C** — One file at a time: lib/memory-client.js, lib/agent-gateway.js
6. **Batch C** — lib/harness/ legacy files → archive/ (not packages/, replaced by packages/harness-*)
7. **Batch C** — orchestration files: lib/agent-loop.js, lib/smith-neo.js, etc.

---

## ARCHIVE CANDIDATES (superseded by packages/ canonical)

| Source | Reason |
|---|---|
| lib/harness/task-schema.js | Replaced by packages/task-schema/index.js |
| lib/harness/result-schema.js | Replaced by packages/result-schema/index.js |
| lib/harness/engine.js | Replaced by packages/harness-core/index.js |

---

## CURRENT STATE VERIFICATION

- Source tree: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW` — 100% intact
- Backup: `E:\PURPCLAW_WORKSPACE\backups\backup_20260804_153252`
- Git: clean (0 modified tracked files)
- Branch: canonical-parity-clean-v2
- Commit: 6ec4079

---

## FILES GENERATED

- `data/migrations/lib-classification.json` — full 172-file classification
- `data/migrations/path-crosswalk.json` — source→destination mapping
- `data/migrations/import-graph.json` — 172-file dependency graph
- `data/migrations/build_manifest.py` — classification generator
- `docs/architecture/FILESYSTEM_MIGRATION_MANIFEST.md` — this file
