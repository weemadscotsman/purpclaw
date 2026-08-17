"""services/console cert — real Python test, no mocks.

Verifies that the rewritten purpconsole (now services/console/) works:
- features module loads with 6 Feature records
- text_report.render_human() produces output
- text_report.render_json() produces valid JSON with the right shape
- by_id() lookups work
- the parity command's full stack works end-to-end (python -m services.console)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

# Make services.console importable when run as a script
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from services.console.features import FEATURES, Feature, by_id  # noqa: E402
from services.console.text_report import render_human, render_json  # noqa: E402


def test_features_count():
    assert len(FEATURES) == 6, f"expected 6 features, got {len(FEATURES)}"


def test_features_have_required_fields():
    for f in FEATURES:
        assert isinstance(f, Feature)
        assert f.n and len(f.n) == 2
        assert f.title
        assert f.blurb
        assert f.detail
        assert f.status in ("live", "partial", "gap")
        assert f.accent in ("cyan", "violet", "emerald", "amber", "rose", "sky")
        assert f.channels and len(f.channels) > 0


def test_features_unique_ids():
    ids = [f.n for f in FEATURES]
    assert len(ids) == len(set(ids)), f"duplicate feature ids: {ids}"


def test_status_counts_match():
    counts = {"live": 0, "partial": 0, "gap": 0}
    for f in FEATURES:
        counts[f.status] += 1
    total = sum(counts.values())
    assert total == 6
    # As of 2026-08-17: 1 live (Delegates), 4 partial, 1 gap (Scheduled)
    assert counts["live"] >= 1, "expected at least 1 live feature"
    assert counts["partial"] >= 1, "expected at least 1 partial feature"
    assert counts["gap"] >= 1, "expected at least 1 gap feature"


def test_by_id_lookup():
    f = by_id("04")
    assert f is not None
    assert f.title == "Delegates & Parallelizes"
    f_missing = by_id("99")
    assert f_missing is None


def test_render_human_runs():
    out = render_human()
    assert "PURPCLAW Parity Dashboard" in out
    for f in FEATURES:
        assert f.title in out, f"feature '{f.title}' missing from human render"
    # Counts line
    assert "live" in out and "partial" in out and "gap" in out


def test_render_json_valid():
    out = render_json()
    data = json.loads(out)
    assert data["schema"] == "purpclaw.parity-dashboard.v1"
    assert len(data["features"]) == 6
    assert "counts" in data
    assert data["counts"]["live"] + data["counts"]["partial"] + data["counts"]["gap"] == 6
    # First feature shape
    f0 = data["features"][0]
    for k in ("n", "title", "blurb", "detail", "channels", "status"):
        assert k in f0, f"feature missing key: {k}"


def test_cli_text_mode_end_to_end():
    """Spawn `python -m services.console --text` and verify it prints the dashboard."""
    proc = subprocess.run(
        [sys.executable, "-m", "services.console", "--text"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert proc.returncode == 0, f"non-zero exit: {proc.stderr}"
    assert "PURPCLAW Parity Dashboard" in proc.stdout
    # textual may not be installed — that's a stderr warning, not a failure
    for f in FEATURES:
        assert f.title in proc.stdout, f"feature '{f.title}' missing from CLI output"


def test_cli_json_mode_end_to_end():
    proc = subprocess.run(
        [sys.executable, "-m", "services.console", "--json"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert proc.returncode == 0
    data = json.loads(proc.stdout)
    assert data["schema"] == "purpclaw.parity-dashboard.v1"
    assert len(data["features"]) == 6


def test_cli_by_id_end_to_end():
    proc = subprocess.run(
        [sys.executable, "-m", "services.console", "--by-id", "04"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert proc.returncode == 0
    data = json.loads(proc.stdout)
    assert data["n"] == "04"
    assert data["title"] == "Delegates & Parallelizes"


if __name__ == "__main__":
    # Run as a script for the cert gate
    failures = 0
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failures += 1
        except Exception as e:
            print(f"  ERROR {t.__name__}: {type(e).__name__}: {e}")
            failures += 1
    print(f"\n{len(tests) - failures}/{len(tests)} tests passed")
    sys.exit(0 if failures == 0 else 1)
