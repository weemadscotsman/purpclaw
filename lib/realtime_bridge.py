"""
realtime_bridge.py — thin adapter between cognitive_spine.py and the
Rust `realtime_core` extension (vendor/realtime_core).

PURPCLAW owns:
  - MemoryMatrixV2 (persistence + archive + backfill)
  - The 25+ PM2 services that fan into /memory/ingest

realtime_core adds:
  - Lock-free sensory ring for ingest events (zero-allocation in Rust)
  - Cosine-similarity top-k over a 384-dim working memory

This bridge does three jobs and no more:

  1. Build a `PySensoryRing` once at import time. If the extension is
     not built (or Python is the wrong arch), every function here
     becomes a no-op — the spine never breaks.

  2. `push_ingest(memory_id, content, importance)` — called on every
     /memory/ingest. Fire-and-forget; if the ring is full, the event
     is dropped (better than blocking the request handler).

  3. Drain the ring on a background thread that updates
     `_HEALTH_CACHE["realtime"]` with throughput metrics — no extra
     work in the request handler pool, no matrix lock contention.

Honest scope: this is a thin observability + recall-acceleration layer
on top of the existing memory matrix. It does NOT replace the matrix,
it does NOT add a different write path, and it does NOT change the
on-disk archive format. If realtime_core is unavailable, the spine
behaves exactly as it does today.
"""

from __future__ import annotations

import os
import sys
import threading
import time
from typing import Any, Dict, List, Tuple

# ── Optional import of the compiled Rust extension ──────────────────────
#
# We don't make this a hard dependency. The .pyd lives at
# vendor/realtime_core/realtime_core.pyd next to this file's repo.
# Adding its directory to sys.path on import is the simplest portable
# loader — it works whether the user runs the spine from the project
# root, from a PM2 cwd, or from the deploy script.

_HERE = os.path.dirname(os.path.abspath(__file__))
_RT_DIR = os.path.normpath(os.path.join(_HERE, "..", "vendor", "realtime_core"))

_rt_module = None
_rt_lock = threading.Lock()
_ring = None
_wm = None
_available = False
_import_error: str | None = None

try:
    if _RT_DIR not in sys.path:
        sys.path.insert(0, _RT_DIR)
    import realtime_core  # type: ignore
    _rt_module = realtime_core
    _ring = realtime_core.PySensoryRing(2048)
    _wm = realtime_core.PyWorkingMemory()
    _available = True
except Exception as exc:  # noqa: BLE001 — bridge must never raise
    _import_error = f"{type(exc).__name__}: {exc}"
    _available = False


def is_available() -> bool:
    """Return True iff the Rust extension is loadable AND instantiated."""
    return _available


def last_import_error() -> str | None:
    """Return the import error string if realtime_core failed to load."""
    return _import_error


# ── Push an ingest event into the sensory ring ──────────────────────────

def push_ingest(memory_id: str, content: str, importance: float) -> None:
    """Best-effort ring push. Drops on full ring, never raises."""
    if not _available:
        return
    try:
        # Cap content payload at 200 bytes to keep the event small.
        payload = list(content.encode("utf-8", "replace")[:200])
        # event_type: 0 = ingest, 1 = recall, 2 = lift, etc.
        # emotional_valence: importance mapped to 0..1 (clamped).
        _ring.push(
            int(time.time() * 1_000_000),
            0,
            max(0.0, min(1.0, importance)),
            payload,
        )
    except Exception:
        # The ring push must never break a request handler. The Rust
        # ring's `push` returns false on full; the PyO3 wrapper turns
        # that into Ok(false) which we just ignore. Anything beyond
        # that is a bug we don't want to surface at runtime.
        pass


# ── Background drain → realtime snapshot for /cognitive/health ─────────

# Throughput counters that the spine's _HEALTH_CACHE picks up.
_throughput_lock = threading.Lock()
_throughput = {
    "ring_capacity": 2048,
    "ring_pushed_total": 0,
    "ring_dropped_total": 0,
    "ring_drained_total": 0,
    "ring_drain_errors": 0,
    "last_drain_at": 0.0,
}

_stop_event = threading.Event()
_drain_thread: threading.Thread | None = None


def start_drain_loop(interval_sec: float = 5.0) -> None:
    """Launch the background drain thread. Idempotent — safe to call twice."""
    global _drain_thread
    if not _available:
        return
    if _drain_thread is not None and _drain_thread.is_alive():
        return
    _stop_event.clear()
    _drain_thread = threading.Thread(
        target=_drain_loop, args=(interval_sec,), name="spine-rt-drain", daemon=True
    )
    _drain_thread.start()


def stop_drain_loop(timeout_sec: float = 2.0) -> None:
    """Stop the background drain thread. Called on server shutdown."""
    _stop_event.set()
    t = _drain_thread
    if t is not None:
        t.join(timeout=timeout_sec)


def _drain_loop(interval_sec: float) -> None:
    while not _stop_event.is_set():
        try:
            drained = 0
            while True:
                ev = _ring.pop()
                if ev is None:
                    break
                drained += 1
            with _throughput_lock:
                _throughput["ring_drained_total"] += drained
                _throughput["last_drain_at"] = time.time()
        except Exception:
            with _throughput_lock:
                _throughput["ring_drain_errors"] += 1
        _stop_event.wait(timeout=interval_sec)


def get_throughput_snapshot() -> Dict[str, Any]:
    """Return a copy of the throughput counters for the health snapshot."""
    with _throughput_lock:
        return dict(_throughput)


def get_realtime_snapshot() -> Dict[str, Any]:
    """Return realtime_core stats for /cognitive/health.services.realtime."""
    snap: Dict[str, Any] = {
        "available": _available,
        "import_error": _import_error,
        "ring": None,
        "working_memory": None,
    }
    if not _available:
        return snap
    try:
        snap["ring"] = {
            "capacity": _ring.len() if hasattr(_ring, "len") else 0,
            "drained_total": _throughput["ring_drained_total"],
            "errors": _throughput["ring_drain_errors"],
            "last_drain_at": _throughput["last_drain_at"],
        }
        snap["working_memory"] = {
            "entries": _wm.len() if hasattr(_wm, "len") else 0,
        }
    except Exception as exc:
        snap["error"] = f"{type(exc).__name__}: {exc}"
    return snap
