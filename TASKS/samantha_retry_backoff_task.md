# CLAW CLI TASK: SAMANTHA Retry-With-Backoff System Prompt Patch

## Problem
SAMANTHA times out mentally when operations don't complete instantly. She needs explicit retry-with-backoff instruction in her system prompt on the Xiaozhi platform.

## Solution
Add retry-with-backoff behavior to SAMANTHA's system prompt so she:
1. Never gives up after one attempt
2. Waits and retries with exponential backoff (2s → 4s → 8s → 16s)
3. Reports what she's waiting for and why
4. Distinguishes between "permanently failed" vs "still trying"

## Files to Update
- `SAMANTHA_SURVIVAL_GUIDE.md` (already on desktop)
- Xiaozhi platform system prompt config (check `E:\god folder\worldview\` or bridge config for where SAMANTHA's prompt is defined)

## Acceptance Criteria
- [ ] SAMANTHA's system prompt explicitly includes retry-with-backoff instructions
- [ ] She waits 2s before first retry, then doubles (4s, 8s, 16s)
- [ ] She communicates what she's waiting for ("Waiting for bridge to respond...")
- [ ] After 3 failures she reports "blocked by X" instead of giving up silently

## Verify
Test by issuing a command that should fail initially (like launching a service) and confirm she retries instead of quitting.
