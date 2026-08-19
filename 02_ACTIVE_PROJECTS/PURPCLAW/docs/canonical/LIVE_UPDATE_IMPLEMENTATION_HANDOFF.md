# IMPLEMENTATION HANDOFF: LIVE CLI/TUI UPDATE

Integrate this into the existing PURPCLAW tree without inventing a second updater.

## 1. Locate the stable launcher/supervisor

The updater must live at the stable bootstrap/supervisor layer, not inside the runtime child it replaces.

## 2. Add one canonical update manager

Adapt `lib/update/update-manager.js` to the live project paths and existing snapshot system.

Wire callbacks:

- `createSnapshot`
- `preflightRelease`
- `verifyReleaseRuntime`
- `checkpointRuntime`
- `activateRelease`
- `postActivationHealth`
- `rollbackRuntime`

Use existing snapshot/rollback implementation where verified.

## 3. CLI command

Register:

`purpclaw update <subcommand>`

Do not create a separate CLI executable as the final product.
`bin/purpclaw-update.js` is only a standalone integration/test entrypoint.

## 4. Interactive slash command

Add `/update` handling BEFORE the normal model/chat path.

A slash update command must not consume a provider request or agent turn.

Use `cli/slash-update.js` semantics.

## 5. TUI

Bind Update panel/status to canonical events and actions.
The TUI calls the same update actions as CLI.

## 6. Runtime activation

The surface clients remain alive.

Supervisor sequence:

- checkpoint;
- drain replaceable child runtime;
- flip current release pointer atomically;
- start new runtime;
- health;
- broadcast reconnect;
- surfaces requery canonical session/process state.

## 7. Auto mode

Add supervisor polling for local inbox / configured remote channel.

Rules:
- off: no polling;
- notify: candidate event only;
- safe: auto-apply at safe checkpoint;
- aggressive: development-only checkpoint update.

No update may interrupt an irreversible tool side-effect.

## 8. Versioning

Every runtime status payload includes:
- product version;
- release ID;
- runtime ID;
- schema version;
- bootstrap version;
- build timestamp.

Every bug report can therefore identify the exact live build.

## 9. Acceptance tests

Must prove:

- CLI stays open across update;
- TUI stays open across update;
- session ID unchanged;
- existing process not duplicated;
- new commands/skills/tools visible after reconnect;
- old release remains rollbackable;
- failed staged build never becomes current;
- failed activated build automatically rolls back;
- local channel works without Git.
