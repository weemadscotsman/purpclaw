# Gap Report Workflow — `lib/feature-parity.js`

`lib/feature-parity.js` is Ted's canonical tool for tracking what
PURPCLAW has vs what it aims to be. The function is:

```js
const fp = require('./lib/feature-parity.js');
fp.evaluate(rootDir, options).then(report => {
  // report.totals = { live, partial, missing, total, checks: { live, partial, missing, total } }
  // report.sections = [{ id, name, required, state, checks: [...] }]
});
```

`rootDir` is the absolute path to the PURPCLAW project root. The
evaluator walks the `TARGETS` array at the top of the file, runs each
check, and rolls up state per section.

## The check types (what goes in TARGETS[].checks)

| `type`           | Required keys         | Pass condition |
|------------------|-----------------------|----------------|
| `'file'`         | `path`                | file exists on disk |
| `'service'`      | `key` (registry key)  | service registered in `service_registry.js` |
| `'countDirsWithFile'` | `dir`, `file`, `minimum` | N directories under `dir` have `file` |
| `'missing'`      | `note`                | always missing — used as a "we know this is missing, here's the plan" marker |

Each check can also have `optional: true` — then a non-live state is
reported as `partial` rather than `missing` (e.g. a service that exists
in the registry but is currently offline).

## Why run it FIRST in any PURPCLAW session

Before designing a new feature or building a new service, run:

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
node _scratch/gap-report.js
```

This tells you:
1. What features are `live` (don't rebuild)
2. What features are `partial` (services registered but offline — wake
   with `purpclaw safe-start --dark` to bring them up)
3. What features are `missing` (the actual target list)
4. The total live/total checks ratio — Ted tracks this as a "how done
   are we?" number. Was 26/45 at session start of June 4 2026, went
   to 35/50 after a focused build session.

The `_scratch/gap-report.js` wrapper script is a thin shim that calls
`fp.evaluate()` and prints the report. Save new wrappers there, don't
commit them (they're session-specific).

## How to add a new check (for a new file or service you built)

Open `lib/feature-parity.js`, find the `TARGETS` section. Pick the
target whose `name` matches your feature. Add or replace a check:

```js
// Replacing a 'missing' stub with a 'file' check (the gap is now closed)
{ label: 'Telegram gateway adapter', type: 'file', path: 'lib/gateways/telegram.js' }

// Adding a brand new check to an existing section
{ label: 'Docker execution backend', type: 'missing', note: 'Needs hardened container worker adapter' }
```

For checks that haven't been built yet, the `type: 'missing'` form
gives Ted a one-line pointer to what's needed. For built-and-shipped
checks, use `type: 'file'` so the gap report immediately reflects
`live` when the file exists.

## After any feature build, ALWAYS:

1. Add/update the check in `lib/feature-parity.js`
2. Run `node _scratch/gap-report.js` to confirm the new check is `live`
3. Note the totals delta in your voice memo (per the
   `voice-first-protocol` skill — "voice on every pass")

## What this does NOT do

- It does not run a service health probe (no PM2 introspection, no
  curl-to-port). That's a separate eval/suites/smoke.py pass.
- It does not write to disk — read-only. Ted wants this as a fast
  scan, not a write-side-effect.
- It does not catch missing transitive dependencies (e.g. a check
  says `lib/foo.js` exists but foo.js imports a non-existent bar.js).
  Use `node -c lib/foo.js` for syntax, `node -e "require('./lib/foo.js')"`
  for module-graph integrity.

## When the gap report tells you a section is "partial" with services offline

This is the "defined but dark" cluster Ted has on PM2 — they exist but
are off by default. Pattern: voice-coordinator, voice-bridge, autodream,
yolo, stt, vision, reasoning, etc.

To bring them up safely (avoiding the Windows cmd-window cascade that
froze Ted's PC on 2026-05-25):

```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
purpclaw safe-start --core    # 16 stable services, one-at-a-time
purpclaw safe-start --dark    # the dark cluster, one-at-a-time
```

`safe-start` has a 3.5s stabilisation watch and a circuit breaker that
refuses services with >3 historical restarts. NEVER use `pm2 start
ecosystem.config.js` directly.

## Common gotcha: `evaluate` fails with "Cannot find module 'service_registry.js'"

The function does `require(path.join(root, 'service_registry.js'))` from
inside `lib/feature-parity.js`. If you pass a relative path or call
`evaluate` from a different cwd, the require fails.

Fix: pass an **absolute** path. From a Hermes session, that's typically:

```js
const root = path.resolve(__dirname, '..');
fp.evaluate(root, {}).then(...)
```

The `_scratch/gap-report.js` wrapper handles this — if you write a new
wrapper, copy that pattern.
