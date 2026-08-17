#!/usr/bin/env python3
"""
CONSOLE CERT GATE — verify_console.py

Runs the services/console test suite, parses results, writes result.json.

Usage (from project root):
  python agent_work/cert_gates/console/verify_console.py

Exits 0 on PASS, 1 on FAIL.
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
TEST_PATH = ROOT / "tests" / "console" / "test_console.py"

PASS_LINE_RE = re.compile(r"\s*PASS\s+(\S+)")
FAIL_LINE_RE = re.compile(r"\s*FAIL\s+(\S+):\s*(.*)$")
SUMMARY_RE = re.compile(r"(\d+)/(\d+) tests passed")


def main() -> int:
    if not TEST_PATH.exists():
        print(f"FAIL: test file missing: {TEST_PATH}", file=sys.stderr)
        return 1

    print(f"[console cert] running {TEST_PATH.relative_to(ROOT)} ...")
    proc = subprocess.run(
        [sys.executable, str(TEST_PATH.relative_to(ROOT))],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )
    print(proc.stdout)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)

    summary = SUMMARY_RE.search(proc.stdout)
    passed = int(summary.group(1)) if summary else 0
    total = int(summary.group(2)) if summary else 0
    fails = [m.group(0) for m in FAIL_LINE_RE.finditer(proc.stdout)]

    if total == 0:
        verdict = "FAIL"
        reason = "could not parse test summary"
        rc = 1
    elif len(fails) == 0 and passed == total and total >= 10:
        verdict = "PASS"
        reason = f"all {passed}/{total} tests green"
        rc = 0
    else:
        verdict = "FAIL"
        reason = f"{len(fails)} of {total} tests failed"
        rc = 1

    result = {
        "schema": "purpclaw.cert-gate.console.v1",
        "cert_id": "agent_work/cert_gates/console/",
        "verdict": verdict,
        "date": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "tests_total": total,
        "tests_pass": passed,
        "tests_fail": len(fails),
        "rewrite_origin": "legacy/reintegrate-2026-08-17/purpconsole",
        "rewrite_target": "services/console",
        "cli_surface": "node bin/purpclaw.js parity [--json] [--by-id NN]",
        "honest_label": (
            "plain-text fallback certified; Textual TUI code intact but visual cert "
            "deferred until `pip install textual` lands on the runtime"
        ),
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\n[console cert] verdict={verdict} reason={reason}")
    print(f"[console cert] wrote {RESULT_PATH}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
