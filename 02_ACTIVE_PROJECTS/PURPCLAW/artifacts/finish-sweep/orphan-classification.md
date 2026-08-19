# lib/commands/ Orphan Classification — 2026-08-18 (Phase 2)

Decision list per the NO-DEAD-CODE / rewrite-not-archive rules. Every module
in lib/commands/ has exactly one verdict. Registry: lib/cli/registry.js.

Totals: 96 modules | 79 WIRED (dispatch via registry) | 17 classified below.

| Module | Verdict | Evidence / next action |
|---|---|---|
| action | NON_COMMAND | argument-parsing + action surface helper (no user-facing run semantics) |
| app-cmd | NON_COMMAND | bin switch helper by its own header (“App command handler for bin/purpclaw.js switch”) |
| bigboss | MERGED | self-wired: registers into the ask command in-chat slash handler (ask.js SLASH_COMMANDS) |
| commit | MERGED | switch routes commit/review/find through the claudecode module with [command, ...args]; standalone modules are alternate impls — fold richer bits into claudecode.js in a later batch |
| eval-auto-fix | MERGED | autofix-pr module is the wired surface; eval-auto-fix is its eval variant — merge there |
| find | MERGED | see commit |
| help | MERGED | superseded: help is now registry-driven in bin/purpclaw.js; module help.js is a router-driven alternate — delete in P5 if no require() consumers |
| init | MERGED | setup/onboard modules are the wired first-run surfaces; init.js is a third variant — merge or delete in P5 |
| loop | MERGED | mode toggle consumed by ask/harness loop config, not a user command |
| memory | MERGED | inline cmdMemory is the live surface; module is the migration target — flip to module dispatch in a later batch |
| model | MERGED | inline cmdModel is live; migrate to module next batch |
| plan | MERGED | inline cmdPlan (deterministic scaffold) is live; lib plan.js is the richer LLM planner — flip in a later batch after checkpoint contract check |
| ponytail | ARCHIVED | routes through OmniCode tool module — external platform dep not present in this repo; archived until OmniCode ships |
| review-pr | MERGED | see commit |
| skills | MERGED | inline cmdSkillGraph is live (skills alias); migrate next batch |
| team | MERGED | inline cmdTeam is live; module team.js covers formation — verify overlap then migrate |
| training | MERGED | inline cmdTrainingFeedback is live; migrate next batch |

## WIRED (79)

apply-diff, architecture, ask, autofix-pr, automate, autoresearch, awaken, browser, buddy, bughunt, business, capabilities, claudecode, code, cognition, completion, council, crew, ctx-viz, deploy, desktop, drift, eval, evolve, feature, feedback, gc, grow, harness, harvest, heal, hivemind, hooks, identity, init-project, intelligence, liveforge, llm, marketplace, mcp, mycelium, next, onboard, open, oracle, overview, parity, permissions, plugin, pocket, pr, provider, registry-audit, release, remote, remotion, repomap, roster, safe-start, safe-stop, sandbox, schedule, secrets, services, setup, skill-discovery, smoke, spinebus, stats, telemetry, teleport, thringlets, tour, vault, watch, weather, workers, workflow, worktree
