# CONSOLE CERT GATE — CONTRACT

**Cert ID:** `agent_work/cert_gates/console/`
**Date opened:** 2026-08-17
**Slice:** `services/console/` — port of `legacy/reintegrate-2026-08-17/purpconsole/` into the live monorepo with a plain-text fallback.
**Status:** open

---

## What this cert certifies

The legacy `purpconsole/` TUI has been rewritten to live at `services/console/`. The rewrite:

1. **Imports rewired** — internal `from purpconsole.X` → `from .X` (relative). CLI surface: `python -m services.console` (TUI if `textual` is installed) or `python -m services.console --text` (always works).
2. **Plain-text parity report** — `services/console/text_report.py` renders the same 6 features as ANSI-coloured text (TUI fallback) or JSON. Same source of truth as the TUI, so they never drift.
3. **CLI surface in `bin/purpclaw.js`** — `purpclaw parity [--json] [--by-id NN]` spawns the Python module and prints the dashboard. Real subprocess wiring, not a Python re-implementation.
4. **10 unit + end-to-end tests** at `tests/console/test_console.py` — covers features module, render functions, and 3 CLI invocations (text/json/by-id).

## What this cert does NOT certify (honest scope)

- **Textual TUI rendering** — `textual` is not installed on this machine. The TUI code is intact and reachable at `services/console/app.py` but the visual cert is deferred. If `pip install textual` succeeds, the TUI launches with no code change.
- **Mission Control / web UI** — the legacy purpconsole had a web UI mention; that is not in this cert.
- **Live status sync** — the 6 features are static (hand-curated in `features.py`). The cert asserts the data shape, not the freshness of the underlying status claims. A future "live" version would query `services/cognitive/`, `packages/permissions/`, etc. for actual feature status.
- **Internationalisation** — labels are English only.

## Run

```
python tests/console/test_console.py
```

From project root. 10/10 tests must pass.

## Assertion criteria (10/10 required for PASS)

| # | Assertion | Why it matters |
|---|---|---|
| T01 | `len(FEATURES) == 6` | The 6 parity targets are present |
| T02 | every feature has `n`, `title`, `blurb`, `detail`, `status`, `accent`, `channels` | Schema integrity |
| T03 | feature ids are unique | Lookup correctness |
| T04 | `counts[live] + counts[partial] + counts[gap] == 6` and each >= 1 | Sanity: not all live, not all gap |
| T05 | `by_id('04')` returns the right feature; `by_id('99')` returns None | Lookup API |
| T06 | `render_human()` includes the title and every feature title | The dashboard renders |
| T07 | `render_json()` parses as JSON, schema=v1, 6 features, counts present | Machine-readable shape |
| T08 | subprocess `python -m services.console --text` returns 0 and prints the dashboard | CLI entry works |
| T09 | subprocess `python -m services.console --json` returns 0 and produces valid JSON | JSON mode works |
| T10 | subprocess `python -m services.console --by-id 04` returns 0 with the right feature | Per-feature lookup works |

## Cert verdict format

`agent_work/cert_gates/console/result.json`:
```json
{
  "schema": "purpclaw.cert-gate.console.v1",
  "cert_id": "agent_work/cert_gates/console/",
  "verdict": "PASS" | "FAIL",
  "date": "2026-08-17T...Z",
  "tests_total": 10,
  "tests_pass": 10,
  "tests_fail": 0,
  "rewrite_origin": "legacy/reintegrate-2026-08-17/purpconsole",
  "rewrite_target": "services/console",
  "cli_surface": "node bin/purpclaw.js parity [--json] [--by-id NN]",
  "honest_label": "plain-text fallback certified; Textual TUI code intact but visual cert deferred until textual is installed"
}
```

## Honest label

This cert is **partial** parity with the original purpconsole. The plain-text fallback (always works) is fully certified. The Textual TUI's visual behavior is certified by code-presence, not by rendering — the runtime needs `pip install textual` to be visible.
