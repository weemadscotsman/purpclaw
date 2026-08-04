# R2: Operator Decisions on 13 Action-Required Features — 2026-06-23

13 features currently flagged `actionRequired=true` in `lib/omni/feature-registry.js:218-232`. Each row needs an explicit operator decision (build / wire-existing / defer / retire). Source-of-truth = current on-disk evidence per audit.

## Decision matrix

| # | Feature | Current State | Operator Decision | Why |
|---|---|---|---|---|
| 1 | OBLITERATUS | partial | **defer** | Canned routes in `unified_api.js:2799-2873`. Real command-law layer is the pre-prompt compiler. Renaming would create churn for no UX value. |
| 2 | api-mega-list | partial | **defer** | POST 403 is intentional (use GOOP broker). Read-only is correct — no write path needed. |
| 3 | GOOP | partial | **defer** | Broker/registry is real. No wiring gap, just needs operator-facing page (out of audit scope). |
| 4 | Kimi | planned | **wire-existing** | Routes exist (`unified_api.js` kimi/*), `.env` configured, but no UI consumer. Wire: add Kimi tab in `app/providers/page.tsx` provider picker + add to model registry. |
| 5 | Shaman | planned | **defer** | No dedicated routes/UI. Persona-only reference (`lib/agent-loop.js:79`). Defer until user defines a surface need. |
| 6 | Security | partial | **defer** | Routes exist (`app/api/security/*`), may be empty stubs. Defer — needs operator to define what "real" security means here. |
| 7 | Sessions | planned | **defer** | Route CRUD defined (`unified_api.js:2939-2966`). State not wired to real session store. Defer — separate concerns from this audit. |
| 8 | Gestures | planned | **defer** | No gesture routes in unified_api.js; mochi pet is the gesture response layer. Defer — covered by MochiNarrator. |
| 9 | Mochi | partial | **wire-existing** | Page exists (`app/mochi/page.tsx` 23593B real). Some UI shows canned state. Wire: replace canned with `/api/mochi` live fetch + narrator integration. |
| 10 | Voice | failing | **wire-existing** | Page.tsx restored (6975B, 23:50). voice-coordinator service was down. Wire: bounce `purpclaw-cognitive` + verify `/api/voice/coordinate`. |
| 11 | Research | partial | **defer** | Route proxies to orchestrator (`app/api/research/group/route.ts`). Orchestrator `/api/swarm/research` not yet proven real. Defer. |
| 12 | Narrator | partial | **defer** | 14 event types have no backend producer (`lib/narrator/publisher.js` is contract-only). Defer — separate publisher sweep needed. |
| 13 | Hooks | partial | **defer** | 6 hook polls to non-existent routes — already verified per Task #17 as not present in v0. Defer. |

## Summary: no-action / out-of-scope

Of 13: **0 build-from-scratch, 3 wire-existing (Kimi/Mochi/Voice), 10 defer** (separate-concerns).

## How to apply next session

When user returns: **bounce PM2 first** to flip runtime gates (Tasks #20/#34), then wire Kimi/Mochi/Voice if user gives the go. The 10 deferred items need their own sprint + operator-decision round when user is ready.
