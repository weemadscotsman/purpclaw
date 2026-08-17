#!/usr/bin/env python3
"""
SLASH COMMANDS CERT GATE — verify_slash_commands.py

Runs the slash command test suite, parses results, writes result.json.

Usage (from project root):
  python agent_work/cert_gates/slash_commands/verify_slash_commands.py
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
TEST_PATH = ROOT / "tests" / "slash_commands" / "test_slash_commands.js"

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
SUMMARY_RE = re.compile(r"tests\s+(\d+)\s+.*?pass\s+(\d+)\s+.*?fail\s+(\d+).*?duration_ms\s+([\d.]+)", re.DOTALL)


def main() -> int:
    if not TEST_PATH.exists():
        print(f"FAIL: test file missing: {TEST_PATH}", file=sys.stderr)
        return 1

    print(f"[slash-commands cert] running {TEST_PATH.relative_to(ROOT)} ...")
    import os as _os
    proc = subprocess.run(
        ["node", "--test", str(TEST_PATH.relative_to(ROOT))],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
        env={**_os.environ, "NO_COLOR": "1", "FORCE_COLOR": "0", "PYTHONIOENCODING": "utf-8"},
    )
    out = ANSI_RE.sub("", (proc.stdout or "") + (proc.stderr or ""))
    # PowerShell may wrap; normalize
    out = out.replace("\r\n", "\n").replace("\r", "\n")
    print(out)

    by_key = {}
    for line in out.split("\n"):
        line = line.strip()
        m = re.match(r"^[\s\u2139]*([a-zA-Z_]+)\s+([\d.]+)\b", line)
        if m:
            by_key[m.group(1)] = m.group(2)

    total = int(by_key["tests"]) if "tests" in by_key else 0
    passed = int(by_key["pass"]) if "pass" in by_key else 0
    failed = int(by_key["fail"]) if "fail" in by_key else 0

    if total == 0:
        verdict, reason, rc = "FAIL", "could not parse node:test summary", 1
    elif failed == 0 and passed == total and total >= 8:
        verdict, reason, rc = "PASS", f"all {passed}/{total} tests green", 0
    else:
        verdict, reason, rc = "FAIL", f"{failed} of {total} tests failed", 1

    result = {
        "schema": "purpclaw.cert-gate.slash-commands.v1",
        "cert_id": "agent_work/cert_gates/slash_commands/",
        "verdict": verdict,
        "date": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "tests_total": total,
        "tests_pass": passed,
        "tests_fail": failed,
        "parity_gaps_closed": [
            "Claude Code slash commands (/plan, /compact, /clear)",
            "Antigravity CLI slash ergonomics",
            "Kimi CLI slash surface",
        ],
        "new_commands": ["/plan", "/clear", "/compact"],
        "honest_label": "slash prefix transparent + 3 new commands; /plan is a deterministic scaffold, not yet LLM-generated",
    }
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\n[slash-commands cert] verdict={verdict} reason={reason}")
    print(f"[slash-commands cert] wrote {RESULT_PATH}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
