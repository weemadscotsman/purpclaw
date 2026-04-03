---
name: multi-service-runtime-boot-hardening
description: |
  Harden the boot of a multi-service runtime that uses PM2 (or similar)
  with a mix of Node.js and Python services, plus a Next.js (or similar)
  frontend dev server. Make the boot silent: no console window floods from
  Python services, no surprise browser tab from Next.js, no cascade when
  one service crash-loops. UIs launch on demand only. The runtime is whole
  by default — no "core vs dark cluster" opt-in gates. Use when a startup
  is noisy (console windows appearing, browser tabs opening, services
  cascading), when adding a new service to an existing runtime, or when
  building a new runtime from scratch.
---

# Multi-Service Runtime Boot Hardening

**The class of work:** a runtime that uses PM2 (or `systemd`/similar) to
manage a mix of Node.js services, Python services, and a Next.js (or
similar) frontend dev server. The runtime boots, but the boot is hostile:
Python services flash console windows, Next.js opens a browser tab on
first compile, a crash-looping service cascades into N more windows. This
skill captures the four orthogonal fixes that together make the boot
silent and predictable.

**Trigger on:** "boot is noisy", "windows are opening", "tab opened on
its own", "cascade on startup", "why are the python services flashing
consoles", "I need to bring up a new PM2 / systemd / k8s runtime cleanly",
"make startup silent".

**Trigger NOT on:** single-service Node apps (no PM2 orchestration to
harden), or runtimes that only run as production containers (the
container orchestrator handles the equivalent constraints).

---

## The four fixes (apply all four, in order)

A clean boot is the *intersection* of four orthogonal hardening steps.
Skip any one and the boot becomes hostile in a different way.

### 1. Use a sequential launcher, not a parallel start

`pm2 start ecosystem.config.js` starts all services in parallel. On
Windows, when any one service crash-loops, this triggers a cascade of
N cmd-window spawns (npx, cmd.exe, the Python wrapper, the Node
interpreter). The fix is a *sequential* launcher with a circuit breaker.

The shape:

```
# Don't: pm2 start ecosystem.config.js
# Do:    purpclaw safe-start                    # one-at-a-time, circuit breaker

# Each service:
#   1. Check historical restart count — refuse if >3 (configurable)
#   2. Spawn: pm2 start ecosystem.config.js --only <name> --update-env
#   3. Wait stabilization window (3.5s default)
#   4. Watch restart count — abort the batch if it grows
#   5. Move to the next service
```

The full wrapper is in `templates/safe-start.js`. Copy and adapt to your
stack. The pattern is:

- A "core" subset (services proven to start cleanly — the default boot)
- An opt-in "UI" subset (Next.js and other dev servers — never default)
- An opt-in "dark" subset (services that need special handling — voice,
  vision, anything that touches hardware)
- A `safe-start` wrapper that loops over the chosen subset sequentially

The wrapper must:
- Use `windowsHide: true` on its own spawn
- Track per-service historical restart count
- Abort the batch on first crash-loop
- Print what it ran for transparency (`pm2 start ... --only <name>`)

### 2. Switch Python interpreters to windowless (`pythonw.exe`)

`python.exe` on Windows is a console-subsystem binary — every process
spawn allocates a cmd window briefly. PM2-spawned Python services
default to `python.exe`, so you get a cascade of console flashes at
boot. The fix is `pythonw.exe` — the same interpreter, but built as a
windowless subsystem.

In `ecosystem.config.js` (or your PM2 equivalent):

```js
// Don't: const PYTHON_BIN = '...python.exe';
// Do:
const PYTHON_BIN = 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/pythonw.exe';
```

Verify it exists before flipping (`where pythonw` from a Windows shell).
The fallback to `python.exe` is fine for foreground scripts (where you
*want* stdout), but every PM2-spawned service should use `pythonw.exe`.

### 3. Tell Next.js not to auto-open a browser

Next.js's `next dev` defaults to opening a browser tab on first compile.
If the user has a browser set as default, this can be a major surprise
during a boot. The fix is the `BROWSER=none` env var on the Next.js
service entry:

```js
// In ecosystem.config.js:
{
  name: 'your-frontend',
  script: './node_modules/next/dist/bin/next',
  args: 'dev -p 3000',
  env: { BROWSER: 'none' },
  windowsHide: true,
  // ...
}
```

The user can still open the UI by typing the URL — they just don't get
an unsolicited tab. Pair this with an explicit `your-cli open <ui>`
command (e.g. `purpclaw open mission`) that:
- Spawns `nextjs` (or the relevant UI service) on demand
- Waits for the port to respond
- Opens the OS default browser via `cmd /c start "" <url>` (Windows) or
  `xdg-open` / `open` (Linux/macOS)

### 4. Audit "core vs dark cluster" framing — usually the wrong default

Many runtimes ship with a "core" subset that boots by default and a
"dark cluster" that needs an explicit opt-in. This is the *opposite* of
what you want for a healthy runtime — it normalizes the dark cluster
as something you never run, and you lose the ability to do real work
because half the services are off.

The right default is "the runtime is whole." If a service needs special
handling (Python windowless, webcam dependency, hardware access), it
goes in the *opt-out* list, not the opt-in list. The boot then brings
up everything that's safe to bring up; opt-out via `--no-<thing>` if
needed.

Audit pattern: for every service in your ecosystem file, ask:
1. Is it safe to run by default? (no hardware, no API keys required, no
   port conflicts)
2. If yes, it should be in the default boot. Don't hide it.
3. If no, it's an opt-out. The default boot should still include
   everything else.

---

## The "system is whole" framing

After the four fixes, the operator's experience is:

```
$ purpclaw safe-start
  ↪ launching purpclaw-eventbus        ✓ online
  ↪ launching purpclaw-state           ✓ online
  ↪ launching purpclaw-api             ✓ online
  ... 28 more ...
  ✔ SAFE-START COMPLETE  ·  28/28 started  · no cascade detected
```

No windows, no tabs, no cascade. If they want a UI:

```
$ purpclaw open mission
  ↪ purpclaw-nextjs is offline, starting it (silent)…
  ↪ waiting for :3000 to respond…
  ✓ ready  http://127.0.0.1:3000/mission
  ✓ opened in default browser
```

This is the new contract. Don't ship anything that violates it.

---

## Pitfalls to avoid

- **Don't put the frontend in the default boot.** Next.js dev compiles
  on first request and that's slow; pulling it into the default boot
  is what causes the "first request takes 30s" surprise. Keep the
  frontend opt-in.
- **Don't use `node script.js` directamente in production.** No `windowsHide`,
  no log capture, no restart policy. Always go through PM2 (or
  systemd) so you get the lifecycle.
- **Don't let the UI's `SERVICE_CONFIG` list lag behind the real ecosystem.**
  The frontend health probe (`useMissionData.ts`) typically hardcodes
  a small list of services. If the ecosystem grows to 30 services
  but the list still has 10, the UI shows "10/10 services live"
  even though 20 more are online. The user notices ("why does it say
  10 when pm2 shows 18?"). **Mirror the ecosystem.** Either:
  1. Generate the SERVICE_CONFIG from the ecosystem file at build time,
     OR
  2. Maintain both lists from a single source (e.g. a JSON the
     ecosystem and the UI both import), OR
  3. At minimum, mark each entry with a `core|optional` flag (the
     `optional: true` services get their own count) so the UI can
     show "X/Y core + N optional" and the user sees the full picture.
  Whichever you pick, the "X/Y" numbers in the UI must equal the
  real count of online services — otherwise the operator loses
  trust in the dashboard.
- **Don't use the route label as the "speaker" header in multi-model
  chat.** When 5 models answer in a group chat, showing 5 bubbles
  all stamped "Group Chat" is meaningless. Give each model its own
  bubble with its name in the header (per-bot chat), so the chat
  flows like a real conversation. The synthesis lands as a final
  summary bubble. Same for research rooms: per-model + synthesis,
  not one wall-of-text.
- **Don't trust the smoke test as a substitute for circuit breakers.**
  The smoke test tells you "things are alive" but doesn't tell you
  "thing X is crash-looping, abort before you spawn 27 more
  processes." You need both.
- **Don't override `pythonw.exe` with `python.exe` because "the script
  needs stdout."** All PM2 services need to be silent at boot;
  stdout goes to log files, not a console window. If you need to
  debug, `pm2 logs <service>` is the answer.
- **Don't use `chrome.exe --kiosk <url>` or similar to "open the UI."**
  Kiosk mode is for production displays, not dev. Use the OS default
  browser via `cmd /c start "" <url>`.
- **Don't gate the default boot on "is the user online?"** The boot
  happens regardless; the user opens what they want, when they want.
  "Always available, opt-in visibility."
- **Don't call `pm2 jlist` from `spawnSync` without `shell: true` on
  Windows.** PM2 is shimmed as `pm2.cmd` under `C:\Users\<user>\AppData\Roaming\npm\`. Node's `spawnSync` does NOT auto-resolve `.cmd` shims and returns
  `error: ENOENT` with a 0-length stdout. The fix:
  `spawnSync('pm2', ['jlist'], { shell: process.platform === 'win32' })`.
  Same trap applies to any `.cmd`-shimmed tool (`npx`, `code`, `claude`,
  etc.) when called from a Node script on Windows. Also bump the
  timeout to 30s and `maxBuffer` to 100MB — `pm2 jlist` output is
  large (every process's full env) and slow (5s+ on a busy daemon).
- **Don't assume a 404 on `/health` means a service is down.** A
  service answering 404 on the root health path might just be on a
  different URL (e.g. Unified API is `/api/health`, Agent Tower is
  `/tower/status`). Build a probe that tries multiple paths in
  order — `['/health', '/api/health', '/api/status', '/tower/status', '/']` —
  and accept the first 200. This is what the auto-discovery probe
  in `lib/commands/services.js` does, and it's the difference between
  "10/10 services live" (looking at the wrong paths) and the real
  count (24 live in a typical PURPCLAW boot).
- **Don't let the "no mocks, no fakery" rule slide when the data
  source is missing.** When a service is DOWN or a UI shows 0, do
  NOT fabricate placeholder numbers. Show "offline" / "-" / a clearly
  empty state with source attribution. The operator can audit; a
  fake number erodes trust faster than a missing one. Add source
  labels (timestamp + endpoint name) so the operator can verify
  each number is real.

## Patterns that pair with this skill

- **Auto-discovery probe.** When the UI says "X/Y services" but the
  operator suspects the real count is different, run
  `purpclaw services scan` (or equivalent). It scans a port range,
  probes each port with multiple health paths, and cross-references
  against `ecosystem.config.js` + `service_registry.js` + `pm2 jlist`.
  Reports which ports are live, which are dead, and which are
  "orphans" (responding but not registered — usually forgotten dev
  processes). Use this to reconcile the UI's hardcoded
  `SERVICE_CONFIG` against the actual runtime.

- **Self-improving runtime.** When a runtime is alive, it can also
  tune itself. Pattern: `program.md` (the spec the agent reads) +
  `prepare.py` (immutable judge) + `train.py` (the only file the
  agent edits) + `results.tsv` (ratchet ledger) + `git reset --hard`
  (revert on regress). See
  https://github.com/karpathy/autoresearch for the canonical
  implementation. The boot is the *input* — the system stays whole,
  the loop is the *output* — the system gets better at staying whole.

- **Voice before text, every time.** When the operator opens a
  terminal, the system should TTS the boot summary, not dump a
  wall-of-text. `purpclaw safe-start` ends with a one-line summary
  ("28/28 started, no cascade") and `speak_kokoro.py` (or
  equivalent) reads it aloud. The operator hears "everything's up"
  before their eyes focus on the screen.

---

## Verification checklist

After applying the four fixes, verify each one in turn:

- [ ] `pm2 list` shows all services online, no restart cascade
- [ ] `tasklist | grep -i python` shows `pythonw.exe` for PM2 services,
      `python.exe` only for foreground scripts you ran yourself
- [ ] `curl http://<frontend-port>/` returns 200 (or 307) without
      opening a browser
- [ ] Boot completes silently (record with a screen-capture if you're
      not sure)
- [ ] Default boot does NOT include the Next.js service
- [ ] `<your-cli> open <ui>` command starts the frontend and opens
      browser on demand
- [ ] If a service crash-loops, the launcher aborts and prints the
      pm2 reset command for the operator to use

---

## Templates

- `templates/safe-start.js` — full sequential PM2 launcher with
  circuit breaker, watch window, and circuit-breaker threshold.
- `templates/open.js` — explicit UI launcher that brings up a service
  on demand and opens the OS default browser.
- `templates/ecosystem-patch.diff` — minimal `diff` to flip an existing
  ecosystem.config.js to the hardened shape (pythonw.exe + BROWSER=none
  + windowsHide).
- `templates/auto-discovery-probe.js` — generic port-scan +
  multi-path health probe + ecosystem cross-reference. Use when the
  UI's hardcoded `SERVICE_CONFIG` disagrees with the real count
  of live services. Adapt the `loadEcosystem` and `loadServiceRegistry`
  stubs to your stack; everything else (probe paths, concurrency,
  pm2 jlist call with `shell:true` on Windows) is reusable as-is.

## Reference

- `references/windows-pm2-quirks.md` — the specific Windows + PM2
  behaviors that motivated this skill. Includes the failed-boot
  transcript, the pythonw verification command, and the windowsHide
  flag matrix.

## Script

- `scripts/verify-boot.sh` — runs the verification checklist and
  prints a pass/fail per item. Cross-references the running PM2 state
  with the expected config.
