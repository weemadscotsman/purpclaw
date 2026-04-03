# PURPCLAW Scheduler — NL-Cron + setTimeout

A class of "soft cron" the platform can use to fire evolution, learning,
and growth jobs. Lives at `lib/scheduler/` and consists of two files
(calendar store + runner service). Replaces the need for system cron
entries that frequently die silently on Ted's box.

## When to use this

- A periodic job needs to fire (every hour, daily, weekly, monthly)
- The schedule is NL or cron-shaped, not second-precision
- You want the job definition persisted to disk, hot-reloadable from
  text edits, and inspectable via HTTP
- The job should NOT block the agent loop (runner uses `.unref()`
  timers; can be killed without affecting other services)
- You'd rather not have another PM2 service or another bare
  `crontab -e` line

**Don't use this for:** sub-minute schedules (use a real
event loop), high-precision timing (cron is minute-resolution), jobs
that need to survive a process restart with second-level SLA
(this is in-memory + on-disk, no Redis).

## The two-file shape

### `lib/scheduler/calendar.js` — store

JSON-backed job store at `agent_work/cron-jobs.json`. Seeded with
default jobs on first run (computes `schedule_cron` from the NL
`schedule` field at seed time). Exposes:

```js
const cal = require('./lib/scheduler/calendar.js');
cal.list()                                  // → jobs[]
cal.get(id)                                 // → job | null
cal.add({ name, schedule, action, enabled }) // → job
cal.update(id, patch)                       // → updated job | null
cal.remove(id)                              // → bool
cal.enable(id, true|false)                  // → updated job
cal.nextFire(cronString, from?)            // → Date | null
cal.CALENDAR_PATH                            // absolute path to the JSON
cal.DEFAULT_JOBS                            // the seed list
```

CLI mode: `node lib/scheduler/calendar.js [list|add|remove|enable|disable|show] [...]`

### `lib/scheduler/runner.js` — executor

Port 7801. Loads jobs at boot, schedules each via `setTimeout` with
`.unref()`, fires on time, records `last_fired`/`last_status`/`last_error`
back to the calendar, hot-reloads every 30s.

Action kinds:
| `kind`    | Fields                              | Behavior |
|-----------|--------------------------------------|----------|
| `'exec'`  | `command`, `args`, `cwd?`, `env?`   | spawn process, wait for exit |
| `'chat'`  | `message`, `source?`                  | POST `unified_api:7780 /api/chat` |
| `'speak'` | `text`, `voice?`                     | POST `tts:7799 /speak` |
| `'http'`  | `method`, `url`, `body?`, `headers?` | direct HTTP call |
| `'noop'`  | (none)                               | mark fired, log only |

HTTP control surface (port 7801):
```
GET    /health
GET    /jobs
POST   /jobs          body: { name, schedule, action } → 201 + job
DELETE /jobs/{id}     → { ok: true }
POST   /reload         re-schedule everything from disk
GET    /version
```

## The NL → cron bridge

`calendar.js` imports `parse` and `describe` from `nl-cron.js` (same
directory). The parser is a small regex-based translator:

```js
const { parse } = require('./lib/scheduler/nl-cron.js');
parse('every morning at 9am');           // → { ok: true, cron: '0 9 * * *' }
parse('every weekday at 8:30');         // → { ok: true, cron: '30 8 * * 1-5' }
parse('every sunday and wednesday at 7pm'); // → { ok: true, cron: '0 19 * * 0,3' }
parse('monthly on the 1st at noon');    // → { ok: true, cron: '0 12 1 * *' }
parse('totally gibberish');             // → { ok: false, reason: '...' }
```

`describe(cron)` is the inverse (best-effort, for human display):
```js
describe('0 9 * * *');                   // → 'daily at 09:00'
describe('*/5 * * * *');                 // → 'every 5 minutes'
```

Caveat: the parser is small and intentionally covers ~90% of common
phrases. Anything it can't parse returns `{ ok: false, reason }` —
callers should fall back to accepting a raw 5-field cron string.

## The nextFire matcher

5-field cron → next Date. Walks minute-by-minute from the next whole
minute, max 366 days ahead. Pure JS, no `node-cron` dep.

```js
nextFire('0 3 * * *')       // next 3am
nextFire('0 4 * * 0')       // next Sun 4am
nextFire('*/5 * * * *')     // next 5-minute mark
```

Subtle gotcha: if you pass `new Date()` directly as `from`, the
sub-millisecond precision means the `seconds !== 0` filter kills every
iteration. The runner's `nextFire` aligns to the next whole minute
before iterating — if you call it from your own code, do the same.

## Default jobs (seeded on first run)

The runner seeds these into `agent_work/cron-jobs.json` the first time
it boots. Ted can edit the JSON to disable, change, or add to them
without restarting the runner (hot-reload every 30s picks it up).

| ID | Schedule (NL)         | Schedule (cron) | Action |
|----|------------------------|-----------------|--------|
| `autodream-nightly`        | every morning at 3am   | `0 3 * * *`  | `python autoDream.py` |
| `diagnostics-hourly`       | every hour             | `0 * * * *`  | `python autonomous_diagnostics.py` |
| `skill-forge-weekly`       | every sunday at 4am    | `0 4 * * 0`  | `node lib/evolution/skill-forge.js` |
| `evolution-mutator-weekly` | every wednesday at 3am | `0 3 * * 3`  | `node lib/evolution/mutator.js` |
| `tts-keepalive-5min`       | every 5 minutes        | `*/5 * * * *`| noop heartbeat |

If you change a default and want the runner to re-seed, delete
`agent_work/cron-jobs.json` and restart.

## End-to-end test (proves the whole loop)

```bash
# 1. Start the runner
PORT=7801 node lib/scheduler/runner.js &

# 2. Add a 1-minute test job
curl -s -X POST -H "content-type: application/json" \
  -d '{"name":"scheduler-smoke","schedule":"every minute","action":{"kind":"noop"}}' \
  http://127.0.0.1:7801/jobs
# → {"id":"scheduler-smoke", ...}

# 3. Check timers
curl -s http://127.0.0.1:7801/health
# → {"jobs_total":6,"jobs_enabled":6,"timers_active":6,...}

# 4. Wait 65s, re-check the job
sleep 65
curl -s http://127.0.0.1:7801/jobs | jq '.jobs[] | select(.id=="scheduler-smoke")'
# → { "last_fired": "2026-...T18:44:00.003Z", "last_status": "ok", ... }

# 5. Clean up
curl -s -X DELETE http://127.0.0.1:7801/jobs/scheduler-smoke
```

The 003ms offset on `last_fired` is the round-trip latency from the
`setTimeout` callback firing to the calendar `update` writing the
JSON file. Acceptable.

## When to extend

If you find yourself adding a third file (e.g. `lib/scheduler/recurring.js`),
that's the signal to consolidate. Two files is the right size — one
for state, one for execution. More than two means the responsibilities
aren't split right.

If you need:
- Sub-minute precision → use a real event loop, not this
- Multi-machine coordination → use a real cron daemon (systemd timers,
  k8s CronJob) with the scheduler as the development/test layer
- Job DAGs (B depends on A) → out of scope; build a workflow engine
