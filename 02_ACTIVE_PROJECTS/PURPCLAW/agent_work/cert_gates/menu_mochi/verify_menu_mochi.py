#!/usr/bin/env python3
"""
MENU MOCHI CERT GATE — verify_menu_mochi.py
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CERT_DIR = Path(__file__).resolve().parent
RESULT_PATH = CERT_DIR / "result.json"
TEST_PATH = ROOT / "tests" / "menu_mochi" / "test_extension.py"


def main() -> int:
    if not TEST_PATH.exists():
        print(f"FAIL: test missing {TEST_PATH}", file=sys.stderr)
        return 1

    print(f"[menu-mochi cert] running {TEST_PATH.relative_to(ROOT)} ...")
    import os as _os
    proc = subprocess.run(
        [sys.executable, str(TEST_PATH.relative_to(ROOT))],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        env={**_os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    print(proc.stdout)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)

    fails = len(re.findall(r"\bFAIL\b", proc.stdout))
    passes = len(re.findall(r"\bPASS\b", proc.stdout))

    if fails == 0 and passes >= 10 and proc.returncode == 0:
        verdict, reason, rc = "PASS", f"all checks green ({passes} passes, 0 fails)", 0
    else:
        verdict, reason, rc = "FAIL", f"{fails} check(s) failed, {passes} passed", 1

    result = {
        "schema": "purpclaw.cert-gate.menu-mochi.v1",
        "cert_id": "agent_work/cert_gates/menu_mochi/",
        "verdict": verdict,
        "date": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "tests_pass": passes,
        "tests_fail": fails,
        "rewrite_origin": "legacy/reintegrate-2026-08-17/mochi/menu_mochi_extension",
        "rewrite_target": "apps/extensions/menu-mochi",
        "parity_impact": "Chrome/Edge browser-extension product now lives in apps/ alongside cli/desktop/web",
        "honest_label": "structure cert only; runtime behaviour requires loading the unpacked extension in a real browser",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\n[menu-mochi cert] verdict={verdict} reason={reason}")
    print(f"[menu-mochi cert] wrote {RESULT_PATH}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
