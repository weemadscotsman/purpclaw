# PURPCLAW Repair Loop

> Permanent working loop for both Mavis sessions and any future agent on this stack. Adopted 2026-06-13.

---

## Core rule

**No agent may claim it performed work unless it personally performed that work in the current session.**

If an agent finds changes already present in the worktree, it must say:

> "This work exists in the tree. I verified it. I did not author it."

What is not acceptable: "I did this," when the agent only discovered it.

## Attribution rule

Every cycle must separate four things:

1. Work I personally performed.
2. Work I found already present.
3. Work I verified as good.
4. Work I rejected, deferred, or marked risky.

If authorship is unclear, say so. No ghost ownership. No fake completion claims. No retrospective patch fiction.

## Baseline rule

Before any repair pass, establish the current baseline:

- Current branch / worktree.
- Current diff (`git status`, `git diff --stat`).
- Current changed files.
- Current audit documents in `STRESS/`.
- Current known blockers.
- Current running service status (PM2 / curl smoke).
- Current smoke-test result.

No agent should patch from memory alone. If the baseline is unclear, the first job is to make it clear.

## Audit rule

Each audit finding must include:

- What is broken.
- Where it appears (file:line).
- Why it matters.
- How severe it is.
- Whether it is confirmed or suspected.
- Whether it is safe to patch now.

Severity:

- **P0** — security or critical functional blocker.
- **P1** — important functionality or reliability problem.
- **P2** — cleanup, polish, type safety, design debt, future hardening.
- **P3** — nice-to-have.

P0 before P1. P1 before P2. Architecture cleanup never while critical runtime failures remain.

## Cross-check rule

Before patching, the second agent (or the same agent in a second pass) should cross-check the finding:

- Confirm the file exists.
- Confirm the reported behaviour exists.
- Confirm the proposed fix matches the actual code.
- Confirm the patch does not duplicate work already done.
- Confirm the fix does not conflict with another active worktree.

If a patch is already present, do not reapply it. Verify it.

## Plan rule

Every repair cycle needs a small plan before edits:

- Target issue.
- Files expected to change.
- Risk level.
- Test or smoke check.
- Rollback note.
- Stop condition.

No giant "fix everything" passes. A cycle should usually touch 1-5 files unless explicitly approved larger.

## Repair rule

- Small, reversible, tied to one audit finding.
- Don't mix unrelated work in one patch (security + UI redesign + type cleanup + architecture refactor).
- Don't delete large groups of files unless verified from multiple angles.
- Don't hide dead code by pretending it does not exist. Mark, archive, or schedule it.

## No-stub, no-removal default

**Nothing in the user's stack is to be stubbed, mocked, simmed, 501'd, or removed because the implementation looks fake.** This overrides the default "graceful absence" instinct for any feature that returns canned data, fabricates evidence, or has half-baked real work underneath.

When you find a feature that looks fake (canned responses, 200-OK stubs, evidence fabrication, dead narrate keys, "policy-adapter bypass" helpers), the repair is **one of**:

1. **Make it real** — actually implement the missing behavior, even if ugly.
2. **Mark it as planned work** — visible in the UI as a roadmap item, not hidden behind a fake 200.
3. **Wire it to something that does work** — even partial, even ugly, but real.

The forbidden moves in this stack:

- 501 a route because the implementation is half-baked. **Implement it.**
- Remove a UI tab because the underlying API returns canned data. **Connect the tab to real state.**
- Delete an "evidence fabrication backdoor" helper without rewriting the test that depends on it. **Rewrite the test to do real work, then remove the helper.**
- Treat dead narrate keys as "delete the matcher." **Fix the publisher to emit the right event name.**
- Treat "cosplay" UI panels as "remove them." **Connect them to live data.**

If a feature is too big to implement in one cycle, mark it as a roadmap item visibly, not as a 200 OK stub. The user will know what's planned and what's shipped. Pretending shipped things are gone is worse than admitting they're planned.

## Execution rule

After repair, verify the changed behaviour. Verification can include:

- Build check (`npm run build`).
- Route check (curl smoke against the patched endpoint).
- Service start (`pm2 restart` + log check).
- Diff review.
- Manual explanation if automated tests are unavailable.

A fix is **not closed** just because a file changed. A fix is only closed when the expected behaviour has been verified, OR clearly marked as pending verification.

## Documentation rule

Every cycle must update the audit state. Docs must show:

- What was fixed.
- What was verified.
- What remains open.
- What was deferred.
- What became stale because another patch closed it.

If a prior round closed an issue, older audit docs must be updated so they do not keep reporting it as open. Use wording like:

- "Provisionally closed pending smoke test."
- "Verified present in worktree, author unknown."
- "Confirmed fixed by external prior change."

## Round 3 / external work rule

Work that is already in the tree at session start is treated as:

- Real but externally authored, unless proven otherwise.
- Valid for adoption, because it was verified against the actual tree.
- **Not** claimable as authored by the current session.

Correct status text:

> "Round N changes exist, appear valid, and were verified. Authorship is unclear or external."

The next step is to update the audit docs to reflect that the patched issues appear closed. **Then run smoke tests** before marking them fully closed.

## Current milestone rule

The statement "all P0 security and P0 functional blockers are closed" should be treated carefully.

Correct phrasing:

> "P0 blockers appear patched and are provisionally closed pending smoke test."

Only after smoke tests pass should it become:

> "P0 blockers verified closed."

## Next-loop target rule

The next loop should not reopen already-patched P0 issues unless testing proves they failed. Focus on P1 items. Defer architecture debt.

Deferred architecture debt needs design-led sprints, not patch passes.

## Multi-session rule

Multiple agents / sessions may touch the same workspace. Every agent must assume the tree may change between turns.

- Before acting, check the diff.
- After acting, report exactly what changed.
- If unexpected changes appear, pause and verify instead of overwriting.
- Unexpected work: identify, attribute, adopt / reject / quarantine, update docs.

## Safety rule

No raw API keys in prompts, summaries, logs, docs, or patch notes. If keys appear, mark them exposed and rotate. Use env-var names only.

## UI truth rule

UI must show runtime truth, not decorative optimism. If a panel cannot prove live state, hide it, mark it simulated, or connect it. No fake service counts. No fake "online" states. No dashboard cosplay.

## Service truth rule

One canonical service truth source. All UI panels must agree. Distinguish between:

- Declared services.
- Live online services.
- Live offline services.
- Optional services.
- Missing services.

## Voice rule

When voice or TTS fails, the response must follow the voice diagnostic chain:

1. Chat response generated.
2. Text entered TTS queue.
3. TTS audio generated.
4. Audio file or stream exists.
5. Playback service received it.
6. Correct output device selected.
7. Windows / app mixer not muted.
8. UI speaking state updated.

No lore response should replace voice diagnostics unless the user explicitly asks for lore.

## Agent mode rule

If the user asks for repair / debug / fix / service / route / API / TTS / stream / runtime help, enter **Operational Debug Mode**:

- Solve the technical problem first.
- Avoid creative drift.
- Avoid unrelated scripts.
- Avoid fake certainty.
- Return the failure point and the repair action.

Creative flavour is allowed only after the technical answer is complete.

## Loop format

Each cycle should report in this format:

- **Cycle number.**
- **Baseline checked.**
- **Audit finding.**
- **Cross-check result.**
- **Plan.**
- **Files changed.**
- **Verification result.**
- **Status.**
- **Next recommended target.**

Keep it short enough to read. No walls of noise.

## Final operating principle

The stack should improve forever, but each loop must be finite, verified, and documented.

- No endless wandering.
- No giant mystery patches.
- No fake work.
- No ghost authorship.
- No dashboard lies.

Audit the truth. Cross-check the truth. Plan from the truth. Repair the truth. Verify the truth. Document the truth. Repeat.
