#!/usr/bin/env python3
"""PURPCLAW Cognitive Spine — single local HTTP surface for the cognitive layer."""

import argparse
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler
from socketserver import ThreadingTCPServer
from urllib.parse import urlparse

try:
    import mem_guard
    mem_guard.install(label="cognitive", limit_mb=int(os.environ.get("COGNITIVE_MEM_LIMIT_MB", "1500")))
except Exception:
    pass

from memory_matrix_v2 import BASE_AVAILABLE, MemoryMatrixV2
from symbolic_rules_engine import DatalogEngine
from modal_logic_engine import ModalLogicEngine
from autonomous_diagnostics import DiagnosticOrchestrator
from neuro_symbolic_bridge import NeuroSymbolicBridge
import autoDream
import spring_doctrine

try:
    from lib.realtime_bridge import (
        push_ingest as _rt_push_ingest,
        start_drain_loop as _rt_start_drain,
        get_realtime_snapshot as _rt_snapshot,
    )
    _rt_available = True
except Exception as _rt_exc:
    _rt_available = False
    def _rt_push_ingest(*_a, **_k): pass
    def _rt_start_drain(*_a, **_k): pass
    def _rt_snapshot(): return {"available": False, "error": str(_rt_exc)}


class CognitiveState:
    def __init__(self):
        self.memory = MemoryMatrixV2()
        self.rules = DatalogEngine()
        self.rules.add_rule_str("sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y")
        self.rules.add_rule_str("ancestor(X,Y) :- parent(X,Y)")
        self.rules.add_rule_str("ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y)")
        self.modal = ModalLogicEngine()
        self.diagnostics = DiagnosticOrchestrator()
        self.neuro = NeuroSymbolicBridge(manage_memory=False)
        self.started_at = time.time()


STATE = None
PORT = 7880
_HEALTH_CACHE = {"cached": None, "at": 0}
_HEALTH_TTL_S = 30


def _health_refresher():
    while True:
        try:
            if STATE is None:
                time.sleep(1.0)
                continue
            snapshot = {
                "status": "healthy",
                "service": "cognitive_spine",
                "port": PORT,
                "uptime": time.time() - STATE.started_at,
                "services": {
                    "memory": STATE.memory.get_stats(),
                    "rules": {"status": "healthy", "service": "rules_engine",
                              "facts": len(STATE.rules.facts), "rules": len(STATE.rules.rules)},
                    "modal": {"status": "healthy", "service": "modal_logic_engine",
                              "agents": len(STATE.modal.agents)},
                    "diagnostics": {"status": "healthy", "service": "diagnostics",
                                    **STATE.diagnostics.get_stats()},
                    "neuro-symbolic": {"status": "healthy", "service": "neuro_symbolic_bridge",
                                       **STATE.neuro.get_statistics()},
                    "autodream": {"status": "healthy", "service": "autodream",
                                  "entries": autoDream.getEntryCount(),
                                  "state": autoDream.loadState()},
                    "realtime": _rt_snapshot(),
                    "spring": spring_doctrine.status(),
                },
            }
            _HEALTH_CACHE["cached"] = snapshot
            _HEALTH_CACHE["at"] = time.time()
        except Exception as e:
            _HEALTH_CACHE["cached"] = {"status": "partial", "service": "cognitive_spine",
                                       "uptime": 0, "error": str(e)}
            _HEALTH_CACHE["at"] = time.time()
        time.sleep(_HEALTH_TTL_S)


def start_health_refresher():
    import threading as _th
    t = _th.Thread(target=_health_refresher, name="spine-health-refresher", daemon=True)
    t.start()


# --- Rate limiter (kept short here for the rewrite) ---
RATE_LIMITS = {
    ("/memory/ingest",  "POST"): {"capacity": 30, "refill_per_sec": 60},
    ("/memory/react",   "POST"): {"capacity": 15, "refill_per_sec": 30},
    ("/memory/recall",  "POST"): {"capacity": 15, "refill_per_sec": 30},
    ("/memory/ground",  "POST"): {"capacity": 10, "refill_per_sec": 20},
    ("/rules/assert",   "POST"): {"capacity": 10, "refill_per_sec": 20},
    ("/spring/validate", "POST"): {"capacity": 20, "refill_per_sec": 40},
}



class _TokenBucket:
    __slots__ = ("capacity", "refill_per_sec", "tokens", "last_refill")

    def __init__(self, capacity, refill_per_sec):
        self.capacity = float(capacity)
        self.refill_per_sec = float(refill_per_sec)
        self.tokens = float(capacity)
        self.last_refill = time.time()

    def _allow(self):
        now = time.time()
        elapsed = now - self.last_refill
        if elapsed > 0:
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_per_sec)
            self.last_refill = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


_buckets = {}


def _match_limit(path, method):
    for (prefix, m), cfg in RATE_LIMITS.items():
        if m != method:
            continue
        if path == prefix or path.startswith(prefix + "/"):
            return (prefix, m), cfg
    return None, None


def _allow(path, method):
    key, cfg = _match_limit(path, method)
    if cfg is None:
        return True
    bucket = _buckets.get(key)
    if bucket is None:
        bucket = _TokenBucket(cfg["capacity"], cfg["refill_per_sec"])
        _buckets[key] = bucket
    return bucket._allow()


class ReuseThreadingServer(ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    import concurrent.futures as _cf
    _pool = _cf.ThreadPoolExecutor(max_workers=48, thread_name_prefix="spine")
    request_queue_size = 1024

    def server_bind(self):
        # CLOSE_WAIT killer: SO_LINGER (1,0) makes close() send RST instead
        # of FIN, so the kernel reaps the fd immediately when we drop a
        # half-closed socket instead of waiting for FIN_WAIT_2 timeout.
        import socket as _socket
        import struct as _struct
        super().server_bind()
        self.socket.setsockopt(_socket.SOL_SOCKET, _socket.SO_LINGER,
                                _struct.pack("ii", 1, 0))

    def process_request(self, request, client_address):
        # Apply SO_LINGER + a 5s recv/send timeout to every accepted socket.
        # Without this, wfile.flush() can block indefinitely when the
        # remote TCP receive buffer is full, which keeps the worker
        # thread and the kernel TCP state machine stuck.
        import socket as _socket
        import struct as _struct
        try:
            request.setsockopt(_socket.SOL_SOCKET, _socket.SO_LINGER,
                                _struct.pack("ii", 1, 0))
            # No socket timeout: upstream POST bodies can be large and
            # the spine must drain them fully before sending 200. SO_LINGER
            # alone is enough to prevent CLOSE_WAIT pile-up — when close()
            # runs the kernel sends RST instead of FIN.
        except OSError:
            pass
        self._pool.submit(self._handle_in_pool, request, client_address)

    def _handle_in_pool(self, request, client_address):
        try:
            self.finish_request(request, client_address)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError) as exc:
            try:
                sys.stderr.write("[spine] client aborted: " + str(exc) + "\n")
                sys.stderr.flush()
            except Exception:
                pass
        except Exception:
            self.handle_error(request, client_address)
        finally:
            try:
                try:
                    self.wfile.flush()
                except Exception:
                    pass
                self.shutdown_request(request)
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
                pass


class SpineHandler(BaseHTTPRequestHandler):
    # HTTP/1.0 + Connection: close so the kernel reaps each socket
    # immediately after the response, no keep-alive limbo.
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        print("[CognitiveSpine:" + str(PORT) + "] " + (fmt % args))

    def _send_raw(self, status, body, extra_headers=None):
        # IMPORTANT: write through self.wfile, not the raw socket.
        # Calling self.connection.sendall() bypasses BaseHTTPRequestHandler's
        # BufferedWriter wrapper, which leaves the kernel TCP state machine
        # out of sync with Python's user-space buffer — exactly what was
        # causing the 45+ CLOSE_WAIT sockets under burst upstream load.
        reason_map = {
            200: "OK", 201: "Created", 204: "No Content",
            400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
            404: "Not Found", 405: "Method Not Allowed",
            408: "Request Timeout", 429: "Too Many Requests",
            500: "Internal Server Error", 502: "Bad Gateway",
            503: "Service Unavailable",
        }
        reason = reason_map.get(status, "OK")
        head = [
            "HTTP/1.0 " + str(status) + " " + reason,
            "Content-Type: application/json",
            "Access-Control-Allow-Origin: *",
            "Content-Length: " + str(len(body)),
            "Connection: close",
        ]
        if extra_headers:
            for k, v in extra_headers.items():
                head.append(k + ": " + str(v))
        # CRITICAL: use the literal \\\\r\\\\n escape sequence (4 chars) so
        # the Python source compiles to CRLF (2 bytes). Do not put a real
        # CRLF in the file — that breaks the source string.
        head_bytes = ("\r\n".join(head) + "\r\n\r\n").encode("ascii")
        try:
            self.wfile.write(head_bytes)
            self.wfile.write(body)
            self.wfile.flush()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError) as exc:
            try:
                self.log_message("[spine] client aborted during response: %s", exc)
            except Exception:
                pass

    def send_json(self, data, status=200):
        body = json.dumps(data, default=str).encode("utf-8")
        self._send_raw(status, body)

    def body_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0:
                return {}
            # Bound the body read so a stalled upstream (whose TCP
            # receive buffer is full, which holds open CLOSE_WAIT) doesn't
            # pin a worker thread indefinitely. 10 s is enough for any
            # legitimate ingest payload. Restore the previous no-timeout
            # setting when we're done so the response write isn't
            # time-bound (small JSON responses should always succeed).
            try:
                self.connection.settimeout(10.0)
            except OSError:
                pass
            try:
                return json.loads(self.rfile.read(length).decode("utf-8"))
            finally:
                try:
                    self.connection.settimeout(None)
                except OSError:
                    pass
        except Exception:
            return {}

    def do_OPTIONS(self):
        self._send_raw(204, b"", extra_headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        })

    def do_GET(self):
        path = urlparse(self.path).path
        if not _allow(path, "GET"):
            body = json.dumps({"ok": False, "error": "rate_limited", "path": path}).encode("utf-8")
            self._send_raw(429, body, extra_headers={"Retry-After": "1"})
            return
        try:
            return self.route_get(path)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc), "path": path}, 500)

    def do_POST(self):
        path = urlparse(self.path).path
        if not _allow(path, "POST"):
            body = json.dumps({"ok": False, "error": "rate_limited", "path": path}).encode("utf-8")
            self._send_raw(429, body, extra_headers={"Retry-After": "1"})
            return
        req = self.body_json()
        try:
            return self.route_post(path, req)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc), "path": path}, 500)

    def spine_health_cached(self):
        # Pure cache read — the snapshot is refreshed on a dedicated
        # background thread, so this never touches the matrix.
        cached = _HEALTH_CACHE.get("cached")
        if cached is not None:
            return cached
        return {"status": "warming", "service": "cognitive_spine", "uptime": 0}

    def memory_health(self):
        return {
            "status": "healthy",
            "service": "memory_matrix_v2",
            "base_available": BASE_AVAILABLE,
            "stats": STATE.memory.get_stats(),
        }

    def route_get(self, path):
        if path in ("/health", "/cognitive/health"):
            return self.send_json(self.spine_health_cached())
        if path == "/memory/health":
            return self.send_json(self.memory_health())
        if path == "/memory/stats":
            return self.send_json(self.memory_health())
        if path == "/memory/recall":
            return self.send_json({"results": STATE.memory.recall("", 5)})
        if path == "/memory/lifted":
            return self.send_json({"lifted_facts": len(STATE.memory.bridge.lifted_facts) if STATE.memory.bridge else 0})
        if path == "/memory/lift/backfill":
            return self.send_json(STATE.memory.get_lift_backfill_status())
        if path == "/rules/health":
            return self.send_json({"status": "healthy", "service": "rules_engine",
                                   "facts": len(STATE.rules.facts), "rules": len(STATE.rules.rules)})
        if path == "/rules/facts":
            return self.send_json({"facts": STATE.rules.all_facts()})
        if path == "/rules/rules":
            return self.send_json({"rules": STATE.rules.all_rules()})
        if path == "/rules/stats":
            return self.send_json(STATE.rules.stats())
        if path == "/rules/infer":
            derived = STATE.rules.run_inference()
            return self.send_json({"newly_derived": derived, "total_facts": len(STATE.rules.facts)})
        if path == "/modal/health":
            return self.send_json({"status": "healthy", "service": "modal_logic_engine",
                                   "agents": len(STATE.modal.agents)})
        if path == "/diagnostics/health":
            return self.send_json({"status": "healthy", "service": "diagnostics",
                                   **STATE.diagnostics.get_stats()})
        if path == "/neuro-symbolic/health":
            return self.send_json({"status": "healthy", "service": "neuro_symbolic_bridge",
                                   **STATE.neuro.get_statistics()})
        if path == "/autodream/health":
            return self.send_json({"status": "healthy", "service": "autodream",
                                   "entries": autoDream.getEntryCount()})
        if path in ("/spring/health", "/spring/status"):
            return self.send_json(spring_doctrine.status())
        if path == "/spring/doctrine":
            return self.send_json({"doctrine": spring_doctrine.doctrine()})
        if path == "/spring/principles":
            return self.send_json({"principles": spring_doctrine.principles()})
        return self.send_json({"error": "not_found", "path": path}, 404)

    def route_post(self, path, req):
        if path in ("/memory/ingest", "/ingest"):
            memory_id = STATE.memory.ingest(
                content=req.get("content", ""),
                content_type=req.get("type", "text"),
                emotional_valence=req.get("valence", 0.0),
                source=req.get("source", "api"),
                importance=req.get("importance", 0.5),
                raw_metadata=req.get("metadata"),
            )
            spring_meta = spring_doctrine.validate({
                "source": req.get("source", "api"),
                "origin": (req.get("metadata") or {}).get("origin") if isinstance(req.get("metadata"), dict) else None,
                "evidence": (req.get("metadata") or {}).get("evidence", []) if isinstance(req.get("metadata"), dict) else [],
                "tests_passed": (req.get("metadata") or {}).get("tests_passed") if isinstance(req.get("metadata"), dict) else None,
                "created_at": time.time(),
            })
            try:
                STATE.rules.assert_fact("spring_rank", (str(memory_id), str(spring_meta.get("spring_rank")), str(spring_meta.get("spring_label"))), "spring_validator")
                STATE.rules.assert_fact("trust_score", (str(memory_id), str(spring_meta.get("trust_score"))), "spring_validator")
            except Exception:
                pass
            try:
                _rt_push_ingest(
                    memory_id,
                    req.get("content", ""),
                    float(req.get("importance", 0.5) or 0.0),
                )
            except Exception:
                pass
            return self.send_json({"memory_id": memory_id, "spring": spring_meta})
        if path in ("/memory/recall", "/recall"):
            return self.send_json({"results": STATE.memory.recall(
                req.get("query", ""), req.get("limit", 5), req.get("emotional_filter"))})
        if path == "/rules/assert":
            try:
                fact = STATE.rules.assert_fact_str(req.get("fact", ""), req.get("provenance", "asserted"))
                return self.send_json({"fact": str(fact), "id": fact.id})
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
        if path == "/rules/query":
            try:
                return self.send_json({"results": STATE.rules.query_str(req.get("query", ""))})
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
        if path == "/spring/validate":
            return self.send_json(spring_doctrine.validate(req or {}))
        return self.send_json({"error": "not_found", "path": path}, 404)


def main():
    global STATE, PORT
    parser = argparse.ArgumentParser(description="PURPCLAW Cognitive Spine")
    parser.add_argument("--port", type=int, default=7880)
    args = parser.parse_args()
    PORT = args.port
    STATE = CognitiveState()
    start_health_refresher()
    _rt_start_drain(5.0)
    with ReuseThreadingServer(("127.0.0.1", PORT), SpineHandler) as server:
        print("[CognitiveSpine] listening on 127.0.0.1:" + str(PORT))
        server.serve_forever()


if __name__ == "__main__":
    main()
