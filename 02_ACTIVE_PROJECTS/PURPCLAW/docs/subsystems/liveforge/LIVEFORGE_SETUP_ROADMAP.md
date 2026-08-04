# PURPCLAW LIVEFORGE Setup Roadmap

## Phase 1: Contracts and stores

Build:
- Surface Contract type
- Event Envelope type
- Lesson Proposal type
- JSONL store helpers
- surface create/read/list
- event validate/write
- receipt write
- health command
- invocation registry snapshot for tools, skills, and agents

Success:
- A surface can be created.
- An event can be validated.
- A receipt is written.
- Tools, skills, and agents can be snapshotted without executing them.
- No UI rendering required yet.

## Phase 2: WebUI safe render lane

Build:
- LiveForge WebUI panel
- render patch preview
- sanitizer profile strict_static
- patch receipt log
- no JavaScript
- no external network

Success:
- A generated card can render safely.
- Dangerous HTML gets blocked.
- Patch receipt exists.

## Later Phases

## Phase 3: Forms as Event Envelopes

Build:
- generated forms use allowed event IDs only
- form submit posts to /api/liveforge/events
- schema validation
- state update
- patch update after state change

Success:
- A form can update canonical state.
- Invalid form data is rejected.
- UI updates from state, not from raw form HTML.

## Phase 4: Tool Gateway bridge

Build:
- event-to-tool route allowlist
- permission token check
- tool execution receipt
- state update from tool result

Success:
- Surface can request a tool.
- Tool runs only if route is registered.
- Proof log shows request, execution, result.

## Phase 5: Generated tool sandbox

Build:
- sandboxed iframe mode
- editor/preview layout
- save-as-proposal
- no direct file write
- explicit approval route for writes

Success:
- CSS/config/prompt playground works.
- Save creates a proposed patch.
- Tool gateway handles approved write.

## Phase 6: Audience Router

Build:
- audience labels
- private patch filtering
- visibility policy responses
- privacy receipts

Success:
- Named-recipient patch only reaches that recipient.
- Other participant can see policy answer, not private content.
- No gaslighting fallback.

## Phase 7: Lesson Distiller and Promotion Gate

Build:
- pending lesson JSONL
- replay test command
- approved pattern registry
- promote endpoint
- failure rollback

Success:
- A correction becomes a pending lesson.
- Replay passes before promotion.
- Approved pattern can be reused.
- High-risk lesson cannot self-promote.
