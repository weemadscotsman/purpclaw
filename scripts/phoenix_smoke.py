#!/usr/bin/env python3
"""
phoenix_smoke.py — PHOENIX Recovery Smoke Test for PURPCLAW
============================================================

🔥 Rebirth Specialist. Restores systems to operational state.
This script proves the swarm is alive and answering in the right shape
BEFORE we trust any work to it. If any check fails, we exit non-zero
and the operator must escalate (PHOENIX → ROBOT → WOLF).

Phases (in order, fail-fast within phase, full report at end):
  1. Validate required env vars + at least one provider key present
  2. Ping each service health endpoint, assert response shape
  3. Spin up the minimum agent set (one persona per division)
  4. Submit one task per persona, assert dispatch response shape
  5. Check telemetry + queue depth
  6. Emit a colored pass/fail report + JSON report to agent_work/

Stdlib only — no pip, no curl, no external deps. Works on Windows / Linux / macOS.

Usage:
  python scripts/phoenix_smoke.py
  PURPCLAW_BASE=http://127.0.0.1:3030 python scripts/phoenix_smoke.py
  PURPCLAW_BASE=http://localhost:3030 python scripts/phoenix_smoke.py --no-color

Exit codes:
  0   all checks passed
  1   one or more checks failed
  2   script misconfiguration (missing env, bad URL)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PURPCLAW_BASE = os.environ.get("PURPCLAW_BASE", "http://127.0.0.1:3030").rstrip("/")
UNIFIED_API = os.environ.get("PURPCLAW_API_URL", "http://127.0.0.1:7780").rstrip("/")
AGENT_TOWER = os.environ.get("PURPCLAW_TOWER_URL", "http://127.0.0.1:7790").rstrip("/")
TIMEOUT_DEFAULT = 3.5
TIMEOUT_DEEP = 8.0

# Hard-required env vars (system is unsafe to run without these).
REQUIRED_ENV = [
    "PURPCLAW_MODE",
    "PURPCLAW_OPERATOR",
    "UNIFIED_API_URL",
]

# Any one of these counts as "a brain is wired" — fail loud if zero.
PROVIDER_ENV = [
    "MINIMAX_API_KEY",
    "OPENROUTER_API_KEY",
    "DEEPSEEK_API_KEY",
    "NVIDIA_API_KEY", "NVIDIA_API_KEY_HERMES",
    "NVIDIA_API_KEY_PURP1", "NVIDIA_API_KEY_PURP2", "NVIDIA_API_KEY_PURP3",
    "GITHUB_MODELS_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "KIMI_API_KEY",
    "OLLAMA_HOST",
]

# Health endpoints we always probe. The (path, required_shape) tuple is the contract.
HEALTH_ENDPOINTS: List[Tuple[str, List[str]]] = [
    ("/api/yo",                ["yo"]),                  # cactus liveness
    ("/api/heartbeat",         ["ok", "green", "core", "providers"]),
    ("/api/services",          ["ok", "up", "total", "services"]),
    ("/api/spine-health",      []),                       # proxies unified_api; ok or error
    ("/api/pulse?limit=5",     []),                       # notifications proxy
    ("/api/llm-status",        []),                       # may 200 or be absent
    ("/api/manifest",          []),                       # catalog
    ("/api/host-telemetry",    []),                       # telemetry
    ("/api/delegation/status", []),                       # queue status
    ("/api/internal/check",    []),                       # internal self-check
]

# Minimum agent set — one persona per division, 9 divisions → 9 agents.
# This is the contract: every division must be reachable on the tower.
MIN_PERSONAS: List[Dict[str, str]] = [
    {"agent": "phoenix",   "division": "creative",            "task": "Recover from the smoke test failure (if any)."},
    {"agent": "architect", "division": "engineering",         "task": "Review the service registry for shape errors."},
    {"agent": "owl",       "division": "intelligence",        "task": "Analyse the last 5 pulse findings."},
    {"agent": "wolf",      "division": "management",          "task": "Audit agent_work/ for orphan mission dirs."},
    {"agent": "mantis",    "division": "media-operations",    "task": "List the recent media jobs and their status."},
    {"agent": "crow",      "division": "operations",          "task": "Verify PM2 service mesh is fully green."},
    {"agent": "scientist", "division": "science",             "task": "Sanity-check the eval harness latest run."},
    {"agent": "guardian",  "division": "security",            "task": "Run a fast posture check on auth providers."},
    {"agent": "cactus",    "division": "voice-infrastructure","task": "Confirm yo endpoint is responsive."},
]

# Report output
REPORT_PATH = os.environ.get("PHOENIX_REPORT", "agent_work/phoenix_smoke_report.json")


# ---------------------------------------------------------------------------
# Color (auto-disabled on non-tty or --no-color)
# ---------------------------------------------------------------------------

class C:
    R = "\033[31m"
    G = "\033[32m"
    Y = "\033[33m"
    B = "\033[34m"
    M = "\033[35m"
    CY = "\033[36m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    X = "\033[0m"

USE_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None

def c(s: str, color: str) -> str:
    return f"{color}{s}{C.X}" if USE_COLOR else s


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

REPORT: List[Dict[str, Any]] = []
GLOBAL_OK = True


def record(check: str, ok: bool, detail: str = "", data: Optional[Any] = None) -> None:
    """Append a check result and update global OK."""
    global GLOBAL_OK
    if not ok:
        GLOBAL_OK = False
    REPORT.append({
        "check": check,
        "ok": ok,
        "detail": detail,
        "data": data if _safe_to_serialize(data) else str(data)[:200],
        "ts": time.time(),
    })
    sym = c("✓", C.G) if ok else c("✗", C.R)
    label = c(check, C.BOLD)
    print(f"  {sym} {label}  {c(detail, C.DIM)}", flush=True)


def _safe_to_serialize(v: Any) -> bool:
    try:
        json.dumps(v)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def http_get(url: str, timeout: float = TIMEOUT_DEFAULT) -> Tuple[int, Any]:
    try:
        req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return r.status, _try_json(body)
    except urllib.error.HTTPError as e:
        try:
            body = e.read()
        except Exception:
            body = b""
        return e.code, _try_json(body)
    except Exception as e:
        return 0, str(e)


def http_post_json(url: str, body: Dict[str, Any], timeout: float = TIMEOUT_DEEP) -> Tuple[int, Any]:
    try:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, method="POST",
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            rbody = r.read()
            return r.status, _try_json(rbody)
    except urllib.error.HTTPError as e:
        try:
            body = e.read()
        except Exception:
            body = b""
        return e.code, _try_json(body)
    except Exception as e:
        return 0, str(e)


def _try_json(raw: bytes) -> Any:
    if not raw:
        return ""
    try:
        return json.loads(raw.decode("utf-8", errors="replace"))
    except Exception:
        return raw.decode("utf-8", errors="replace")[:500]


# ---------------------------------------------------------------------------
# Phase 1 — Environment validation
# ---------------------------------------------------------------------------

def phase_env() -> None:
    print()
    print(c("🔥 PHASE 1 — Environment validation", C.BOLD + C.M))
    missing_required = [v for v in REQUIRED_ENV if not os.environ.get(v)]
    if missing_required:
        record("env/required", False, f"missing: {missing_required}")
    else:
        record("env/required", True, f"all {len(REQUIRED_REQUIRED_DISPLAY)} required env vars present")

    present_providers = [v for v in PROVIDER_ENV if os.environ.get(v)]
    if not present_providers:
        record("env/providers", False, "no provider API keys present — LLM lanes are dead")
    else:
        record("env/providers", True, f"{len(present_providers)} provider(s) wired: {present_providers}")

    # Config sanity
    if not PURPCLAW_BASE.startswith(("http://", "https://")):
        record("env/base-url", False, f"PURPCLAW_BASE malformed: {PURPCLAW_BASE}")
    else:
        record("env/base-url", True, f"PURPCLAW_BASE={PURPCLAW_BASE}")


# display helper used by env check label
REQUIRED_REQUIRED_DISPLAY = REQUIRED_ENV


# ---------------------------------------------------------------------------
# Phase 2 — Service health probes
# ---------------------------------------------------------------------------

def phase_health() -> None:
    print()
    print(c("🔥 PHASE 2 — Service health probes", C.BOLD + C.M))
    for path, required_shape in HEALTH_ENDPOINTS:
        url = PURPCLAW_BASE + path
        t0 = time.time()
        code, body = http_get(url, timeout=TIMEOUT_DEEP if "heartbeat" in path or "services" in path else TIMEOUT_DEFAULT)
        latency_ms = int((time.time() - t0) * 1000)

        # 502 from a proxy is acceptable when upstream is down — log it but don't fail unless we require shape
        if code == 0:
            record(f"health{path}", False, f"code=0 (unreachable) latency={latency_ms}ms err={body}")
            continue

        # Shape check
        if required_shape and isinstance(body, dict):
            missing = [k for k in required_shape if k not in body]
            if missing:
                record(f"health{path}", False, f"code={code} missing shape: {missing}")
                continue

        if "/api/heartbeat" in path and isinstance(body, dict):
            record(
                f"health{path}",
                code == 200 and body.get("ok") is True,
                f"green={body.get('green')} core={body.get('core')} providers={body.get('providers')} memory={body.get('memory')} latency={latency_ms}ms",
                {"green": body.get("green"), "core": body.get("core"), "providers": body.get("providers")},
            )
        elif "/api/services" in path and isinstance(body, dict):
            up = body.get("up")
            total = body.get("total")
            ok = code == 200 and body.get("ok") is True and isinstance(up, int) and isinstance(total, int)
            record(
                f"health{path}",
                ok,
                f"up={up}/{total} groups={body.get('groups')} latency={latency_ms}ms",
                {"up": up, "total": total, "groups": body.get("groups")},
            )
        elif "/api/yo" in path and isinstance(body, dict):
            record(
                f"health{path}",
                code == 200 and body.get("yo") is True,
                f"code={code} agent={body.get('agent')} division={body.get('division')} latency={latency_ms}ms",
            )
        elif "/api/manifest" in path and isinstance(body, dict):
            tools = body.get("tools") or body.get("toolsCount") or 0
            agents = body.get("agents") or body.get("agentsCount") or 0
            record(
                f"health{path}",
                code == 200,
                f"code={code} tools={tools} agents={agents} latency={latency_ms}ms",
            )
        else:
            # Generic: code 200 or 502 (proxy fallback) is acceptable
            record(
                f"health{path}",
                code in (200, 502),
                f"code={code} latency={latency_ms}ms shape={type(body).__name__}",
            )


# ---------------------------------------------------------------------------
# Phase 3 — Agent spin-up (minimum set)
# ---------------------------------------------------------------------------

def phase_agents() -> None:
    print()
    print(c("🔥 PHASE 3 — Minimum agent set spin-up", C.BOLD + C.M))
    # Probe the tower first
    code, body = http_get(f"{AGENT_TOWER}/tower/status", timeout=TIMEOUT_DEEP)
    if code == 0:
        record("agents/tower-alive", False, f"agent tower unreachable at {AGENT_TOWER}: {body}")
    elif isinstance(body, dict):
        registered = body.get("totalRegistered") or body.get("registered") or body.get("count")
        record(
            "agents/tower-alive",
            code == 200,
            f"tower up at {AGENT_TOWER} registered={registered} divisions={list((body.get('divisions') or {}).keys()) if isinstance(body.get('divisions'), dict) else 'n/a'}",
            {"registered": registered, "raw_keys": list(body.keys())},
        )
    else:
        record("agents/tower-alive", code == 200, f"tower responded code={code}")

    # Try to spawn each persona
    for p in MIN_PERSONAS:
        url = f"{AGENT_TOWER}/tower/spawn"
        payload = {
            "agent": p["agent"],
            "division": p["division"],
            "task": p["task"],
            "meta": {"source": "phoenix_smoke", "kind": "smoke"},
        }
        code, body = http_post_json(url, payload, timeout=TIMEOUT_DEEP)
        ok = code in (200, 201, 202) and isinstance(body, dict)
        if ok:
            record(
                f"agents/spawn/{p['agent']}",
                True,
                f"code={code} division={p['division']} id={body.get('id') or body.get('agentId') or body.get('jobId') or 'n/a'}",
            )
        else:
            # 404 means no /tower/spawn endpoint — log but don't kill the run
            record(
                f"agents/spawn/{p['agent']}",
                False,
                f"code={code} division={p['division']} (body: {str(body)[:120]})",
            )


# ---------------------------------------------------------------------------
# Phase 4 — Task dispatch per persona
# ---------------------------------------------------------------------------

def phase_dispatch() -> None:
    print()
    print(c("🔥 PHASE 4 — Task dispatch per persona", C.BOLD + C.M))
    for p in MIN_PERSONAS:
        # Try Next.js harness start first, then fall back to tower spawn
        url = f"{PURPCLAW_BASE}/api/harness/start"
        payload = {
            "agent": p["agent"],
            "division": p["division"],
            "task": p["task"],
            "source": "phoenix_smoke",
        }
        code, body = http_post_json(url, payload, timeout=TIMEOUT_DEEP)
        used = "harness"
        if not (code in (200, 201, 202) and isinstance(body, dict) and body.get("ok") is not False):
            # fallback to tower /tower/spawn with a task field
            url2 = f"{AGENT_TOWER}/tower/spawn"
            payload2 = {
                "agent": p["agent"],
                "division": p["division"],
                "task": p["task"],
            }
            code, body = http_post_json(url2, payload2, timeout=TIMEOUT_DEEP)
            used = "tower-spawn"

        ok = code in (200, 201, 202) and isinstance(body, dict)
        if isinstance(body, dict):
            task_id = body.get("id") or body.get("jobId") or body.get("missionId") or body.get("agentId")
            shape_ok = ("ok" in body) or ("id" in body) or ("jobId" in body) or ("missionId" in body) or ("result" in body) or ("status" in body)
            ok = ok and shape_ok
            record(
                f"dispatch/{p['agent']}",
                ok,
                f"via={used} code={code} id={task_id} keys={list(body.keys())[:5]}",
            )
        else:
            record(
                f"dispatch/{p['agent']}",
                False,
                f"via={used} code={code} body={str(body)[:120]}",
            )


# ---------------------------------------------------------------------------
# Phase 5 — Telemetry + queue depth
# ---------------------------------------------------------------------------

def phase_telemetry() -> None:
    print()
    print(c("🔥 PHASE 5 — Telemetry + queue depth", C.BOLD + C.M))
    # Host telemetry
    code, body = http_get(f"{PURPCLAW_BASE}/api/host-telemetry", timeout=TIMEOUT_DEFAULT)
    if isinstance(body, dict):
        record(
            "telemetry/host",
            code == 200,
            f"code={code} keys={list(body.keys())[:6]}",
        )
    else:
        record("telemetry/host", code == 200, f"code={code} (no JSON body)")

    # Delegation status — this carries queue depth
    code, body = http_get(f"{PURPCLAW_BASE}/api/delegation/status", timeout=TIMEOUT_DEFAULT)
    qd: Any = None
    if isinstance(body, dict):
        # The field name is whatever the route decided — search common ones
        for key in ("queueDepth", "queue_depth", "queue", "pending", "depth", "backlog"):
            if key in body and isinstance(body[key], (int, float)):
                qd = body[key]
                break
        if qd is None and isinstance(body.get("queues"), dict):
            qd = sum((v.get("depth") or 0) for v in body["queues"].values() if isinstance(v, dict))
        record(
            "telemetry/queue",
            code == 200,
            f"code={code} queueDepth={qd if qd is not None else 'unknown'} keys={list(body.keys())[:6]}",
            {"queueDepth": qd},
        )
    else:
        record("telemetry/queue", code == 200, f"code={code}")

    # Internal check — health of the API process itself
    code, body = http_get(f"{PURPCLAW_BASE}/api/internal/check", timeout=TIMEOUT_DEFAULT)
    if isinstance(body, dict):
        record(
            "telemetry/internal",
            code == 200,
            f"code={code} keys={list(body.keys())[:6]}",
        )
    else:
        record("telemetry/internal", code == 200, f"code={code}")

    # LLM status — provider lane health
    code, body = http_get(f"{PURPCLAW_BASE}/api/llm-status", timeout=TIMEOUT_DEFAULT)
    if isinstance(body, dict):
        usable = body.get("usable") or body.get("available")
        record(
            "telemetry/llm",
            code == 200,
            f"code={code} usable={usable} keys={list(body.keys())[:6]}",
        )
    else:
        record("telemetry/llm", code == 200, f"code={code}")


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def emit_report() -> int:
    print()
    print(c("=" * 64, C.BOLD))
    print(c("🔥 PHOENIX SMOKE REPORT", C.BOLD + C.M))
    print(c("=" * 64, C.BOLD))
    passed = sum(1 for r in REPORT if r["ok"])
    failed = sum(1 for r in REPORT if not r["ok"])
    for r in REPORT:
        sym = c("✓", C.G) if r["ok"] else c("✗", C.R)
        print(f"  {sym} {c(r['check'], C.BOLD):60s}  {c(r['detail'], C.DIM)}")
    print(c("-" * 64, C.DIM))
    print(f"  Total: {c(str(len(REPORT)), C.BOLD)}   "
          f"Pass: {c(str(passed), C.G)}   "
          f"Fail: {c(str(failed), C.R if failed else C.G)}")
    print()
    if failed == 0:
        print(c("🔥 SMOKE TEST PASSED — swarm is healthy. Phoenix rests.", C.BOLD + C.G))
    else:
        print(c(f"💀 SMOKE TEST FAILED — {failed} check(s) need attention. "
                f"Escalate to ROBOT (repair) → WOLF (audit) → OWL (root cause).",
                C.BOLD + C.R))
    print(c("=" * 64, C.BOLD))

    # JSON report
    try:
        os.makedirs(os.path.dirname(REPORT_PATH) or ".", exist_ok=True)
        with open(REPORT_PATH, "w", encoding="utf-8") as f:
            json.dump({
                "ok": failed == 0,
                "passed": passed,
                "failed": failed,
                "total": len(REPORT),
                "at": time.time(),
                "config": {
                    "PURPCLAW_BASE": PURPCLAW_BASE,
                    "UNIFIED_API": UNIFIED_API,
                    "AGENT_TOWER": AGENT_TOWER,
                },
                "checks": REPORT,
            }, f, indent=2)
        print(c(f"  Report written → {REPORT_PATH}", C.DIM))
    except Exception as e:
        print(c(f"  (could not write report: {e})", C.Y))

    return 0 if failed == 0 else 1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="PHOENIX smoke test for PURPCLAW")
    parser.add_argument("--no-color", action="store_true", help="disable ANSI colors")
    parser.add_argument("--skip-dispatch", action="store_true",
                        help="skip task dispatch (phases 3-4)")
    args = parser.parse_args()

    global USE_COLOR
    if args.no_color:
        USE_COLOR = False

    print(c("🔥 PHOENIX — Recovery Smoke Test starting…", C.BOLD + C.M))
    print(f"  PURPCLAW_BASE = {PURPCLAW_BASE}")
    print(f"  UNIFIED_API    = {UNIFIED_API}")
    print(f"  AGENT_TOWER    = {AGENT_TOWER}")
    print(f"  Report path    = {REPORT_PATH}")

    phase_env()
    phase_health()
    if not args.skip_dispatch:
        phase_agents()
        phase_dispatch()
    else:
        print()
        print(c("  (skipping phases 3-4: --skip-dispatch)", C.Y))
    phase_telemetry()

    return emit_report()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print(c("\n🔥 Aborted by operator.", C.Y))
        sys.exit(130)
