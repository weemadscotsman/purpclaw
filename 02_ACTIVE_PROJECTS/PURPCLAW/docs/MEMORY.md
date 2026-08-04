# PurpClaw Durable Memory

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

This root file is a compatibility pointer. Canonical operator and runtime memory belongs in `workspace/MEMORY.md`; user preferences belong in `workspace/USER.md`; generated registry truth belongs in `public/showcase/truth-manifest.json`.

## Durable Facts

- PurpClaw is a local-first AI workstation OS.
- Sessions are intended to persist and support search, resume and branching; Wave 1 must prove the failure path as well as the happy path.
- Context compaction exists; semantic preservation remains an improvement target.
- Direct file mutation tools can receive checkpoints.
- Shell mutations are not guaranteed automatic rollback.
- Delegation defaults must remain bounded by policy, depth, concurrency and tool access.
- Concurrent write-capable delegation requires registered temporary workspace isolation.
- Runtime counts and version numbers must be read from their generated or package sources, not copied here.
