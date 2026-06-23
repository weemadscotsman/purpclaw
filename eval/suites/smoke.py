#!/usr/bin/env python3
"""
Smoke tests — poll all PURPCLAW services and print status.
Runs standalone: python eval/suites/smoke.py
"""

import json, os, sys, time, urllib.request, urllib.error
from typing import Any

# Actual PURPCLAW service endpoints
SERVICES = [
    ("orchestrator", "http://localhost:7784/health"),
    ("pool",          "http://localhost:7885/health"),
    ("diagnostics",   "http://localhost:7786/health"),
    ("rules",         "http://localhost:7787/health"),
    ("memory",        "http://localhost:7880/health"),
    ("modal",         "http://localhost:7785/health"),
    ("avatar",        "http://localhost:7777/health"),
    ("yolo",          "http://localhost:7779/health"),
]

TIMEOUT = 3


def poll_service(name: str, url: str) -> dict[str, Any]:
    try:
        start = time.perf_counter()
        req = urllib.request.Request(url, headers={"User-Agent": "purpclaw-smoke/1.0"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            elapsed = time.perf_counter() - start
            body = resp.read().decode("utf-8", errors="replace")
            data = None
            try:
                data = json.loads(body)
            except Exception:
                pass
            return {"name": name, "url": url, "status": "UP",
                    "latency_ms": round(elapsed * 1000, 1), "data": data, "error": None}
    except urllib.error.HTTPError as e:
        return {"name": name, "url": url, "status": "HTTP_ERROR",
                "latency_ms": None, "data": None, "error": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"name": name, "url": url, "status": "DOWN",
                "latency_ms": None, "data": None, "error": str(e.reason)}
    except Exception as e:
        return {"name": name, "url": url, "status": "ERROR",
                "latency_ms": None, "data": None, "error": str(e)}


def main() -> int:
    print("=== PURPCLAW SMOKE TESTS ===\n")

    results = []
    for name, url in SERVICES:
        r = poll_service(name, url)
        results.append(r)
        status = r["status"]
        lat = f"{r['latency_ms']}ms" if r["latency_ms"] is not None else "—"

        if status == "UP":
            print(f"  [UP]   {name:<15} {url:<40} {lat}")
        else:
            print(f"  [DOWN] {name:<15} {url:<40} {lat}")
            if r["error"]:
                print(f"         → {r['error']}")

    up_count = sum(1 for r in results if r["status"] == "UP")
    total = len(results)
    print(f"\n{up_count}/{total} services UP")

    if up_count == total:
        return 0
    else:
        down = [r["name"] for r in results if r["status"] != "UP"]
        print(f"DOWN: {', '.join(down)}")
        return 1


if __name__ == "__main__":
    sys.exit(main())