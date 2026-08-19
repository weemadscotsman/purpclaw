# `bin/` Agent Notes

`bin/` is the command entry surface. `bin/purpclaw.js` is the operator front door and dispatches into `lib/commands/*.js`.

## Entry Points

| File | Role |
|---|---|
| `purpclaw.js` | Main CLI dispatcher; registry-first dispatch via `lib/cli/registry.js`, falls back to the inline switch during migration |
| `coding-eval.js` | Coding benchmark/eval runner |
| `model-sync.js` | Model-discovery cron utility (NIM/OpenRouter/HF) |
| `purpclaw-vector-bench.js` | Vector benchmark helper (spawned by `purpclaw vector`) |
| `MISSION.js` | Mission-oriented command helper |

## TUI Boundary

`purpclaw tui` launches `scripts/tui.js`. `purpclaw tui ask` launches `scripts/tui-ask.js`. Do not describe TUI parity from web components alone; check these scripts or the CLI launch branch.

## Health Commands

The canonical local verification commands are:

```powershell
node bin/purpclaw.js status
node bin/purpclaw.js doctor
node bin/purpclaw.js bughunt
node bin/purpclaw.js services
node bin/purpclaw.js parity
```

## Edit Rules

- Keep CLI output factual. Do not report a route as healthy unless the command actually probes it.
- Shared health logic must be status-aware; redirects and empty-body healthy responses are valid liveness.
- Do not duplicate command implementations in `bin/purpclaw.js` when a scoped `lib/commands/<name>.js` module already owns the behavior.
