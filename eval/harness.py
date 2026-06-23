"""
eval/harness.py
TestHarness: health-checking, benchmarking, and regression-detection runner.
"""

import json
import time
import os
import statistics
import traceback
from pathlib import Path
from typing import Any, Callable, Optional


# ---------------------------------------------------------------------------
# Internal result / baseline structures
# ---------------------------------------------------------------------------

class BenchmarkResult:
    """Holder for a single benchmark run."""
    def __init__(self, name: str, value: float, unit: str = "", metadata: Optional[dict] = None):
        self.name = name
        self.value = value
        self.unit = unit
        self.metadata = metadata or {}
        self.timestamp = time.time()

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "value": self.value,
            "unit": self.unit,
            "metadata": self.metadata,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "BenchmarkResult":
        r = cls(d["name"], d["value"], d.get("unit", ""), d.get("metadata"))
        r.timestamp = d.get("timestamp", time.time())
        return r


class ServiceHealth:
    """Health status of a single service."""
    def __init__(self, name: str, reachable: bool, latency_ms: Optional[float] = None, error: Optional[str] = None):
        self.name = name
        self.reachable = reachable
        self.latency_ms = latency_ms
        self.error = error

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "reachable": self.reachable,
            "latency_ms": self.latency_ms,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# TestHarness
# ---------------------------------------------------------------------------

class TestHarness:
    """
    Orchestrates health checks, benchmarks, baseline management, and regression
    assertions for a test / benchmarking suite.

    Parameters
    ----------
    results_dir : str | Path
        Directory where results and baselines are persisted.
    regression_tolerance : float
        Fraction (0.0 – 1.0) accepted drift before assert_no_regression raises.
        E.g. 0.05 → flag if new result is >5 % worse than baseline.
    """

    DEFAULT_REGRESSION_TOLERANCE = 0.05

    def __init__(
        self,
        results_dir: str | Path = "./results",
        regression_tolerance: float = DEFAULT_REGRESSION_TOLERANCE,
    ):
        self.results_dir = Path(results_dir)
        self.regression_tolerance = regression_tolerance
        self._last_run: Optional[dict] = None
        self._baseline: Optional[dict] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def health_check(self, checker: Optional[Callable[[], bool]] = None) -> dict:
        """
        Run a generic health check.

        Parameters
        ----------
        checker : callable, optional
            Zero-argument callable that returns True (healthy) or False (unhealthy).
            If omitted, a trivial check returning True is used.

        Returns
        -------
        dict with keys:
            healthy   (bool)
            message   (str)
            timestamp (float)
        """
        healthy = True
        message = "OK"
        try:
            if checker is not None:
                healthy = bool(checker())
                if not healthy:
                    message = "checker returned False"
            else:
                healthy = True
        except Exception as exc:
            healthy = False
            message = f"exception: {exc}"
            traceback.print_exc()

        return {
            "healthy": healthy,
            "message": message,
            "timestamp": time.time(),
        }

    def probe_all_services(self, services: list[dict]) -> list[dict]:
        """
        Probe a list of services and collect health data.

        Parameters
        ----------
        services : list[dict]
            Each dict must contain at minimum a ``name`` key.
            Supported optional keys: ``url``, ``check_fn`` (callable).

        Returns
        -------
        list[ServiceHealth dicts], stored in ``self._last_run["services"]``.
        """
        results = []
        for svc in services:
            name = svc.get("name", "?")
            result = self._probe_service(svc)
            results.append(result)

        if self._last_run is None:
            self._last_run = {}
        self._last_run["services"] = results
        return results

    def run_benchmark(
        self,
        fn: Callable[[], Any],
        name: Optional[str] = None,
        unit: str = "",
        metadata: Optional[dict] = None,
        iterations: int = 1,
    ) -> BenchmarkResult:
        """
        Execute ``fn`` (optionally multiple ``iterations``) and record its result.

        Parameters
        ----------
        fn       : callable returning a comparable numeric value.
        name     : benchmark name (defaults to ``fn.__name__``).
        unit     : unit string for the metric (e.g. "ms", "ops/s").
        metadata : extra key/value tags attached to the result.
        iterations : number of times to call ``fn`` (median is used when >1).

        Returns
        -------
        BenchmarkResult, also stored in ``self._last_run["benchmarks"]``.
        """
        if name is None:
            name = fn.__name__

        values = []
        for _ in range(iterations):
            t0 = time.perf_counter()
            val = fn()
            elapsed = (time.perf_counter() - t0) * 1000  # ms
            values.append(elapsed if val is None else float(val))

        value = statistics.median(values) if len(values) > 1 else values[0]

        result = BenchmarkResult(name=name, value=value, unit=unit, metadata=metadata)

        if self._last_run is None:
            self._last_run = {}
        if "benchmarks" not in self._last_run:
            self._last_run["benchmarks"] = []
        self._last_run["benchmarks"].append(result.to_dict())

        return result

    def save_results(self, label: Optional[str] = None, path: Optional[Path] = None) -> Path:
        """
        Persist ``self._last_run`` to disk as JSON.

        Parameters
        ----------
        label : str, optional
            Human-readable run identifier; used in the filename.
            Defaults to an ISO timestamp.
        path : Path, optional
            Full output path; if omitted, defaults to
            ``<results_dir>/runs/<label>.json``.

        Returns
        -------
        Path to the saved file.
        """
        if self._last_run is None:
            raise RuntimeError("No results to save — run benchmarks first.")

        self.results_dir.mkdir(parents=True, exist_ok=True)

        if path is None:
            run_dir = self.results_dir / "runs"
            run_dir.mkdir(parents=True, exist_ok=True)
            label_str = label or time.strftime("%Y%m%dT%H%M%S")
            path = run_dir / f"{label_str}.json"

        payload = self._last_run.copy()
        payload["saved_at"] = time.time()

        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)

        return path

    def load_baseline(self, path: Optional[Path | str] = None) -> dict:
        """
        Load a baseline from disk.

        Parameters
        ----------
        path : Path | str, optional
            Path to the baseline JSON. If omitted, attempts
            ``<results_dir>/baseline.json``.

        Returns
        -------
        dict — the loaded baseline, also stored in ``self._baseline``.
        """
        if path is None:
            path = self.results_dir / "baseline.json"
        else:
            path = Path(path)

        if not path.exists():
            raise FileNotFoundError(f"No baseline found at {path}")

        with open(path, "r", encoding="utf-8") as fh:
            baseline = json.load(fh)

        self._baseline = baseline
        return baseline

    def assert_no_regression(
        self,
        baseline: Optional[dict] = None,
        tolerance: Optional[float] = None,
    ) -> dict:
        """
        Compare latest results against a baseline and flag regressions.

        Parameters
        ----------
        baseline  : dict, optional; uses ``self._baseline`` if omitted.
        tolerance : float, optional; uses ``self.regression_tolerance`` if omitted.

        Returns
        -------
        dict with keys:
            passed        (bool)
            regressed     (list[str]) — benchmark names that got worse
            improved      (list[str]) — benchmark names that got better
            details       (list[dict])
        """
        if baseline is None:
            if self._baseline is None:
                raise RuntimeError("No baseline loaded — call load_baseline() first.")
            baseline = self._baseline

        tol = tolerance if tolerance is not None else self.regression_tolerance

        if self._last_run is None:
            raise RuntimeError("No current results — run benchmarks first.")

        regressed = []
        improved = []
        details = []

        # Normalise to dicts
        current_benchmarks = {
            b["name"]: b
            for b in self._last_run.get("benchmarks", [])
        }
        baseline_benchmarks = {
            b["name"]: b
            for b in baseline.get("benchmarks", [])
        }

        all_names = set(current_benchmarks) | set(baseline_benchmarks)

        for name in sorted(all_names):
            cur = current_benchmarks.get(name)
            bas = baseline_benchmarks.get(name)

            if cur is None or bas is None:
                # Can't compare when one is missing
                details.append({
                    "name": name,
                    "status": "missing",
                    "baseline_value": bas["value"] if bas else None,
                    "current_value": cur["value"] if cur else None,
                })
                continue

            bval = float(bas["value"])
            cval = float(cur["value"])
            if bval == 0:
                # Avoid division by zero; flag if non-zero result appears
                if cval != 0:
                    regressed.append(name)
                    details.append({
                        "name": name,
                        "status": "regressed",
                        "baseline_value": bval,
                        "current_value": cval,
                        "drift": None,
                    })
                else:
                    details.append({
                        "name": name,
                        "status": "unchanged",
                        "baseline_value": bval,
                        "current_value": cval,
                        "drift": 0.0,
                    })
                continue

            drift = (cval - bval) / bval  # positive = worse

            if drift > tol:
                regressed.append(name)
                status = "regressed"
            elif drift < -tol:
                improved.append(name)
                status = "improved"
            else:
                status = "ok"

            details.append({
                "name": name,
                "status": status,
                "baseline_value": bval,
                "current_value": cval,
                "drift": round(drift * 100, 2),  # percent
            })

        passed = len(regressed) == 0

        verdict = {
            "passed": passed,
            "regressed": regressed,
            "improved": improved,
            "details": details,
            "tolerance_pct": round(tol * 100, 1),
        }

        return verdict

    def report(self, last_run: Optional[dict] = None, verbose: bool = False) -> str:
        """
        Render a human-readable text report from a run dict.

        Parameters
        ----------
        last_run : dict, optional; uses ``self._last_run`` if omitted.
        verbose  : bool, shows full metadata when True.

        Returns
        -------
        str — the formatted report.
        """
        if last_run is None:
            last_run = self._last_run

        if last_run is None:
            return "(no run data available)"

        lines = []
        lines.append("=" * 60)
        lines.append(" TestHarness Report")
        lines.append("=" * 60)

        # Timestamp
        ts = last_run.get("timestamp", 0) or last_run.get("saved_at", 0)
        if ts:
            lines.append(f"  Run at : {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(ts))}")

        # Services
        services = last_run.get("services", [])
        if services:
            lines.append("\n Services:")
            for s in services:
                status = "UP" if s.get("reachable") else "DOWN"
                latency = f" ({s.get('latency_ms', '?')} ms)" if s.get("reachable") else ""
                lines.append(f"    [{status}] {s.get('name', '?')}{latency}")

        # Benchmarks
        benchmarks = last_run.get("benchmarks", [])
        if benchmarks:
            lines.append("\n Benchmarks:")
            for b in benchmarks:
                name   = b.get("name", "?")
                value  = b.get("value", "?")
                unit   = b.get("unit", "")
                meta   = b.get("metadata", {})
                lines.append(f"    {name}: {value} {unit}")
                if verbose and meta:
                    for k, v in meta.items():
                        lines.append(f"        {k} = {v}")

        lines.append("=" * 60)
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _probe_service(self, svc: dict) -> dict:
        """Probe a single service definition and return a ServiceHealth dict."""
        name = svc.get("name", "?")
        check_fn = svc.get("check_fn")

        if check_fn is not None:
            try:
                t0 = time.perf_counter()
                result = bool(check_fn())
                latency = (time.perf_counter() - t0) * 1000
                return ServiceHealth(name, reachable=result, latency_ms=round(latency, 3)).to_dict()
            except Exception as exc:
                return ServiceHealth(name, reachable=False, error=str(exc)).to_dict()

        # Fallback: URL-based check
        url = svc.get("url")
        if url:
            return self._probe_url(name, url)

        return ServiceHealth(name, reachable=False, error="no check_fn or url").to_dict()

    def _probe_url(self, name: str, url: str) -> dict:
        """Simple URL reachability probe."""
        import urllib.request
        import urllib.error

        try:
            t0 = time.perf_counter()
            req = urllib.request.Request(url, method="HEAD")
            urllib.request.urlopen(req, timeout=5)
            latency = (time.perf_counter() - t0) * 1000
            return ServiceHealth(name, reachable=True, latency_ms=round(latency * 1000, 3)).to_dict()
        except Exception as exc:
            return ServiceHealth(name, reachable=False, error=str(exc)).to_dict()