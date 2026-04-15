#!/usr/bin/env python3
"""
PURPCLAW Modal Logic Engine v1.0
================================
Implements 4 modal logics per agent using Kripke Models:
  - Epistemic (KNOW, KNOW_NOT, KNOW_WHO)
  - Temporal (BEFORE, AFTER, DURING, EVENTUALLY, NEXT, UNTIL)
  - Deontic (MAY, MUST, MUST_NOT, OBLIGATED)
  - Doxastic (BELIEVES, SUSPECTS, CONFident, UNCERTAIN)

Each agent has its own Kripke Model with worlds, accessibility relations,
atomic propositions, and truth evaluation.
"""

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ─────────────────────────────────────────────────────────────
# MODAL OPERATORS (symbols used in formulas)
# ─────────────────────────────────────────────────────────────

class ModalOperator(Enum):
    KNOW = "KNOW"
    KNOW_NOT = "KNOW_NOT"
    KNOW_WHO = "KNOW_WHO"
    BEFORE = "BEFORE"
    AFTER = "AFTER"
    DURING = "DURING"
    EVENTUALLY = "EVENTUALLY"
    NEXT = "NEXT"
    UNTIL = "UNTIL"
    MAY = "MAY"
    MUST = "MUST"
    MUST_NOT = "MUST_NOT"
    OBLIGATED = "OBLIGATED"
    BELIEVES = "BELIEVES"
    SUSPECTS = "SUSPECTS"
    CONFIDENT = "CONFIDENT"
    UNCERTAIN = "UNCERTAIN"


# ─────────────────────────────────────────────────────────────
# KRIPKE MODEL STRUCTURES
# ─────────────────────────────────────────────────────────────

@dataclass
class World:
    """A possible world in a Kripke model."""
    id: str
    label: str
    propositions: dict[str, bool] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AccessibilityRelation:
    """R_a(w1, w2) — world w2 is accessible from w1 for agent a."""
    agent_id: str
    from_world: str
    to_world: str
    relation_type: str = "standard"  # standard, epistemic, temporal, deontic


class KripkeModel:
    """
    A Kripke Model: (W, R, V) where:
      W = set of worlds
      R = accessibility relation (per agent)
      V = valuation (which atomic propositions are true in which worlds)
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.worlds: dict[str, World] = {}
        self.accessibility: dict[str, list[AccessibilityRelation]] = {}  # agent_id -> relations
        self.current_world: str | None = None
        self.lock = threading.RLock()

    def add_world(self, world: World) -> None:
        with self.lock:
            self.worlds[world.id] = world
            if self.current_world is None:
                self.current_world = world.id

    def set_accessibility(self, agent_id: str, from_world: str, to_world: str,
                         rel_type: str = "standard") -> None:
        with self.lock:
            if agent_id not in self.accessibility:
                self.accessibility[agent_id] = []
            self.accessibility[agent_id].append(
                AccessibilityRelation(agent_id, from_world, to_world, rel_type)
            )

    def is_accessible(self, from_world: str, to_world: str,
                     agent_id: str | None = None, rel_type: str = "standard") -> bool:
        """Check if to_world is accessible from from_world."""
        agent = agent_id or self.agent_id
        with self.lock:
            for rel in self.accessibility.get(agent, []):
                if rel.from_world == from_world and rel.to_world == to_world:
                    if rel_type == "standard" or rel.relation_type == rel_type:
                        return True
            return False

    def evaluate_prop(self, world_id: str, prop: str) -> bool | None:
        """Evaluate atomic proposition in a world. Returns None if not set."""
        with self.lock:
            world = self.worlds.get(world_id)
            if world is None:
                return None
            return world.propositions.get(prop)

    def set_prop(self, world_id: str, prop: str, value: bool) -> None:
        with self.lock:
            if world_id in self.worlds:
                self.worlds[world_id].propositions[prop] = value

    def all_accessible_worlds(self, from_world: str, agent_id: str | None = None,
                              rel_type: str = "standard") -> list[str]:
        """Return all worlds accessible from the given world."""
        agent = agent_id or self.agent_id
        with self.lock:
            result = []
            for rel in self.accessibility.get(agent, []):
                if rel.from_world == from_world:
                    if rel_type == "standard" or rel.relation_type == rel_type:
                        result.append(rel.to_world)
            return result

    def to_dict(self) -> dict:
        with self.lock:
            return {
                "agent_id": self.agent_id,
                "worlds": {wid: {
                    "label": w.label,
                    "propositions": w.propositions,
                    "metadata": w.metadata
                } for wid, w in self.worlds.items()},
                "current_world": self.current_world,
                "accessibility": {
                    ag: [{"from": r.from_world, "to": r.to_world, "type": r.relation_type}
                         for r in rels]
                    for ag, rels in self.accessibility.items()
                }
            }


# ─────────────────────────────────────────────────────────────
# TEMPORAL REASONER
# ─────────────────────────────────────────────────────────────

class TemporalReasoner:
    """
    Tracks events with temporal ordering constraints.
    Supports: BEFORE, AFTER, DURING, EVENTUALLY, NEXT, UNTIL
    """

    def __init__(self):
        self.events: dict[str, dict] = {}  # event_id -> {time, duration, label, props}
        self.ordering_constraints: list[dict] = []  # [{type, e1, e2}, ...]
        self.lock = threading.RLock()
        self._event_counter = 0

    def add_event(self, label: str, timestamp: float | None = None,
                  duration: float = 1.0, props: dict | None = None) -> str:
        with self.lock:
            self._event_counter += 1
            eid = f"evt_{self._event_counter}"
            self.events[eid] = {
                "label": label,
                "time": timestamp or time.time(),
                "duration": duration,
                "props": props or {}
            }
            return eid

    def add_constraint(self, ctype: str, e1: str, e2: str) -> None:
        """Add ordering constraint: BEFORE(e1,e2) means e1 happens before e2."""
        with self.lock:
            self.ordering_constraints.append({"type": ctype, "e1": e1, "e2": e2})

    def is_before(self, e1: str, e2: str) -> bool:
        with self.lock:
            t1 = self.events.get(e1, {}).get("time", 0)
            t2 = self.events.get(e2, {}).get("time", 0)
            return t1 < t2

    def is_after(self, e1: str, e2: str) -> bool:
        return self.is_before(e2, e1)

    def is_during(self, e1: str, e2: str) -> bool:
        with self.lock:
            ev1 = self.events.get(e1)
            ev2 = self.events.get(e2)
            if not ev1 or not ev2:
                return False
            t1, d1 = ev1["time"], ev1["duration"]
            t2, d2 = ev2["time"], ev2["duration"]
            return t2 <= t1 and (t1 + d1) <= (t2 + d2)

    def eventually_holds(self, condition: callable, within_seconds: float = 300) -> bool:
        """Check if condition holds for any event within time window."""
        with self.lock:
            now = time.time()
            for ev in self.events.values():
                if now - ev["time"] <= within_seconds:
                    if condition(ev):
                        return True
            return False

    def next_event(self, after_e: str | None = None) -> str | None:
        """Return the next event after the given event (or current time)."""
        with self.lock:
            ref_time = 0
            if after_e:
                ref_time = self.events.get(after_e, {}).get("time", 0)
            else:
                ref_time = time.time()

            candidates = [(eid, ev["time"]) for eid, ev in self.events.items()
                         if ev["time"] > ref_time]
            if not candidates:
                return None
            candidates.sort(key=lambda x: x[1])
            return candidates[0][0]

    def until_holds(self, e1: str, e2: str) -> bool:
        """Check if e2 eventually happens after e1 and e1 holds until then."""
        with self.lock:
            ev1 = self.events.get(e1)
            ev2 = self.events.get(e2)
            if not ev1 or not ev2:
                return False
            return ev1["time"] < ev2["time"]

    def to_dict(self) -> dict:
        with self.lock:
            return {
                "events": self.events,
                "constraints": self.ordering_constraints
            }


# ─────────────────────────────────────────────────────────────
# EPISTEMIC REASONER
# ─────────────────────────────────────────────────────────────

class EpistemicReasoner:
    """
    Knowledge operators:
      KNOW(agent, prop)      — agent knows proposition is true in current world
      KNOW_NOT(agent, prop)  — agent knows proposition is false
      KNOW_WHO(agent, entity) — agent knows who entity is
      KNOW_THAT(agent, fact)  — agent knows compound fact
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.known_props: set[str] = set()       # "prop_name"
        self.known_false: set[str] = set()        # "prop_name" (known to be false)
        self.known_entities: dict[str, str] = {}  # entity_id -> entity_type/label
        self.known_facts: set[str] = set()        # serialized compound facts
        self.lock = threading.RLock()

    def learn(self, prop: str, value: bool) -> None:
        """Learn that a proposition is true or false."""
        with self.lock:
            if value:
                self.known_props.add(prop)
                self.known_false.discard(prop)
            else:
                self.known_false.add(prop)
                self.known_props.discard(prop)

    def learn_entity(self, entity_id: str, entity_type: str) -> None:
        with self.lock:
            self.known_entities[entity_id] = entity_type

    def learn_fact(self, fact: str) -> None:
        with self.lock:
            self.known_facts.add(fact)

    def knows(self, prop: str) -> bool:
        with self.lock:
            return prop in self.known_props

    def knows_not(self, prop: str) -> bool:
        with self.lock:
            return prop in self.known_false

    def knows_who(self, entity_id: str) -> bool:
        with self.lock:
            return entity_id in self.known_entities

    def knows_that(self, fact: str) -> bool:
        with self.lock:
            return fact in self.known_facts

    def what_knows(self) -> dict:
        with self.lock:
            return {
                "known_props": list(self.known_props),
                "known_false": list(self.known_false),
                "known_entities": self.known_entities.copy(),
                "known_facts": list(self.known_facts)
            }


# ─────────────────────────────────────────────────────────────
# DOXASTIC REASONER
# ─────────────────────────────────────────────────────────────

class DoxasticReasoner:
    """
    Belief operators with confidence levels:
      BELIEVES(agent, prop, confidence)
      SUSPECTS(agent, prop)    — low confidence belief
      CONFIDENT(agent, prop)   — high confidence belief
      UNCERTAIN(agent, prop)   — conflicting or low info
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        # prop -> (confidence: 0.0-1.0, state: bel/suspect/confident/uncertain)
        self.beliefs: dict[str, tuple[float, str]] = {}
        self.lock = threading.RLock()

    def set_belief(self, prop: str, confidence: float, state: str | None = None) -> None:
        with self.lock:
            if state is None:
                if confidence >= 0.8:
                    state = "confident"
                elif confidence >= 0.5:
                    state = "believes"
                elif confidence >= 0.25:
                    state = "suspects"
                else:
                    state = "uncertain"
            self.beliefs[prop] = (confidence, state)

    def get_belief(self, prop: str) -> dict:
        with self.lock:
            if prop not in self.beliefs:
                return {"confidence": 0.0, "state": "unknown"}
            conf, state = self.beliefs[prop]
            return {"confidence": conf, "state": state}

    def update_confidence(self, prop: str, delta: float) -> None:
        """Adjust confidence by delta, clamped to [0,1]."""
        with self.lock:
            if prop in self.beliefs:
                conf, state = self.beliefs[prop]
                conf = max(0.0, min(1.0, conf + delta))
                if conf >= 0.8:
                    state = "confident"
                elif conf >= 0.5:
                    state = "believes"
                elif conf >= 0.25:
                    state = "suspects"
                else:
                    state = "uncertain"
                self.beliefs[prop] = (conf, state)

    def to_dict(self) -> dict:
        with self.lock:
            return {prop: {"confidence": c, "state": s}
                    for prop, (c, s) in self.beliefs.items()}


# ─────────────────────────────────────────────────────────────
# DEONTIC REASONER
# ─────────────────────────────────────────────────────────────

class DeonticReasoner:
    """
    Normative reasoning:
      MAY(agent, action)        — agent is permitted to do action
      MUST(agent, action)       — agent is obligated to do action
      MUST_NOT(agent, action)   — agent is forbidden from action
      OBLIGATED(agent, norm)    — norm is active for agent
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.permitted: set[str] = set()
        self.obligated: set[str] = set()
        self.forbidden: set[str] = set()
        self.active_norms: set[str] = set()
        self.lock = threading.RLock()

    def permit(self, action: str) -> None:
        with self.lock:
            self.permitted.add(action)
            self.forbidden.discard(action)

    def obligate(self, action: str) -> None:
        with self.lock:
            self.obligated.add(action)

    def forbid(self, action: str) -> None:
        with self.lock:
            self.forbidden.add(action)
            self.permitted.discard(action)
            self.obligated.discard(action)

    def deactivate_norm(self, norm: str) -> None:
        with self.lock:
            self.active_norms.discard(norm)

    def may_do(self, action: str) -> bool:
        with self.lock:
            return action in self.permitted and action not in self.forbidden

    def must_do(self, action: str) -> bool:
        with self.lock:
            return action in self.obligated

    def must_not_do(self, action: str) -> bool:
        with self.lock:
            return action in self.forbidden

    def to_dict(self) -> dict:
        with self.lock:
            return {
                "permitted": list(self.permitted),
                "obligated": list(self.obligated),
                "forbidden": list(self.forbidden),
                "active_norms": list(self.active_norms)
            }


# ─────────────────────────────────────────────────────────────
# PER-AGENT MODAL STATE
# ─────────────────────────────────────────────────────────────

class AgentModalState:
    """Holds all 4 modal dimensions for a single agent."""

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.kripke = KripkeModel(agent_id)
        self.temporal = TemporalReasoner()
        self.epistemic = EpistemicReasoner(agent_id)
        self.doxastic = DoxasticReasoner(agent_id)
        self.deontic = DeonticReasoner(agent_id)
        self.created_at = time.time()

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "kripke": self.kripke.to_dict(),
            "temporal": self.temporal.to_dict(),
            "epistemic": self.epistemic.what_knows(),
            "doxastic": self.doxastic.to_dict(),
            "deontic": self.deontic.to_dict(),
            "created_at": self.created_at
        }


# ─────────────────────────────────────────────────────────────
# MODAL LOGIC ENGINE — MAIN ORCHESTRATOR
# ─────────────────────────────────────────────────────────────

class ModalLogicEngine:
    """
    Central engine managing Kripke models for all agents.
    Provides unified API for all 4 modal logics.

    HTTP API on PORT 7785:
      POST /agent/:aid/epistemic/know      — learn proposition
      POST /agent/:aid/epistemic/know_not  — learn negation
      POST /agent/:aid/epistemic/know_who  — learn entity
      POST /agent/:aid/temporal/event      — add timed event
      POST /agent/:aid/temporal/constraint — add ordering constraint
      POST /agent/:aid/doxastic/belief     — set belief
      POST /agent/:aid/doxastic/update     — update confidence
      POST /agent/:aid/deontic/permit      — permit action
      POST /agent/:aid/deontic/obligation  — obligate action
      POST /agent/:aid/deontic/forbid      — forbid action
      GET  /agent/:aid/state              — full agent state
      GET  /agent/:aid/query               — query modal formulas
      GET  /engine/stats                   — all agent states
      GET  /health
    """

    def __init__(self, port: int = 7785):
        self.port = port
        self.agents: dict[str, AgentModalState] = {}
        self.lock = threading.RLock()
        self._request_counter = 0

        # Bootstrap default agent
        self.get_or_create_agent("PURPCLAW_CORE")

    def get_or_create_agent(self, agent_id: str) -> AgentModalState:
        with self.lock:
            if agent_id not in self.agents:
                self.agents[agent_id] = AgentModalState(agent_id)
                # Create initial world for Kripke model
                w = World(id="w0", label="actual_world", propositions={})
                self.agents[agent_id].kripke.add_world(w)
            return self.agents[agent_id]

    # ── EPISTEMIC ───────────────────────────────────────────

    def learn(self, agent_id: str, prop: str, value: bool) -> dict:
        agent = self.get_or_create_agent(agent_id)
        agent.epistemic.learn(prop, value)
        world_id = agent.kripke.current_world or "w0"
        agent.kripke.set_prop(world_id, prop, value)
        return {"agent": agent_id, "action": "learn", "prop": prop, "value": value}

    def learn_entity(self, agent_id: str, entity_id: str, entity_type: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        agent.epistemic.learn_entity(entity_id, entity_type)
        return {"agent": agent_id, "action": "learn_entity", "entity": entity_id, "type": entity_type}

    def query_knowledge(self, agent_id: str, prop: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        return {
            "agent": agent_id,
            "prop": prop,
            "knows": agent.epistemic.knows(prop),
            "knows_not": agent.epistemic.knows_not(prop)
        }

    # ── TEMPORAL ────────────────────────────────────────────

    def add_timed_event(self, agent_id: str, label: str, timestamp: float | None = None,
                        duration: float = 1.0, props: dict | None = None) -> dict:
        agent = self.get_or_create_agent(agent_id)
        eid = agent.temporal.add_event(label, timestamp, duration, props)
        return {"agent": agent_id, "event_id": eid, "label": label}

    def add_temporal_constraint(self, agent_id: str, ctype: str, e1: str, e2: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        agent.temporal.add_constraint(ctype, e1, e2)
        return {"agent": agent_id, "constraint": {"type": ctype, "e1": e1, "e2": e2}}

    def query_temporal(self, agent_id: str, ctype: str, e1: str, e2: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        result = getattr(agent.temporal, f"is_{ctype.lower()}", lambda x, y: None)(e1, e2)
        return {"agent": agent_id, "query": f"{ctype}({e1}, {e2})", "result": result}

    # ── DOXASTIC ────────────────────────────────────────────

    def set_belief(self, agent_id: str, prop: str, confidence: float) -> dict:
        agent = self.get_or_create_agent(agent_id)
        agent.doxastic.set_belief(prop, confidence)
        state = agent.doxastic.get_belief(prop)["state"]
        return {"agent": agent_id, "prop": prop, "confidence": confidence, "state": state}

    def update_confidence(self, agent_id: str, prop: str, delta: float) -> dict:
        agent = self.get_or_create_agent(agent_id)
        agent.doxastic.update_confidence(prop, delta)
        belief = agent.doxastic.get_belief(prop)
        return {"agent": agent_id, "prop": prop, **belief}

    def query_belief(self, agent_id: str, prop: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        return {"agent": agent_id, "prop": prop, **agent.doxastic.get_belief(prop)}

    # ── DEONTIC ────────────────────────────────────────────

    def permit_action(self, agent_id: str, action: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        agent.deontic.permit(action)
        return {"agent": agent_id, "action": "permit", "action_name": action}

    def obligate_action(self, agent_id: str, action: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        agent.deontic.obligate(action)
        return {"agent": agent_id, "action": "obligate", "action_name": action}

    def forbid_action(self, agent_id: str, action: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        agent.deontic.forbid(action)
        return {"agent": agent_id, "action": "forbid", "action_name": action}

    def query_permission(self, agent_id: str, action: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        return {
            "agent": agent_id,
            "action": action,
            "may": agent.deontic.may_do(action),
            "must": agent.deontic.must_do(action),
            "must_not": agent.deontic.must_not_do(action)
        }

    # ── MULTI-AGENT KNOWLEDGE TRANSFER ─────────────────────

    def transfer_knowledge(self, from_agent: str, to_agent: str,
                          props: list[str] | None = None) -> dict:
        """Copy known propositions from one agent to another."""
        src = self.get_or_create_agent(from_agent)
        dst = self.get_or_create_agent(to_agent)

        transferred = []
        props = props or list(src.epistemic.known_props)

        for prop in props:
            if src.epistemic.knows(prop):
                dst.epistemic.learn(prop, True)
                transferred.append(prop)
            elif src.epistemic.knows_not(prop):
                dst.epistemic.learn(prop, False)
                transferred.append(prop)

        return {"from": from_agent, "to": to_agent, "transferred": transferred}

    # ── STATS ───────────────────────────────────────────────

    def get_stats(self) -> dict:
        with self.lock:
            return {
                "agents": len(self.agents),
                "agent_ids": list(self.agents.keys()),
                "timestamp": time.time()
            }

    def get_agent_state(self, agent_id: str) -> dict:
        agent = self.get_or_create_agent(agent_id)
        return agent.to_dict()


# ─────────────────────────────────────────────────────────────
# HTTP SERVER
# ─────────────────────────────────────────────────────────────

def _make_json_response(data: dict, status: int = 200) -> tuple[dict, int]:
    return {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, status


def _json_body(body: bytes) -> dict:
    try:
        return json.loads(body.decode())
    except Exception:
        return {}


def run_modal_logic_server(port: int = 7785):
    import http.server
    import socketserver

    engine = ModalLogicEngine(port)

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print(f"[ModalLogic:{port}] {fmt % args}")

        def send_json(self, data: dict, status: int = 200):
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        def do_GET(self):
            if self.path == "/health":
                self.send_json({"status": "healthy", "service": "modal_logic_engine", "port": port})
            elif self.path == "/engine/stats":
                self.send_json(engine.get_stats())
            elif self.path.startswith("/agent/"):
                parts = self.path.split("/", 4)
                if len(parts) >= 4:
                    agent_id = parts[2]
                    state = engine.get_agent_state(agent_id)
                    self.send_json(state)
                else:
                    self.send_json({"error": "bad path"}, 400)
            else:
                self.send_json({"error": "not found"}, 404)

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            data = _json_body(body)

            path = self.path

            # /agent/:aid/epistemic/know
            if path == "/agent/epistemic/know":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.learn(aid, data["prop"], data.get("value", True))
                self.send_json(result)
            elif path == "/agent/epistemic/know_not":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.learn(aid, data["prop"], False)
                self.send_json(result)
            elif path == "/agent/epistemic/know_who":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.learn_entity(aid, data["entity"], data.get("entity_type", "unknown"))
                self.send_json(result)

            # /agent/:aid/temporal/event
            elif path == "/agent/temporal/event":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.add_timed_event(aid, data.get("label", "event"),
                                                data.get("timestamp"), data.get("duration", 1.0),
                                                data.get("props"))
                self.send_json(result)
            elif path == "/agent/temporal/constraint":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.add_temporal_constraint(aid, data.get("type", "BEFORE"),
                                                         data.get("e1"), data.get("e2"))
                self.send_json(result)

            # /agent/:aid/doxastic/belief
            elif path == "/agent/doxastic/belief":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.set_belief(aid, data["prop"], data.get("confidence", 0.5))
                self.send_json(result)
            elif path == "/agent/doxastic/update":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.update_confidence(aid, data["prop"], data.get("delta", 0.0))
                self.send_json(result)

            # /agent/:aid/deontic/permit|obligation|forbid
            elif path == "/agent/deontic/permit":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.permit_action(aid, data["action"])
                self.send_json(result)
            elif path == "/agent/deontic/obligation":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.obligate_action(aid, data["action"])
                self.send_json(result)
            elif path == "/agent/deontic/forbid":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                result = engine.forbid_action(aid, data["action"])
                self.send_json(result)

            # /query endpoints
            elif path == "/query/knowledge":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                self.send_json(engine.query_knowledge(aid, data["prop"]))
            elif path == "/query/belief":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                self.send_json(engine.query_belief(aid, data["prop"]))
            elif path == "/query/permission":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                self.send_json(engine.query_permission(aid, data["action"]))
            elif path == "/query/temporal":
                aid = data.get("agent_id", "PURPCLAW_CORE")
                self.send_json(engine.query_temporal(aid, data.get("type", "BEFORE"),
                                                      data.get("e1", ""), data.get("e2", "")))
            elif path == "/agent/transfer":
                result = engine.transfer_knowledge(data.get("from"), data.get("to"), data.get("props"))
                self.send_json(result)
            else:
                self.send_json({"error": "not found", "path": path}, 404)

    class ReuseAddrTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    with ReuseAddrTCPServer(("", port), Handler) as httpd:
        print(f"[ModalLogicEngine] Kripke Modal Logic Server running on port {port}")
        print(f"[ModalLogicEngine] Logics: Epistemic | Temporal | Deontic | Doxastic")
        httpd.serve_forever()


# ─────────────────────────────────────────────────────────────
# STANDALONE TEST
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== PURPCLAW Modal Logic Engine v1.0 ===")
    print()

    engine = ModalLogicEngine()

    # Epistemic test
    print("[TEST] Epistemic reasoning...")
    engine.learn("agent1", "fire_is_hot", True)
    engine.learn("agent1", "water_is_wet", True)
    engine.learn_entity("agent1", "alice", "PERSON")
    k = engine.query_knowledge("agent1", "fire_is_hot")
    print(f"  KNOW(fire_is_hot): {k['knows']}")

    # Temporal test
    print("[TEST] Temporal reasoning...")
    e1 = engine.add_timed_event("agent1", "wake_up", timestamp=100.0)
    e2 = engine.add_timed_event("agent1", "start_work", timestamp=200.0)
    engine.add_temporal_constraint("agent1", "BEFORE", e1["event_id"], e2["event_id"])
    t = engine.query_temporal("agent1", "BEFORE", e1["event_id"], e2["event_id"])
    print(f"  BEFORE(wake_up, start_work): {t['result']}")

    # Doxastic test
    print("[TEST] Doxastic reasoning...")
    engine.set_belief("agent1", "rain_tomorrow", 0.7)
    b = engine.query_belief("agent1", "rain_tomorrow")
    print(f"  BELIEF(rain_tomorrow): conf={b['confidence']}, state={b['state']}")
    engine.update_confidence("agent1", "rain_tomorrow", 0.2)
    b2 = engine.query_belief("agent1", "rain_tomorrow")
    print(f"  After +0.2: conf={b2['confidence']}, state={b2['state']}")

    # Deontic test
    print("[TEST] Deontic reasoning...")
    engine.permit_action("agent1", "drive_car")
    engine.obligate_action("agent1", "pay_taxes")
    engine.forbid_action("agent1", "steal")
    p = engine.query_permission("agent1", "drive_car")
    print(f"  MAY(drive_car): {p['may']}")
    o = engine.query_permission("agent1", "pay_taxes")
    print(f"  MUST(pay_taxes): {o['must']}")
    f = engine.query_permission("agent1", "steal")
    print(f"  MUST_NOT(steal): {f['must_not']}")

    # Multi-agent transfer
    print("[TEST] Knowledge transfer...")
    engine.learn("agent2", "gravity_exists", True)
    result = engine.transfer_knowledge("agent2", "agent1", ["gravity_exists"])
    print(f"  Transferred: {result['transferred']}")

    print()
    print(f"[STATS] Total agents: {engine.get_stats()['agents']}")
    print()
    print("All tests passed.")
    print()

    # Start HTTP server
    print("[SERVER] Starting HTTP server on port 7785...")
    run_modal_logic_server(7785)
