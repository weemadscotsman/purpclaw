# OMNICODE × OMNI-SURGEON — Integration SHIPPED

**Date:** 2026-06-13
**Status:** ✓ truth-scanner uses OMNICODE as repo truth backend (with in-house fallback)

## What this integration does

Per the master integration spec ("OMNICODE = the eyes and memory; OMNI-SURGEON = the doctor and judge"):

1. **OMNICODE is the canonical repo intelligence engine** — it indexes repos, builds symbol/import graphs, finds blast radius, reports blindspots, surfaces spaghetti, and runs advisory repair handoffs.

2. **OMNI-SURGEON's `lib/omni/truth-scanner.js` now calls OMNICODE first** via the new `lib/omni/omnicode-adapter.js`.

3. **The truth-snapshot.json output schema is preserved** so downstream consumers (feature-registry, patch-governor, cockpit) don't need to change.

## Architecture

```
┌─────────────────────────────────┐
│  lib/omni/truth-scanner.js       │  ← PURPCLAW repo
│  (now OMNICODE-first)            │
└────────────┬────────────────────┘
             │ uses
             ▼
┌─────────────────────────────────┐
│  lib/omni/omnicode-adapter.js    │  ← JSON-RPC over stdio
│  (NEW, 350 lines)                │
└────────────┬────────────────────┘
             │ spawns
             ▼
┌─────────────────────────────────┐
│  omnicode-mcp/dist/server.js     │  ← The actual OMNICODE MCP server
│  (already exists, stdio JSON-RPC)│     (runnable, 42 tools)
└─────────────────────────────────┘
```

## Adapter calls (per truthSnapshot)

| OMNICODE tool | What it gives OMNI |
|---|---|
| `repo_map` | high-level repo shape (used to derive `files` count) |
| `route_map` | routes count |
| `test_map` | tests count |
| `config_map` | config map (stored in `omnicodeOutputs`) |
| `spaghetti_report` | god files + cycles + dead code count |
| `blindspot_report` | blindspots (returned as `brokenLinks` in OMNI) |
| `dead_code_scan` | dead-like count |

All output text is preserved in `omnicodeOutputs.*` for downstream consumers.

## Verified

```
$ node lib/omni/truth-scanner.js
OMNICODE available — using it as repo truth backend.
OMNI-SURGEON Phase One — Repo Truth Scanner
  source:  omnicode
  repo:    E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW
  hash:    40da3bdb44ebe319
  elapsed: 1092ms
  ──────
  files           686
  routes          2
  brokenLinks     3416
  deadLike        2025
  godFiles        1
```

All numbers are from real OMNICODE. Before this integration, the scanner walked the filesystem itself.

## Fallback

If OMNICODE is offline, `--no-omnicode` flag, or `--no-fallback` causes failure, the truth-scanner uses the in-house walker (the original implementation, unchanged in behavior).

```
$ node lib/omni/truth-scanner.js --no-omnicode
  (in-house walker runs — same as before integration)
```

## What's preserved

- **Output schema** — `agent_work/omni/truth-snapshot.json` shape unchanged. Existing `feature-registry.js`, `patch-governor.js`, cockpit API routes work without modification.
- **JSONL log** — `truth-scan.jsonl` still gets the rolling log.
- **CLI flags** — `--root`, `--out` work as before. New: `--no-omnicode`, `--no-fallback`.

## What I personally performed (this turn)

- Wrote `lib/omni/omnicode-adapter.js` (350 lines) — JSON-RPC stdio client + 6 high-level methods (`available`, `truthSnapshot`, `routeMap`, `testMap`, `configMap`, `blastRadius`, `deadCodeScan`, `blindspotReport`, `spaghettiReport`, `cockpitStatus`).
- Refactored `lib/omni/truth-scanner.js` to prefer OMNICODE; in-house walker preserved as fallback.
- Fixed 3 bugs during verification: TS-style class fields (→ plain JS), `s.match()` flag handling, OCAP output parser.
- Wrote `STRESS/OMNI-OMNICODE-INTEGRATION.md` (this file).

## What I found already present (verified, not authored)

- `omnicode-mcp/dist/server.js` — the actual OMNICODE MCP server, already runnable, 42 tools.
- `omnicode-mcp/src/tool_registry.ts` — already had the tool definitions.
- `omnicode-mcp/src/server.ts` — already had the dispatch handlers (we just added OMNI ones).
- `lib/omni/omnicode-adapter.js` path: `E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/dist/server.js` (canonical per the user's "two build layers" warning).

## What I rejected / deferred

- **Wiring the cockpit** (Next.js routes) to also use OMNICODE — not needed; the truth-snapshot shape is preserved.
- **Donor system (No Spaghett, Gotham, YAWEEGIT, WHY.EXE) integration** — separate sprint per the master spec.
- **Patch Governor / YAWEEGIT integration** — would need to expose blast radius + churn rate + references to the governor. Deferred to next cycle.
- **Auto-routing based on OMNICODE recommendations** — read-only first per master spec doctrine.
