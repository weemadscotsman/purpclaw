#!/usr/bin/env python3
"""COORDINATOR DECOMPOSER CERT GATE — verify_coordinator_decomposer.py"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CERT_DIR = Path(__file__).resolve().parent
RESULT_PATH = CERT_DIR / "result.json"
TEST_PATH = ROOT / "tests" / "coordinator_decomposer" / "test_wire.js"


def main() -> int:
    if not TEST_PATH.exists():
        print(f"FAIL: test missing {TEST_PATH}", file=sys.stderr)
        return 1

    print(f"[coordinator-decomposer cert] running {TEST_PATH.relative_to(ROOT)} ...")
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
    elif failed == 0 and passed == total and total >= 8:
        verdict, reason, rc = "PASS", f"all {passed}/{total} tests green", 0
    else:
        verdict, reason, rc = "FAIL", f"{failed} of {total} tests failed", 1

    result = {
        "schema": "purpclaw.cert-gate.coordinator-decomposer.v1",
        "cert_id": "agent_work/cert_gates/coordinator_decomposer/",
        "verdict": verdict,
        "date": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "tests_total": total,
        "tests_pass": passed,
        "tests_fail": failed,
        "bug_class": "require-path mismatch",
        "fix": "copied task_decomposer.js + agent_routing_matrix.js from project root to services/swarm/",
        "remaining_in_same_pattern": [
            "lib/context-packet.js (referenced as ./lib/context-packet.js by coordinator)",
            "lib/llm-provider.js (referenced as ./lib/llm-provider.js by coordinator)",
            "lib/self-context.js (referenced as ./lib/self-context.js by coordinator)",
            "lib/memory-client.js (referenced as ./lib/memory-client.js by coordinator)",
            "lib/cognitive-client.js (referenced as ./lib/cognitive-client.js by coordinator)",
        ],
        "honest_label": "decomposer wired; 5 sibling lib/ modules still need the same fix; live coordinator lane still not Tesco-testable (also needs EventBus on 7782)",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\n[coordinator-decomposer cert] verdict={verdict} reason={reason}")
    print(f"[coordinator-decomposer cert] wrote {RESULT_PATH}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
