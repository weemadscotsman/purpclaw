# Runtime Safety and Telemetry

PurpClaw must not create visible terminal cascades or unbounded Node/Python
children.

## Process rules

- Core services run under PM2 with bounded restart counts.
- Python services use `scripts/windows/python-service-host.js`.
- The Python host allows one child, hides its window, writes stdout/stderr to
  `logs/services/`, checks the service port before spawning, and opens a
  circuit after three starts in ten minutes.
- `safe-start` and `safe-stop` invoke the PM2 JavaScript CLI directly through
  Node. They do not launch `cmd.exe`, `npx.cmd`, or shell windows.
- Idle optimization is single-flight across processes.
- Idle LoRA training is disabled by default. It requires
  `PURPCLAW_IDLE_AUTO_TRAIN=1` and runs as a bounded tracked child.

## Telemetry

Structured events are appended to:

```text
agent_work/telemetry/pipeline.jsonl
```

Events include:

- command ingress
- parsing and routing
- governance pass or approval block
- execution start and retry
- workflow completion or failure
- duplicate service blocks
- process supervisor starts, crashes, circuit opens, and heartbeats
- idle training skips and duplicate-cycle blocks

Query recent events:

```powershell
purpclaw telemetry --limit 50
purpclaw telemetry --workflow <workflow-id>
purpclaw telemetry --service purpclaw-cognitive
purpclaw telemetry --status failed
purpclaw telemetry --json
```

The same data is available from:

```text
GET http://127.0.0.1:7784/api/telemetry
```

The TUI Logs tab consumes this endpoint and the live `/api/stream` workflow
feed.
