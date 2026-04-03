# PURPCLAW Console

The TUI that runs from inside Hermes. A parity explorer for the PURPCLAW agent
platform: six target capability groups, one grid, full keyboard nav.

## Run

```bash
# From the PURPCLAW root
python -m purpconsole

# Or directly
python purpconsole/run.py
```

Invoke from Hermes the same way:
```python
mcp__hermes__terminal(command="python E:/god\\ folder/02_ACTIVE_PROJECTS/PURPCLAW/purpconsole/run.py")
```

Requires Python 3.11+ with `textual` and `rich` installed:
```bash
pip install textual rich
```

## Keys

| Key       | Action                          |
|-----------|---------------------------------|
| `↑ ↓ ← →` | Navigate tiles                  |
| `1`-`6`   | Jump to a feature               |
| `enter`   | Open focused feature            |
| `esc`/`b` | Back to dashboard               |
| `q`       | Quit                            |

## What it shows

The six parity targets of the agent platform:

1. **Lives Where You Do** - CLI/API/web surfaces now; chat-platform gateways to build
2. **Grows the Longer It Runs** - Memory, knowledge, skills, scoring, and consolidation
3. **Scheduled Automations** - Natural-language scheduling target, not wired yet
4. **Delegates & Parallelizes** - Worker dispatch, locks, validation, and synthesis
5. **Real Sandboxing** - Local/HTTP/SSH now; Docker/Singularity/Modal/Daytona to build
6. **Full Web & Browser Control** - Browser, vision, STT, voice, and multi-model paths tracked

## Files

- `app.py` — Textual App + screens
- `features.py` — Feature data (one source of truth)
- `purpconsole.tcss` — Stylesheet
- `__main__.py` — `python -m purpconsole` entry
- `run.py` — Direct entry point
- `_smoke.py` — Headless render test (SVG snapshots in `_screens/`)
