"""Governance benchmark: measures proposal, voting, and tallying latency."""
import time
import subprocess
import sys

sys.path.insert(0, "C:/Users/Admin/Desktop")
try:
    from harness import run_benchmark
except Exception:
    def run_benchmark(name, fn, iterations=10):
        results = []
        for _ in range(iterations):
            start = time.perf_counter()
            fn()
            elapsed = (time.perf_counter() - start) * 1000
            results.append(elapsed)
        avg = sum(results) / len(results)
        p95 = sorted(results)[int(len(results) * 0.95)]
        print(f"[{name}] avg={avg:.2f}ms p95={p95:.2f}ms")
        return {"avg_ms": round(avg, 2), "p95_ms": round(p95, 2)}


def governance_probe(action, timeout=5):
    """Make an HTTP probe to governance endpoint via curl."""
    try:
        subprocess.run(
            ["curl", "-s", "-o", "NUL", "-w", "%{time_total}",
             f"http://localhost:8080/governance/{action}"],
            capture_output=True, timeout=timeout
        )
    except Exception:
        pass


def benchmark_governance_proposal():
    """Measure proposal creation latency."""
    def run():
        start = time.perf_counter()
        governance_probe("propose")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("governance:proposal", run, iterations=20)


def benchmark_governance_vote():
    """Measure vote submission latency."""
    def run():
        start = time.perf_counter()
        governance_probe("vote")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("governance:vote", run, iterations=20)


def benchmark_governance_tally():
    """Measure vote tallying latency."""
    def run():
        start = time.perf_counter()
        governance_probe("tally")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("governance:tally", run, iterations=15)


def benchmark_governance_quorum():
    """Measure quorum check latency."""
    def run():
        start = time.perf_counter()
        governance_probe("quorum")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("governance:quorum", run, iterations=15)


if __name__ == "__main__":
    print("=== Governance Benchmark Suite ===")
    benchmark_governance_proposal()
    benchmark_governance_vote()
    benchmark_governance_tally()
    benchmark_governance_quorum()
    print("=== Done ===")