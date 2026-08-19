# PURPCLAW LIVE UPDATE RUNTIME CONTRACT

Status: CANONICAL ADDENDUM  
Purpose: keep CLI and TUI live while PURPCLAW is updated underneath them.

## Core rule

The interactive CLI and TUI are durable clients of the canonical supervisor.

They are NOT the runtime process that is being replaced.

Update topology:

CLI / TUI / Web / Desktop / Mobile
        |
        v
Stable Bootstrap + Supervisor
        |
        +--> Current Runtime Release
        |
        +--> Staged Next Release
        |
        +--> Snapshot / Rollback

An update replaces the Current Runtime Release only after staging and verification.
The supervisor remains alive, preserves session/process identity, emits update events,
restarts/reloads the runtime child, then lets every surface reconnect.

## Required commands

Normal CLI:

- `purpclaw update status`
- `purpclaw update check`
- `purpclaw update apply [path-or-url]`
- `purpclaw update auto on`
- `purpclaw update auto off`
- `purpclaw update channel local|dev|stable`
- `purpclaw update rollback`
- `purpclaw update history`

Interactive slash commands:

- `/update`
- `/update status`
- `/update check`
- `/update apply [path-or-url]`
- `/update auto on`
- `/update auto off`
- `/update channel local|dev|stable`
- `/update rollback`
- `/update history`

`/update` alone displays current version, latest known version, channel, auto-update state,
last update result, runtime ID and whether a rollback is available.

## Channels

### local
Default development channel.

Watches:

`<PURPCLAW_DATA>/updates/inbox/`

Drop a release directory or package there and the updater can stage/apply it.

This is the safest channel for rapid development because it does not require Git.

### dev
Optional remote manifest feed for development builds.

The configured channel endpoint points to `latest.json`.

### stable
Remote signed/verified release feed for normal users.

## Update sequence

1. acquire updater lock;
2. inspect candidate manifest;
3. validate product/version;
4. verify SHA-256/file hashes;
5. verify signature when configured;
6. create/update snapshot;
7. stage release in a new version directory;
8. run static preflight;
9. start staged runtime in verification mode;
10. run canonical health checks;
11. run Action Kernel smoke test;
12. run registry integrity test;
13. checkpoint active sessions/processes;
14. tell surfaces `runtime.update.activating`;
15. stop/drain only the replaceable runtime child;
16. atomically switch `current.json`;
17. start new runtime child;
18. reconnect surfaces;
19. restore/rebind active canonical sessions/processes;
20. run post-activation health check;
21. mark release good;
22. emit `runtime.update.completed`.

If any step after activation fails:

1. emit `runtime.update.failed`;
2. switch `current.json` to previous release;
3. restart previous runtime;
4. restore checkpoint;
5. emit `runtime.update.rolled_back`.

## What must stay alive

During update:

- bootstrap;
- supervisor;
- runtime lock;
- surface gateway/reconnect endpoint;
- updater;
- minimal event bridge;
- process/session checkpoint authority.

Everything else may be restarted if its version requires it.

## What must not happen

- do not run a second full PURPCLAW backend beside the current backend indefinitely;
- do not spawn another CLI runtime;
- do not lose current session IDs;
- do not duplicate missions/processes;
- do not overwrite the active release in-place;
- do not delete the previous known-good release before the new release is marked good;
- do not auto-apply an unverified package;
- do not make Web/TUI/Desktop implement their own updater;
- do not require Git for update transport.

## TUI behaviour

TUI gets a permanent Update status area:

- current version;
- channel;
- auto mode;
- latest candidate;
- staged version;
- update phase;
- last failure;
- rollback available.

When update activates:

- TUI remains open;
- status changes to RECONNECTING;
- TUI preserves local input buffer;
- it reconnects to the supervisor;
- canonical process/session state is rehydrated;
- status returns LIVE.

## CLI behaviour

Interactive CLI remains open.

During activation it prints a single compact status sequence:

`[update] staged 0.3.1-dev.17`
`[update] switching runtime`
`[update] runtime healthy`
`[update] now on 0.3.1-dev.17`

The CLI's current conversation/session ID does not change.

## Auto update modes

`off`
- never checks automatically.

`notify`
- checks channel and reports candidate but never applies.

`safe`
- automatically applies only when:
  - no irreversible tool call is active;
  - no approval is currently being executed;
  - update manifest passes verification;
  - staged health/smoke tests pass;
  - snapshot exists.

`aggressive`
- development-only.
- may update as soon as the runtime reaches a checkpoint-safe boundary.

Default for developer builds: `notify`.

Normal users should never default to `aggressive`.

## Update events

- `runtime.update.check.started`
- `runtime.update.candidate`
- `runtime.update.none`
- `runtime.update.stage.started`
- `runtime.update.staged`
- `runtime.update.verification.started`
- `runtime.update.verification.passed`
- `runtime.update.verification.failed`
- `runtime.update.activation.started`
- `runtime.update.reconnecting`
- `runtime.update.completed`
- `runtime.update.failed`
- `runtime.update.rollback.started`
- `runtime.update.rolled_back`
- `runtime.update.auto.changed`
- `runtime.update.channel.changed`

All surfaces consume the same events.

## Release layout

Recommended:

```
<PURPCLAW_DATA>/
  runtime/
    current.json
    previous.json
    releases/
      0.3.0/
      0.3.1-dev.17/
    update.lock
  updates/
    inbox/
    staging/
    rejected/
    history.ndjson
```

`current.json` is atomically replaced.

Example:

```json
{
  "version": "0.3.1-dev.17",
  "releasePath": "runtime/releases/0.3.1-dev.17",
  "activatedAt": "2026-08-19T17:30:00.000Z"
}
```

## Release manifest

Every candidate contains `purpclaw-update.json`.

It declares:

- product;
- version;
- release ID;
- entry point;
- minimum bootstrap version;
- optional minimum schema version;
- created time;
- channel;
- full package SHA-256 or file hashes;
- migrations;
- restart domains;
- health checks;
- smoke actions;
- optional Ed25519 signature.

## Development loop

The intended build/test loop becomes:

1. implementation produces a new versioned release package;
2. package lands in `updates/inbox` or is published to `dev/latest.json`;
3. live CLI/TUI receives `runtime.update.candidate`;
4. `/update apply` or auto mode stages it;
5. supervisor verifies and flips release;
6. CLI/TUI reconnect without losing the user's session;
7. user immediately tests the changed command/agent/skill/tool path;
8. bugs are reported against exact `runtime_id`, `version`, `process_id` and trace ID.

This makes the user's CLI/TUI a live acceptance-testing cockpit rather than a dead build artifact.
