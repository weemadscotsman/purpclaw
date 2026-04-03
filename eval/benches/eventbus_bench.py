"""EventBus benchmark: measures event publish, delivery, and fanout latency."""
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


def eventbus_probe(action, timeout=5):
    """Make an HTTP probe to eventbus endpoint via curl."""
    try:
        subprocess.run(
            ["curl", "-s", "-o", "NUL", "-w", "%{time_total}",
             f"http://localhost:8080/eventbus/{action}"],
            capture_output=True, timeout=timeout
        )
    except Exception:
        pass


def benchmark_eventbus_publish():
    """Measure event publish latency."""
    def run():
        start = time.perf_counter()
        eventbus_probe("publish")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("eventbus:publish", run, iterations=25)


def benchmark_eventbus_delivery():
    """Measure event delivery latency to subscriber."""
    def run():
        start = time.perf_counter()
        eventbus_probe("deliver")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("eventbus:delivery", run, iterations=25)


def benchmark_eventbus_fanout():
    """Measure fanout to multiple subscribers."""
    def run():
        start = time.perf_counter()
        eventbus_probe("fanout")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("eventbus:fanout", run, iterations=15)


def benchmark_eventbus_backpressure():
    """Measure backpressure handling under high volume."""
    def run():
        start = time.perf_counter()
        for _ in range(50):
            eventbus_probe("backpressure")
        return (time.perf_counter() - start) * 1000

    return run_benchmark("eventbus:backpressure", run, iterations=8)


if __name__ == "__main__":
    print("=== EventBus Benchmark Suite ===")
    benchmark_eventbus_publish()
    benchmark_eventbus_delivery()
    benchmark_eventbus_fanout()
    benchmark_eventbus_backpressure()
    print("=== Done ===")