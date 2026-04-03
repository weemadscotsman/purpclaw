# Bench Timeout Gotcha

## Symptom

`bench-many` or `sweep` exits with:

```
benchmark child timed out after 900000ms
```

The 17K-file repo (GOTHAM_3077) hits the default 15 min cap. Bumping to 30 min still doesn't fit. 60 min untested as of 2026-06-01.

## Root cause

`src/cli.ts:254`:

```ts
.option('--repo-timeout-ms <n>', 'Hard timeout for each isolated benchmark child', (v: string) => Number(v), 15 * 60 * 1000)
```

Default is 900000ms (15 min). The cap is on the bench-child subprocess spawned by `runIsolatedBenchmark` at line 1019. On timeout, child receives SIGKILL and the parent rejects with the error above.

The flag is wired into `bench-many`, `sweep`, and `bench-drive`. The single `benchmark` command does NOT accept `--repo-timeout-ms` — it uses the default 15 min for the whole run.

## Fix

Pass the flag at the call site. No code edit needed:

```bash
node dist/cli.js bench-many <list_file> --repo-timeout-ms 1800000 --out <dir>
```

For GOTHAM-class repos (17K+ files), 30 min may still be insufficient. Three honest options:

- **(a) Bump further** — 60 min, 90 min. Slow, might still fail.
- **(b) Cap `--max-files`** — e.g. `--max-files 10000`. Lands in ~15 min. Result honestly says "10,000 of 17,338 files accounted." Sampled measurement, real number, not full sweep.
- **(c) Document as out-of-scope** — 19/20 sweep coverage is honest. Add GOTHAM to a "stress test" category, not the benchmark matrix.

The byte-exact methodology that ships with OmniCode says "no rounding" and "no asterisk." That cuts both ways: (a) might fail and waste time, (b) gives a real number with the cap called out, (c) is the most honest. **(b)** is the recommended default for big repos.

## Verification

After the run, check the ndjson in `--out`:

```bash
cat <out_dir>/benchmarks.ndjson
```

- Empty `error` field → success
- `"benchmark child timed out after..."` → failure, bump again or switch to (b)/(c)

## Known-large repos

| Repo | Path | Files | Status |
|---|---|---:|---|
| GOTHAM_3077 | `E:\god folder\02_ACTIVE_PROJECTS\GOTHAM_3077` | ~17K | Hits 30 min cap. Use --max-files or skip. |

## Pattern: run in background

For long bench runs, use `terminal(background=true, notify_on_complete=true)` so the agent can keep working:

```bash
node dist/cli.js bench-many <list> --repo-timeout-ms 1800000 --out .omnicode-bench-x 2>&1 | tail -200
```

The `| tail -200` is important — `bench-many` writes to stdout as it goes, and the full log can be large. Tailing bounds the output buffer.
