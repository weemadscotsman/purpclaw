# DOC VERSIONING PLAN (Stage 1 output)

> Generated: 2026-06-25 · Source: docs/DOC_STATUS_LEDGER.json
> This is the **standard header format** that every CURRENT doc must carry
> once Stage 2 applies the canonical set.

## Canonical header format (block, not line — blocks survive copy/paste)

```
> Version: <semver>
> Updated: <YYYY-MM-DD>
> Verified against: <git short-sha or "manual">
> Status: CURRENT
> Owner: PURPCLAW
```

## Header variants by status

- **CURRENT** — block above.
- **STALE** — same block, change Status to STALE and add `> Drift:` line listing
  what changed since the doc was last verified.
- **ARCHIVE** — change Status to ARCHIVE, add `> Archived: YYYY-MM-DD reason: <why>`.
- **HISTORICAL** — same as ARCHIVE but keep in place (not moved to docs/archive/).

## Application order for Stage 2 (after human review of Stage 1)

1. Stamp canonical headers on the CURRENT set (47 files).
2. Stamp STALE headers on the 17 STALE files, but **do not move them yet** —
   let a human confirm drift claims first.
3. Stamp ARCHIVE headers on the 27 HISTORICAL files (no moves yet).
4. Move the 3 SUPERSEDED files to `docs/superseded/` after human review.
5. Apply zero-byte DELETEs (none found in scope).

## What MUST be re-verified before adding a CURRENT header

- The doc's claims about live state (service count, key count, agent count,
  model routing) are accurate.
- Runtime proof exists (live HTTP 200, or recent audit that ran the gauntlet).
- No contradiction with `docs/DOC_STATUS_LEDGER.json`.

## Drift rules (what disqualifies a CURRENT doc)

A CURRENT doc is auto-demoted to STALE if it claims any of the following
without a 2026-06-24-or-later runtime proof:

- Service count ≠ 25 (per `ecosystem.config.js`)
- NVIDIA key count ≠ 10 (per `.env` env-var list)
- Agent count ≠ 73 (per `lib/whoami.js` live count)
- Tool count ≠ 459 (per runtime `tools.list().length`)
- Provider routing that names specific NIM models that don't exist
- "Usage Governor not implemented" (now live in `lib/usage-governor.js`)
- "18/18 runtime proof" without an actual HTTP gauntlet this session

## Live verification gate

Before a doc can be stamped CURRENT, the following must be true:

```
HTTP 200 from:
  /mission, /mission/harness, /agents, /system-map, /omni,
  /pipeline, /spine, /providers, /settings, /mochi, /swarm,
  /voice, /inline
  /api/health, /api/narrator/types, /api/harvest/status,
  /api/internal/governor/status
```

These are the **18/18** the directive references. They are not yet proven
green in this session (the dev server has been failing to bind 3030).
Until they are, no doc may claim "18/18 runtime proof" as CURRENT.
