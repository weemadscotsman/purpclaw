#!/usr/bin/env python3
"""
mem_guard — dependency-free self memory watchdog for PURPCLAW python services.

No leaky drawers. Every long-running python service installs this. A daemon
thread checks the process's own RSS every N seconds; if it exceeds the cap it
logs and cleanly exits (os._exit). Under PM2 that triggers a clean restart;
an ORPHAN (escaped PM2's max_memory_restart, e.g. after a daemon death) simply
dies instead of growing to 7GB and eating a potato PC / phone / browser host.

Works with NO third-party deps (psutil is used if present, else falls back to
Windows ctypes, Linux /proc, or POSIX resource). If RSS can't be measured on a
platform, it disables itself rather than risk a false kill.

Usage (one line near service startup):
    import mem_guard; mem_guard.install(label='cognitive', limit_mb=1500)

Env overrides:
    PURPCLAW_MEM_LIMIT_MB   global default cap (MB)
    PURPCLAW_MEM_GUARD=0    disable entirely
"""

import os
import sys
import time
import threading


def _rss_mb():
    """Best-effort current-process RSS in MB, or None if unmeasurable."""
    # 1) psutil (most accurate, cross-platform) — used only if already installed
    try:
        import psutil  # noqa
        return psutil.Process().memory_info().rss / (1024.0 * 1024.0)
    except Exception:
        pass

    # 2) Windows — GetProcessMemoryInfo via ctypes (no deps)
    if sys.platform.startswith("win"):
        try:
            import ctypes
            from ctypes import wintypes

            class _PMC(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD),
                    ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            counters = _PMC()
            counters.cb = ctypes.sizeof(_PMC)
            k32 = ctypes.windll.kernel32
            k32.GetCurrentProcess.restype = wintypes.HANDLE
            handle = k32.GetCurrentProcess()
            # GetProcessMemoryInfo lives in psapi.dll (older) or as
            # K32GetProcessMemoryInfo in kernel32.dll (Win7+). Try both, with
            # explicit argtypes/restype so the 64-bit handle isn't truncated.
            fn = None
            try:
                fn = ctypes.windll.psapi.GetProcessMemoryInfo
            except Exception:
                fn = getattr(k32, "K32GetProcessMemoryInfo", None)
            if fn is not None:
                fn.argtypes = [wintypes.HANDLE, ctypes.POINTER(_PMC), wintypes.DWORD]
                fn.restype = wintypes.BOOL
                if fn(handle, ctypes.byref(counters), counters.cb):
                    return counters.WorkingSetSize / (1024.0 * 1024.0)
        except Exception:
            pass

    # 3) Linux — /proc/self/statm (pages → bytes)
    try:
        with open("/proc/self/statm", "r") as fh:
            resident_pages = int(fh.read().split()[1])
        return resident_pages * os.sysconf("SC_PAGE_SIZE") / (1024.0 * 1024.0)
    except Exception:
        pass

    # 4) POSIX — resource.getrusage (linux: KB, mac: bytes)
    try:
        import resource
        ru = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return ru / (1024.0 * 1024.0) if sys.platform == "darwin" else ru / 1024.0
    except Exception:
        pass

    return None


def install(label="service", limit_mb=None, interval_s=30):
    """Start the watchdog. Returns True if armed, False if disabled/unmeasurable."""
    if os.environ.get("PURPCLAW_MEM_GUARD", "1") == "0":
        return False

    try:
        cap = int(limit_mb if limit_mb is not None else os.environ.get("PURPCLAW_MEM_LIMIT_MB", "1024"))
    except Exception:
        cap = 1024
    if cap <= 0:
        return False

    # Confirm we can actually measure before arming — never false-kill.
    if _rss_mb() is None:
        sys.stderr.write(f"[mem-guard] {label}: RSS unmeasurable on this platform — guard disabled\n")
        sys.stderr.flush()
        return False

    def _watch():
        breaches = 0
        while True:
            time.sleep(interval_s)
            mb = _rss_mb()
            if mb is None:
                return
            if mb > cap:
                # Require 2 consecutive breaches so a transient spike (e.g. a
                # one-off model load) doesn't bounce the service.
                breaches += 1
                if breaches >= 2:
                    sys.stderr.write(
                        f"[mem-guard] {label}: RSS {mb:.0f}MB > {cap}MB cap "
                        f"(2x) — exiting for a clean restart\n"
                    )
                    sys.stderr.flush()
                    os._exit(0)
            else:
                breaches = 0

    threading.Thread(target=_watch, daemon=True, name="mem-guard").start()
    sys.stderr.write(f"[mem-guard] {label}: armed at {cap}MB (every {interval_s}s)\n")
    sys.stderr.flush()
    return True


if __name__ == "__main__":
    # Quick self-test
    print("current RSS:", _rss_mb(), "MB")
    print("armed:", install(label="selftest", limit_mb=99999, interval_s=1))
    time.sleep(2)
    print("ok")
