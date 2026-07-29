> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# CODEX PARITY — CANONICAL STATUS
**Last updated:** 2026-07-28
**Canonical wording:** See below. Do not use other scorecards.

---

## CLI Parity: 20/20 ✅ COMPLETE
All supported command domains matched. No stubs. No outstanding CLI gaps.

## Extended Product Parity: 20/22 ✅
Two surfaces genuinely outstanding (not CLI gaps — separate product surfaces):

| # | Surface | Status | Notes |
|---|---|---|---|
| 1 | **Marketplace** | Outstanding | Source registries, add/list/remove/update, persistence |
| 2 | **Desktop App** | Outstanding | Launcher, server lifecycle, window integration, install/package path |

## Smoke Tests: 12/12 ✅ PASSING

---

## What "20/20 CLI complete" means
Codex has ~29 CLI commands. 20 are fully matched. The remaining ~7 in Codex are:
- Hidden/internal (stdio-to-uds, responses-api-proxy, execpolicy) — not applicable
- Architecture differences (exec-server is a separate binary; PURPCLAW is a unified runtime)
- **Not gaps**: these are design choices, not missing features

## What "Marketplace + Desktop outstanding" means
These are not CLI flag gaps. They are separate product surfaces requiring:
- Marketplace: registry system, source adapters, persistence layer, tests
- Desktop App: Electron/desktop surface, launcher, server lifecycle, window management

---

## Lane assignments
- **Lane 1 — Marketplace:** Source registries, add/list/remove/update, persistence, tests
- **Lane 2 — Desktop App:** Launcher, server lifecycle, window integration, install/package
- **Lane 3 — Parity Verifier ONLY:** Tests finished surfaces against Codex/Hermes. No implementation.

## What this document is NOT
This is not a living audit that gets re-run for discovery. It is a status document. The verifier agent updates it; it does not grow it.
