# Full Deploy Log — Spawn Cascade Fix (2026-06-06)

## State before

`lib/child-registry.js` existed with `trackedSpawn()`, `execSafe()`, `installCleanup()`, and `list()` — but was referenced by **zero files** in the codebase. Every spawn in the runtime was raw `child_process.spawn()` or `child_process.exec()`.

## Files changed (11 total)

### 1. `bin/purpclaw.js` (7 spawn points)

| Line | Before | After |
|---|---|---|
| 33 | `const { spawn, execSync } = require('child_process')` | `const { spawn: rawSpawn, execSync } = ...` + `const { trackedSpawn, execSafe, installCleanup, list: listChildren } = require('../lib/child-registry')` |
| 354 | `spawn(command, finalArgs, { cwd, stdio, shell: false, windowsHide: true })` | `trackedSpawn(command, finalArgs, { tag, timeoutMs, cwd, stdio, shell: false })` |
| 1108-1111 | `exec(\`node ... run ... >> LOG 2>&1 &\`)` — fire-and-forget shell background | `trackedSpawn(process.execPath, [..., 'run', task], { tag, timeoutMs: 30min, stdio: ['ignore', logFd, logFd] })` |
| 1771 | `const { spawn } = require('child_process')` (inline) | Removed — uses top-level `trackedSpawn` |
| 1831 | `spawn(cmd[0], cmd.slice(1), { stdio: 'inherit' })` — LoRA train | `trackedSpawn(cmd[0], cmd.slice(1), { tag: 'lora-train', timeoutMs: 30min, stdio: 'inherit' })` |
| 2134 | `const { spawn } = require('child_process')` (inline) | Removed |
| 2143-2150 | `spawn(process.execPath, [...], { detached: true, ... })` + `proc.unref()` | `trackedSpawn(process.execPath, [...], { tag: 'purpclaw-boot', timeoutMs: 0, stdio: 'inherit' })` |
| 2346 | `spawn('pm2', ['logs', ...], { shell: true })` | `trackedSpawn('pm2', ['logs', ...], { tag: 'pm2-logs', timeoutMs: 0, shell: false })` |
| 2388 | `spawn(process.execPath, [NANOCLAW, ...], { stdio: 'inherit' })` | `trackedSpawn(process.execPath, [NANOCLAW, ...], { tag: 'nanoclaw', timeoutMs: 0 })` |
| 3483 | `require('child_process').spawn(process.execPath, [TUI_ASK, ...])` | `trackedSpawn(process.execPath, [TUI_ASK, ...], { tag: 'tui-ask', timeoutMs: 0 })` |
| 3497 | `require('child_process').spawn(process.execPath, [TUI_SCRIPT, ...])` | `trackedSpawn(process.execPath, [TUI_SCRIPT, ...], { tag: 'tui', timeoutMs: 0 })` |

### 2. `voice_bridge_7792.js` (2 cmd.exe spawns)

| Line | Before | After |
|---|---|---|
| 12 | `const { spawn } = require('child_process')` | `const { spawn: rawSpawn } = ...` + `const { trackedSpawn } = require('./lib/child-registry')` |
| 112 | `spawn('cmd.exe', ['/d', '/s', '/c', \`curl ... && start /min ...\`], { detached: true }).unref()` | Download MP3 via Node http, then `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', dlPath], { tag: 'tts-play', timeoutMs: 30_000 }).unref()` |
| 136 | `spawn('cmd.exe', ['/d', '/s', '/c', \`start /min "" "${outPath}"\`], { detached: true }).unref()` | `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', outPath], { tag: 'tts-play', timeoutMs: 30_000 }).unref()` |

### 3. `screen-manager.js`

| Line | Before | After |
|---|---|---|
| 1 | `const { exec, spawn } = require('child_process')` | `const { exec: rawExec, spawn: rawSpawn, execSync } = ...` + `const { trackedSpawn } = require('./lib/child-registry')` |
| 72-76 | `spawn('cmd', ['/k', command], { detached: true, shell: true }).unref()` | First pass: `trackedSpawn('cmd', ['/c', 'start', '', command], ...)` — still had cmd wrapper. **Final pass**: `trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', command], { tag, timeoutMs: 10_000, stdio: 'ignore' }).unref()` — zero cmd.exe at all. FileProtocolHandler resolves URLs, file paths, and executables the same way Windows `start` does. |

### 4. `spinUpAgent.js`

| Line | Before | After |
|---|---|---|
| 17 | `const { spawn } = require('child_process')` | `const { spawn: rawSpawn } = ...` + `const { trackedSpawn } = require('./lib/child-registry')` |
| 158-171 | `spawn(NODE_BIN, [OPENCLAUDE_SCRIPT, ...], { detached: true, ... }).unref()` | `trackedSpawn(NODE_BIN, [OPENCLAUDE_SCRIPT, ...], { tag, timeoutMs: 30min, ... })` (unref still called) |

### 5. `tmux-worktree-orchestrator.js`

| Line | Before | After |
|---|---|---|
| 22 | `const { spawn } = require('child_process')` | `const { spawn: rawSpawn } = ...` + `const { trackedSpawn } = require('./lib/child-registry')` |
| 99-105 | `spawn(nodeBin, args, { detached: true, ... }).unref()` | `trackedSpawn(nodeBin, args, { tag, timeoutMs: 1hr, ... })` (no detached, unref still called) |

### 6. `voice_coordinator.js`

| Line | Before | After |
|---|---|---|
| 12 | (no child_process import) | `const { trackedSpawn } = require('./lib/child-registry')` |
| 167 | `require('child_process').exec(cmd, { windowsHide: true })` | `trackedSpawn('cmd.exe', ['/c', KOKORO, text], { tag: 'tts-speak', timeoutMs: 30_000, stdio: 'ignore' }).unref()` |

### 7. `boot.js`

| Line | Before | After |
|---|---|---|
| 17 | `const { spawn, execSync } = require('child_process')` | `const { spawn: rawSpawn, execSync } = ...` + `const { trackedSpawn, installCleanup } = require('./lib/child-registry')` + `installCleanup()` |
| 161-167 | `spawn('node', [script, ...], { shell: true, detached: false })` | `trackedSpawn('node', [script, ...], { tag, timeoutMs: 0 })` |
| 370-380 | `spawn('node', ['node_modules/next/dist/bin/next', 'dev', ...], { shell: true, detached: false })` | `trackedSpawn('node', ['node_modules/next/dist/bin/next', 'dev', ...], { tag: 'Next.js', timeoutMs: 0 })` |

### 8. `agent_tower.js`

| Line | Before | After |
|---|---|---|
| 13 | `const { spawn, execSync } = require('child_process')` | `const { spawn: rawSpawn, execSync } = ...` + `const { trackedSpawn, installCleanup } = require('./lib/child-registry')` + `installCleanup()` |
| 250 | `spawn(KIMI_CLI_PATH, args, { cwd, stdio })` | `trackedSpawn(KIMI_CLI_PATH, args, { tag, timeoutMs: 30min, cwd, stdio })` |
| 363 | `spawn(finalCmd, finalArgs, { cwd, stdio })` | `trackedSpawn(finalCmd, finalArgs, { tag, timeoutMs: 30min, cwd, stdio })` |

### 9. `launch_detached.js`

| Line | Before | After |
|---|---|---|
| 8 | `const { spawn } = require('child_process')` | `const { trackedSpawn } = require('./lib/child-registry')` |
| 39-47 | `spawn('node', [comp.file], { detached: true, stdio: 'ignore' }).unref()` (×3) | `trackedSpawn('node', [comp.file], { tag, timeoutMs: 0, stdio: 'ignore' }).unref()` (×3) |

### 10. `start_purpclaw.js`

| Line | Before | After |
|---|---|---|
| 8 | `const { spawn } = require('child_process')` | `const { spawn: rawSpawn } = ...` + `const { trackedSpawn, installCleanup } = require('./lib/child-registry')` + `installCleanup()` |
| 37-41 | `spawn('node', [component.file], { shell: true })` | `trackedSpawn('node', [component.file], { tag, timeoutMs: 0 })` |

### 11. `purpclaw.js` (root — legacy CLI)

| Line | Before | After |
|---|---|---|
| 19 | `const { spawn, execSync } = require('child_process')` | `const { spawn: rawSpawn, execSync } = ...` + `const { trackedSpawn } = require('./lib/child-registry')` |
| 49-53 | `spawn(command, { shell: true, ... })` | `trackedSpawn(cmd, args, { tag, timeoutMs, ... })` — command split into args array |

## Additional cleanup

- **Stale slash_worker session** (20260606_085842, PID 16116 → 5432) killed via `taskkill //PID 16116 //F`
- **34 stale docs** archived to `docs/legacy/`
- **CLAUDE.md spawn section** fixed — was recommending `detached: true` as the correct pattern
- **6 cognitive modules** confirmed import-clean: `from memory_matrix_v2 import ...` etc. all pass
- **Cognitive Spine** booted on port 7880, health endpoint confirms all 6 modules healthy
- **`launch_detached.js`** archived to `docs/legacy/` — self-marked LEGACY, replaced by PM2 via ecosystem.config.js
- **`start_purpclaw.sh`** archived to `docs/legacy/` — Kimmi-era, old ports, exposed API key, pre-unification
- **10 dead HTML dashboards** (brain_dashboard, command_center, swarm_dashboard, etc.) → `docs/legacy/html-graveyard/`
- **37 temp root files** (diff ghosts, temp logs, stubs, zip, keys.env) → `docs/legacy/root-cleanup-2026-06-06/`
- **`yolov8n.pt`** (6.5MB) moved from root → `models/`
- **`screen-manager.js` refined** — `cmd /c start` → `rundll32 url.dll,FileProtocolHandler` (zero cmd.exe now)

## Verification commands used

```bash
# Syntax check all 11 files
for f in bin/purpclaw.js boot.js launch_detached.js agent_tower.js \
  voice_bridge_7792.js screen-manager.js spinUpAgent.js \
  tmux-worktree-orchestrator.js voice_coordinator.js start_purpclaw.js purpclaw.js; do
  node -c "$f" && echo "$f OK"
done

# Zero detached:true outside child-registry
grep -rn 'detached:\s*true' --include='*.js' lib/ bin/ ./*.js | grep -v child-registry | grep -v '//'
# → EMPTY

# Zero shell:true outside child-registry
grep -rn 'shell:\s*true' --include='*.js' lib/ bin/ ./*.js | grep -v child-registry | grep -v '//' | grep -v 'NEVER shell'
# → EMPTY

# Cognitive spine health
curl -s http://localhost:7880/cognitive/health | python -m json.tool
# → all 6 modules healthy
```
