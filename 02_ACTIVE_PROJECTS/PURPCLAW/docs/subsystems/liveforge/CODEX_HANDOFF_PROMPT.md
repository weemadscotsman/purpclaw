# CODEX HANDOFF: LIVEFORGE

Phases 1 through 6 are implemented. Phase 7 may add only Lesson Distiller and Promotion Gate.

After Phase 7, do not add new roadmap phases without a new explicit spec.

Phase 1 must provide:
- Surface Contract type
- Event Envelope type
- Lesson Proposal type
- JSONL store helpers
- surface create/read/list
- event validate/write
- receipt write
- health command
- invocation registry snapshot for tools, skills, and agents

Acceptance:
- A surface can be created.
- An event can be validated.
- A receipt is written.
- Tools, skills, and agents can be snapshotted without execution.
- No UI rendering is required.

Phase 2 acceptance:
- A generated static card can preview safely.
- Dangerous HTML is blocked by strict_static.
- Patch receipts are written.
- No JavaScript or external network capability is introduced.

Phase 3 acceptance:
- Form submit uses only allowed event IDs.
- Form submit posts to /api/liveforge/events.
- Event payload schema validation rejects invalid data.
- Accepted events update canonical surface state.
- Patch previews update from canonical state, not raw form HTML.

Phase 4 acceptance:
- Event-to-tool routes are explicit allowlist entries.
- Permission tokens are checked before execution.
- Unregistered routes and bad tokens are rejected.
- Tool execution writes request/result receipts.
- Surface state updates from the tool result.

Phase 5 acceptance:
- Preview output renders inside a sandboxed iframe.
- CSS/config/prompt playground content saves as a proposal only.
- No direct file write happens on save.
- Approved writes run through a registered tool-gateway route.

Phase 6 acceptance:
- Patches can carry audience labels.
- Private patches are visible only to named recipients.
- Non-recipients receive an explicit policy answer, not private content.
- Privacy access receipts are written.

Phase 7 acceptance:
- Corrections can become pending lessons.
- Replay must pass before promotion.
- Approved patterns are stored in a reusable registry.
- Failed promotion writes rollback receipt.
- High-risk lessons cannot self-promote.
