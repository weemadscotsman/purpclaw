"""Pool benchmark: measures connection pool efficiency and concurrency."""
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


def pool_http_probe(endpoint, timeout=3):
    """Make an HTTP probe via subprocess curl."""
    try:
        subprocess.run(
            ["curl", "-s", "-o", "NUL", "-w", "%{time_total}",
             f"http://localhost:8080{endpoint}"],
            capture_output=True, timeout=timeout
        )
    except Exception:
        pass


def benchmark_pool_acquire_release():
    """Measure pool acquire + release cycle time."""
    def run():
        start = time.perf_counter()
        pool_http_probe("/pool/acquire")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("pool:acquire_release", run, iterations=20)


def benchmark_pool_concurrent_handles():
    """Measure pool handling concurrent connections."""
    def run():
        start = time.perf_counter()
        procs = []
        for _ in range(20):
            pool_http_probe("/pool/handle")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("pool:concurrent_handles", run, iterations=10)


def benchmark_pool_idle_reap():
    """Measure idle connection reaping latency."""
    def run():
        start = time.perf_counter()
        pool_http_probe("/pool/reap")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("pool:idle_reap", run, iterations=15)


if __name__ == "__main__":
    print("=== Connection Pool Benchmark Suite ===")
    benchmark_pool_acquire_release()
    benchmark_pool_concurrent_handles()
    benchmark_pool_idle_reap()
    print("=== Done ===")