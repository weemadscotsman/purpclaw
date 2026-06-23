#!/usr/bin/env python3
"""
Chaos testing via PM2.  Kill, restart, freeze, and melt services to verify resilience.
Requires PM2 (`npm install -g pm2`) and a running PM2 process list.
"""

import json
import os
import random
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

RESULTS_DIR = Path(__file__).parent.parent / "results"
CHAOS_INTERVAL = float(os.environ.get("CHAOS_INTERVAL", "10"))  # seconds between actions
HEALTH_URL = os.environ.get("HEALTH_URL", "http://localhost:8080/health")
SAMPLE_SIZE = 3  # how many random actions to pick from the action pool


def pm2_list() -> list[dict[str, Any]]:
    """Return list of PM2 process descriptors."""
    try:
        out = subprocess.check_output(["pm2", "jlist"], text=True, timeout=10)
        return json.loads(out)
    except subprocess.CalledProcessError:
        print("ERROR: pm2 jlist failed — is PM2 installed and running?")
        return []
    except Exception as e:
        print(f"ERROR: cannot run pm2: {e}")
        return []


def pm2_restart(name: str) -> None:
    subprocess.run(["pm2", "restart", name], timeout=30, check=False)


def pm2_stop(name: str) -> None:
    subprocess.run(["pm2", "stop", name], timeout=30, check=False)


def pm2_start(script: str, name: str | None = None, env: dict | None = None) -> None:
    cmd = ["pm2", "start", script]
    if name:
        cmd += ["--name", name]
    if env:
        for k, v in env.items():
            cmd += ["--env", f"{k}={v}"]
    subprocess.run(cmd, timeout=30, check=False)


def pm2_kill_process(name: str) -> None:
    """Hard-delete a process by name (like kill <pid>)."""
    try:
        subprocess.run(["pm2", "delete", name], timeout=15, check=False)
    except Exception:
        pass


def health_check(url: str = HEALTH_URL, retries: int = 3) -> bool:
    """Return True if the service is reachable."""
    import urllib.request
    import urllib.error

    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "chaos-py/1.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status < 500:
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


def save_chaos_log(events: list[dict[str, Any]]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    path = RESULTS_DIR / f"{stamp}_chaos.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"timestamp": time.time(), "events": events}, f, indent=2, ensure_ascii=False)
    return path


# ----------------------------------------------------------------
# Chaos actions
# ----------------------------------------------------------------

def action_kill(processes: list[dict]) -> str:
    """Kill a random PM2 process."""
    targets = [p["name"] for p in processes if p.get("name") and p["name"] != "PM2"]
    if not targets:
        return "no process to kill"
    target = random.choice(targets)
    pm2_kill_process(target)
    return f"killed {target}"


def action_restart(processes: list[dict]) -> str:
    """Restart a random process."""
    targets = [p["name"] for p in processes if p.get("name") and p["name"] != "PM2"]
    if not targets:
        return "no process to restart"
    target = random.choice(targets)
    pm2_restart(target)
    return f"restarted {target}"


def action_stop(processes: list[dict]) -> str:
    """Stop a random process."""
    targets = [p["name"] for p in processes if p.get("name") and p["name"] != "PM2"]
    if not targets:
        return "no process to stop"
    target = random.choice(targets)
    pm2_stop(target)
    return f"stopped {target}"


def action_freeze(processes: list[dict]) -> str:
    """Freeze a process by sending SIGSTOP (Unix only)."""
    try:
        targets = [p for p in processes if p.get("name") and p["name"] != "PM2"]
        if not targets:
            return "no process to freeze"
        pid = random.choice(targets).get("pid")
        if pid:
            subprocess.run(["kill", "-STOP", str(pid)], timeout=5, check=False)
            return f"froze pid {pid}"
    except Exception:
        pass
    return "freeze not available on this platform"


def action_melt(processes: list[dict]) -> str:
    """Resume a frozen process (SIGCONT)."""
    try:
        targets = [p for p in processes if p.get("name") and p["name"] != "PM2"]
        if not targets:
            return "no process to melt"
        pid = random.choice(targets).get("pid")
        if pid:
            subprocess.run(["kill", "-CONT", str(pid)], timeout=5, check=False)
            return f"melted pid {pid}"
    except Exception:
        pass
    return "melt not available on this platform"


# ----------------------------------------------------------------
# Main
# ----------------------------------------------------------------

def main() -> int:
    print("=== Chaos Testing via PM2 ===")
    processes = pm2_list()
    if not processes:
        print("No PM2 processes found. Run your services via pm2 start ... first.")
        return 2

    print(f"Found {len(processes)} PM2 process(es).")
    print(f"Health endpoint: {HEALTH_URL}")
    print()

    actions = [
        action_kill,
        action_restart,
        action_stop,
        action_freeze,
        action_melt,
    ]

    events: list[dict[str, Any]] = []
    chaos_run = 0
    failures = 0

    try:
        while True:
            chaos_run += 1
            print(f"[chaos #{chaos_run}] ", end="", flush=True)

            proc_list = pm2_list()
            action = random.choice(actions)
            msg = action(proc_list)
            print(f"{action.__name__}: {msg}")

            # Wait for interval
            time.sleep(CHAOS_INTERVAL)

            # Health check after chaos
            healthy = health_check()
            event = {
                "run": chaos_run,
                "action": action.__name__,
                "detail": msg,
                "healthy_after": healthy,
                "timestamp": time.time(),
            }
            events.append(event)

            if not healthy:
                failures += 1
                print(f"  WARNING: service unhealthy after chaos event #{chaos_run}")

    except KeyboardInterrupt:
        pass

    print()
    print(f"=== Chaos Summary: {chaos_run} events, {failures} health failures ===")

    path = save_chaos_log(events)
    print(f"Log saved to {path}")

    if failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
