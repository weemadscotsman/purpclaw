#!/usr/bin/env python3
"""
Regression test: loads baseline.json, runs benchmarks, and detects regressions.
Baseline is read from BASELINE env var or defaults to eval/baseline.json.
Results are written to eval/results/YYYY-MM-DD_HH-MM-SS_regression.json.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Any

BENCHMARK_URL = os.environ.get("BENCHMARK_URL", "http://localhost:8080/benchmark")
BASELINE_PATH = os.environ.get("BASELINE", str(Path(__file__).parent.parent / "baseline.json"))
RESULTS_DIR = Path(__file__).parent.parent / "results"
TIMEOUT = 30
REGRESSION_THRESHOLD = 0.10  # 10% slower or error rate increase = regression


def load_baseline() -> dict[str, Any]:
    """Load baseline metrics from JSON file."""
    path = Path(BASELINE_PATH)
    if not path.exists():
        print(f"WARNING: baseline not found at {path}; creating empty baseline.")
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_baseline(baseline: dict[str, Any]) -> None:
    """Save current run as new baseline."""
    path = Path(BASELINE_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(baseline, f, indent=2, ensure_ascii=False)


def save_results(data: dict[str, Any]) -> Path:
    """Save regression results to eval/results/."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    path = RESULTS_DIR / f"{stamp}_regression.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return path


def run_benchmark() -> dict[str, Any]:
    """Hit benchmark endpoint and collect metrics."""
    try:
        start = time.perf_counter()
        req = urllib.request.Request(
            BENCHMARK_URL,
            headers={"User-Agent": "regression-py/1.0", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            elapsed = time.perf_counter() - start
            body = resp.read().decode("utf-8", errors="replace")
            data = json.loads(body) if body else {}
            data["_latency_ms"] = round(elapsed * 1000, 2)
            data["_http_status"] = resp.status
            return data
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return {"_error": str(e), "_http_status": e.code, "_latency_ms": None}
    except Exception as e:
        return {"_error": str(e), "_http_status": None, "_latency_ms": None}


def compare(key: str, current: float | None, baseline_val: float | None) -> dict[str, Any]:
    """Compare current vs baseline value; detect regressions."""
    result = {
        "key": key,
        "current": current,
        "baseline": baseline_val,
        "regression": False,
        "message": "",
    }
    if current is None and baseline_val is None:
        result["message"] = "no data"
        return result
    if current is None:
        result["regression"] = True
        result["message"] = "current is None, baseline present"
        return result
    if baseline_val is None:
        result["message"] = "new metric (no baseline)"
        return result
    if baseline_val == 0:
        if current != 0:
            result["regression"] = True
            result["message"] = "baseline was 0"
        else:
            result["message"] = "both zero"
        return result
    delta_pct = (current - baseline_val) / abs(baseline_val)
    result["delta_pct"] = round(delta_pct * 100, 3)
    if delta_pct > REGRESSION_THRESHOLD:
        result["regression"] = True
        result["message"] = f"+{delta_pct*100:.1f}% vs baseline (threshold={REGRESSION_THRESHOLD*100}%)"
    else:
        result["message"] = f"OK ({delta_pct*100:+.1f}%)"
    return result


def detect_regressions(current: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    """Compare two result dicts key-by-key for known metric keys."""
    metric_keys = ["latency_ms", "throughput_rps", "error_rate", "p50_ms", "p95_ms", "p99_ms", "_latency_ms"]
    regressions = []
    for key in metric_keys:
        cv = current.get(key, current.get(key.replace("_", "")))
        bv = baseline.get(key, baseline.get(key.replace("_", "")))
        if isinstance(cv, (int, float)) or isinstance(bv, (int, float)):
            result = compare(key, cv, bv)
            if result["regression"]:
                regressions.append(result)
    return regressions


def print_summary(current: dict[str, Any], regressions: list[dict[str, Any]]) -> None:
    """Print a readable summary to stdout."""
    print("=== Regression Test Results ===")
    print()
    lat = current.get("_latency_ms", current.get("latency_ms"))
    print(f"  Latency : {lat}ms" if lat else "  Latency : —")
    print(f"  HTTP    : {current.get('_http_status', current.get('http_status', '—'))}")
    print()

    if not regressions:
        print("  No regressions detected.")
    else:
        print(f"  REGRESSIONS ({len(regressions)}):")
        for r in regressions:
            print(f"    - {r['key']}: {r['message']}")
    print()


def main() -> int:
    baseline = load_baseline()
    print(f"Baseline loaded: {len(baseline)} keys")

    current = run_benchmark()
    if current.get("_error"):
        print(f"Benchmark failed: {current['_error']}")
        results = {
            "timestamp": datetime.now().isoformat(),
            "error": current["_error"],
            "baseline_loaded": bool(baseline),
        }
        path = save_results(results)
        print(f"Results saved to {path}")
        return 2

    regressions = detect_regressions(current, baseline)

    results = {
        "timestamp": datetime.now().isoformat(),
        "baseline": baseline,
        "current": current,
        "regressions": regressions,
        "passed": len(regressions) == 0,
    }

    path = save_results(results)
    print_summary(current, regressions)
    print(f"Results saved to {path}")

    if regressions:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())