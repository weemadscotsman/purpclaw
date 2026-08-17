"""services/console/text_report.py — plain-text parity report (always works, no TUI).

The 6-feature dashboard, rendered as ANSI-coloured text. Same source-of-truth
features module as the Textual TUI, so the two never drift. CLI:
    purpclaw parity            # human-readable
    purpclaw parity --json     # machine-readable
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow `python services/console/text_report.py` to find the package
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from .features import FEATURES, by_id  # noqa: E402


# ANSI palette
_RESET = "\x1b[0m"
_BOLD = "\x1b[1m"
_DIM = "\x1b[2m"
_CYAN = "\x1b[36m"
_VIOLET = "\x1b[35m"
_EMERALD = "\x1b[32m"
_AMBER = "\x1b[33m"
_ROSE = "\x1b[31m"
_SKY = "\x1b[34m"
_GREY = "\x1b[90m"

_STATUS_COLOUR = {
    "live": _EMERALD,
    "partial": _AMBER,
    "gap": _ROSE,
}

_ACCENT_COLOUR = {
    "cyan": _CYAN,
    "violet": _VIOLET,
    "emerald": _EMERALD,
    "amber": _AMBER,
    "rose": _ROSE,
    "sky": _SKY,
}


def _isatty() -> bool:
    try:
        return sys.stdout.isatty()
    except Exception:
        return False


def _c(colour: str, text: str) -> str:
    if not _isatty():
        return text
    return f"{colour}{text}{_RESET}"


def render_human() -> str:
    """Return the 6-tile parity dashboard as a string (ANSI when tty, plain otherwise)."""
    lines: list[str] = []
    lines.append(_c(_BOLD, "PURPCLAW Parity Dashboard"))
    lines.append(_c(_DIM, "The 6 capability groups the agent platform targets."))
    lines.append("")

    counts = {"live": 0, "partial": 0, "gap": 0}
    for f in FEATURES:
        counts[f.status] = counts.get(f.status, 0) + 1

    summary = " | ".join(
        f"{_c(_STATUS_COLOUR[k], f'{counts[k]} {k}')}" for k in ("live", "partial", "gap")
    )
    lines.append(_c(_DIM, f"  {summary}"))
    lines.append("")

    for f in FEATURES:
        accent = _ACCENT_COLOUR.get(f.accent, _CYAN)
        status_colour = _STATUS_COLOUR.get(f.status, _GREY)
        lines.append(
            f"  {_c(accent, f'[{f.n}]')} {_c(_BOLD, f.title)}  "
            f"{_c(status_colour, f.status.upper())}"
        )
        lines.append(f"      {f.blurb}")
        if f.channels:
            channels = ", ".join(f.channels)
            lines.append(f"      {_c(_DIM, 'channels:')} {channels}")
        lines.append("")

    lines.append(_c(_DIM, "Run `python -m services.console` for the interactive Textual TUI"))
    lines.append(_c(_DIM, "(requires `pip install textual`). Pass `--json` for machine output."))
    return "\n".join(lines)


def render_json() -> str:
    """Return the parity dashboard as JSON."""
    return json.dumps(
        {
            "schema": "purpclaw.parity-dashboard.v1",
            "features": [
                {
                    "n": f.n,
                    "title": f.title,
                    "blurb": f.blurb,
                    "detail": f.detail,
                    "icon": f.icon,
                    "accent": f.accent,
                    "channels": list(f.channels),
                    "status": f.status,
                }
                for f in FEATURES
            ],
            "counts": {
                "live": sum(1 for f in FEATURES if f.status == "live"),
                "partial": sum(1 for f in FEATURES if f.status == "partial"),
                "gap": sum(1 for f in FEATURES if f.status == "gap"),
            },
        },
        indent=2,
    )


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--json" in argv:
        print(render_json())
    elif "--by-id" in argv:
        # `python -m services.console.text_report --by-id 04` for one feature
        try:
            idx = argv.index("--by-id")
            n = argv[idx + 1]
        except (ValueError, IndexError):
            print("usage: --by-id <NN>", file=sys.stderr)
            return 2
        f = by_id(n)
        if not f:
            print(f"no feature with id {n}", file=sys.stderr)
            return 1
        print(json.dumps({
            "schema": "purpclaw.parity-feature.v1",
            "n": f.n,
            "title": f.title,
            "blurb": f.blurb,
            "detail": f.detail,
            "channels": list(f.channels),
            "status": f.status,
        }, indent=2))
    else:
        print(render_human())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
