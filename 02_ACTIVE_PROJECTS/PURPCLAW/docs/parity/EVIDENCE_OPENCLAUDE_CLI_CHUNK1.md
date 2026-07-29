# EVIDENCE: OpenClaude CLI Parity — Chunk 1

**Date:** 2026-07-29
**Authority:** [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md) — the sole parity authority.
This file is evidence only; it defines nothing.
**Status:** 6 of 7 capabilities WORKING, 1 NOT IMPLEMENTED (GitHub Models onboarding).
**Code commit:** `5259be0` (+ `fd5af98` for the repo-map prompt injection in `lib/agent-loop.js`).

> This document replaces an earlier revision of itself that was written before
> verification finished. Three of that revision's claims were disproved by live
> execution and are corrected below (see *Corrections*).

---

## Files Changed

| File | State | Purpose |
|------|-------|---------|
| `bin/purpclaw.js` | modified | `provider` dispatch case; `bg`/`ps`/`kill`/`attach` wiring; `logs` job routing; `--repo-map`/`--no-repo-map`; `--provider-env-file` strip |
| `lib/commands/provider.js` | new | summary, list, save, load, delete, test, wizard |
| `lib/commands/buddy.js` | new | hatch, set, name, mute, unmute, list, status |
| `lib/commands/repomap.js` | new | repomap inspection command |
| `lib/repo-mapper.js` | new | reference-graph repo mapper |
| `lib/feature-parity.js` | new | parity registry — 5 CLI targets + 9 core targets |
| `lib/runtime/provider-config.js` | modified | `OPENCLAUDE_CONFIG_DIR` honoured for the active config path |
| `lib/agent-loop.js` | modified | `_repoMapBlock()` — real repo-map injection into the system prompt |

`lib/agent-loop.js` is co-owned with the concurrent Wave 1 runtime work; its
Chunk 1 hunk rode along in commit `fd5af98`.

---

## Defects found and fixed during recovery

The previous agent's files were syntactically valid but several capabilities did
not execute. Every one below was reproduced before being fixed.

| # | Defect | Effect | Fix |
|---|--------|--------|-----|
| 1 | `provider` had no `case` in the `bin/purpclaw.js` dispatch switch | `purpclaw provider list` fell through to "Treating as task" and tried to reach the orchestrator | added `case 'provider':` |
| 2 | `lib/repo-mapper.js` did `require('glob')`; `glob` is not installed and `globSync` was never used | `purpclaw repomap` died with *"command 'repomap' not found — lib/commands/repomap.js does not exist"* (`loadCmd` mislabels a nested `MODULE_NOT_FOUND`) | deleted the dead import |
| 3 | repo map was never injected into any prompt — `lib/repo-mapper.js` was referenced only by its own command | `REPO_MAP=1` did nothing | added `_repoMapBlock()` in `lib/agent-loop.js`, cached per cwd |
| 4 | `buddy.js` `cmdMute` referenced undefined `muted` | `buddy mute` / `buddy unmute` threw `ReferenceError` | `mute` |
| 5 | `case 'kill'` / `case 'attach'` passed `args.slice(1)`, but `args` already excludes the command word | `purpclaw kill <id>` silently dropped the job id | pass `args` |
| 6 | top-level `logs` went only to PM2 | `purpclaw logs <job>` could not read a bg job | `cmdLogs` routes to `cmdBg` only when `agent_work/bg-sessions/<id>.json` exists; every other name still goes to PM2 |
| 7 | `ps` checked `d.done` before `d.killed`; `kill` left `running: true` | a killed job displayed as `done` with contradictory metadata | reordered; `kill` now sets `running:false, status:'killed'` |
| 8 | `provider.js` `cmdTest`/`cmdWizard` read `ctx.col.green` where `ctx.col` is a **function** | crash whenever those paths ran | single `painter(ctx)` helper |
| 9 | wizard printed `${log(finalName)}` — `log` returns `undefined` | "Profile 'undefined' saved" | print, don't interpolate |
| 10 | `OPENCLAUDE_CONFIG_DIR` moved the profiles dir but not the active config | `provider load` wrote the user's real `~/.purpclaw/provider-config.json` even under a test config dir | `configPath()` honours `OPENCLAUDE_CONFIG_DIR` |
| 11 | parity registry proved subcommands with `type: 'file'` | claimed 8 bg subcommands and a `provider` command purely because `bin/purpclaw.js` exists — while `provider` was unwired (#1) | new `contains` check type asserts the wiring |
| 12 | `provider load <missing>` printed "PROFILE ACTIVATED" then "PROFILE NOT FOUND" | misleading | header moved after the lookup |

---

## Commands Executed

### Syntax
```
node --check bin/purpclaw.js           OK
node --check lib/commands/provider.js  OK
node --check lib/commands/buddy.js     OK
node --check lib/commands/repomap.js   OK
node --check lib/repo-mapper.js        OK
node --check lib/feature-parity.js     OK
```

### Exit codes
```
purpclaw provider list  -> exit 0
purpclaw buddy list     -> exit 0
purpclaw bg ps          -> exit 0
purpclaw ps             -> exit 0
purpclaw repomap        -> exit 0
purpclaw parity --json  -> exit 0
```

### `provider` lifecycle (temp config dir, user config untouched)
```
$ export OPENCLAUDE_CONFIG_DIR=<scratchpad>/cfg
$ purpclaw provider save chunk1test
  PROFILE SAVED
Profile 'chunk1test' saved to:
  <scratchpad>\cfg\profiles\chunk1test.json
$ purpclaw provider list
chunk1test  (0 lane(s))
$ purpclaw provider load chunk1test
Profile 'chunk1test' is now active.
$ purpclaw provider load nope
  PROFILE NOT FOUND
Profile 'nope' not found. Available: chunk1test
$ purpclaw provider delete chunk1test
'chunk1test' removed.
$ purpclaw provider delete chunk1test
Profile 'chunk1test' does not exist.
$ purpclaw provider list
No profiles saved. Run: purpclaw provider save <name>
$ purpclaw provider test bogusprovider
  Failed: Unknown provider 'bogusprovider'
```

### `--provider-env-file` (loading + arg removal + no real-config writes, one test)
`<scratchpad>/cfgdir.env`:
```
# temp config
OPENCLAUDE_CONFIG_DIR=<scratchpad>/cfg
```
```
$ purpclaw --provider-env-file <scratchpad>/cfgdir.env provider
Config dir : <scratchpad>/cfg
Profiles   : (none)
Current lane overrides: <scratchpad>\cfg\provider-config.json
```
The command ran as `provider` (not as the flag or the path), which proves both
the flag and its value were removed from the command arguments; and the variable
the file supplied is what redirected the config dir, which proves it loaded.

Malformed-line handling, same mechanism:
```
# comment line
PURPCLAW_CHUNK1_PROBE=hello-chunk1
MALFORMED LINE WITHOUT EQUALS
=novalue
QUOTED_VAL="quoted-ok"
```
```
$ purpclaw --provider-env-file <scratchpad>/test.env buddy list
  [purpclaw] loaded 2 env var(s) from <scratchpad>/test.env
  ⚔  AVAILABLE HEROES
```
2 of 5 lines loaded — comment, equals-less line and empty key all skipped, no
throw. Only the count is logged, never a value. A missing file is swallowed by
the surrounding `try` and the command proceeds. Existing variables are preserved:
the loader only assigns when `!(k in process.env)`.

### `buddy`
```
$ purpclaw buddy list
  ⚔  AVAILABLE HEROES
  robinhood  → duck
  kaio       → dragon
  strawhat   → axolotl
  merlin     → owl
  kage       → cat
  ember      → dragon
  corsair    → octopus
  (animation unavailable: width 80 < 100 cols)

$ purpclaw buddy mute
  Companion muted.
$ purpclaw buddy unmute
  Companion unmuted.
$ purpclaw buddy set bogus
Usage: purpclaw buddy set <hero>
Available heroes: robinhood, kaio, strawhat, merlin, kage, ember, corsair
$ purpclaw buddy status
  Name:    BuddyTest
  Species: duck
  Hero:    robinhood
  Muted:   no
```
`canAnimate()` guard matrix, evaluated directly:
```
cols=200 motion=off -> {"ok":true}
cols=200 motion=1   -> {"ok":false,"reason":"prefersReducedMotion"}
cols=80  motion=off -> {"ok":false,"reason":"width 80 < 100 cols"}
```

### `repomap`
```
$ purpclaw repomap
  REPO MAP
  Root: E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW
  Tokens: ~1428 (budget: 2048)
## Repo Map
### app\api\cmd
- app/api/cmd/_invoke.ts ```score:151``` ██████████
### lib
- lib/llm-provider.js ```score:34``` ██████████
...
_Generated by PurpClaw repo-mapper · 608 files ranked · ~2058 tokens_
  Auto-inject: OFF (set REPO_MAP=1 to enable)

$ purpclaw repomap --tokens=400
  Tokens: ~326 (budget: 400)
```

Prompt injection proved live, not assumed:
```
REPO_MAP=1     -> prompt contains Repo Map: true   (prompt length 100684)
REPO_MAP unset -> prompt contains Repo Map: false
repoMap:false  -> prompt contains Repo Map: false
```

### Background sessions — end to end
```
$ purpclaw bg "print the word chunk1ok"
  BACKGROUND DISPATCHED
  ✔  Job ID : bg-1785342179816
  ✔  PID   : 11136
  ✔  Log   : ...\agent_work\bg-sessions\bg-1785342179816.log

$ cat agent_work/bg-sessions/bg-1785342179816.json
{ "id": "bg-1785342179816", "task": "print the word chunk1ok",
  "dispatchedAt": "2026-07-29T16:22:59.835Z",
  "done": true, "running": false, "killed": false,
  "pid": 11136, "exitCode": 1, "finishedAt": "2026-07-29T16:23:01.050Z" }

$ purpclaw ps
  bg-1785342179816  done  print the word chunk1ok

$ purpclaw logs bg-1785342179816          # routed to the bg job, not PM2
  ⚡ PURPCLAW RUN
  Task: print the word chunk1ok
  [X] Orchestrator not reachable [port=7784]. Run `purpclaw start` first.

$ purpclaw logs bg-1785342179816 -f
  [Following — Ctrl+C to stop]
  [Job finished]                          # terminates on completion, no hang

$ purpclaw attach bg-1785342179816        # replays a finished job
  ⚡ PURPCLAW RUN
  Task: print the word chunk1ok

$ purpclaw logs some-service-not-a-bg-job # PM2 path preserved
[child-registry] error in pm2-logs: spawn pm2 ENOENT
  [X] PM2 not found. Install: npm install -g pm2
```
PID and completion state update correctly: `pid` at dispatch, then
`done/running/exitCode/finishedAt` from the child's `exit` handler. `exitCode: 1`
is the *job* failing because the orchestrator is not running — the bg machinery
recorded it faithfully.

Kill, against a real live process:
```
$ purpclaw ps
  bg-1785342282766  running  chunk1 kill probe 2
$ purpclaw kill bg-1785342282766
  Job bg-1785342282766 marked as killed.
$ purpclaw ps
  bg-1785342282766  killed  chunk1 kill probe 2
alive after kill? false
```
Argument handling:
```
$ purpclaw kill                       -> Usage: purpclaw kill <jobId>
$ purpclaw kill bg-does-not-exist     -> Job not found: bg-does-not-exist
$ purpclaw attach                     -> Usage: purpclaw attach <jobId>
```

### Feature parity registry
```
TARGETS total: 14 | CLI: 5 | ids unique: 14
[LIVE] cli-parity-provider      (8/8 checks live)
[LIVE] cli-parity-buddy         (9/9 checks live)
[LIVE] cli-parity-repomap       (5/5 checks live)
[LIVE] cli-parity-bg-sessions   (9/9 checks live)
[LIVE] cli-parity-env-file      (2/2 checks live)
Totals: {"live":7,"partial":7,"missing":0,"total":14,
         "checks":{"live":77,"partial":6,"missing":12,"total":95}}
```
14 unique ids = 5 CLI + 9 core, each present exactly once; no recursive wrappers,
no duplicate or orphan blocks. `module.exports.TARGETS` is
`CLI_PARITY_TARGETS.concat(TARGETS)`, so it carries both sets.
Check types used: `file`, `contains`, `service`, `countDirsWithFile`, `missing` —
all five have an evaluator branch. `target` also has an evaluator and is
currently unused.

### Repository gates
```
$ npm run truth:check
truth-manifest.json + AGENT_TRUTH_AUDIT.md written — 153 unique agents,
153 executor-backed, 515 tools mapped, 22 providers
TRUTH DRIFT:
 - board vs showcase drift on tools.total_mapped: board=513 showcase=515
RC=1
```
```
$ npm run verify:harness
advanced harness contracts: OK          output contract: OK
A2A protocol: OK                        gateway tracing: OK
run context and usage limits: OK        scoped state/artifact/instructions: OK
typed SDK stream and durable invocations: OK   delegation lifecycle: OK
team manager: OK                        eval manager: OK
index, retrieval and typed components: OK      program optimizer/team training: OK
agent component: OK                     agent gateway contract: OK
gateway server: OK                      session repository: OK
tool runtime: OK
TypeError: Cannot read properties of null (reading 'id')
    at ToolRuntime.invoke (E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\lib\tool-runtime.js:176:96)
    at async E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\scripts\test-permission-manager.js:1:631
RC=1
```

---

## Capability Status

| # | Capability | Status |
|---|-----------|--------|
| 1 | Provider management | **WORKING** — summary/list/save/load/delete/test/wizard, `OPENCLAUDE_CONFIG_DIR`, no key ever printed |
| 2 | GitHub Models onboarding | **NOT IMPLEMENTED** |
| 3 | Buddy command | **WORKING** — list/hatch/set/name/mute/unmute/status, both fallbacks |
| 4 | Repository map | **WORKING** — command, `REPO_MAP`, `REPO_MAP_TOKENS`, `--tokens=N`, `--repo-map`/`--no-repo-map`, injection genuinely wired |
| 5 | Background sessions | **WORKING** — dispatch/ps/logs/logs -f/kill/attach, metadata + PID + completion correct, `logs` collision resolved |
| 6 | Provider environment file | **WORKING** — loads, strips args, preserves existing vars, tolerates missing/malformed, logs no values |
| 7 | Feature parity registry | **WORKING** — 5 CLI + 9 core, unique, both exported, every check type evaluable |

### 2 — GitHub Models onboarding: why NOT IMPLEMENTED
- `lib/commands/onboard.js` mtime is **2026-06-19**, untouched by this work.
- It contains no `github`, `oauth`, `device_code` or `GITHUB` string at all.
- `onboard-github` does not appear anywhere in `lib/` or `bin/`.
- GitHub Models already exists as a **token** provider (`lib/commands/setup.js`
  `github-models` → `GITHUB_TOKEN`; `lib/llm-provider.js`
  `https://models.inference.ai.azure.com`). Its documented auth is a PAT with
  `models:read`, not a device/OAuth flow.
- No OAuth client id exists in this repository. A device flow needs one; putting
  an invented id in would ship a login that cannot succeed. The brief forbids
  inventing a fake successful login, so nothing was written.

---

## Known Limitations

1. **`buddy hatch` and `buddy name` were not executed.** `hatch` is interactive
   (two `readline` prompts) and both overwrite the user's real Mochi state, which
   has no config-dir override. The shared `loadMochi`/`saveMochi` write path was
   exercised by the `mute` → `unmute` round trip instead.
2. **`provider test <real provider>` and `provider wizard` were not run against a
   live provider.** Both make outbound model calls; the brief forbids paid API
   calls to prove parsing. The dispatch, validation and error paths were proved
   with `provider test bogusprovider`.
3. **Two different token numbers appear in `repomap` output** (`~1428` header vs
   `~2058` footer). The header measures the finished string; the footer is the
   incremental counter the budget loop uses. Cosmetic; the budget itself is
   enforced by the loop, as `--tokens=400 → ~326` shows.
4. **Repo map is cached per cwd for the process lifetime.** A long-lived agent
   process will not see files added after the first injection. Restart to refresh.
5. **`bg` is not fully detached.** The child is neither `detached` nor `unref`'d,
   so the dispatching CLI process stays alive until the job ends. This is what
   makes the `exit` handler fire and the completion status update; making it truly
   fire-and-forget would need a different completion-recording mechanism.
6. **`npm run truth:check` fails: `board=513 showcase=515` tool drift.**
   Pre-existing and unrelated — Chunk 1 registers no tools. Fix is `npm run truth`.
7. **`npm run verify:harness` fails at `test-permission-manager.js`** —
   `TypeError: Cannot read properties of null (reading 'id')` at
   `lib/tool-runtime.js:176`, where `CHECKPOINTS.create()` returned `null` and
   `checkpoint.id` is then read. `lib/tool-runtime.js` was last modified
   **2026-07-22**, a week before this work, and Chunk 1 touches no checkpoint or
   permission code. 18 harness scripts pass before it. Left unrepaired per the
   scope addendum. Note this is *not* the DatabaseSync defect — the same run
   reports `session repository: OK`.

---

## Skipped Tests

| Test | Reason |
|------|--------|
| Real GitHub device/OAuth login | No OAuth client id exists in the repo, and the flow itself is not implemented. Automating it would require the user's real GitHub credentials. |
| `provider test` / `provider wizard` against a live provider | Would make paid external model calls purely to prove command parsing. |
| `buddy hatch` | Interactive `readline` prompts, and it overwrites the user's real companion state. |

---

## Corrections to the previous revision of this file

1. It said `repo-mapper.js` "requires `glob` … works via CLI because the full
   environment is set up; `purpclaw repomap` from the CLI works correctly."
   `purpclaw repomap` did **not** work — it exited with
   *"command 'repomap' not found"*. The `glob` import was dead code and is gone.
2. It said the logs collision was "resolved … separate command tree, no
   conflict." That was the collision, not a resolution: `purpclaw logs <job>` did
   not work. It now does, and the PM2 path is unchanged.
3. It listed the supported check types without `contains`, and counted "10 core
   targets" where there are 9.
4. It attributed the `verify:harness` failure to `DatabaseSync … trace-manager.js`.
   The current failure is the `tool-runtime.js:176` null checkpoint above.

---

## Verifier Result

No separate verification agent was spawned. Verification is the live command
execution transcribed above: every capability marked WORKING has its own real
output in this file, and every one of the 12 defects was reproduced before being
fixed and re-run after.

**Not a PASS on the repository gates:** `npm run truth:check` and
`npm run verify:harness` both exit 1, for the two pre-existing reasons in
*Known Limitations* 6 and 7. Neither is caused by Chunk 1, and neither was
repaired, per the scope addendum.
