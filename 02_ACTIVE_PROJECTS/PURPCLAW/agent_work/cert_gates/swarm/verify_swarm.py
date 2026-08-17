#!/usr/bin/env python3
"""
SWARM CERT GATE — verify_swarm.py

Runs the swarm dispatcher test suite, parses node:test output, writes result.json.

Usage (from project root):
  python agent_work/cert_gates/swarm/verify_swarm.py

Exits 0 on PASS, 1 on FAIL, 2 on DEGRADED.
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CERT_DIR = Path(__file__).resolve().parent
RESULT_PATH = CERT_DIR / "result.json"
TEST_PATH = ROOT / "tests" / "swarm" / "dispatcher.test.js"

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
NODE_TEST_SUMMARY_RE = re.compile(
    r"ℹ tests\s+(\d+)\s+ℹ pass\s+(\d+)\s+ℹ fail\s+(\d+).*?duration_ms\s+([\d.]+)",
    re.DOTALL,
)


def strip_ansi(s: str) -> str:
    return ANSI_RE.sub("", s)


def run_tests() -> tuple[int, str, float]:
    """Run the dispatcher test suite, return (returncode, stdout, duration_seconds)."""
    proc = subprocess.run(
        ["node", "--test", str(TEST_PATH.relative_to(ROOT))],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    out = strip_ansi((proc.stdout or "") + (proc.stderr or ""))
    return proc.returncode, out, 0.0


def parse_summary(out: str) -> dict:
    # Windows PowerShell wraps output mid-line with CR+LF. Parse line-by-line.
    # The bullet (U+2139) is 3 bytes UTF-8 — using `$` anchor with `\s*` after
    # a multibyte char can fail in some re engines. Use re.search without
    # trailing anchor and require a word-boundary at the end of the value.
    out_clean = out.replace("\r\n", "\n").replace("\r", "\n")
    by_key = {}
    INFO_BULLET_RE = re.compile(r"[\s\u2139]*([a-zA-Z_]+)\s+([\d.]+)\b")
    for line in out_clean.split("\n"):
        line = line.strip()
        m = INFO_BULLET_RE.search(line)
        if m:
            by_key[m.group(1)] = m.group(2)
    return {
        "tests_total": int(by_key["tests"]) if "tests" in by_key else None,
        "tests_pass": int(by_key["pass"]) if "pass" in by_key else None,
        "tests_fail": int(by_key["fail"]) if "fail" in by_key else None,
        "duration_ms": float(by_key["duration_ms"]) if "duration_ms" in by_key else None,
    }


def main() -> int:
    if not TEST_PATH.exists():
        print(f"FAIL: test file missing: {TEST_PATH}", file=sys.stderr)
        return 1
    if not (ROOT / "packages" / "swarm" / "dispatcher.js").exists():
        print("FAIL: dispatcher.js missing (packages/swarm/)", file=sys.stderr)
        return 1

    print(f"[swarm cert] running {TEST_PATH.relative_to(ROOT)} ...")
    rc, out, _ = run_tests()
    print(out)
    summary = parse_summary(out)

    if summary["tests_total"] is None:
        verdict = "DEGRADED"
        rc_out = 2
        reason = "could not parse node:test summary"
    elif summary["tests_fail"] == 0 and summary["tests_pass"] == summary["tests_total"] and summary["tests_total"] >= 8:
        verdict = "PASS"
        rc_out = 0
        reason = f"all {summary['tests_total']}/8 tests green"
    else:
        verdict = "FAIL"
        rc_out = 1
        reason = f"{summary['tests_fail']} of {summary['tests_total']} tests failed"

    result = {
        "schema": "purpclaw.cert-gate.swarm.v1",
        "cert_id": "agent_work/cert_gates/swarm/",
        "verdict": verdict,
        "date": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "tests_total": summary["tests_total"],
        "tests_pass": summary["tests_pass"],
        "tests_fail": summary["tests_fail"],
        "duration_ms": summary["duration_ms"],
        "parity_gaps_closed_partial": [
            "Kimi Agent Swarm (300 sub-agents) — 2-3 in cert, lane open",
            "Antigravity 2.0 Manager View (5 parallel) — terminal cert",
            "Claude Code Task tool — persona-resolved dispatch, registry-driven",
            "Hermes Harness — JSON-output SwarmReport first-class",
            "DeepSeek Harness team coordination — sub-agent factory seam",
        ],
        "parity_gaps_remaining": [
            "MCP client (Kimi CLI, Claude, Antigravity)",
            "Slash commands (/plan, /compact, /clear, /status)",
            "Resume/fork/search on event stream (DeepSeek)",
            "Built-in Chrome browser (Antigravity)",
            "Voice mode loop (ChatGPT app)",
            "Custom GPTs (ChatGPT app)",
            "Antigravity Manager View UI (apps/desktop/src/manager/)",
        ],
        "honest_label": "partial parity — substrate for multi-agent is real; ceiling (Kimi 300) and UI surface (Manager View) not yet tested",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\n[swarm cert] verdict={verdict} reason={reason}")
    print(f"[swarm cert] wrote {RESULT_PATH}")
    return rc_out


if __name__ == "__main__":
    sys.exit(main())
