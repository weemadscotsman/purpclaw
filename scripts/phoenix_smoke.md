# PHOENIX Smoke Test

**Author:** 🔥 PHOENIX — Rebirth Specialist, Creative Division
**Mission:** prove the PURPCLAW swarm is alive and answering in the right shape before we trust any work to it.

Two implementations, same contract:

- `scripts/phoenix_smoke.py` — Python 3 stdlib only. Preferred (richer output, JSON report, shape assertions).
- `scripts/phoenix_smoke.sh` — bash + curl fallback. Auto-routes to Python if available, otherwise runs a thin bash version.

## Phases (in order)

1. **Env validation** — `PURPCLAW_MODE`, `PURPCLAW_OPERATOR`, `UNIFIED_API_URL` present; at least one provider key wired.
2. **Service health probes** — `/api/yo`, `/api/heartbeat`, `/api/services`, `/api/spine-health`, `/api/pulse`, `/api/llm-status`, `/api/manifest`, `/api/host-telemetry`, `/api/delegation/status`, `/api/internal-check`.
3. **Minimum agent set spin-up** — one persona per division (9 total) via `POST :7790/tower/spawn`.
4. **Task dispatch per persona** — submit one task per persona via `/api/harness/start` (fallback `/tower/spawn`); assert response shape.
5. **Telemetry + queue depth** — host-telemetry, delegation status (queueDepth), internal check, llm-status.
6. **Report** — colored pass/fail summary + JSON dump to `agent_work/phoenix_smoke_report.json`.

## Usage

```bash
# default — uses http://127.0.0.1:3030 / 7780 / 7790
python scripts/phoenix_smoke.py

# custom host/ports
PURPCLAW_BASE=http://mybox:3030 python scripts/phoenix_smoke.py

# CI-friendly — no color, exit non-zero on any failure
python scripts/phoenix_smoke.py --no-color > smoke.log 2>&1

# bash fallback (auto-routes to python if present, else runs bash version)
bash scripts/phoenix_smoke.sh

# skip dispatch (phases 3-4) for a fast liveness-only run
python scripts/phoenix_smoke.py --skip-dispatch
```

## Exit codes

- `0` — all checks passed, swarm is healthy
- `1` — one or more checks failed, escalate per Phoenix recovery protocols
- `2` — script misconfiguration (missing env, malformed URL)
- `130` — operator aborted (Ctrl+C)

## Recovery escalation chain

When the smoke test fails, follow Phoenix's standard chain:

1. **PHOENIX** (this script) — detect & report
2. **ROBOT** — mechanical repair (re-spin failed services, restart containers)
3. **OWL** — root-cause analysis of failures
4. **WOLF** — coordinate pack-wide response if the failure is systemic
5. **VOID** — cleanup unrecoverable components

## Configuration

All endpoints are env-driven, with sensible defaults for local dev:

| Var                  | Default                    | Purpose                          |
|----------------------|----------------------------|----------------------------------|
| `PURPCLAW_BASE`      | `http://127.0.0.1:3030`    | Next.js dev server              |
| `PURPCLAW_API_URL`   | `http://127.0.0.1:7780`    | unified_api.js (Node)           |
| `PURPCLAW_TOWER_URL` | `http://127.0.0.1:7790`    | agent_tower.js                  |
| `PHOENIX_REPORT`     | `agent_work/phoenix_smoke_report.json` | JSON output path |
| `NO_COLOR`           | unset                      | disable ANSI colors              |
