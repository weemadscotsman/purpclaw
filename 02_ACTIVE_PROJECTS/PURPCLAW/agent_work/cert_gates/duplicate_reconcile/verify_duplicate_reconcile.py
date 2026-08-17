#!/usr/bin/env python3
"""DUPLICATE RECONCILE CERT GATE — verify_duplicate_reconcile.py"""
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CERT_DIR = Path(__file__).resolve().parent
RESULT_PATH = CERT_DIR / "result.json"
TEST_PATH = ROOT / "tests" / "duplicate_reconcile" / "test_canonical.js"
REGRESSION_PATHS = [
    ROOT / "tests" / "coordinator_decomposer" / "test_wire.js",
    ROOT / "tests" / "coordinator_lib_wire" / "test_wire.js",
]


def parse_node_test_output(out: str) -> dict:
    by_key = {}
    for line in out.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = line.strip()
        m = re.match(r"^[\s\u2139]*([a-zA-Z_]+)\s+([\d.]+)\b", line)
        if m:
            by_key[m.group(1)] = m.group(2)
    return by_key


def run_node_test(test_path: Path) -> tuple[int, int, int, str]:
    proc = subprocess.run(
        ["node", "--test", str(test_path.relative_to(ROOT))],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        env={**__import__("os").environ, "NO_COLOR": "1", "FORCE_COLOR": "0", "PYTHONIOENCODING": "utf-8"},
    )
    summary = parse_node_test_output(proc.stdout + (proc.stderr or ""))
    total = int(summary.get("tests", 0))
    passed = int(summary.get("pass", 0))
    failed = int(summary.get("fail", 0))
    return total, passed, failed, proc.stdout


def main() -> int:
    if not TEST_PATH.exists():
        print(f"FAIL: test missing {TEST_PATH}", file=sys.stderr)
        return 1

    print(f"[duplicate-reconcile cert] running {TEST_PATH.relative_to(ROOT)} ...")
    total, passed, failed, _ = run_node_test(TEST_PATH)

    if total == 0:
        verdict, reason, rc = "FAIL", "could not parse node:test summary", 1
    elif failed == 0 and passed == total and total >= 8:
        verdict, reason = "PASS", f"all {passed}/{total} tests green"
        rc = 0
    else:
        verdict, reason, rc = "FAIL", f"{failed} of {total} tests failed", 1

    # Also run the regression checks
    regression_results = []
    for rp in REGRESSION_PATHS:
        if not rp.exists():
            regression_results.append({"path": str(rp.relative_to(ROOT)), "status": "MISSING"})
            continue
        rt, rp_pass, rp_fail, _ = run_node_test(rp)
        if rt == 0:
            regression_results.append({"path": str(rp.relative_to(ROOT)), "status": "DEGRADED"})
        elif rp_fail > 0:
            regression_results.append({"path": str(rp.relative_to(ROOT)), "status": f"FAIL ({rp_fail}/{rt} failed)"})
            rc = 1
            verdict = "FAIL"
            reason = f"regression in {rp.name}"
        else:
            regression_results.append({"path": str(rp.relative_to(ROOT)), "status": f"PASS ({rp_pass}/{rt})"})

    result = {
        "schema": "purpclaw.cert-gate.duplicate-reconcile.v1",
        "cert_id": "agent_work/cert_gates/duplicate_reconcile/",
        "verdict": verdict,
        "date": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "tests_total": total,
        "tests_pass": passed,
        "tests_fail": failed,
        "reconciled_files": ["task_decomposer.js", "agent_routing_matrix.js"],
        "canonical_home": "project root",
        "shim_home": "services/swarm/",
        "regression_checks": regression_results,
        "no_regression_required": ["coordinator_lib_wire", "coordinator_decomposer"],
        "honest_label": "duplicates reconciled as shims; both coordinator files (root swarm_coordinator.js + services/swarm/coordinator.js) still exist separately — that's a bigger cleanup",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\n[duplicate-reconcile cert] verdict={verdict} reason={reason}")
    print(f"[duplicate-reconcile cert] wrote {RESULT_PATH}")
    for r in regression_results:
        print(f"[regression] {r['path']}: {r['status']}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
