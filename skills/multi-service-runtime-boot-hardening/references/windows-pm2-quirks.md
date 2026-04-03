# Windows + PM2 quirks — the specific failures that motivated this skill

**Recorded:** 2026-06-04
**Platform:** Windows 10, git-bash shell, PM2 daemon, Node + Python 3.11 services
**Symptom:** booting the runtime flooded the operator's desktop with cmd windows, browser tabs, and stuck pm2 processes.

---

## The four failure modes (one per fix in the skill)

### Failure 1 — parallel start cascades

**What happens:** `pm2 start ecosystem.config.js` launches all 28
services in parallel. If any one service crash-loops on launch
(missing import, port conflict, bad config), PM2's restart loop fires
2-3 times in rapid succession. Each restart spawns a new child Node
process via `cmd.exe`. On Windows, `cmd.exe` always allocates a console
window briefly. The user sees 5-10 cmd windows flash open and close in
under a second. With 28 services starting in parallel, this gets
unreadable fast.

**The transcript (paraphrased):**

```
  ↪ launching purpclaw-eventbus
  ↪ launching purpclaw-state
  ↪ launching purpclaw-api
  ↪ launching purpclaw-tower
  ... 24 more ...
  [FLOOD OF CMD WINDOWS]
  [DESKTOP UNUSABLE]
  pm2 list
  ┌ 4 services online, 24 with restart counts >5
```

**Fix:** sequential launcher. `safe-start.js` launches one service,
waits 3.5s for the stabilization window, aborts the batch on the
first crash-loop, refuses to launch any service with >3 historical
restarts (configurable). See `templates/safe-start.js`.

---

### Failure 2 — Python services flash console windows

**What happens:** every Python service in the ecosystem has
`interpreter: 'C:/.../python.exe'`. Python.exe is a console-subsystem
binary on Windows, so every PM2-spawned Python process briefly
allocates a console window. With 8-10 Python services in the
ecosystem, the boot shows that many black cmd windows flashing open
and closing.

**Verification command:**

```bash
where python pythonw
# Both should be present in the same Python install dir.
# pythonw.exe = windowless, use for PM2 services.
# python.exe  = console-subsystem, use for foreground scripts only.
```

**The fix:** change the `PYTHON_BIN` constant in `ecosystem.config.js`:

```js
// Before
const PYTHON_BIN = 'C:/.../python.exe';

// After
const PYTHON_BIN = 'C:/.../pythonw.exe';
```

**Verify after restart:**

```bash
pm2 restart <python-service> --update-env
sleep 3
tasklist | grep -iE "python\.exe|pythonw\.exe"
# All PM2-managed Python services should appear as pythonw.exe.
# python.exe should only appear for foreground scripts YOU ran.
```

**Don't do this if:** the script is interactive (waiting on stdin, etc.).
PM2 services are non-interactive; this is safe. If a script needs
stdout, it goes to the PM2 log file, not a console window.

---

### Failure 3 — Next.js auto-opens a browser tab

**What happens:** `next dev` includes an experimental auto-open feature
that fires on first compile, opening the OS default browser to
`http://localhost:3000`. The user didn't ask for this. Sometimes it
fires 30s after the dev server is up, by which time the user has
moved on to other work — so the tab is a complete surprise.

**The fix:** `BROWSER=none` env on the Next.js service in the
ecosystem config:

```js
{
  name: 'your-frontend',
  script: './node_modules/next/dist/bin/next',
  args: 'dev -p 3000',
  env: { BROWSER: 'none' },
  // ...
}
```

**Don't:** use `BROWSER=0` or omit the env entirely. `none` is the
exact string Next.js checks for.

**The companion fix:** give the user an explicit "open this UI"
command (e.g. `your-cli open <name>`). It brings up the service
on-demand, waits for the port, and opens the OS default browser via
`cmd /c start "" <url>` (Windows) or `xdg-open` / `open` (Linux/macOS).
The user always knows what's about to open.

---

### Failure 4 — "core vs dark cluster" framing hardens the wrong default

**The anti-pattern:** "we have a 12-service core that boots by
default, plus a 16-service 'dark cluster' that you have to opt into
with `--dark`." The reason this is hostile: the dark cluster is
*designed* to never be run, and over time, the operator forgets
which services are in it. The "core" is the only thing that ever
runs, even though 16 services are sitting in the ecosystem doing
nothing.

**The right framing:** the runtime is whole by default. Services that
need special handling (webcam access, hardware dependencies) are
*opt-out* via `--no-<thing>`, not opt-in. The boot brings up
everything that's safe to bring up.

**Migration path:** rename `--dark` to `--legacy-dark-cluster` (kept
as a no-op alias for muscle memory), make the default boot the union
of "core" and the previously-dark services, audit each service for
"is it safe to run by default?" and either include it or move it to
an explicit opt-out list with a comment explaining why.

---

## windowsHide matrix (what to set on what)

| Service type | windowsHide | Why |
|--------------|--------------|-----|
| Node.js (no child processes) | `true` | Defensive — never wrong |
| Python (pythonw.exe) | `true` | Reinforces windowless — belt and braces |
| Next.js (dev) | `true` | Prevents the npx wrapper from flashing |
| Anything that spawns subprocesses | `true` | Children may not honor windowsHide on Windows |
| Daemon/watchdog | `true` | Same |

The default in the safe-start wrapper is `true` for everything. The
only time to set `windowsHide: false` is when debugging a service
that's stuck and you need to see the cmd window. Then you know what
you're doing.

---

## The 3.5s stabilization window — where does 3.5s come from?

Empirically: most service startup times in this kind of runtime are
<1s (the listener binds and we get an HTTP 200). The 3.5s window
catches:

- Slow port binding (Python imports can take 1-2s on Windows)
- Cold-cache compile of any pre-flight code
- TCP TIME_WAIT cleanup if the port was recently used

Anything that takes >3.5s to stabilize is genuinely slow, not
crash-looping. The window is short enough that the boot feels
responsive, long enough that crash-loops are caught.

If you have a service that legitimately needs >3.5s, pass
`--stabilise=10000` (or whatever) per-service. The default is just
the sane default.
