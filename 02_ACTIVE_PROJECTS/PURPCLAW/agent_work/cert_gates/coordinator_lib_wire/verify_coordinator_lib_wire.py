#!/usr/bin/env python3
"""COORDINATOR LIB WIRE CERT GATE — verify_coordinator_lib_wire.py"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CERT_DIR = Path(__file__).resolve().parent
RESULT_PATH = CERT_DIR / "result.json"
TEST_PATH = ROOT / "tests" / "coordinator_lib_wire" / "test_wire.js"


def main() -> int:
    if not TEST_PATH.exists():
        print(f"FAIL: test missing {TEST_PATH}", file=sys.stderr)
        return 1

    print(f"[coordinator-lib-wire cert] running {TEST_PATH.relative_to(ROOT)} ...")
    import os as _os
    proc = subprocess.run(
        ["node", "--test", str(TEST_PATH.relative_to(ROOT))],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        env={**_os.environ, "NO_COLOR": "1", "FORCE_COLOR": "0", "PYTHONIOENCODING": "utf-8"},
    )
    print(proc.stdout)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)

    by_key = {}
    out = proc.stdout.replace("\r\n", "\n").replace("\r", "\n")
    for line in out.split("\n"):
        line = line.strip()
        m = re.match(r"^[\s\u2139]*([a-zA-Z_]+)\s+([\d.]+)\b", line)
        if m:
            by_key[m.group(1)] = m.group(2)
    total = int(by_key.get("tests", 0))
    passed = int(by_key.get("pass", 0))
    failed = int(by_key.get("fail", 0))

    if total == 0:
        verdict, reason, rc = "FAIL", "could not parse node:test summary", 1
    elif failed == 0 and passed == total and total >= 10:
        verdict, reason, rc = "PASS", f"all {passed}/{total} tests green", 0
    else:
        verdict, reason, rc = "FAIL", f"{failed} of {total} tests failed", 1

    result = {
        "schema": "purpclaw.cert-gate.coordinator-lib-wire.v1",
        "cert_id": "agent_work/cert_gates/coordinator_lib_wire/",
        "verdict": verdict,
        "date": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "tests_total": total,
        "tests_pass": passed,
        "tests_fail": failed,
        "pattern_fixed": "5 lib/ require paths + 1 task_decomposer inner require path + 1 agent_score copy",
        "remaining_to_tesco_testable": [
            "EventBus service on port 7782 must be started",
            "LLM provider needs API keys for actual chat (loads offline)",
            "Tower service on port 7790 must be started",
        ],
        "honest_label": "all 7 dependencies load clean; full /api/coordinate round-trip not yet certified (EventBus + Tower still down)",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\n[coordinator-lib-wire cert] verdict={verdict} reason={reason}")
    print(f"[coordinator-lib-wire cert] wrote {RESULT_PATH}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
