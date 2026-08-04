# Spec: PTY Terminal — real interactive shell for PURPCLAW

**Version:** 1.0.0
**Date:** 2026-07-18
**Author:** Quill
**Status:** Implemented + smoke-tested. Native module is prebuilt multiarch.

---

## 1. Purpose

Plain `child_process.spawn()` is enough for "ls /tmp"-style commands. It
breaks for anything that depends on a real terminal:
- SSH (banner animation, password prompts)
- vim, less, tmux (curses + escape sequences)
- psql, mysql, sqlite3 (interactive REPLs)
- Node/Python REPLs (`> ` prompts)
- Anything reading `isatty(stdout)`

Claude Code / Hermes both ship this. PURPCLAW's `shell` tool returned
non-TTY output, breaking these workflows. This module + tools give PURPCLAW
a real PTY (ConPTY on Windows, forkpty on POSIX) with full data streaming.

## 2. Native Module

`@homebridge/node-pty-prebuilt-multiarch` (chosen over upstream `node-pty`
because Eddie's machine lacks VS Build Tools and upstream requires compile).
Ships prebuilt binaries:
- `conpty.node` + `pty.node` — Windows 10+ ConPTY backend
- `winpty.dll` + `winpty-agent.exe` — Windows fallback for older systems
- `pty.node` for darwin-x64 + linux-x64

Installation: `npm install @homebridge/node-pty-prebuilt-multiarch`.

## 3. Public API (`lib/pty.js`)

```js
const PTY = require('./lib/pty');

// Run a command to completion.
const result = await PTY.run('bash', ['-c', 'echo hi'], { timeoutMs: 5000 });
// { stdout, stderr, exitCode, durationMs, pid, mode: 'pty'|'spawn' }

// Open a long-lived interactive session.
const session = PTY.spawn('ssh', ['user@host'], { cwd, cols: 120, rows: 40 });
session.on('data', d => process.stdout.write(d));
session.write('ls\n');
session.resize(80, 24);
session.kill();

// Check availability.
PTY.isAvailable();   // true / false
PTY.VERSION;          // '1.0.0'

// Disable via env var (useful for CI / sandboxed envs).
process.env.PURPCLAW_PTY_DISABLED = '1';
```

## 4. Tools (`lib/tools/index.js`)

Two new tools, registered with the existing tool registry:

### `pty_run`
| Field    | Type    | Required | Notes                                   |
|----------|---------|----------|-----------------------------------------|
| command  | string  | yes      | Executable (cmd.exe, bash, ssh, …)      |
| args     | string[]| no       | Default `[]`                            |
| cwd      | string  | no       | Default `process.cwd()`                  |
| env      | object  | no       | Merged with `process.env`                |
| cols     | int     | no       | Default 80                               |
| rows     | int     | no       | Default 24                               |
| timeoutMs| int     | no       | Auto-kill after N ms                     |

Returns: `{ ok, stdout, stderr, exitCode, durationMs, pid, mode, pty }`.
ANSI escape sequences are stripped from stdout/stderr by default.

### `pty_session`
| Field      | Type   | Required | Notes                                    |
|------------|--------|----------|------------------------------------------|
| op         | string | yes      | `open` / `read` / `write` / `resize` / `kill` / `close` / `list` |
| sessionId  | string | for non-list ops | From `op=open` response   |
| command    | string | for open | Executable                                |
| args       | string[]| for open|                                          |
| cwd        | string | for open |                                          |
| data       | string | for write | Keystrokes / stdin                      |
| cols/rows  | int    | for open/resize |                                    |
| since      | int    | for read | Byte offset to start from (default 0)   |

State: sessions live in an in-process Map. Killed sessions removed after
60s grace period so callers can read the final buffer.

## 5. CLI

`purpclaw pty <command> [args...]` — quick one-off PTY exec.

Example:
```
$ purpclaw pty cmd.exe /c "echo hello"
hello

$ purpclaw pty bash -c "ls /tmp | head -5"
```

(Falls back to plain `purpclaw shell` if PTY is unavailable or disabled.)

## 6. Fallback Behavior

When the native module is unavailable (CI, sandboxed env, build failure),
PTY automatically falls back to `child_process.spawn()` with stdout/stderr
piped. The output is missing ANSI sequences and TTY-aware tools won't work
properly, but the basic `pty_run` API still functions. The fallback is
signalled to callers via `result.mode === 'spawn'`.

`PURPCLAW_PTY_DISABLED=1` forces the fallback path even when the native
module is available.

## 7. State Machine

```
  spawn() → session emits 'data' chunks + 'exit' once
              │
              ▼
    ┌─────────┴──────────┐
    │  alive              │  exitCode === null
    │  read() / write()   │
    │  resize()           │
    └─────────┬──────────┘
              │ kill() or natural exit
              ▼
    ┌─────────┴──────────┐
    │  exited (60s grace) │  exitCode set; session still readable
    │  can read() final  │  auto-purged from Map after 60s
    └────────────────────┘
```

## 8. Limitations (deferred)

- No built-in shell-in-CLI REPL (`purpclaw pty-ssh user@host` interactive). Agents use the `pty_session` tool to script these.
- No transcript file by default. `pty_session` keeps an in-memory buffer (capped at 10 MB).
- `pty_session` Map is per-process. Doesn't survive process restart. If you need long-lived sessions across restarts, write the buffer to disk in your workflow.
- ANSI strip is naive (regex on `\x1b\[[0-9;?]*[ -/]*[@-~]`). Some escape sequences (CSI > 0xFF, OSC with BEL terminator) may slip through. If you need raw bytes, set `PURPCLAW_KEEP_ANSI=1` (planned; not yet implemented).

## 9. Integration Points

| Surface          | Uses PTY for                                                  |
|------------------|---------------------------------------------------------------|
| `pty_run` tool   | One-shot interactive command (vim, ssh with key, REPL eval)  |
| `pty_session` tool | ssh sessions, db CLIs, REPL exploration                    |
| `shell` tool     | Stays as `child_process.spawn` (fast, no PTY overhead)        |
| `execute_code`   | Future: run snippets in a Node/Python REPL via PTY           |

## 10. Test Proof

`tests/pty.smoke.js` covers:
1. `PTY.run('cmd.exe', ['/c', 'echo ok'])` returns stdout='ok\r\n', exit=0, mode='pty'
2. `PTY.isAvailable()` returns true after install
3. `PTY.spawn` opens a session, emits 'data' within 500ms
4. `PTY.spawn(...).write('echo x\n')` followed by `read()` returns 'x' in the buffer
5. `PTY.spawn(...).kill()` stops the process; subsequent reads return no new data
6. `pty_run` tool produces same result as direct `PTY.run` (excluding ANSI strip)
7. `pty_session` tool with `op=open` returns sessionId
8. `pty_session` tool with `op=write` followed by `op=read` round-trips bytes
9. `pty_session` tool with `op=kill` terminates session
10. `pty_session` tool with `op=list` lists live sessions

## 11. Versioning

| Version | Change                                                      |
|---------|-------------------------------------------------------------|
| 1.0.0   | Initial PTY wrapper, pty_run + pty_session tools, CLI glue |

This spec lives at `docs/spec/PTY.md`. Bumping requires spec version +
`CHANGELOG.md` entry + `lib/pty.js` `VERSION` constant + new test.
