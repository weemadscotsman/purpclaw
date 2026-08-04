# PURPCLAW Status

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

This file describes current operational meaning and active blockers. It is not a substitute for runtime probes.

## Status Vocabulary

- **Registered:** present in a registry or configuration file.
- **Executor-backed:** connected to an implementation path.
- **Strict-live:** demonstrated through the required proof ladder.
- **PM2-defined:** present in process configuration.
- **Healthy:** passed a current health probe.
- **Integrated:** participates in the canonical runtime rather than a duplicate path.

Never collapse these into one claim.

## Wave 1 Blocking State

The active campaign must independently verify and close:

### P0-A — Runtime boot and persistence

- `lib/session-repository.js` must use the intended SQLite implementation consistently.
- Persistence failure must be visible rather than silently becoming null persistence.
- Session create, restart, resume and branch behaviour must have test evidence.

### P0-B — Permission enforcement

- CLI, HTTP and MCP must converge on the canonical `ToolRuntime` permission path.
- Direct tool dispatch outside policy evaluation must be removed or made impossible.
- Raw MCP shell execution must not bypass caller, policy, decision or audit context.

### P0-C — Provider routing truth

- Configured provider, model and lane decisions must control real calls.
- Status reporting must match the route actually used by execution.
- Fallback and invalid-configuration behaviour must be deterministic and secret-safe.

These statements are campaign hypotheses until re-proved against the approved base. Builders do not get to convert their own claims into PASS.

## Verification Commands

```bash
npm run truth:check
npm run docs:sync
npm run docs:check
npm run verify:harness
npm run verify:parity
npm run build
node bin/purpclaw.js safe-start --core --dry-run
node bin/purpclaw.js doctor
node bin/purpclaw.js health --verbose
```

## Work Deferred Until Final PASS

Do not start desktop, TUI redesign, marketplace, image, search, fan-out, voice, cosmetic or external-harness parity expansion as part of Wave 1.

The harness reference blueprint remains design input only until the canonical priority file authorises that work.
