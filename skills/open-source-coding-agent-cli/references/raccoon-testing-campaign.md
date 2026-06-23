# Raccoon Testing — The Sticky-Finger Campaign

> From 2026-06-06. The most dangerous bugs are found by absolute goblins, not careful people.

## The philosophy

Eddie's testing philosophy, articulated during a deep audit session:

> Touch everything. Touch it twice. Touch it wrong. Touch it while another thing is touching it. Then see what catches fire.

This is NOT a formal test suite. It's a sticky-finger campaign — run real commands against every surface and see what breaks.

## Campaign structure

### Surface 1: CLI
- Invalid provider (e.g. `--provider raccoon_ai`) — should fail gracefully, not crash with deserialization error
- Empty prompt — should go to interactive mode
- Missing file read — should return helpful error
- 10K character prompt — should warn/truncate, not hang
- Recursive tool request — should detect loop
- Tool returns garbage — should handle malformed output

### Surface 2: TUI
- Resize terminal rapidly — should not crash
- Disconnect network — should show offline indicator
- Kill provider mid-stream — should show error, not hang
- Spam slash commands — should not queue overflow
- Open multiple chat sessions — should not conflate state
- Flood event bus — should throttle

### Surface 3: WebUI
- Open 20 tabs — should not degrade
- Reconnect SSE repeatedly — should handle reconnect
- Invalid websocket messages — should not crash
- Stale sessions — should timeout gracefully
- Browser sleep/wake — should recover

### Surface 4: Memory
- Duplicate facts — should detect repetition
- Contradictory facts — should detect conflicts
- Future timestamps — should flag as anomalous
- Impossible timelines — should reject
- Self-references — should detect loops

### Surface 5: Swarm
- Planner refuses — synthesis should fall back
- Builder hallucinates — auditor should catch
- Auditor lies — Neo should detect
- Researcher times out — should retry or skip

### Surface 6: Smith+Neo
- Smith's job is to discover attack classes Neo doesn't know exist
- The day Smith finds attack #9 before Neo detects it is the day the ledger gets interesting
- Run chaos campaigns regularly, track detection rates over time

## Results from 2026-06-06 campaign

3 bugs found, 1 fixed:
| Bug | Status |
|---|---|
| Invalid provider crashes with MiniMax deserialization error | Open |
| 10K prompt hangs/timeout | Open |
| Reorder detection: 3 regex bugs (capture group index, matchAll, object.method) | Fixed |
| Duplicate facts not detected | Open |
| Contradictory facts not detected | Open |
| Self-reference loops not detected | Open |

## The value

This methodology found a real regex bug (3 sub-bugs in one) that would have silently let memory reordering attacks pass undetected. Formal test suites test correctness. Raccoon campaigns test failure modes.
