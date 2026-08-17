"""Entry point: `python -m services.console` (or `python -m services.console --text`).

If `textual` is installed, launches the full TUI.
Otherwise, falls back to the plain-text parity report.
Pass `--text` to force the text report, `--json` for JSON.
"""
from __future__ import annotations

import sys


def main() -> int:
    args = sys.argv[1:]
    if "--text" in args or "--json" in args:
        from .text_report import main as text_main
        return text_main(args)

    try:
        from .app import main as tui_main
    except ImportError as exc:
        # textual not installed — fall back to text report
        print(f"[services.console] textual not available ({exc.__class__.__name__}); using text report.", file=sys.stderr)
        from .text_report import main as text_main
        return text_main(args)

    return tui_main()


if __name__ == "__main__":
    raise SystemExit(main())
