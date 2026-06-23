# Full Sweep Methodology — Finding All Spawn Leaks

> Added: 2026-06-06. How the 11-file spawn cascade fix was discovered and applied.

## The Problem

A single `grep -rn 'detached: true'` misses most leaks. Dangerous patterns hide in:
- `require('child_process').exec(command)` with shell string
- `spawn('cmd.exe', ['/c', 'start', ...], { detached: true })` in voice/UI code
- `exec('start "" app.exe', { shell: 'cmd.exe' })` in TTS handlers
- Old `.sh` scripts that expose API keys and use dead ports
- Files that reference themselves in comments but the actual code is elsewhere

## Step 1: Run all five grep audits

```bash
cd PURPCLAW_DIR

# 1. detached: true
grep -rn 'detached:\s*true' --include='*.js' lib/ bin/ ./*.js ./*.py 2>/dev/null \
  | grep -v node_modules | grep -v child-registry

# 2. shell: true
grep -rn 'shell:\s*true' --include='*.js' lib/ bin/ ./*.js 2>/dev/null \
  | grep -v node_modules | grep -v child-registry | grep -v 'NEVER shell'

# 3. cmd /c start, cmd /k, start /min
grep -rn 'cmd.*/c.*start\|cmd.*/k\|start /min' --include='*.js' lib/ bin/ ./*.js 2>/dev/null \
  | grep -v node_modules | grep -v child-registry

# 4. raw exec() calls
grep -rn 'require.*child_process.*exec\|\.exec(' --include='*.js' lib/ bin/ ./*.js 2>/dev/null \
  | grep -v node_modules | grep -v child-registry | grep -v execSync | grep -v execSafe

# 5. .exec() with spawn
grep -rn '\brequire.*child_process.*spawn\b' --include='*.js' lib/ bin/ ./*.js 2>/dev/null \
  | grep -v node_modules | grep -v child-registry | grep -v trackedSpawn | grep -v rawSpawn
```

## Step 2: For each match, READ THE FILE

Do NOT assume a match is a false positive. Every file with a dangerous pattern needs to be opened and read. Folder names lie. File names lie. Comments lie.

## Step 3: For each dangerous file, read the IMPORTS at the top

Check: does it `require('./lib/child-registry')`? If not, every `spawn()` call in the file is untracked.

## Step 4: Classify by replacement type

| Pattern | Replacement |
|---|---|
| `spawn('cmd', ['/c', 'start', '"', url], { detached: true })` | `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', url])` |
| `spawn('node', ['-e', giantTemplate], { shell: true })` | Extract to a real `.js` file, use `trackedSpawn` |
| `exec(start '"' app, { shell: 'cmd.exe' })` | `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', app])` |
| `spawn('cmd', ['/k', command], { detached: true, shell: true })` | `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', command])` |
| `exec('cmd.exe /c ...')` | Use `trackedSpawn` directly with the target executable |
| `require('child_process').exec(cmd)` (TTS) | `trackedSpawn('powershell.exe', ['-NoProfile', ..., file])` |
| `spawn(nodeBin, args, { detached: true }).unref()` | `trackedSpawn(nodeBin, args).unref()` |
| `spawn('cmd', ['/c', 'start', '', anything])` | `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', anything])` |

## Step 5: Add installCleanup() at the top of long-running processes

```js
const { trackedSpawn, installCleanup } = require('./lib/child-registry');
installCleanup();  // kill all tracked children on SIGINT/SIGTERM
```

Required in: `boot.js`, `agent_tower.js`, `start_purpclaw.js`, `unified_api.js`.

## Step 6: Update ecosystem.config.js for any services that need to stay

If a service was spawned via `launch_detached.js` or a `.sh` script, add it to `ecosystem.config.js` with proper PM2 entry instead. Then archive the old launcher.

## Step 7: Verify every modified file passes syntax

```bash
for f in bin/purpclaw.js boot.js agent_tower.js voice_bridge_7792.js \
  screen-manager.js spinUpAgent.js tmux-worktree-orchestrator.js \
  voice_coordinator.js start_purpclaw.js purpclaw.js; do
  node -c "$f" && echo "$f OK" || echo "$f FAILED"
done
```

## Files instrumented in the 2026-06-06 sweep

| File | Found | Fixed |
|---|---|---|
| `bin/purpclaw.js` | `exec()` with `&` bg, `detached: true` boot, 7 raw spawns | All → `trackedSpawn` |
| `boot.js` | `shell: true` ×2 | → `trackedSpawn` + `installCleanup` |
| `launch_detached.js` | `detached: true` ×3 + `proc.unref()` | → `trackedSpawn` + `child.unref()` (archived to legacy) |
| `agent_tower.js` | raw `spawn()` ×2 | → `trackedSpawn` + `installCleanup` |
| `voice_bridge_7792.js` | `cmd.exe /c start /min` ×2 with `detached: true` | → `rundll32 url.dll,FileProtocolHandler` |
| `screen-manager.js` | `cmd /k` + `detached: true` + `shell: true` | → `trackedSpawn rundll32 url.dll,FileProtocolHandler` |
| `spinUpAgent.js` | `detached: true` + `proc.unref()` | → `trackedSpawn` |
| `tmux-worktree-orchestrator.js` | `detached: true` + `proc.unref()` | → `trackedSpawn` |
| `voice_coordinator.js` | `exec(cmd)` | → `trackedSpawn` |
| `start_purpclaw.js` | `shell: true` + restart loop | → `trackedSpawn` + `installCleanup` |
| `purpclaw.js` (root) | `shell: true` in `exec()` fn | → `trackedSpawn` |

## Aftermath

- 11 files fixed, 18 ghost files archived, 10 dead HTML dashboards buried
- Zero `detached: true` remaining (outside child-registry.js)
- Zero `shell: true` remaining (outside child-registry.js)
- Zero `cmd /c start` or `cmd /k` remaining
- `launch_detached.js` and `start_purpclaw.sh` archived
- 4 three-am truly dead folders deleted (~1.13GB freed)
