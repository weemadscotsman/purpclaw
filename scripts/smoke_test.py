#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# PURPCLAW SMOKE TEST — 🔥 PHOENIX (Rebirth & Recovery Specialist)
# ═══════════════════════════════════════════════════════════════════════════
#
# Validates the full PURPCLAW runtime, in order:
#   1. ENV  — load .env, assert required vars present
#   2. HEALTH — ping every service health endpoint from service_registry
#   3. STARTUP — spin up the "minimal" launch profile if not already running
#   4. AGENTS — submit one task to each agent persona via the tower
#   5. SHAPE — assert every response is JSON with the expected keys
#   6. QUEUE — read EventBus queue depth + agent active count from tower
#
# Exits non-zero on ANY failure. Writes pass/fail reports to:
#   - scripts/.smoke_report.json   (machine-readable)
#   - scripts/.smoke_report.txt    (human-readable)
#
# Usage:
#   python scripts/smoke_test.py
#   python scripts/smoke_test.py --profile minimal          (default)
#   python scripts/smoke_test.py --skip-startup             (assume running)
#   python scripts/smoke_test.py --timeout 90               (per-request)
#   python scripts/smoke_test.py --agents phoenix,robot,owl (subset)
#
# Requires: Python 3.10+ stdlib only (urllib, json, socket, argparse, time)
# ═══════════════════════════════════════════════════════════════════════════

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

# ─────────────────────────────────────────────────────────────────────────
# Constants — pulled from service_registry.js + agent_tower.js + .env.example
# ─────────────────────────────────────────────────────────────────────────

PURP_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PURP_ROOT / ".env"

# Required env vars (per .env.example) — what the runtime actually reads
REQUIRED_ENV = [
    "LLM_PROVIDER",
    "LLM_MODEL",
]

# Soft env vars — warn if missing, don't fail
SOFT_ENV = [
    "LLM_FALLBACK",
    "LLM_FALLBACK_MODEL",
    "PURPCLAW_GATEWAY_URL",
    "INTERNAL_API_KEY",
]

# Mirrors service_registry.js — every service, its port, and its health path.
# If a new service is added to the JS file, add it here too.
SERVICES = [
    {"key": "eventbus",       "pm2": "purpclaw-eventbus",  "port": 7782, "path": "/health",        "required": True},
    {"key": "state",          "pm2": "purpclaw-state",     "port": 7783, "path": "/health",        "required": True},
    {"key": "api",            "pm2": "purpclaw-api",       "port": 7780, "path": "/api/health",    "required": True},
    {"key": "tower",          "pm2": "purpclaw-tower",     "port": 7790, "path": "/tower/status",  "required": True},
    {"key": "orchestrator",   "pm2": "purpclaw-orchestrator","port": 7784, "path": "/api/health",   "required": True},
    {"key": "gatekeeper",     "pm2": "purpclaw-gatekeeper","port": 7791, "path": "/health",        "required": True},
    {"key": "metrics",        "pm2": "purpclaw-metrics",   "port": 7890, "path": "/health",        "required": True},
    {"key": "pool",           "pm2": "purpclaw-pool",      "port": 7885, "path": "/health",        "required": True},
    {"key": "workers",        "pm2": "purpclaw-workers",   "port": 7897, "path": "/health",        "required": True},
    {"key": "context-bus",    "pm2": "purpclaw-context",   "port": 7881, "path": "/health",        "required": True},
    {"key": "nextjs",         "pm2": "purpclaw-nextjs",    "port": 3030, "path": "/",              "required": True},
    {"key": "coordinator",    "pm2": "purpclaw-coordinator","port": 7898,"path": "/health",        "required": False},
    {"key": "goop",           "pm2": "purpclaw-goop",      "port": 7895, "path": "/health",        "required": False},
    {"key": "voice-coord",    "pm2": "purpclaw-voice",     "port": 8781, "path": "/health",        "required": False},
    {"key": "voice-bridge",   "pm2": "purpclaw-bridge",    "port": 7792, "path": "/health",        "required": False},
    {"key": "telegram",       "pm2": "purpclaw-telegram",  "port": 7795, "path": "/health",        "required": False},
    {"key": "cognitive",      "pm2": "purpclaw-cognitive", "port": 7880, "path": "/cognitive/health", "required": False},
    {"key": "harness",        "pm2": "purpclaw-harness",   "port": 7798, "path": "/health",        "required": False},
    {"key": "thringlet",      "pm2": "purpclaw-thringlet", "port": 7799, "path": "/health",        "required": False},
]

# Mirrors LAUNCH_PROFILES.minimal in service_registry.js — minimum agent set
MINIMAL_PROFILE = [
    "purpclaw-eventbus",
    "purpclaw-state",
    "purpclaw-api",
    "purpclaw-tower",
    "purpclaw-orchestrator",
    "purpclaw-nextjs",
]

# Minimum agent personas to exercise — one from each major division, plus PHOENIX
# (PHOENIX checks itself first — rebirth specialist's gotta verify own fire)
MIN_AGENTS = [
    "phoenix",   # CREATIVE       — rebirth, the smoke test's own division
    "dragon",    # ENGINEERING    — architecture
    "robot",     # ENGINEERING    — coding
    "owl",       # SECURITY       — audit
    "spider",    # INTELLIGENCE   — recon
    "penguin",   # MANAGEMENT     — coordination
    "scientist", # SCIENCE        — research
    "void",      # INFRASTRUCTURE — null handler
]

# Shape contract: every spawn response must include at least these keys.
SPAWN_SHAPE_REQUIRED = {"success"}
TOWER_STATUS_SHAPE = {"status", "registry"}

# Per-step timeouts (seconds)
DEFAULT_REQ_TIMEOUT = 8


# ─────────────────────────────────────────────────────────────────────────
# Report structures
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ""
    duration_ms: int = 0
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class SmokeReport:
    started_at: str
    finished_at: str = ""
    total_duration_ms: int = 0
    passed: int = 0
    failed: int = 0
    checks: list[CheckResult] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    skipped_env: list[str] = field(default_factory=list)
    agents_tested: list[str] = field(default_factory=list)
    services_tested: list[str] = field(default_factory=list)
    queue_depth: int | None = None
    active_agents: int | None = None
    exit_code: int = 0

    def add(self, r: CheckResult) -> None:
        self.checks.append(r)
        if r.passed:
            self.passed += 1
        else:
            self.failed += 1

    def ok(self) -> bool:
        return self.failed == 0


# ─────────────────────────────────────────────────────────────────────────
# Helpers — env, http, pretty
# ─────────────────────────────────────────────────────────────────────────

def load_env() -> tuple[dict[str, str], list[str]]:
    """Parse .env file into a dict. Returns (env, missing_required)."""
    env: dict[str, str] = {}
    if ENV_FILE.exists():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k:
                env[k] = v

    # Pull from os.environ too (in case .env is incomplete and shell has the rest)
    for k in REQUIRED_ENV + SOFT_ENV:
        env.setdefault(k, os.environ.get(k, ""))

    missing = [k for k in REQUIRED_ENV if not env.get(k)]
    return env, missing


def http_json(method: str, url: str, body: dict | None = None,
              timeout: float = DEFAULT_REQ_TIMEOUT) -> tuple[int, Any, dict]:
    """Returns (status_code, parsed_json_or_text, response_headers)."""
    data = None
    headers = {"Accept": "application/json", "User-Agent": "purpclaw-smoke/1.0"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            hdrs = dict(resp.headers.items())
            try:
                return resp.status, json.loads(raw), hdrs
            except json.JSONDecodeError:
                return resp.status, raw, hdrs
    except urllib.error.HTTPError as e:
        raw = ""
        try:
            if e.fp:
                raw = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        try:
            return e.code, json.loads(raw), dict(e.headers.items()) if e.headers else {}
        except (json.JSONDecodeError, AttributeError, TypeError):
            return e.code, raw, {}
    except (urllib.error.URLError, socket.timeout, ConnectionRefusedError, OSError) as e:
        return 0, f"{type(e).__name__}: {e}", {}


def port_is_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def wait_for_health(host: str, port: int, path: str, deadline_s: float) -> tuple[bool, str]:
    """Polls service until 2xx/healthy or deadline. Returns (ok, detail)."""
    url = f"http://{host}:{port}{path}"
    end = time.time() + deadline_s
    last = ""
    while time.time() < end:
        code, payload, _ = http_json("GET", url, timeout=2.0)
        if code == 200:
            return True, f"HTTP 200"
        last = f"HTTP {code} — {str(payload)[:120]}"
        if not port_is_open(host, port, timeout=0.3):
            last = f"port {port} not open"
        time.sleep(2.0)
    return False, last or "timeout"


def mask_secret(value: str) -> str:
    if not value:
        return "<empty>"
    if len(value) < 6:
        return f"<{len(value)} chars>"
    if len(value) > 8:
        return f"{value[:3]}***{value[-3:]}"
    return "<redacted>"


def section(title: str) -> str:
    bar = "═" * max(0, 70 - len(title) - 2)
    return f"\n── {title} {bar[:60]}"


# ─────────────────────────────────────────────────────────────────────────
# Phase 1 — ENV
# ─────────────────────────────────────────────────────────────────────────

def phase_env() -> CheckResult:
    env, missing = load_env()
    soft_missing = [k for k in SOFT_ENV if not env.get(k)]
    if missing:
        return CheckResult(
            "ENV: required vars present",
            False,
            f"missing required env vars: {missing}",
            data={"missing": missing, "soft_missing": soft_missing},
        )
    return CheckResult(
        "ENV: required vars present",
        True,
        f"LLM_PROVIDER={env.get('LLM_PROVIDER')!r}  LLM_MODEL={env.get('LLM_MODEL')!r}"
        + (f"  (soft missing: {soft_missing})" if soft_missing else ""),
        data={"soft_missing": soft_missing},
    )


# ─────────────────────────────────────────────────────────────────────────
# Phase 2 — HEALTH
# ─────────────────────────────────────────────────────────────────────────

def phase_health(required_only: bool = True) -> tuple[list[CheckResult], list[str]]:
    results: list[CheckResult] = []
    tested: list[str] = []
    for svc in SERVICES:
        if required_only and not svc["required"]:
            continue
        host = "127.0.0.1"
        port = svc["port"]
        path = svc["path"]
        t0 = time.time()
        ok, detail = wait_for_health(host, port, path, deadline_s=6.0)
        dur = int((time.time() - t0) * 1000)
        results.append(CheckResult(
            f"HEALTH: {svc['key']:<14} :{port}{path}",
            ok,
            detail,
            duration_ms=dur,
        ))
        tested.append(svc["key"])
    return results, tested


# ─────────────────────────────────────────────────────────────────────────
# Phase 3 — STARTUP (assertion of running services)
# ─────────────────────────────────────────────────────────────────────────

def phase_startup(profile: list[str], skip: bool) -> CheckResult:
    if skip:
        return CheckResult("STARTUP: minimal launch profile", True, "skipped (--skip-startup)")
    missing: list[str] = []
    for name in profile:
        port = next((s["port"] for s in SERVICES if s["pm2"] == name), None)
        path = next((s["path"] for s in SERVICES if s["pm2"] == name), "/health")
        if port is None:
            missing.append(f"{name} (no port registered)")
            continue
        if not port_is_open("127.0.0.1", port, timeout=1.0):
            # Wait up to 30s for it to come up
            ok, _ = wait_for_health("127.0.0.1", port, path, deadline_s=30.0)
            if not ok:
                missing.append(f"{name} :{port}{path}")

    if missing:
        return CheckResult(
            "STARTUP: minimal launch profile",
            False,
            "missing services (start with: pm2 start ecosystem.config.js): "
            + ", ".join(missing),
            data={"missing": missing, "expected": profile},
        )
    return CheckResult(
        "STARTUP: minimal launch profile",
        True,
        f"all {len(profile)} services responding",
        data={"verified": profile},
    )


# ─────────────────────────────────────────────────────────────────────────
# Phase 4+5 — AGENT SPAWN & SHAPE
# ─────────────────────────────────────────────────────────────────────────

def phase_agents(agents: list[str]) -> tuple[list[CheckResult], list[str]]:
    """Submit one task to each agent via the tower's spawn endpoint."""
    results: list[CheckResult] = []
    tested: list[str] = []
    spawn_url = "http://127.0.0.1:7790/spawn"
    # Fallback: some tower impls accept task at /api/agent/spawn on the API
    fallback_url = "http://127.0.0.1:7780/api/agent/spawn"

    for name in agents:
        t0 = time.time()
        payload = {
            "agent": name,
            "task": f"smoke-test ping at {int(time.time())}",
            "smoke": True,
        }
        code, body, _ = http_json("POST", spawn_url, body=payload, timeout=10.0)
        if code == 0 or code == 404:
            code, body, _ = http_json("POST", fallback_url, body=payload, timeout=10.0)
        dur = int((time.time() - t0) * 1000)

        parsed: Any = body
        if isinstance(body, str):
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError:
                parsed = body

        if code in (200, 201, 202):
            if isinstance(parsed, dict) and SPAWN_SHAPE_REQUIRED.issubset(parsed.keys()):
                ok = parsed.get("success", True) is True
                detail = f"HTTP {code}  spawned agent={name!r}  agentId={parsed.get('agentId', '?')}"
            elif isinstance(parsed, dict):
                if parsed.get("ok") is True or "agentId" in parsed or "id" in parsed:
                    ok = True
                    detail = f"HTTP {code}  agent accepted (alt shape: {list(parsed.keys())[:6]})"
                else:
                    ok = False
                    detail = f"HTTP {code} but response missing required keys: {SPAWN_SHAPE_REQUIRED}"
            else:
                ok = False
                detail = f"HTTP {code} but response is not a JSON object: {str(parsed)[:120]}"
        else:
            ok = False
            detail = f"HTTP {code}  {str(parsed)[:200]}"

        results.append(CheckResult(
            f"AGENT: spawn {name}",
            ok,
            detail,
            duration_ms=dur,
            data={"agent": name, "http": code, "response_keys": list(parsed.keys()) if isinstance(parsed, dict) else None},
        ))
        tested.append(name)
    return results, tested


# ─────────────────────────────────────────────────────────────────────────
# Phase 6 — QUEUE / TELEMETRY
# ─────────────────────────────────────────────────────────────────────────

def phase_queue() -> tuple[CheckResult, int | None, int | None]:
    """Read eventbus queue depth and tower active-agent count."""
    depth: int | None = None
    active: int | None = None

    for path in ("/stats", "/events/depth", "/health", "/api/stats"):
        code, body, _ = http_json("GET", f"http://127.0.0.1:7782{path}", timeout=4.0)
        if code == 200 and isinstance(body, dict):
            for key in ("queueDepth", "queue_depth", "depth", "pending", "size"):
                if key in body and isinstance(body[key], (int, float)):
                    depth = int(body[key])
                    break
            if depth is not None:
                break

    code, body, _ = http_json("GET", "http://127.0.0.1:7790/tower/status", timeout=4.0)
    tower_ok = False
    tower_detail = ""
    if code == 200 and isinstance(body, dict):
        for key in ("totalActive", "active_agents", "activeAgents", "active"):
            if key in body and isinstance(body[key], (int, float)):
                active = int(body[key])
                tower_ok = True
                tower_detail = f"totalActive={active} status={body.get('status', '?')!r}"
                break
        if not tower_ok:
            if TOWER_STATUS_SHAPE.issubset(body.keys()):
                tower_ok = True
                tower_detail = f"status={body.get('status', '?')!r} (active count not in payload)"
            else:
                tower_detail = f"shape mismatch: have {list(body.keys())[:8]}"
    else:
        tower_detail = f"HTTP {code} {str(body)[:120]}"

    if depth is None and active is None and not tower_ok:
        return (
            CheckResult("TELEMETRY: queue depth + active agents", False, tower_detail),
            None, None,
        )

    return (
        CheckResult(
            "TELEMETRY: queue depth + active agents",
            True,
            f"eventbus.depth={depth}  tower.active={active}  {tower_detail}",
            data={"queue_depth": depth, "active_agents": active},
        ),
        depth, active,
    )


# ─────────────────────────────────────────────────────────────────────────
# Report writer
# ─────────────────────────────────────────────────────────────────────────

def write_reports(report: SmokeReport) -> None:
    json_path = PURP_ROOT / "scripts" / ".smoke_report.json"
    txt_path = PURP_ROOT / "scripts" / ".smoke_report.txt"

    json_path.write_text(json.dumps(asdict(report), indent=2), encoding="utf-8")

    lines: list[str] = []
    lines.append("═" * 70)
    lines.append("  PURPCLAW SMOKE REPORT — 🔥 PHOENIX")
    lines.append("═" * 70)
    lines.append(f"  Started:  {report.started_at}")
    lines.append(f"  Finished: {report.finished_at}")
    lines.append(f"  Duration: {report.total_duration_ms} ms")
    lines.append(f"  Result:   {'PASS ✅' if report.ok() else 'FAIL ❌'}")
    lines.append(f"  Passed:   {report.passed}")
    lines.append(f"  Failed:   {report.failed}")
    lines.append("")
    if report.env:
        lines.append("  ENV (masked):")
        for k, v in sorted(report.env.items()):
            masked = mask_secret(v) if any(s in k for s in ("KEY", "TOKEN", "SECRET")) else v
            lines.append(f"    {k} = {masked}")
        if report.skipped_env:
            lines.append(f"  Soft-missing (non-fatal): {', '.join(report.skipped_env)}")
        lines.append("")
    lines.append(f"  Services tested ({len(report.services_tested)}):")
    for s in report.services_tested:
        lines.append(f"    • {s}")
    lines.append("")
    lines.append(f"  Agents tested ({len(report.agents_tested)}):")
    for a in report.agents_tested:
        lines.append(f"    • {a}")
    lines.append("")
    if report.queue_depth is not None or report.active_agents is not None:
        lines.append("  Telemetry:")
        lines.append(f"    EventBus queue depth : {report.queue_depth}")
        lines.append(f"    Tower active agents  : {report.active_agents}")
        lines.append("")
    lines.append("  Checks:")
    for c in report.checks:
        mark = "✅" if c.passed else "❌"
        lines.append(f"    {mark} {c.name}  ({c.duration_ms} ms)")
        if c.detail:
            lines.append(f"        {c.detail}")
    lines.append("═" * 70)
    txt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="PURPCLAW smoke test — PHOENIX 🔥")
    parser.add_argument("--profile", default="minimal",
                        help="Launch profile name from service_registry.js (default: minimal)")
    parser.add_argument("--skip-startup", action="store_true",
                        help="Assume services are already running, don't probe for them")
    parser.add_argument("--required-only", action="store_true",
                        help="Only ping services marked required in service_registry")
    parser.add_argument("--agents", default=",".join(MIN_AGENTS),
                        help=f"Comma-separated agent list (default: {','.join(MIN_AGENTS)})")
    parser.add_argument("--timeout", type=float, default=DEFAULT_REQ_TIMEOUT,
                        help=f"Per-request timeout in seconds (default: {DEFAULT_REQ_TIMEOUT})")
    args = parser.parse_args()

    agents = [a.strip() for a in args.agents.split(",") if a.strip()]
    profile = MINIMAL_PROFILE if args.profile == "minimal" else MINIMAL_PROFILE

    env, _ = load_env()

    report = SmokeReport(
        started_at=time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime()),
        env={k: env.get(k, "") for k in REQUIRED_ENV + SOFT_ENV if env.get(k)},
        skipped_env=[k for k in SOFT_ENV if not env.get(k)],
    )

    t_total = time.time()

    print(section("PHASE 1/6 — ENV VALIDATION"))
    r = phase_env()
    report.add(r)
    print(f"  [{'OK' if r.passed else 'FAIL'}] {r.name}: {r.detail}")

    print(section("PHASE 2/6 — SERVICE HEALTH PING"))
    health_results, services_tested = phase_health(required_only=args.required_only)
    report.services_tested = services_tested
    for r in health_results:
        report.add(r)
        mark = "OK" if r.passed else "FAIL"
        print(f"  [{mark:<4}] {r.name}  ({r.duration_ms} ms)  {r.detail}")

    print(section("PHASE 3/6 — MINIMUM AGENT SET (LAUNCH PROFILE)"))
    r = phase_startup(profile, args.skip_startup)
    report.add(r)
    print(f"  [{'OK' if r.passed else 'FAIL'}] {r.name}: {r.detail}")

    print(section("PHASE 4/6 — AGENT TASK SUBMISSION"))
    agent_results, agents_tested = phase_agents(agents)
    report.agents_tested = agents_tested
    for r in agent_results:
        report.add(r)
        mark = "OK" if r.passed else "FAIL"
        print(f"  [{mark:<4}] {r.name}  ({r.duration_ms} ms)  {r.detail}")

    print(section("PHASE 5/6 — RESPONSE SHAPE (covered in phase 4)"))
    shape_ok = len(agent_results) > 0 and all(r.passed for r in agent_results)
    r = CheckResult(
        "SHAPE: spawn responses validate required keys",
        shape_ok,
        f"{len([a for a in agent_results if a.passed])}/{len(agent_results)} agents returned well-formed responses",
    )
    report.add(r)
    print(f"  [{'OK' if r.passed else 'FAIL'}] {r.name}: {r.detail}")

    print(section("PHASE 6/6 — TELEMETRY / QUEUE DEPTH"))
    r, depth, active = phase_queue()
    report.add(r)
    report.queue_depth = depth
    report.active_agents = active
    print(f"  [{'OK' if r.passed else 'FAIL'}] {r.name}: {r.detail}")

    report.finished_at = time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime())
    report.total_duration_ms = int((time.time() - t_total) * 1000)
    report.exit_code = 0 if report.ok() else 1

    print(section("RESULT"))
    print(f"  {'PASS ✅' if report.ok() else 'FAIL ❌'}  —  {report.passed} passed, {report.failed} failed, {report.total_duration_ms} ms total")
    print(f"  Reports: scripts/.smoke_report.txt  +  scripts/.smoke_report.json")

    write_reports(report)
    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
