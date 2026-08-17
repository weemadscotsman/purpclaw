#!/usr/bin/env python3
"""
spring_doctrine — stub
PURPCLAW operational doctrine / policy engine. Encodes the hard rules that
govern what the system may and may not do: safety boundaries, pricing rules,
spawn constraints, and override protocols. Stub satisfies the import so the
spine boots. Real doctrine loading and enforcement not yet implemented.
"""

import time

_policy = {
    "version": "stub",
    "loaded_at": time.time(),
}


def load_doctrine(path: str = None) -> dict:
    """Load doctrine from a JSON/YAML file. Stub: returns empty policy."""
    return _policy


def status() -> dict:
    """Return current doctrine status."""
    return {
        "ok": True,
        "policy": _policy,
        "loaded": True,
    }


def validate(action: str, context: dict = None) -> dict:
    """
    Validate an action against the doctrine.
    Returns {ok, reason}. Stub: always ok.
    """
    return {"ok": True, "action": action}


def is_allowed(action: str, context: dict = None) -> bool:
    """Return True if the action is permitted. Stub: always True."""
    return True
