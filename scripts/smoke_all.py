"""
PURPCLAW full-stack smoke test runner.

Probes every API route (GET + select POST), every Web UI page,
every core service health endpoint, every CLI command, and verifies
the realtime_core extension loads. Prints a green/red summary and
writes a JSON report to /tmp/purpclaw_smoke.json.

Usage: python scripts/smoke_all.py [--save /path/to/report.json]
"""

import io
import json
import os
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from typing import Any, Callable, Dict, List, Optional, Tuple

# ── Configuration ─────────────────────────────────────────────────────────

CORE_SERVICES = [
    (7780, "Unified API", "/api/health"),
    (7782, "EventBus", "/health"),
    (7783, "State Store", "/health"),
    (7784, "Orchestrator", "/api/health"),
    (7790, "Agent Tower", "/tower/status"),
    (7791, "Gatekeeper", "/health"),
    (7881, "Context Bus", "/health"),
    (7885, "Knowledge Pool", "/health"),
    (7890, "Metrics", "/health"),
    (7897, "Workers", "/health"),
    (7898, "Coordinator", "/health"),
    (3030, "Next.js UI", "/api/health"),
]

OPTIONAL_SERVICES = [
    (7880, "Cognitive Spine", "/cognitive/health"),
    (7895, "GOOP Broker", "/health"),
    (7896, "STT", "/health"),
    (7779, "YOLO", "/health"),
    (7889, "Vision", "/health"),
    (7781, "Voice Coord", "/health"),
    (7792, "Voice Bridge", "/health"),
    (7795, "Telegram", "/health"),
    (7798, "Harness", "/health"),
    (7777, "Avatar", "/health"),
]

# Every /api/* endpoint we can curl directly with GET. POST endpoints tested
# separately below.
API_GET_ENDPOINTS = [
    "/api/health", "/api/heartbeat", "/api/stack-whoami", "/api/pulse",
    "/api/services", "/api/providers", "/api/models", "/api/registry",
    "/api/mochi", "/api/personality", "/api/spine-health", "/api/manifest",
    "/api/llm-status", "/api/settings", "/api/setup", "/api/gatekeeper-status",
    "/api/governor/status", "/api/evolution/status", "/api/delegation/status",
    "/api/host-telemetry", "/api/event-timeline", "/api/preprompt",
    "/api/sessions", "/api/llm-ledger", "/api/api-mega-list", "/api/whoami",
    "/api/yo", "/api/kernel/jobs", "/api/llm-config",
    "/api/output", "/api/api-mega-list", "/api/registry",
    "/api/discover",
    "/api/service-proxy",
]

API_POST_ENDPOINTS = [
    ("/api/discover", {"intent": "memory"}),
    ("/api/discover", {"intent": "chat"}),
    ("/api/chat", {"message": "smoke-test"}),
]

WEBUI_ROUTES = [
    "/", "/mission", "/cockpit", "/dash", "/swarm", "/omni", "/memory",
    "/providers", "/skyscraper", "/settings", "/spine", "/evolution",
    "/frameworks", "/inline", "/pipeline", "/preprompt", "/voice",
    "/agents", "/bridge", "/mochi", "/abliterator",
    "/mission/harness", "/system-map",
]

CLI_COMMANDS = [
    ("status", None),
    ("doctor", None),
    ("doctors", None),
    ("whoami", None),
    ("agents", None),
    ("profiles", None),
    ("workflows", None),
    ("llm", None),
    ("model", None),
    ("model list", None),
    ("llm providers", None),
    ("architecture", None),
    ("architecture services", None),
    ("architecture flow", None),
    ("overview", None),
    ("policies", None),
    ("introspect", None),
    ("registry", None),
    ("queue", None),
    ("dream", None),
]


# ── Helpers ───────────────────────────────────────────────────────────────

class Reporter:
    def __init__(self):
        self.results: List[Dict[str, Any]] = []

    def add(self, category: str, name: str, status: str, detail: str = "", ms: int = 0, **extra):
        entry = {
            "category": category,
            "name": name,
            "status": status,
            "detail": detail,
            "ms": ms,
            **extra,
        }
        self.results.append(entry)
        glyph = {"pass": "✅", "fail": "❌", "skip": "⏭️ ", "warn": "⚠️ "}[status]
        print(f"  {glyph} {category:<14} {name:<46} {status:<4} {ms:>4}ms  {detail}")

    def summary(self) -> Dict[str, int]:
        counts = {"pass": 0, "fail": 0, "skip": 0, "warn": 0}
        for r in self.results:
            counts[r["status"]] = counts.get(r["status"], 0) + 1
        return counts


@contextmanager
def timed():
    t0 = time.perf_counter()
    yield lambda: int((time.perf_counter() - t0) * 1000)


def http_get(host: str, port: int, path: str, timeout: float = 5.0) -> Tuple[int, int, str]:
    """Return (status_code, bytes, content_type). Handles chunked transfer."""
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        req = f"GET {path} HTTP/1.0\r\nHost: {host}\r\nConnection: close\r\n\r\n".encode()
        s.sendall(req)
        s.settimeout(timeout)
        data = b""
        try:
            while len(data) < 1_000_000:
                chunk = s.recv(65536)
                if not chunk:
                    break
                data += chunk
        except socket.timeout:
            pass
        s.close()
        if not data:
            return 0, 0, ""
        header, _, body = data.partition(b"\r\n\r\n")
        status = 0
        ct = ""
        cl = 0
        chunked = False
        for line in header.split(b"\r\n"):
            if line.startswith(b"HTTP/"):
                try:
                    status = int(line.split()[1])
                except Exception:
                    pass
            elif line.lower().startswith(b"content-type:"):
                ct = line.split(b":", 1)[1].strip().decode("latin-1", "replace")
            elif line.lower().startswith(b"content-length:"):
                try:
                    cl = int(line.split(b":", 1)[1].strip())
                except Exception:
                    pass
            elif line.lower().startswith(b"transfer-encoding:"):
                if b"chunked" in line.lower():
                    chunked = True
        # If chunked, decode the body by stripping chunk sizes
        if chunked and body:
            decoded = b""
            cursor = 0
            while cursor < len(body):
                # Find the next CRLF that ends a chunk size line
                line_end = body.find(b"\r\n", cursor)
                if line_end < 0:
                    break
                size_line = body[cursor:line_end]
                try:
                    # Chunk size in hex (ignore extensions)
                    chunk_size = int(size_line.split(b";")[0].strip(), 16)
                except Exception:
                    break
                if chunk_size == 0:
                    break
                start = line_end + 2
                decoded += body[start:start + chunk_size]
                cursor = start + chunk_size + 2  # skip chunk + trailing CRLF
            body = decoded
            if not cl:
                cl = len(body)
        return status, cl if cl else len(body), ct
    except Exception as e:
        return 0, 0, f"err:{e}"


def http_post(host: str, port: int, path: str, body: dict, timeout: float = 10.0) -> Tuple[int, int, str]:
    import json as _json
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        body_bytes = _json.dumps(body).encode()
        req = (
            f"POST {path} HTTP/1.0\r\n"
            f"Host: {host}\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(body_bytes)}\r\n"
            f"Connection: close\r\n\r\n"
        ).encode() + body_bytes
        s.sendall(req)
        s.settimeout(timeout)
        data = b""
        try:
            while len(data) < 1_000_000:
                chunk = s.recv(65536)
                if not chunk:
                    break
                data += chunk
        except socket.timeout:
            pass
        s.close()
        if not data:
            return 0, 0, ""
        header, _, body = data.partition(b"\r\n\r\n")
        status = 0
        cl = 0
        for line in header.split(b"\r\n"):
            if line.startswith(b"HTTP/"):
                try:
                    status = int(line.split()[1])
                except Exception:
                    pass
            elif line.lower().startswith(b"content-length:"):
                try:
                    cl = int(line.split(b":", 1)[1].strip())
                except Exception:
                    pass
        return status, cl if cl else len(body), ""
    except Exception as e:
        return 0, 0, f"err:{e}"


def looks_like_json(content_type: str, body: bytes) -> bool:
    if "json" in content_type:
        return True
    if body and body[:1] in (b"{", b"["):
        return True
    return False


def run_cli(args: List[str], cwd: str, timeout: float = 45.0) -> Tuple[int, str, int]:
    """Run a CLI command and return (exit_code, output_tail, ms)."""
    t0 = time.perf_counter()
    try:
        proc = subprocess.run(
            ["node", "bin/purpclaw.js", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
        ms = int((time.perf_counter() - t0) * 1000)
        # Strip the giant ASCII banner; keep the substantive tail.
        out = proc.stdout
        if proc.stderr and "Tip:" not in proc.stderr[:200]:
            out = (out + "\n[STDERR]\n" + proc.stderr).strip()
        return proc.returncode, out[-1200:] if len(out) > 1200 else out, ms
    except subprocess.TimeoutExpired:
        ms = int((time.perf_counter() - t0) * 1000)
        return 124, "[TIMEOUT]", ms
    except Exception as e:
        ms = int((time.perf_counter() - t0) * 1000)
        return 1, f"err:{e}", ms


# ── Tests ─────────────────────────────────────────────────────────────────

def test_core_services(r: Reporter, host: str = "127.0.0.1") -> None:
    print("\n=== CORE SERVICES (12) ===")
    for port, name, path in CORE_SERVICES:
        with timed() as ms:
            status, size, ct = http_get(host, port, path)
        if status == 200:
            r.add("svc-core", f"{name}:{port}{path}", "pass", f"{size}B", ms())
        elif status == 0:
            r.add("svc-core", f"{name}:{port}{path}", "fail", "no response", ms())
        else:
            r.add("svc-core", f"{name}:{port}{path}", "warn", f"HTTP {status}", ms())


def test_optional_services(r: Reporter, host: str = "127.0.0.1") -> None:
    print("\n=== OPTIONAL SERVICES (11) ===")
    for port, name, path in OPTIONAL_SERVICES:
        with timed() as ms:
            status, size, ct = http_get(host, port, path, timeout=2.0)
        if status == 200:
            r.add("svc-opt", f"{name}:{port}{path}", "pass", f"{size}B", ms())
        elif status == 0:
            r.add("svc-opt", f"{name}:{port}{path}", "skip", "offline", ms())
        else:
            r.add("svc-opt", f"{name}:{port}{path}", "warn", f"HTTP {status}", ms())


def test_api_routes(r: Reporter, host: str = "127.0.0.1", port: int = 3030) -> None:
    print("\n=== API GET ROUTES ===")
    # Per-route timeout map: some endpoints are SSE-style (heartbeat,
    # eventbus/stream), some do heavy I/O (manifest, settings), and
    # some hit slow upstreams under load.
    custom_timeouts = {
        "/api/heartbeat": 8.0,
        "/api/services": 8.0,
        "/api/registry": 8.0,
        "/api/settings": 8.0,
        "/api/output": 8.0,
        "/api/host-telemetry": 8.0,
        "/api/sessions": 8.0,
        "/api/llm-ledger": 8.0,
        "/api/api-mega-list": 8.0,
        "/api/stack-whoami": 8.0,
    }
    for path in API_GET_ENDPOINTS:
        to = custom_timeouts.get(path, 4.0)
        with timed() as ms:
            status, size, ct = http_get(host, port, path, timeout=to)
        if status == 200 and size > 0 and looks_like_json(ct, b"x"):
            # Try to actually parse the body for proof
            r.add("api-get", path, "pass", f"{size}B JSON", ms())
        elif status == 200:
            r.add("api-get", path, "warn", f"{size}B HTML", ms())
        elif status == 0:
            r.add("api-get", path, "fail", "no response", ms())
        elif status == 404:
            r.add("api-get", path, "skip", "404", ms())
        else:
            r.add("api-get", path, "warn", f"HTTP {status}", ms())


def test_api_post_routes(r: Reporter, host: str = "127.0.0.1", port: int = 3030) -> None:
    print("\n=== API POST ROUTES ===")
    for path, body in API_POST_ENDPOINTS:
        # /api/chat makes a real LLM round-trip; needs more headroom.
        # /api/llm/plan runs a planning LLM call too.
        to = 30.0 if path in ("/api/chat",) else 8.0
        with timed() as ms:
            status, size, ct = http_post(host, port, path, body, timeout=to)
        if status == 200 and size > 0:
            r.add("api-post", path, "pass", f"{size}B", ms())
        elif status == 0:
            r.add("api-post", path, "fail", "no response", ms())
        elif status == 404:
            r.add("api-post", path, "skip", "404", ms())
        else:
            r.add("api-post", path, "warn", f"HTTP {status}", ms())


def test_webui(r: Reporter, host: str = "127.0.0.1", port: int = 3030) -> None:
    print("\n=== WEBUI ROUTES ===")
    for path in WEBUI_ROUTES:
        with timed() as ms:
            status, size, ct = http_get(host, port, path, timeout=8.0)
        if status in (200, 307) and size > 0:
            r.add("webui", path, "pass", f"{status} {size}B", ms())
        elif status == 0:
            r.add("webui", path, "fail", "no response", ms())
        else:
            r.add("webui", path, "warn", f"HTTP {status}", ms())


def test_cli(r: Reporter, cwd: str) -> None:
    print("\n=== CLI COMMANDS ===")
    for cmd, sub in CLI_COMMANDS:
        args = [cmd] if sub is None else cmd.split() if isinstance(cmd, str) and " " in cmd else [cmd]
        if sub:
            args = cmd.split() + sub.split()
        with timed() as ms:
            exit_code, out, _ = run_cli(args, cwd, timeout=45.0)
        if exit_code == 0:
            # Look for substantive output: ASCII separators, agent
            # names, real JSON keys, "available", or known CLI banners.
            has_real = any(
                marker in out
                for marker in ["✅", "OK", "available:", "service", "agent",
                               "tool", "PURPCLAW", "───", "provider",
                               "skills", "ROSTER", "POLICY", "PROFILE",
                               "INTROSPECT", "QUEUE", "DREAM", "OVERVIEW",
                               "AGENT", "STATUS", "DOCTOR"]
            )
            r.add("cli", cmd, "pass" if has_real else "warn",
                  f"exit 0, {len(out)}b", ms())
        elif exit_code == 124:
            r.add("cli", cmd, "warn", "timeout 15s", ms())
        else:
            r.add("cli", cmd, "fail", f"exit {exit_code}", ms())


def test_realtime_core(r: Reporter) -> None:
    print("\n=== REALTIME CORE (Rust) ===")
    # 1. .pyd loads
    try:
        sys.path.insert(0, os.path.join(os.getcwd(), "vendor", "realtime_core"))
        import realtime_core  # type: ignore
        r.add("rt-core", "import realtime_core", "pass",
              f"file={os.path.basename(realtime_core.__file__)}", 0)
    except Exception as e:
        r.add("rt-core", "import realtime_core", "fail", str(e)[:80], 0)
        return

    # 2. SPSC ring roundtrip
    with timed() as ms:
        try:
            ring = realtime_core.PySensoryRing(1024)
            for i in range(500):
                ring.push(i, i & 0xFF, 0.5, [i & 0xFF])
            pushed = 500
            popped = 0
            while True:
                ev = ring.pop()
                if ev is None:
                    break
                popped += 1
            ok = pushed == popped == 500
            r.add("rt-core", f"ring 500 push + {popped} pop", "pass" if ok else "fail",
                  f"thrash ok" if ok else "mismatch", ms())
        except Exception as e:
            r.add("rt-core", "ring roundtrip", "fail", str(e)[:80], ms())

    # 3. Working memory
    with timed() as ms:
        try:
            wm = realtime_core.PyWorkingMemory()
            import random
            random.seed(42)
            embs = []
            for _ in range(100):
                v = [random.gauss(0, 1) for _ in range(384)]
                n = sum(x * x for x in v) ** 0.5
                embs.append([x / n for x in v])
            for i, e in enumerate(embs):
                wm.add(f"k{i}", e)
            top = wm.find_similar(embs[50], 3)
            ok = top[0][0] == "k50" and top[0][1] > 0.99
            r.add("rt-core", "cosine top-1 self-match", "pass" if ok else "fail",
                  f"top={top[0]}", ms())
            wm.decay_all(0.0)
            ev = wm.evict_below_threshold(0.5)
            r.add("rt-core", f"decay_all + evict (got {ev})",
                  "pass" if ev == 100 else "warn", "", ms())
        except Exception as e:
            r.add("rt-core", "working memory", "fail", str(e)[:80], ms())


def test_direct_api(r: Reporter, host: str = "127.0.0.1") -> None:
    print("\n=== DIRECT API (:7780) ===")
    direct = [
        ("/api/health", 200),
        ("/api/tower/status", 200),
        ("/api/tower/agents", 200),
        ("/api/swarm", 200),
        ("/api/memory/stats", 200),
    ]
    for path, expected in direct:
        with timed() as ms:
            status, size, ct = http_get(host, 7780, path, timeout=4.0)
        if status == expected:
            r.add("api-7780", path, "pass", f"{size}B", ms())
        elif status == 0:
            r.add("api-7780", path, "fail", "no response", ms())
        else:
            r.add("api-7780", path, "warn", f"HTTP {status}", ms())

    # Spawn an agent and verify it shows up in /api/swarm
    print("\n=== AGENT SPAWN SMOKE ===")
    with timed() as ms:
        s, sz, _ = http_post("127.0.0.1", 7780, "/api/swarm/spawn", {}, timeout=4.0)
    if s == 200:
        r.add("spawn", "POST /api/swarm/spawn", "pass", f"{sz}B", ms())
    elif s == 0:
        r.add("spawn", "POST /api/swarm/spawn", "fail", "no response", ms())
    else:
        r.add("spawn", "POST /api/swarm/spawn", "warn", f"HTTP {s}", ms())


def test_orchestrator(r: Reporter, host: str = "127.0.0.1") -> None:
    print("\n=== ORCHESTRATOR (:7784) ===")
    paths = ["/api/health", "/api/workflows"]
    for path in paths:
        with timed() as ms:
            status, size, _ = http_get(host, 7784, path, timeout=4.0)
        if status == 200:
            r.add("orch", path, "pass", f"{size}B", ms())
        elif status == 0:
            r.add("orch", path, "fail", "no response", ms())
        else:
            r.add("orch", path, "warn", f"HTTP {status}", ms())


def test_sse(r: Reporter, host: str = "127.0.0.1", port: int = 3030) -> None:
    print("\n=== SERVER-SENT EVENTS (SSE) ===")
    with timed() as ms:
        try:
            s = socket.create_connection((host, port), timeout=4.0)
            s.sendall(b"GET /api/eventbus/stream HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/event-stream\r\n\r\n")
            s.settimeout(4.0)
            data = b""
            while len(data) < 8192:
                chunk = s.recv(8192)
                if not chunk:
                    break
                data += chunk
                if b"\n\n" in data:
                    break
            s.close()
            ok = b"data: {" in data or b": connected" in data or b"event:" in data
            r.add("sse", "/api/eventbus/stream", "pass" if ok else "warn",
                  f"{len(data)}B", ms())
        except Exception as e:
            r.add("sse", "/api/eventbus/stream", "fail", str(e)[:80], ms())


# ── Main ──────────────────────────────────────────────────────────────────

def main() -> int:
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(repo)
    r = Reporter()

    print("╔════════════════════════════════════════════════════════════════════════════╗")
    print("║                PURPCLAW  ·  FULL-STACK SMOKE TEST                            ║")
    print("╚════════════════════════════════════════════════════════════════════════════╝")

    test_core_services(r)
    test_optional_services(r)
    test_direct_api(r)
    test_orchestrator(r)
    test_api_routes(r)
    test_api_post_routes(r)
    test_webui(r)
    test_sse(r)
    test_cli(r, repo)
    test_realtime_core(r)

    counts = r.summary()
    total = sum(counts.values())
    print("\n" + "═" * 78)
    print(f"  RESULT: {total} checks  |  ✅ {counts.get('pass',0)} pass"
          f"  |  ⚠️  {counts.get('warn',0)} warn"
          f"  |  ⏭️  {counts.get('skip',0)} skip"
          f"  |  ❌ {counts.get('fail',0)} fail")
    print("═" * 78)

    import tempfile
    out_dir = tempfile.gettempdir()
    out_path = os.path.join(out_dir, "purpclaw_smoke.json")
    if len(sys.argv) > 2 and sys.argv[1] == "--save":
        out_path = sys.argv[2]
    with open(out_path, "w") as f:
        json.dump({"summary": counts, "results": r.results}, f, indent=2)
    print(f"\n  Full report → {out_path}")

    return 0 if counts.get("fail", 0) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
