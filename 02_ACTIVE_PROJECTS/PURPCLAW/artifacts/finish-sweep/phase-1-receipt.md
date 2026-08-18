# Phase 1 Receipt — Stabilize

Date: 2026-08-18 · Sweep: finish-line-2026-08-18 · Baseline: `baseline.md`

## Files changed (8)
| File | Change |
|---|---|
| `ecosystem.config.js` | 5 dead script paths repaired; cognitive → `python -m` module form; +3 entries (coordinator, cowork-overlay, tts-gateway) |
| `bin/purpclaw.js` | 7 duplicate case labels removed; shadowed `cmdStatus` (~47 lines) deleted; banner version now reads package.json |
| `package.json` | `"undefined": "^0.1.0"` dependency removed |
| `package-lock.json` | `undefined` package entries surgically removed |
| `lib/commands/safe-start.js` | coordinator → CORE_SERVICES; cowork-overlay + tts-gateway → DARK_SERVICES |
| `services/cognitive/gateway.js` | spine spawn → `-m services.cognitive.spine`, cwd repo root |
| `agent_tower.js` | agent-loop event handling fixed (tool-call/tool-result/turn-done); output = stripped final answer with tool-digest fallback; spawn return contract carries output/toolCalls/provider/model |
| `services/swarm/coordinator.js` | sandbox: EOL-only churn detection; conflict preserves commit + reports via `mission.sandboxResult` instead of failing mission |

## Files added
- `artifacts/finish-sweep/baseline.md` + `baseline-git-status.txt` + `baseline-cli-help.txt` (preflight)
- `artifacts/finish-sweep/probe-minimax-tools.js` (protocol probe; no secrets)
- `artifacts/finish-sweep/phase-1-receipt.md` (this file)
- `CHANGELOG.md` entry 2026-08-18

## Files deleted
- `node_modules/undefined/` (installed package named "undefined"; nothing requires it)
- ~47 lines dead `cmdStatus` + 7 dead case labels inside `bin/purpclaw.js`

## Commands executed (material)
- `node bin/purpclaw.js safe-start --core` → 11/12 stable, cognitive crash-loop caught by cascade guard
- `pm2 delete purpclaw-cognitive` + `safe-start purpclaw-cognitive purpclaw-nextjs purpclaw-coordinator` → 3/3
- `pm2 restart purpclaw-tower purpclaw-coordinator` (×2 after fixes)
- `node --check` on every edited JS file → OK
- Duplicate-case grep → zero duplicates remaining
- `node -e` ecosystem validation → 26 apps, 0 missing scripts

## Tests executed
| Test | Result |
|---|---|
| `node --test tests/coordinator_live_boot/test_boot.js` (run 1, pre-fix) | 7/8 — T08 FAIL (ECONNRESET surface, real cause output plumbing) |
| run 2 (after tower event fix) | 8/8 but T08 via "acceptable error" branch (output-too-short persisted) |
| run 3 (after spawn return fix) | 8/8 but T08 via "acceptable error" branch (sandbox cherry-pick conflict) |
| run 4 (after sandbox contract fix) | **8/8, T08 genuine pass: `status=completed`, full round-trip** |
| agent-loop direct probe (real `runAgent`, real MiniMax) | tool call `ls` executed, 846-char answer, no 400 |
| MiniMax two-turn protocol probe | turn-2 follow-up accepted (assistant-content + user tool-result form works) |

## Known remaining failures (out of Phase 1 scope, tracked in later phases)
- `tests/root-misplaced/` 49 broken-require test files → Phase 4
- Dead CI workflow (`ci:control` script absent) → Phase 4
- `certification.json` "CERTIFIED" verdict with doc-grep gates → Phase 4
- `app/` vs `apps/web/app/` duplicate Next.js trees → Phase 5
- Dual lockfiles (package-lock.json + pnpm-lock.yaml) → Phase 5
- Historical MiniMax 400 "tool result's tool id() not found" seen in older tower logs did not reproduce post-fix; if it recurs, instrument `lib/agent-loop.js` message assembly before changing validation

## Architectural decisions
1. `search` keeps registry-search semantics (current behavior); `websearch` remains the explicit web alias.
2. `release` keeps `lib/commands/release.js` (build/show artifact); inline Ed25519 signing `cmdRelease` is now uncalled — to be MERGED into the module in Phase 2 orphan resolution.
3. `roster` keeps team-roster semantics; `lib/commands/roster.js` (tower-vs-personas audit) gets its own command name in Phase 2.
4. Sandbox merge conflicts preserve work as a git commit and report honestly (`sandboxResult`) rather than failing validated missions.
5. Nothing retired; all services recovered via `services/` relocations.

## Verification gate
- [x] zero PM2 dead-path launch errors (26/26 resolve; 13/13 core online)
- [x] coordinator live round-trip (T08 genuine completion)
- [x] `node --check bin/purpclaw.js`
- [x] no duplicate command cases (grep)
- [x] no `"undefined"` dependency
- [x] retained Python services point to real files
- [x] no retirements to record (CHANGELOG notes this)

## Commit
SHA: (filled at commit time)
