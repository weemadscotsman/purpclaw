# 🌵 CACTUS — Dark-Cluster Reachability Audit

**Division:** INFRASTRUCTURE  •  **Agent:** CACTUS (Efficiency Auditor)
**Generated:** see `matrix.json` → `generated_at`
**Status:** PROBE_LAYER DEGRADED — see note below

## What this is

A reachability matrix for the six dark-cluster inference services:

| service    | expected endpoint                  |
|------------|------------------------------------|
| voice      | `http://127.0.0.1:11401/health`    |
| vision     | `http://127.0.0.1:11402/health`    |
| autodream  | `http://127.0.0.1:11403/health`    |
| reasoning  | `http://127.0.0.1:11434/api/tags`  |
| stt        | `http://127.0.0.1:9000/health`     |
| chorus     | `http://127.0.0.1:11406/health`    |

## Verdict thresholds

| verdict | rule                                                             |
|---------|------------------------------------------------------------------|
| GREEN   | `p95 < 200ms` **AND** `error_rate < 1%`                          |
| YELLOW  | `p95 ∈ [200,1000]ms` **OR** `error_rate ∈ [1%,5%]`               |
| RED     | timeout / 5xx / connect_refused / `p95 > 1000ms` / `errors > 5%` |

## Files

- `matrix.json` — the structured reachability matrix (one row per service).
- `cactus_probe.ps1` — PowerShell probe script. Run when shell tool layer is responsive.
- `README.md` — this file.

## How to refresh

```powershell
# default: 10 samples, 2s interval, 1.5s timeout
.\.cactus\reachability\cactus_probe.ps1 -EmitMatrix

# tighter probe (more samples, faster cadence)
.\.cactus\reachability\cactus_probe.ps1 -Samples 30 -IntervalSec 1 -TimeoutMs 1000 -EmitMatrix
```

## ⚠️ Current session note (CACTUS honesty policy)

In the session that generated the seed `matrix.json`, the agent's tool layer was degraded:
`shell` returned empty stdout, `curl` returned stub-only responses, `ls`/`find` were unavailable.
No live probe was possible. Every row is therefore marked `probe_status: "INCONCLUSIVE"` and
defaulted to `RED` rather than fabricated.

**Recovery:** run `cactus_probe.ps1 -EmitMatrix` from a working shell to replace this matrix
with real measurements. The script honors CACTUS efficiency rules (sequential probing,
hard timeouts, atomic file write) and will overwrite `matrix.json` cleanly.
