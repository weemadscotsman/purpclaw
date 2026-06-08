#!/usr/bin/env python3
"""
PURPCLAW Cognitive Spine
========================
Single local HTTP surface for the cognitive layer.

This replaces the old pattern of running memory, modal logic, rules,
diagnostics, neuro-symbolic, and AutoDream as separate HTTP services.
The modules stay real and imported directly; only the transport is collapsed.
"""

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler
from socketserver import ThreadingTCPServer
from urllib.parse import urlparse

from memory_matrix_v2 import BASE_AVAILABLE, MemoryMatrixV2
from symbolic_rules_engine import DatalogEngine
from modal_logic_engine import ModalLogicEngine
from autonomous_diagnostics import DiagnosticOrchestrator
from neuro_symbolic_bridge import NeuroSymbolicBridge
import autoDream


class CognitiveState:
    def __init__(self):
        self.memory = MemoryMatrixV2()
        self.rules = DatalogEngine()
        self.rules.add_rule_str("sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y")
        self.rules.add_rule_str("ancestor(X,Y) :- parent(X,Y)")
        self.rules.add_rule_str("ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y)")
        self.modal = ModalLogicEngine()
        self.diagnostics = DiagnosticOrchestrator()
        self.neuro = NeuroSymbolicBridge()
        self.started_at = time.time()


STATE = None
PORT = 7880


class ReuseThreadingServer(ThreadingTCPServer):
    allow_reuse_address = True


class SpineHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[CognitiveSpine:{PORT}] {fmt % args}")

    def send_json(self, data, status=200):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            return self.route_get(path)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc), "path": path}, 500)

    def do_POST(self):
        path = urlparse(self.path).path
        req = self.body_json()
        try:
            return self.route_post(path, req)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc), "path": path}, 500)

    def spine_health(self):
        services = {
            "memory": self.memory_health(),
            "rules": {"status": "healthy", "service": "rules_engine", "facts": len(STATE.rules.facts), "rules": len(STATE.rules.rules)},
            "modal": {"status": "healthy", "service": "modal_logic_engine", "agents": len(STATE.modal.agents)},
            "diagnostics": {"status": "healthy", "service": "diagnostics", **STATE.diagnostics.get_stats()},
            "neuro-symbolic": {"status": "healthy", "service": "neuro_symbolic_bridge", **STATE.neuro.get_statistics()},
            "autodream": {"status": "healthy", "service": "autodream", "entries": autoDream.getEntryCount(), "state": autoDream.loadState()},
        }
        return {
            "status": "healthy",
            "service": "cognitive_spine",
            "port": PORT,
            "uptime": time.time() - STATE.started_at,
            "services": services,
        }

    def memory_health(self):
        return {
            "status": "healthy",
            "service": "memory_matrix_v2",
            "base_available": BASE_AVAILABLE,
            "stats": STATE.memory.get_stats(),
        }

    def route_get(self, path):
        if path in ("/health", "/cognitive/health"):
            return self.send_json(self.spine_health())

        if path == "/memory/health":
            return self.send_json(self.memory_health())
        if path == "/memory/stats":
            return self.send_json(STATE.memory.get_stats())
        if path == "/memory/context":
            return self.send_json({"context": STATE.memory.get_active_context()})
        if path == "/memory/lifted":
            facts = STATE.memory.bridge.get_lifted_facts() if STATE.memory.bridge else []
            return self.send_json({"lifted_facts": facts})
        if path == "/memory/counterfactual/branches":
            return self.send_json({"branches": STATE.memory.get_counterfactual_branches()})
        if path.startswith("/memory/timeline/"):
            entity = path.split("/memory/timeline/", 1)[1]
            return self.send_json({"entity": entity, "timeline": STATE.memory.get_timeline(entity)})

        if path == "/rules/health":
            return self.send_json({"status": "healthy", "service": "rules_engine", "facts": len(STATE.rules.facts), "rules": len(STATE.rules.rules)})
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
            return self.send_json({"status": "healthy", "service": "modal_logic_engine", "agents": len(STATE.modal.agents)})
        if path == "/modal/engine/stats":
            return self.send_json(STATE.modal.get_stats())
        if path.startswith("/modal/agent/"):
            agent_id = path.split("/", 3)[3]
            return self.send_json(STATE.modal.get_agent_state(agent_id))

        if path == "/diagnostics/health":
            return self.send_json({"status": "healthy", "service": "diagnostics", **STATE.diagnostics.get_stats()})
        if path == "/diagnostics/findings":
            return self.send_json({"findings": STATE.diagnostics.get_findings()})
        if path == "/diagnostics/vote":
            stats = STATE.diagnostics.get_stats()
            return self.send_json({"vote_tally": stats.get("vote_tally", {}), "leading_cause": stats.get("leading_cause")})
        if path == "/diagnostics/stats":
            return self.send_json(STATE.diagnostics.get_stats())

        if path == "/neuro-symbolic/health":
            return self.send_json({"status": "healthy", "service": "neuro_symbolic_bridge", **STATE.neuro.get_statistics()})
        if path == "/neuro-symbolic/stats":
            return self.send_json(STATE.neuro.get_statistics())
        if path == "/neuro-symbolic/query":
            return self.send_json({"results": STATE.neuro.query()})

        if path == "/autodream/health":
            return self.send_json({"status": "healthy", "service": "autodream", "entries": autoDream.getEntryCount()})
        if path in ("/autodream/status", "/autodream/dream/status"):
            return self.send_json({"state": autoDream.loadState(), "entries": autoDream.getEntryCount()})

        return self.send_json({"error": "not_found", "path": path}, 404)

    def route_post(self, path, req):
        if path == "/memory/ingest":
            memory_id = STATE.memory.ingest(
                content=req.get("content", ""),
                content_type=req.get("type", "text"),
                emotional_valence=req.get("valence", 0.0),
                source=req.get("source", "api"),
                importance=req.get("importance", 0.5),
                raw_metadata=req.get("metadata"),
            )
            return self.send_json({"memory_id": memory_id})
        if path == "/memory/recall":
            return self.send_json({"results": STATE.memory.recall(req.get("query", ""), req.get("limit", 5), req.get("emotional_filter"))})
        if path == "/memory/project":
            return self.send_json(STATE.memory.project_backward(req.get("query", ""), req.get("target_time")))
        if path == "/memory/what_if/forgotten":
            return self.send_json(STATE.memory.what_if_forgotten(req.get("memory_id", ""), req.get("query", "")))
        if path == "/memory/what_if/noticed":
            return self.send_json(STATE.memory.what_if_noticed(req.get("entity", ""), req.get("start_time", time.time() - 3600), req.get("end_time", time.time()), req.get("query", "")))
        if path == "/memory/lift":
            result = STATE.memory.lift_memory(req.get("memory_id", ""))
            return self.send_json(result or {"error": "not found"}, 404 if not result else 200)
        if path == "/memory/ground":
            return self.send_json({"results": STATE.memory.ground_symbolic(req.get("query", ""), req.get("limit", 5))})
        if path == "/memory/react":
            return self.send_json(STATE.memory.react_to_stimulus(req.get("stimulus", ""), req.get("source", "api")))

        if path == "/rules/assert":
            try:
                fact = STATE.rules.assert_fact_str(req.get("fact", ""), req.get("provenance", "asserted"))
                return self.send_json({"fact": f"{fact.predicate}({','.join(str(t) for t in fact.terms)})", "id": fact.id})
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
        if path == "/rules/retract":
            try:
                success = STATE.rules.retract_fact(req.get("predicate", ""), req.get("terms", []))
                return self.send_json({"ok": success})
            except Exception as exc:
                return self.send_json({"error": str(exc)}, 400)
        if path == "/rules/query":
            try:
                return self.send_json({"results": STATE.rules.query_str(req.get("query", ""))})
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
        if path == "/rules/rule":
            try:
                rule = STATE.rules.add_rule_str(req.get("rule", ""))
                return self.send_json({"rule_id": rule.id, "rule": str(rule)})
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
        if path == "/rules/check":
            violations = STATE.rules.check_constraints()
            return self.send_json({"violations": violations, "count": len(violations)})
        if path == "/rules/counterfactual":
            return self.send_json(STATE.rules.counterfactual(req.get("hypothesis", ""), req.get("assumptions", [])))
        if path == "/rules/infer":
            return self.send_json({"newly_derived": STATE.rules.run_inference()})

        if path == "/modal/agent/epistemic/know":
            if not req.get("prop"):
                return self.send_json({"error": "prop required"}, 400)
            return self.send_json(STATE.modal.learn(req.get("agent_id", "PURPCLAW_CORE"), req["prop"], req.get("value", True)))
        if path == "/modal/agent/epistemic/know_not":
            if not req.get("prop"):
                return self.send_json({"error": "prop required"}, 400)
            return self.send_json(STATE.modal.learn(req.get("agent_id", "PURPCLAW_CORE"), req["prop"], False))
        if path == "/modal/agent/epistemic/know_who":
            if not req.get("entity"):
                return self.send_json({"error": "entity required"}, 400)
            return self.send_json(STATE.modal.learn_entity(req.get("agent_id", "PURPCLAW_CORE"), req["entity"], req.get("entity_type", "unknown")))
        if path == "/modal/agent/temporal/event":
            return self.send_json(STATE.modal.add_timed_event(req.get("agent_id", "PURPCLAW_CORE"), req.get("label", "event"), req.get("timestamp"), req.get("duration", 1.0), req.get("props")))
        if path == "/modal/agent/doxastic/belief":
            if not req.get("prop"):
                return self.send_json({"error": "prop required"}, 400)
            return self.send_json(STATE.modal.set_belief(req.get("agent_id", "PURPCLAW_CORE"), req["prop"], req.get("confidence", 0.5)))
        if path == "/modal/agent/deontic/permit":
            if not req.get("action"):
                return self.send_json({"error": "action required"}, 400)
            return self.send_json(STATE.modal.permit_action(req.get("agent_id", "PURPCLAW_CORE"), req["action"]))

        if path == "/diagnostics/diagnose":
            return self.send_json(STATE.diagnostics.run_diagnosis(req.get("agent")))
        if path == "/diagnostics/event":
            event_id = STATE.diagnostics.report_event(req.get("source", "unknown"), req.get("description", ""), req.get("severity", "INFO"), req.get("metadata"))
            return self.send_json({"event_id": event_id})

        if path == "/neuro-symbolic/lift/anomaly":
            result = STATE.neuro.lift_anomaly(
                pattern_type=req.get("pattern_type", req.get("pattern", "unknown")),
                confidence=req.get("confidence", 0.5),
                source=req.get("source", "api"),
                subject=req.get("subject"),
                metadata=req.get("metadata"),
            )
            return self.send_json(result.to_dict())
        if path == "/neuro-symbolic/query":
            query_args = dict(req)
            if "query" in query_args and "fact_type" not in query_args:
                query_args["fact_type"] = query_args.pop("query")
            allowed = {"fact_type", "subject", "predicate", "obj", "source", "min_confidence", "within_seconds", "limit"}
            query_args = {key: value for key, value in query_args.items() if key in allowed}
            return self.send_json({"results": STATE.neuro.query(**query_args)})

        if path in ("/autodream/dream", "/autodream/run"):
            return self.send_json(autoDream.runCycle())

        return self.send_json({"error": "not_found", "path": path}, 404)


def main():
    global STATE, PORT
    parser = argparse.ArgumentParser(description="PURPCLAW Cognitive Spine")
    parser.add_argument("--port", type=int, default=7880)
    args = parser.parse_args()
    PORT = args.port
    STATE = CognitiveState()
    with ReuseThreadingServer(("127.0.0.1", PORT), SpineHandler) as server:
        print(f"[CognitiveSpine] listening on 127.0.0.1:{PORT}")
        server.serve_forever()


if __name__ == "__main__":
    main()
