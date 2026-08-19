# Phase 3 Receipt — Steering Live in the Turn Path

Date: 2026-08-19 · Sweep: finish-line-2026-08-18 · Baseline: `baseline.md`

## Files changed (11)
| File | Change |
|---|---|
| `lib/steering-resolver.js` | `sourceRules` input channel (discovered records injected at workspace authority); `applyToAction` hardened — regex-escaped tool matching + deterministic `forbidTools` lists |
| `lib/agent-loop.js` | Capsule resolved BEFORE provider/recall/tool work (contract position); steering preamble in system prompt (advisory); deterministic tool gate BEFORE dispatch AND before the tool-call event; capsuleId threaded through turn/tool-call/tool-result/done events; DONE blocked while unresolvedConflicts > 0 (both natural and max-turns exits emit `steering-blocked`); S4 priority-steer wired at turn boundaries (interrupt abandons turn, queued directives inject as operator messages, turnStarted/turnEnded lifecycle) |
| `lib/tool-runtime.js` | Steering gate in the deterministic ladder (after path-security, `STEERING_DENIED` + `steering.denied` event); S6 approval-triage in the approval decision path (3+ denials auto-block, 3+ approvals auto-pass non-destructive, HIGH_STAKES always escalates, decisions recorded); S13 remote-approval transport (explicit opt-in `remoteApprovals: true`, durable queue + `approval.queued` event); S14 device-consent gate (device-class tools → capability tiers, BLOCKED hard-denies, ASK_EACH requires operator) |
| `lib/chat-agent.js` | Executor now routes through canonical ToolRuntime (was a raw `TOOLS.invoke` bypassing schema/guardrails/path-security/approvals — the "direct effectful path" hole); capsule resolved once per chat turn and threaded to loop + executor; `steeringBlocked`/`capsuleId` surfaced in the return |
| `unified_api.js` | SSE chat endpoint forwards `steering` / `steering-blocked` events + capsuleId on tool events; JSON chat endpoint returns `capsuleId` + steering-block errors; new `/api/approvals/*` routes (queue/pending/get/approve/deny + `approval.resolved` broadcast); new `/api/session/persist/*` routes (suspend/resume/fork/list) |
| `services/swarm/coordinator.js` | S9: every completed subtask registers its output with swarm-verify (per mission:subtask; distinct agents accumulate, same agent overwrites); S10: each mission creates a team with role-per-subtask + declared handoffs to synthesis, handoff recorded on completion |
| `lib/steering-registry.js` | Donor-machine absolute ROOT → relative; registry path → the real showcase (`apps/web/public/showcase/`); `implemented` now requires the probe file to EXIST (was `!!path` — declared ≠ implemented); probes run as `node --test` suites |
| `lib/per-reply-supervisor.js` | Honesty labels: `supervisionMode: 'planning-only'`, `executedBy: 'agent-loop'`; docstring states pillars are not materialized here (no processes, no leases, costMs 0) |
| `lib/remote-approvals.js` | Hardcoded `E:/god folder/...` ROOT → `path.resolve(__dirname, '..')` |
| `bin/purpclaw.js` | `registry update` inline fallback tolerates the absent `agents/` dir (was ENOENT crash); **`skills/luno-gemini-live-voice` deleted, `skills/luno-human-conversation` installed**; index rebuilt from disk truth: **380 skills** (stale index claimed 139) |
| `apps/web/public/showcase/steering-registry.json` | Regenerated FROM REAL PROBE RUNS: 8/16 implemented + PASS (S2 S4 S6 S9 S10 S12 S13 S14), 8/16 honestly UNIMPLEMENTED — replaces prior PASS claims on probe files that do not exist in this tree |

## Files added
- `lib/steering-sources.js` — real source discovery: checksums (SHA-256) canonical law files, loads `.steering/` JSON records, honours validFrom/validUntil/supersedes; parse failures reported, never silent
- `lib/steering-middleware.js` — the single steering seam: `resolveForTurn` / `gateTool` / `completionBlocked` / `preamble`
- `.steering/workspace.json` — first live workspace records (receipts, scoped staging, no threshold cheating, no secret output)
- `tests/steering/test-live-turn.js` — 6 tests
- `tests/steering/test-s-modules.js` — 8 tests
- `docs/architecture/PURPCLAW_ONE_RUNTIME_ARCHITECTURE.md` — launcher → runtime → supervisor → gateway → surfaces architecture (pasted contract, now in-repo)
- `docs/architecture/PURPCLAW_SURFACE_PARITY_CONTRACT.md` — `purpclaw.surface-parity.v1`: capability IDs, 8 surface states, 15 parity invariants
- `skills/luno-human-conversation/SKILL.md`

## Commands executed (material)
- `node --check` on every edited file → OK
- `node --test tests/cli/test_cli.js tests/steering/test-live-turn.js tests/steering/test-s-modules.js` → **24/24 pass**
- Registry rebuild + `runAll()` real probe execution → 8/16 PASS, showcase JSON regenerated from those runs
- Live middleware probe: capsule `cap_6a75b57a`, 12 active rules (8 built-in + 4 discovered workspace records at authority 700, checksummed), `format_disk` → STEERING_DENIED, `read` → allowed
- Live ToolRuntime probes: non-operator `clipboard_write` → DEVICE_CONSENT_DENIED; operator-initiated → passes consent, denied by approval ladder (layers compose); remote approval round-trip approve + deny via queue

## Verification gate (plan P3)
- [x] a real turn emits capsuleId — middleware probe + SSE forwarding
- [x] the same capsule reaches execution context — chat-agent threads one capsule to loop + executor
- [x] an action conflicting with steering is blocked — `format_disk` STEERING_DENIED at the deterministic boundary; nothing written
- [x] unresolved steering conflict prevents task DONE — equal-authority tie test → `steering-blocked`
- [x] expiry and supersession work — validUntil/validFrom/supersedes test
- [x] registry JSON is produced from real probes — `runAll()` output, 8/16 PASS
- [x] every retained S-module has a production call site and test — S4 agent-loop, S6 ToolRuntime, S9/S10 coordinator, S12 unified_api, S13 ToolRuntime + unified_api, S14 ToolRuntime (S0/S1/S3/S5/S7/S8/S11/S15 remain UNIMPLEMENTED in the honest registry — no false claims retained)

## Architectural decisions
1. Prompt is advisory, tool code is enforcement: the preamble shows the model the law; `gateTool` decides at dispatch. Steering failure never breaks the loop (report + continue ungated).
2. One seam (`steering-middleware`), two enforcement points (loop gate pre-event, ToolRuntime gate post-path-security) — chat-agent's raw-invoke bypass was closed, not duplicated.
3. Triage never weakens escalation: HIGH_STAKES destructive always escalates regardless of approval history; triage errors fall through to normal approval.
4. Remote approvals are explicit opt-in (`remoteApprovals: true`) — headless paths keep instant-deny; no silent blocking on a queue nobody watches.
5. S9 registers per (mission, subtask) — the module's semantic (compare outputs from *different* agents on the same task) is preserved; same-agent retries overwrite.
6. Registry honesty: `implemented` requires an existing probe file; verdicts come only from executed runs.

## Known remaining (tracked in later phases)
- S0/S1/S3/S5/S7/S8/S11/S15 have no probes in this tree — honestly UNIMPLEMENTED; S1 lifecycle (PreCompact/PostCompact/Error delivery) is Phase 4 work
- Live coordinator round-trip under the new S9/S10 wiring exercises at next boot check (P4 re-runs harness; wiring is try/catch-failure-tolerant so the graph runner is unaffected if the modules are absent)
- Capsule is resolved per turn, not yet cached per session across surfaces — belongs with the one-runtime session contract

## Commit
SHA: see `git log --grep='phase3: enforce steering' -1` (authoritative SHAs collected in the final finish-line receipt)
