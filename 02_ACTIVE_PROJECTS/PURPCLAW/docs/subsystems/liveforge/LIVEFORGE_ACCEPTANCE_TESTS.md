# LIVEFORGE Phase 1 Acceptance Tests

1. Create a surface.
2. Read the created surface.
3. List surfaces and find the created surface.
4. Validate and write an event using an allowed event id.
5. Reject an event using an unregistered event id.
6. Write a receipt.
7. Snapshot tools, skills, and agents into the invocation registry.
8. Run health and confirm stores are writable.

Command:

```bash
node scripts/liveforge-phase1-smoke.js
```

## Phase 2

1. Create a generated static card preview.
2. Confirm strict_static keeps safe HTML.
3. Submit dangerous HTML with script/event/external URL attributes.
4. Confirm dangerous content is blocked/removed.
5. Confirm patch receipts exist for both preview and blocked cases.

Command:

```bash
node scripts/liveforge-phase2-smoke.js
```

## Phase 3

1. Create a surface with an allowed form event and payload schema.
2. Submit a valid Event Envelope with `statePatch`.
3. Confirm canonical surface state changes.
4. Confirm a state-derived patch preview exists.
5. Submit invalid form data and confirm rejection.
6. Submit an event ID outside `allowedEventIds` and confirm rejection.

Command:

```bash
node scripts/liveforge-phase3-smoke.js
```

## Phase 4

1. Register an event-to-tool route for a surface.
2. Reject execution with a bad permission token.
3. Reject execution for an unregistered route.
4. Execute the registered route with the correct token.
5. Confirm request and execution receipts exist.
6. Confirm surface state stores the tool result.

Command:

```bash
node scripts/liveforge-phase4-smoke.js
```

## Phase 5

1. Save CSS/config/prompt content as a generated tool proposal.
2. Confirm save does not write the output file.
3. Register a write route through the tool gateway.
4. Reject approval with a bad token.
5. Approve with the correct token.
6. Confirm the write happened through tool execution receipts.

Command:

```bash
node scripts/liveforge-phase5-smoke.js
```

## Phase 6

1. Create a private patch addressed to one recipient.
2. Confirm the named recipient receives the patch content.
3. Confirm a different viewer receives an explicit policy answer.
4. Confirm private content is not returned to the different viewer.
5. Confirm privacy receipts are written.

Command:

```bash
node scripts/liveforge-phase6-smoke.js
```

## Phase 7

1. Create a pending lesson from a correction event.
2. Replay the lesson and require pass before promotion.
3. Promote the passed lesson into the approved pattern registry.
4. Attempt high-risk self-promotion and confirm rejection.
5. Confirm rollback receipt exists for failed promotion.

Command:

```bash
node scripts/liveforge-phase7-smoke.js
```
