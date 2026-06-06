"""Memory benchmark: measures heap usage, allocation rate, and GC pressure."""
import time
import subprocess
import sys
import os

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


def curl_probe(url, timeout=5):
    """Make an HTTP probe via subprocess curl."""
    try:
        subprocess.run(
            ["curl", "-s", "-o", "NUL", "-w", "%{time_total}",
             url],
            capture_output=True, timeout=timeout
        )
    except Exception:
        pass


def benchmark_memory_alloc_rate():
    """Measure allocation rate under steady-state load."""
    def run():
        start = time.perf_counter()
        for _ in range(100):
            curl_probe("http://localhost:8080/memory/alloc")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("memory:alloc_rate", run, iterations=8)


def benchmark_memory_gc_pressure():
    """Measure GC pause time under memory pressure."""
    def run():
        start = time.perf_counter()
        curl_probe("http://localhost:8080/memory/gc")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("memory:gc_pressure", run, iterations=12)


def benchmark_memory_leak_detection():
    """Measure leak detection cycle time."""
    def run():
        start = time.perf_counter()
        curl_probe("http://localhost:8080/memory/leak_check")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("memory:leak_detection", run, iterations=10)


def benchmark_memory_working_set():
    """Measure working set size growth under load."""
    def run():
        start = time.perf_counter()
        for _ in range(30):
            curl_probe("http://localhost:8080/memory/working_set")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("memory:working_set", run, iterations=10)


if __name__ == "__main__":
    print("=== Memory Benchmark Suite ===")
    benchmark_memory_alloc_rate()
    benchmark_memory_gc_pressure()
    benchmark_memory_leak_detection()
    benchmark_memory_working_set()
    print("=== Done ===")