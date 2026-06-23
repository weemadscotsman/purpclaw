---
name: child-registry-no-spawn-leak
description: How PURPCLAW prevents the "infinite spawn cascade" — child process tracking, hard timeouts, no detached processes, no cmd /c start, no shell:true. Use this pattern when adding any new spawn in the runtime.
when_to_use: Adding any spawn or exec call to unified_api.js, bin/purpclaw.js, lib/commands/*.js, lib/xiaozhi_bridge.ts, or any other runtime file
---

# Child Registry — No More Spawn Leak (2026-06-06)

## The bug

Eddie reported his PC was being killed by runaway spawns — infinite
terminal windows, leaked detached cmd.exe processes, orphaned node
workers. Root cause was **two layers** of leaks that compounded:

**Layer 1 — bad spawn patterns** scattered across the codebase:
1. `spawn('cmd', ['/c', 'start', '""', url], { detached: true })` — opens a
   new terminal window and never tracks the child. The start builtin
   returns immediately; the child outlives the parent. Each call leaks
   one cmd.exe.
2. `spawn('node', ['-e', "...200+ lines..."], { shell: true })` — the
   giant template literal in `unified_api.js:1625` (the PURPCLAW
   pipeline). With `shell: true`, on Windows this became
   `cmd.exe /c node -e "..."` which spawned an additional cmd.exe and
   a node process. Each pipeline start leaked both.
3. `exec(\`start "" "${app}"\`, { shell: 'cmd.exe' })` — used by the
   `open_application`, `browser_open`, `play_music`, `speak` handlers.
   Same leak pattern.

**Layer 2 — the real trigger** (Eddie's actual frustration was the
upstream cause, not just the patterns): **Windows / git-bash munges
leading-slash args.** When the user runs `node bin/purpclaw.js open
foo`, bash on Windows interprets `cmd /c start "" foo` as opening the
path `foo` (which exists in the Git install dir → `C:/Program Files/
Git/usr/bin/foo` or wherever). Every UI launcher call hit a path that
existed somewhere, so `start` was called hundreds of times. Bash on
Windows resolves the "command" as a path; if the file exists, it
runs; if not, it tries to add `.exe`, `.bat`, etc. and run that. The
`detached: true` + missing process tracking meant each of those ran
forever.

Without Layer 1 fixes, Layer 2 was invisible. Without Layer 2 fixes,
new spawns would have re-introduced the leak. Both are required.

## The fix

`lib/child-registry.js` — single source of truth for all spawned
children. Every spawn in the runtime goes through `trackedSpawn()`.
Rules enforced:

- No `detached: true` — every child is a child of the parent. If the
  parent dies, the OS reaps the child.
- No `shell: true` (default). The only place that uses shell is the
  user-facing `cmd()` tool in unified_api.js, which is a documented
  escape hatch.
- `windowsHide: true` by default — no new console windows pop up.
- Hard timeout — every spawn has a `timeoutMs`. After that, the
  child gets `SIGTERM`, then `SIGKILL` after a 2s grace period.
- **Windows .cmd files**: `execSafe('pm2.cmd', [...])` fails with EINVAL because `.cmd` files need `shell: true`. Fix: use the underlying Node.js script directly via `execSafe(nodePath, [scriptPath, ...args])`. The bigboss.js PM2 resolver shows the pattern.
- Auto-cleanup — `SIGINT`, `SIGTERM`, `beforeExit`,
  `uncaughtException` all trigger `killAll()` which terminates every
  tracked child.
- `rundll32 url.dll,FileProtocolHandler <url>` replaces
  `cmd /c start <url>` for opening URLs. Does not spawn a console
  window. The default browser handler picks it up.

## Use it

```js
const { trackedSpawn, execSafe, installCleanup, list, killAll } =
  require('./lib/child-registry');

// At process startup, ONCE:
installCleanup();

// For any spawn:
const child = trackedSpawn('python', ['train.py', '--epochs', '1'], {
  tag: 'lora-train',
  cwd: 'E:/training',
  timeoutMs: 5 * 60_000,    // 5 min hard budget
  windowsHide: true,
  stdio: 'inherit',
});

// For shell commands:
const r = await execSafe('git', ['log', '--oneline'], { timeoutMs: 30_000 });
// → { ok, code, stdout, stderr }

// For diagnostics:
list(); // → [{ pid, tag, startedAt, ageMs, killed }, ...]

// For emergency:
killAll('SIGTERM'); // or 'SIGKILL' for hard stop
```

## Root cause: the Layer 2 trigger

The spawn cascade that killed Eddie's PC had TWO layers:

**Layer 1 — bad spawn patterns** (the leaks themselves):
- `spawn('cmd', ['/c', 'start', '""', url], { detached: true })` — opens new terminal window, never tracks the child
- `spawn('node', ['-e', \`...200+ lines...\`], { shell: true })` — on Windows becomes `cmd.exe /c node -e "..."`, adds another cmd.exe
- `exec(\`start "" "${app}"\`, { shell: 'cmd.exe' })` — leaks cmd.exe per call
- Child processes never cleaned up on parent exit

**Layer 2 — the real trigger** (what made the leaks compound to 50+ processes):
- **Windows / git-bash munges leading-slash args into file paths.**
- When the agent called `openBrowser("/somewhere")` via `cmd /c start "" /somewhere`, bash on Windows resolved `/somewhere` as a path relative to the current directory (e.g. `C:/Program Files/Git/usr/bin/somewhere`).
- If the path existed, `start` ran it. Multiple UI elements called `openBrowser` → each call spawned a new `cmd.exe` window.
- The `detached: true` + missing process tracking meant each of those ran forever.
- Even after the user killed the parent, the detached children survived.

Both layers are required for the fix. Without Layer 1 fixes (no detached, no cmd /c start), Layer 2 is invisible. Without Layer 2 awareness (track all children, kill on exit), new spawns re-introduce the leak.

See `references/full-sweep-methodology.md` — the systematic process for auditing all 11 files with spawn leaks, including the grep commands and classification table.

## Additional recovery patterns
See `references/port-collision-recovery.md` — how to detect and fix two services colliding on the same port (Python hardcoded port vs ecosystem.config.js expected port).

See `references/cognitive-cluster-wake.md` — surgeon-mode procedure for booting the 6-service cognitive cluster (memory, rules, modal, neuro, diagnostics, autodream) in dependency order, with health checks, 60s stay-alive verification, and an end-to-end integration proof.

## Next.js .next cache corruption (additional recovery recipe)

Symptom: WebUI goes from dark CRT theme to white page with black text after `npm run build` runs over `next dev`.

Recovery: `git checkout --` corrupted CSS/TSX files → `pm2 delete purpclaw-nextjs` → `taskkill /F /PID <zombie>` → `rm -rf .next` → fresh pm2 start → wait 20s → verify :3000→200.

Never run `npm run build` while `next dev` is running.

## Replacements

| old pattern | new pattern |
|---|---|
| `spawn('cmd', ['/c', 'start', '""', url], { detached: true })` | `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', url], { windowsHide: true, timeoutMs: 5_000 })` |
| `spawn('node', ['-e', \`...\`], { shell: true })` | Extract to a real file (`lib/workers/purp-worker.js`), spawn it with `trackedSpawn` |
| `exec(\`start chrome "url"\`, { shell: 'cmd.exe' })` | `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', url], ...)` |
| `exec(\`start "" "app.exe"\`, { shell: 'cmd.exe' })` | `trackedSpawn('app.exe', [], { ... })` |
| `exec(\`"${bat}" "${arg}"\`, { shell: 'cmd.exe' })` (TTS) | `trackedSpawn('powershell.exe', ['-NoProfile', ..., '-File', bat, arg], { windowsHide: true })` |
| `execAsync(command, { shell: 'cmd.exe' })` (generic tool) | `execSafe(command, [], { shell: 'cmd.exe', timeoutMs })` |
| `execAsync(\`type "${file}"\`, { shell: 'cmd.exe' })` | `fs.readFileSync(file, 'utf-8')` — no shell needed |
| `spawn('cmd', ['/c', 'start', '', arbitraryCommand], { detached: true })` | `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', arbitraryCommand], { timeoutMs: 10_000 })` — works for URLs, executables, and file paths |

## Don'ts

- Do NOT use `spawn(cmd, args, { detached: true })` — ever. If you need
  a long-lived process, write it to pm2. Don't detach from the registry.
- Do NOT use `exec('cmd /c ...')` — leaks cmd.exe windows.
- Do NOT use `shell: true` for arbitrary user commands inside API
  handlers — use `execSafe` which tracks and timeouts.
- Do NOT forget to call `installCleanup()` at the top of long-running
  processes (unified_api.js, agents). Without it, the SIGINT handler
  does not know to kill children.
- **⚠️ PITFALL: project docs may be wrong.** As of 2026-06-06, even
  `CLAUDE.md` recommended `spawn(cmd, args, { detached: true })` as the
  "correct" pattern. This was fixed. If you find docs recommending
  `detached: true`, `shell: true`, or `cmd /c start`, the docs are
  stale — fix them AND the spawn call. The single source of truth is
  `lib/child-registry.js` and this skill.

## Verification

### Quick audit (run after any spawn-related change)

Run the bundled audit script: `node scripts/spawn-audit.js` (in `child-registry-no-spawn-leak/scripts/`).

Or manually:

```bash
# Windows: confirm zero detached:true or shell:true outside child-registry itself
cd PURPCLAW_DIR
grep -rn 'detached:\s*true' --include='*.js' lib/ bin/ ./*.js | grep -v child-registry | grep -v '//'
# Expected: EMPTY (no matches)

grep -rn 'shell:\s*true' --include='*.js' lib/ bin/ ./*.js | grep -v child-registry | grep -v '//' | grep -v 'NEVER shell'
# Expected: EMPTY (no matches)

# Confirm all files parse
for f in bin/purpclaw.js boot.js launch_detached.js agent_tower.js \
  voice_bridge_7792.js screen-manager.js spinUpAgent.js \
  tmux-worktree-orchestrator.js voice_coordinator.js start_purpclaw.js purpclaw.js; do
  node -c "$f" && echo "$f OK" || echo "$f FAILED"
done
# Expected: all OK

# Confirm cognitive spine health (if running)
curl -s http://localhost:7880/cognitive/health | grep '"status":"healthy"'
```

### Live process check (Windows)

```powershell
# Count Python + Node + CMD processes
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'Name LIKE \"%python%\" OR Name LIKE \"%node%\" OR Name LIKE \"%cmd%\"' | Measure-Object | Select -ExpandProperty Count"
# Expected: single digits (normal runtime overhead)

# Show process tree to spot parent-child duplication
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'Name LIKE \"%python%\"' | Select ProcessId,ParentProcessId,CommandLine | Format-List"
```

### What "clean" looks like

- Zero `detached: true` in any spawn call outside child-registry.js
- Zero `shell: true` in any spawn call outside child-registry.js (except documented escape hatches)
- Zero `cmd.exe /c start` or `cmd /k` patterns
- All 11 instrumented files pass `node -c`
- Cognitive spine responds to `/cognitive/health` with all 6 modules healthy
- Process count stable (not growing) over 30s observation window

## Where it is wired (2026-06-06 — full deployment)

- `lib/child-registry.js` — the registry itself
- `lib/workers/purp-worker.js` — extracted from unified_api.js eval
- `unified_api.js:18-19` — `installCleanup()` called at startup
- `unified_api.js:763-770` — `cmd()` generic tool uses `execSafe`
- `unified_api.js:1514-1525` — `browser_open` uses trackedSpawn + rundll32
- `unified_api.js:1703-1716` — `open_application` uses trackedSpawn
- `unified_api.js:1724-1737` — `speak` uses trackedSpawn + powershell
- `unified_api.js:1632-1654` — purpProc pipeline spawns `purp-worker.js`
- `lib/commands/open.js:55-79` — `startService` uses trackedSpawn
- `lib/commands/open.js:87-119` — `openBrowser` no longer spawns cmd
- **bin/purpclaw.js** — ALL spawns replaced: pm2(), bg dispatch, boot, cmdLora, logs, chat, tui → trackedSpawn
- **boot.js** — spawnService + Next.js spawn → trackedSpawn + installCleanup
- **launch_detached.js** — 3 legacy services → trackedSpawn (no detached)
- **agent_tower.js** — Kimi CLI + fallback spawns → trackedSpawn + installCleanup
- **voice_bridge_7792.js** — 2x `cmd.exe /c start /min` → `rundll32 url.dll,FileProtocolHandler`
- **screen-manager.js** — `cmd /k` + detached + shell:true → `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', command])` — no cmd.exe wrapper at all
- **spinUpAgent.js** — OpenClaude spawn → trackedSpawn (no detached)
- **tmux-worktree-orchestrator.js** — worker spawn → trackedSpawn (no detached)
- **voice_coordinator.js** — `exec(cmd)` → trackedSpawn
- **start_purpclaw.js** — service spawn → trackedSpawn + installCleanup
- **purpclaw.js** (root) — `exec()` fn → trackedSpawn (no shell:true)

## Pre-audit methodology

Before assuming any file or folder is dead, see `references/codebase-archaeology.md`. This reference was written because the same mistake — skimming folder names and assuming disconnection — was made repeatedly in the session that deployed child-registry.js. The lesson: read the files, trace the imports, check the registry, then move. Never earlier.
- `lib/xiaozhi_bridge.ts` — removed 2026-06-06 (stale, voice modes exist separately)
- **launch_detached.js** — archived to `docs/legacy/` (self-marked LEGACY, replaced by PM2 via ecosystem.config.js)
- **start_purpclaw.sh** — archived to `docs/legacy/` (Kimmi-era, old ports, exposed API key, pre-unification)

## Related reference files

- `references/provider-unification-pattern.md` — pattern for removing hardcoded provider endpoints in favor of `llm-provider.js`. Covers the Kimi→provider-layer migration in agent_tower.js, digital_shaman.js, shaman_evaluator.js, and unified_api.js.
- `references/documentation-three-stories.md` — the "three eras" trap in codebase docs (dream/build/ship), the 4-folder solution (current/shipped/experimental/legacy), and the Built/Running/Integrated truth standard for every doc.
- `references/codebase-archaeology.md` — the core lesson "folder names lie, read every file before cutting." Includes the full audit checklist and common traps.
