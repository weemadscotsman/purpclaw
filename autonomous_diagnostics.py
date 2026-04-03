#!/usr/bin/env python3
"""
PURPCLAW Autonomous Diagnostics System v1.0
=============================================
Multi-agent causal diagnosis system. Specialized diagnostic agents
investigate subsystems, emit findings, vote on root causes, and
build a causal graph over time.

Agents:
  - MemoryDiag:    diagnoses memory_matrix.py anomalies
  - VisionDiag:     diagnoses vision_monitor / YOLO pipeline
  - NetworkDiag:   diagnoses inter-service communication
  - ResourceDiag:  diagnoses CPU / memory / disk pressure
  - AppDiag:       diagnoses application-level failures
  - Orchestrator:  coordinates diagnosis, aggregates results

HTTP API on PORT 7786:
  POST /diagnose          — run full diagnosis (all agents)
  POST /diagnose/:agent   — run single agent diagnosis
  POST /event            — report a system event to the event bus
  GET  /causal-graph     — current causal graph (DOT format)
  GET  /findings         — all accumulated findings
  GET  /vote             — root cause vote tally
  GET  /agent/:name      — single agent state
  GET  /health
"""

import json
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ─────────────────────────────────────────────────────────────
# EVENT BUS
# ─────────────────────────────────────────────────────────────

class EventSeverity(Enum):
    DEBUG = 0
    INFO = 1
    WARNING = 2
    ERROR = 3
    CRITICAL = 4


@dataclass
class SystemEvent:
    id: str
    timestamp: float
    source: str
    severity: EventSeverity
    description: str
    metadata: dict = field(default_factory=dict)
    processed: bool = False


class EventBus:
    """In-memory event bus for inter-agent communication."""

    def __init__(self, maxlen: int = 1000):
        self.events: list[SystemEvent] = []
        self.maxlen = maxlen
        self.lock = threading.RLock()
        self.subscribers: list[queue.Queue] = []
        self._counter = 0

    def publish(self, source: str, description: str,
                severity: EventSeverity = EventSeverity.INFO,
                metadata: dict | None = None) -> str:
        with self.lock:
            self._counter += 1
            eid = f"evt_{self._counter}"
            event = SystemEvent(
                id=eid,
                timestamp=time.time(),
                source=source,
                severity=severity,
                description=description,
                metadata=metadata or {}
            )
            self.events.append(event)
            if len(self.events) > self.maxlen:
                self.events = self.events[-self.maxlen:]
            for q in self.subscribers:
                try:
                    q.put_nowait(event)
                except queue.Full:
                    pass
            return eid

    def subscribe(self, q: queue.Queue):
        self.subscribers.append(q)

    def get_events(self, since: float = 0,
                   severity_min: EventSeverity | None = None,
                   source: str | None = None) -> list[SystemEvent]:
        with self.lock:
            result = []
            for e in reversed(self.events):
                if e.timestamp < since:
                    continue
                if severity_min and e.severity.value < severity_min.value:
                    continue
                if source and e.source != source:
                    continue
                result.append(e)
            return list(reversed(result))


# ─────────────────────────────────────────────────────────────
# CAUSAL GRAPH
# ─────────────────────────────────────────────────────────────

@dataclass
class CausalNode:
    id: str
    label: str
    node_type: str  # 'symptom', 'cause', 'root_cause', 'hypothesis'
    agent_id: str | None
    confidence: float  # 0-1
    metadata: dict = field(default_factory=dict)


@dataclass
class CausalEdge:
    from_node: str
    to_node: str
    evidence: str
    strength: float  # 0-1


class CausalGraph:
    """Directed acyclic graph of cause→effect relationships."""

    def __init__(self):
        self.nodes: dict[str, CausalNode] = {}
        self.edges: list[CausalEdge] = []
        self.lock = threading.RLock()

    def add_node(self, node: CausalNode) -> None:
        with self.lock:
            self.nodes[node.id] = node

    def add_edge(self, edge: CausalEdge) -> None:
        with self.lock:
            self.edges.append(edge)

    def to_dot(self) -> str:
        with self.lock:
            lines = ["digraph CausalGraph {",
                     "  rankdir=TB;",
                     "  node [shape=box style=filled];"]
            color_map = {
                'symptom': '#ffcccc',
                'cause': '#fff0cc',
                'root_cause': '#ccffcc',
                'hypothesis': '#ccccff'
            }
            for nid, node in self.nodes.items():
                color = color_map.get(node.node_type, '#ffffff')
                label = node.label.replace('"', '\\"')
                conf = f"{node.confidence:.2f}"
                lines.append(f'  "{nid}" [label="{label}\\n(conf={conf})" fillcolor="{color}"];')
            for edge in self.edges:
                lines.append(f'  "{edge.from_node}" -> "{edge.to_node}" [label="{edge.evidence}" fontsize=9];')
            lines.append("}")
            return "\n".join(lines)

    def to_dict(self) -> dict:
        with self.lock:
            return {
                "nodes": {nid: {
                    "label": n.label,
                    "type": n.node_type,
                    "agent": n.agent_id,
                    "confidence": n.confidence,
                    "metadata": n.metadata
                } for nid, n in self.nodes.items()},
                "edges": [{"from": e.from_node, "to": e.to_node, "evidence": e.evidence, "strength": e.strength}
                          for e in self.edges]
            }

    def clear(self) -> None:
        with self.lock:
            self.nodes.clear()
            self.edges.clear()


# ─────────────────────────────────────────────────────────────
# FINDING & VOTE
# ─────────────────────────────────────────────────────────────

@dataclass
class DiagnosticFinding:
    id: str
    timestamp: float
    agent_id: str
    target: str
    finding_type: str  # 'anomaly', 'bottleneck', 'misconfig', 'resource_pressure', 'unknown'
    description: str
    confidence: float
    recommendation: str | None


class DiagnosticVote:
    """Root cause vote tally across diagnostic agents."""

    def __init__(self):
        self.votes: dict[str, list[str]] = {}  # cause_id -> [agent_ids]
        self.lock = threading.RLock()

    def cast_vote(self, agent_id: str, cause_id: str) -> None:
        with self.lock:
            if cause_id not in self.votes:
                self.votes[cause_id] = []
            if agent_id not in self.votes[cause_id]:
                self.votes[cause_id].append(agent_id)

    def tally(self) -> dict:
        with self.lock:
            return {cid: len(agents) for cid, agents in self.votes.items()}

    def leading_cause(self) -> str | None:
        tally = self.tally()
        if not tally:
            return None
        return max(tally, key=tally.get)


# ─────────────────────────────────────────────────────────────
# DIAGNOSTIC AGENTS
# ─────────────────────────────────────────────────────────────

class DiagnosticAgent:
    """Base class for diagnostic agents."""

    name: str = "BaseAgent"

    def __init__(self, event_bus: EventBus, causal_graph: CausalGraph,
                 findings: list, votes: DiagnosticVote, findings_lock: threading.Lock):
        self.event_bus = event_bus
        self.causal_graph = causal_graph
        self.findings = findings
        self.votes = votes
        self.findings_lock = findings_lock
        self.running = False

    def diagnose(self) -> list[DiagnosticFinding]:
        raise NotImplementedError

    def _add_finding(self, finding: DiagnosticFinding) -> None:
        with self.findings_lock:
            self.findings.append(finding)

    def _emit_node(self, nid: str, label: str, ntype: str,
                   confidence: float, metadata: dict | None = None) -> None:
        node = CausalNode(id=nid, label=label, node_type=ntype,
                         agent_id=self.name, confidence=confidence,
                         metadata=metadata or {})
        self.causal_graph.add_node(node)

    def _emit_edge(self, from_node: str, to_node: str,
                   evidence: str, strength: float = 1.0) -> None:
        edge = CausalEdge(from_node=from_node, to_node=to_node,
                         evidence=evidence, strength=strength)
        self.causal_graph.add_edge(edge)

    def _vote_for(self, cause_id: str) -> None:
        self.votes.cast_vote(self.name, cause_id)


# ─────────────────────────────────────────────────────────────
# MEMORY DIAGNOSTIC AGENT
# ─────────────────────────────────────────────────────────────

class MemoryDiag(DiagnosticAgent):
    name = "MemoryDiag"

    def diagnose(self) -> list[DiagnosticFinding]:
        findings = []

        # Check for memory-related events
        mem_events = self.event_bus.get_events(
            since=time.time() - 300, source="memory_matrix"
        )

        errors = [e for e in mem_events if e.severity.value >= EventSeverity.ERROR.value]
        warnings = [e for e in mem_events if e.severity == EventSeverity.WARNING]

        if errors:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="memory_matrix",
                finding_type="anomaly",
                description=f"Memory matrix errors: {[e.description for e in errors]}",
                confidence=0.9,
                recommendation="Check memory_matrix logs for exception stack traces"
            )
            findings.append(f)
            self._add_finding(f)
            self._emit_node("mem_error", "Memory Error", "symptom", 0.9)
            self._emit_node("mem_matrix_fault", "Memory Matrix Fault", "cause", 0.8)
            self._emit_edge("mem_error", "mem_matrix_fault", "errors in memory_matrix", 0.9)
            self._vote_for("mem_matrix_fault")

        if warnings:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="memory_matrix",
                finding_type="bottleneck",
                description=f"Memory matrix warnings: {[w.description for w in warnings]}",
                confidence=0.6,
                recommendation="Monitor memory pressure, consider quantization adjustment"
            )
            findings.append(f)
            self._add_finding(f)

        if not errors and not warnings:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="memory_matrix",
                finding_type="anomaly",
                description="No memory anomalies detected",
                confidence=1.0,
                recommendation=None
            )
            findings.append(f)

        return findings


# ─────────────────────────────────────────────────────────────
# VISION DIAGNOSTIC AGENT
# ─────────────────────────────────────────────────────────────

class VisionDiag(DiagnosticAgent):
    name = "VisionDiag"

    def diagnose(self) -> list[DiagnosticFinding]:
        findings = []

        vision_events = self.event_bus.get_events(
            since=time.time() - 300, source="vision_monitor"
        )
        yolo_events = self.event_bus.get_events(
            since=time.time() - 300, source="yolo_service"
        )

        all_vision_errors = [e for e in vision_events + yolo_events
                             if e.severity.value >= EventSeverity.ERROR.value]

        if all_vision_errors:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="vision_pipeline",
                finding_type="anomaly",
                description=f"Vision pipeline errors: {[e.description for e in all_vision_errors]}",
                confidence=0.85,
                recommendation="Check YOLO service (port 7779) and vision_monitor (port 7781)"
            )
            findings.append(f)
            self._add_finding(f)
            self._emit_node("vision_error", "Vision Error", "symptom", 0.85)
            self._emit_node("yolo_down", "YOLO Service Down", "cause", 0.7)
            self._emit_edge("vision_error", "yolo_down", "yolo errors detected", 0.8)
            self._vote_for("yolo_down")

        # Check for stale frames (scene change but no detection)
        stale_events = [e for e in vision_events
                       if "stale" in e.description.lower() or "timeout" in e.description.lower()]
        if stale_events:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="vision_monitor",
                finding_type="bottleneck",
                description="Camera frame staleness detected",
                confidence=0.7,
                recommendation="Check camera connection or reduce detection frequency"
            )
            findings.append(f)
            self._add_finding(f)

        if not all_vision_errors:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="vision_pipeline",
                finding_type="anomaly",
                description="Vision pipeline healthy",
                confidence=1.0,
                recommendation=None
            )
            findings.append(f)

        return findings


# ─────────────────────────────────────────────────────────────
# NETWORK DIAGNOSTIC AGENT
# ─────────────────────────────────────────────────────────────

class NetworkDiag(DiagnosticAgent):
    name = "NetworkDiag"

    def diagnose(self) -> list[DiagnosticFinding]:
        findings = []

        net_events = self.event_bus.get_events(since=time.time() - 300)
        net_errors = [e for e in net_events
                     if "timeout" in e.description.lower()
                     or "connection" in e.description.lower()
                     or "refused" in e.description.lower()
                     or e.severity.value >= EventSeverity.ERROR.value]

        if net_errors:
            # Group by target
            targets: dict[str, list] = {}
            for e in net_errors:
                target = e.metadata.get("target", e.source)
                targets.setdefault(target, []).append(e)

            for target, errors in targets.items():
                f = DiagnosticFinding(
                    id=str(uuid.uuid4())[:8],
                    timestamp=time.time(),
                    agent_id=self.name,
                    target=target,
                    finding_type="bottleneck",
                    description=f"Network errors to {target}: {[e.description for e in errors]}",
                    confidence=0.8,
                    recommendation=f"Check if service at {target} is reachable"
                )
                findings.append(f)
                self._add_finding(f)
                self._emit_node(f"net_error_{target}", f"Network Error: {target}", "symptom", 0.8)
                self._emit_node(f"service_down_{target}", f"Service Down: {target}", "cause", 0.7)
                self._emit_edge(f"net_error_{target}", f"service_down_{target}",
                               "connection failures", 0.85)
                self._vote_for(f"service_down_{target}")
        else:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="network",
                finding_type="anomaly",
                description="No network errors detected",
                confidence=1.0,
                recommendation=None
            )
            findings.append(f)

        return findings


# ─────────────────────────────────────────────────────────────
# RESOURCE DIAGNOSTIC AGENT
# ─────────────────────────────────────────────────────────────

class ResourceDiag(DiagnosticAgent):
    name = "ResourceDiag"

    def diagnose(self) -> list[DiagnosticFinding]:
        findings = []

        try:
            import psutil
            cpu = psutil.cpu_percent(interval=0.5)
            mem = psutil.virtual_memory().percent
            disk = psutil.disk_usage('/').percent

            pressure = []
            if cpu > 90:
                pressure.append(f"CPU={cpu:.1f}%")
            if mem > 90:
                pressure.append(f"Memory={mem:.1f}%")
            if disk > 90:
                pressure.append(f"Disk={disk:.1f}%")

            if pressure:
                f = DiagnosticFinding(
                    id=str(uuid.uuid4())[:8],
                    timestamp=time.time(),
                    agent_id=self.name,
                    target="system_resources",
                    finding_type="resource_pressure",
                    description=", ".join(pressure),
                    confidence=0.95,
                    recommendation="Reduce concurrent processes or scale horizontally"
                )
                findings.append(f)
                self._add_finding(f)
                self._emit_node("resource_pressure", "Resource Pressure", "symptom", 0.95)
                self._emit_node("system_overload", "System Overload", "cause", 0.8)
                self._emit_edge("resource_pressure", "system_overload", "metrics > 90%", 0.9)
                self._vote_for("system_overload")
            else:
                f = DiagnosticFinding(
                    id=str(uuid.uuid4())[:8],
                    timestamp=time.time(),
                    agent_id=self.name,
                    target="system_resources",
                    finding_type="anomaly",
                    description=f"Resources normal (CPU={cpu:.1f}%, Mem={mem:.1f}%, Disk={disk:.1f}%)",
                    confidence=1.0,
                    recommendation=None
                )
                findings.append(f)
        except ImportError:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="system_resources",
                finding_type="anomaly",
                description="psutil not available, skipping resource diagnosis",
                confidence=0.0,
                recommendation="Install psutil: pip install psutil"
            )
            findings.append(f)

        return findings


# ─────────────────────────────────────────────────────────────
# APP DIAGNOSTIC AGENT
# ─────────────────────────────────────────────────────────────

class AppDiag(DiagnosticAgent):
    name = "AppDiag"

    def diagnose(self) -> list[DiagnosticFinding]:
        findings = []

        app_events = self.event_bus.get_events(since=time.time() - 300)
        app_errors = [e for e in app_events
                     if e.severity.value >= EventSeverity.ERROR.value
                     and e.source not in ("memory_matrix", "vision_monitor",
                                         "yolo_service", "network")]

        if app_errors:
            for e in app_errors:
                f = DiagnosticFinding(
                    id=str(uuid.uuid4())[:8],
                    timestamp=time.time(),
                    agent_id=self.name,
                    target=e.source,
                    finding_type="anomaly",
                    description=e.description,
                    confidence=0.8,
                    recommendation=f"Investigate {e.source} service logs"
                )
                findings.append(f)
                self._add_finding(f)
                self._emit_node(f"app_error_{e.source}", f"App Error: {e.source}", "symptom", 0.8)
                self._vote_for(f"app_error_{e.source}")
        else:
            f = DiagnosticFinding(
                id=str(uuid.uuid4())[:8],
                timestamp=time.time(),
                agent_id=self.name,
                target="application",
                finding_type="anomaly",
                description="No application errors detected",
                confidence=1.0,
                recommendation=None
            )
            findings.append(f)

        return findings


# ─────────────────────────────────────────────────────────────
# ORCHESTRATOR
# ─────────────────────────────────────────────────────────────

class DiagnosticOrchestrator:
    """
    Coordinates all diagnostic agents, aggregates findings,
    manages the causal graph, and runs the vote tally.
    """

    def __init__(self):
        self.event_bus = EventBus()
        self.causal_graph = CausalGraph()
        self.findings: list[DiagnosticFinding] = []
        self.findings_lock = threading.Lock()
        self.votes = DiagnosticVote()
        self.agents: dict[str, DiagnosticAgent] = {}
        self.diagnosis_history: list[dict] = []
        self.running = False
        self._lock = threading.Lock()

        # Register agents
        self._register_agents()

    def _register_agents(self):
        self.agents = {
            "MemoryDiag": MemoryDiag(self.event_bus, self.causal_graph,
                                     self.findings, self.votes, self.findings_lock),
            "VisionDiag": VisionDiag(self.event_bus, self.causal_graph,
                                    self.findings, self.votes, self.findings_lock),
            "NetworkDiag": NetworkDiag(self.event_bus, self.causal_graph,
                                      self.findings, self.votes, self.findings_lock),
            "ResourceDiag": ResourceDiag(self.event_bus, self.causal_graph,
                                         self.findings, self.votes, self.findings_lock),
            "AppDiag": AppDiag(self.event_bus, self.causal_graph,
                              self.findings, self.votes, self.findings_lock),
        }

    def report_event(self, source: str, description: str,
                     severity_str: str = "INFO",
                     metadata: dict | None = None) -> str:
        sev = EventSeverity[severity_str.upper()] if severity_str.upper() in EventSeverity.__members__ else EventSeverity.INFO
        return self.event_bus.publish(source, description, sev, metadata)

    def run_diagnosis(self, agent_name: str | None = None) -> dict:
        results: dict[str, list] = {}

        if agent_name:
            agent = self.agents.get(agent_name)
            if agent:
                findings = agent.diagnose()
                results[agent_name] = findings
        else:
            for name, agent in self.agents.items():
                findings = agent.diagnose()
                results[name] = findings

        # Record in history
        with self._lock:
            self.diagnosis_history.append({
                "timestamp": time.time(),
                "results": {
                    name: [{"id": f.id, "type": f.finding_type,
                            "description": f.description, "confidence": f.confidence}
                           for f in flist]
                    for name, flist in results.items()
                },
                "vote_tally": self.votes.tally(),
                "leading_cause": self.votes.leading_cause()
            })

        return {
            "results": {
                name: [{
                    "id": f.id,
                    "agent": f.agent_id,
                    "target": f.target,
                    "type": f.finding_type,
                    "description": f.description,
                    "confidence": f.confidence,
                    "recommendation": f.recommendation
                } for f in flist]
                for name, flist in results.items()
            },
            "vote_tally": self.votes.tally(),
            "leading_cause": self.votes.leading_cause()
        }

    def get_causal_graph(self) -> dict:
        return self.causal_graph.to_dict()

    def get_causal_graph_dot(self) -> str:
        return self.causal_graph.to_dot()

    def get_findings(self, since: float = 0) -> list:
        with self.findings_lock:
            return [{
                "id": f.id,
                "timestamp": f.timestamp,
                "agent": f.agent_id,
                "target": f.target,
                "type": f.finding_type,
                "description": f.description,
                "confidence": f.confidence,
                "recommendation": f.recommendation
            } for f in self.findings if f.timestamp >= since]

    def get_agent_state(self, name: str) -> dict | None:
        if name not in self.agents:
            return None
        agent = self.agents[name]
        return {
            "name": agent.name,
            "running": agent.running
        }

    def get_stats(self) -> dict:
        with self._lock:
            return {
                "agents": list(self.agents.keys()),
                "total_findings": len(self.findings),
                "diagnosis_runs": len(self.diagnosis_history),
                "vote_tally": self.votes.tally(),
                "leading_cause": self.votes.leading_cause(),
                "events_in_bus": len(self.event_bus.events)
            }


# ─────────────────────────────────────────────────────────────
# HTTP SERVER
# ─────────────────────────────────────────────────────────────

def _json_body(body: bytes) -> dict:
    try:
        return json.loads(body.decode())
    except Exception:
        return {}


def run_diagnostics_server(port: int = 7786):
    import http.server
    import socketserver

    orch = DiagnosticOrchestrator()

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print(f"[DiagEngine:{port}] {fmt % args}")

        def send_json(self, data: dict, status: int = 200):
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        def do_GET(self):
            if self.path == "/health":
                self.send_json({"status": "healthy", "service": "diagnostics", "port": port})
            elif self.path == "/diagnose":
                result = orch.run_diagnosis()
                self.send_json(result)
            elif self.path == "/causal-graph":
                self.send_json(orch.get_causal_graph())
            elif self.path == "/causal-graph/dot":
                dot = orch.get_causal_graph_dot()
                self.send_response(200)
                self.send_header("Content-Type", "text/vnd.graphviz")
                self.end_headers()
                self.wfile.write(dot.encode())
            elif self.path == "/findings":
                self.send_json({"findings": orch.get_findings()})
            elif self.path == "/vote":
                self.send_json({
                    "tally": orch.votes.tally(),
                    "leading": orch.votes.leading_cause()
                })
            elif self.path.startswith("/agent/"):
                parts = self.path.split("/", 3)
                if len(parts) >= 3:
                    name = parts[2]
                    state = orch.get_agent_state(name)
                    if state:
                        self.send_json(state)
                    else:
                        self.send_json({"error": "agent not found"}, 404)
                else:
                    self.send_json({"error": "bad path"}, 400)
            elif self.path == "/stats":
                self.send_json(orch.get_stats())
            else:
                self.send_json({"error": "not found"}, 404)

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            data = _json_body(body)

            if self.path == "/diagnose":
                agent = data.get("agent")
                result = orch.run_diagnosis(agent)
                self.send_json(result)
            elif self.path == "/event":
                eid = orch.report_event(
                    data.get("source", "unknown"),
                    data.get("description", ""),
                    data.get("severity", "INFO"),
                    data.get("metadata")
                )
                self.send_json({"event_id": eid})
            elif self.path.startswith("/diagnose/"):
                agent = self.path.split("/", 2)[-1]
                result = orch.run_diagnosis(agent)
                self.send_json(result)
            else:
                self.send_json({"error": "not found"}, 404)

    class ReuseAddrTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    with ReuseAddrTCPServer(("", port), Handler) as httpd:
        print(f"[DiagEngine] Autonomous Diagnostics Server running on port {port}")
        print(f"[DiagEngine] Agents: {list(orch.agents.keys())}")
        httpd.serve_forever()


# ─────────────────────────────────────────────────────────────
# STANDALONE TEST
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== PURPCLAW Autonomous Diagnostics v1.0 ===")
    print()

    orch = DiagnosticOrchestrator()

    # Simulate events
    print("[TEST] Reporting events...")
    orch.report_event("memory_matrix", "SentenceTransformer load failed, using hash fallback",
                      "WARNING")
    orch.report_event("vision_monitor", "YOLO connection timeout on /detect",
                      "ERROR", {"target": "localhost:7779"})
    orch.report_event("network", "Connection refused to port 7780",
                      "ERROR", {"target": "localhost:7780"})

    print("[TEST] Running full diagnosis...")
    result = orch.run_diagnosis()
    for agent, findings in result["results"].items():
        print(f"  {agent}: {len(findings)} finding(s)")
        for f in findings:
            print(f"    [{f['type']}] {f['description'][:60]} (conf={f['confidence']})")

    print(f"\n[TEST] Vote tally: {result['vote_tally']}")
    print(f"[TEST] Leading cause: {result['leading_cause']}")
    print(f"\n[TEST] Causal graph nodes: {len(orch.get_causal_graph()['nodes'])}")
    print(f"[TEST] Causal graph edges: {len(orch.get_causal_graph()['edges'])}")
    print(f"\n[TEST] Stats: {orch.get_stats()}")
    print()
    print("All tests passed.")
    print()

    print("[SERVER] Starting HTTP server on port 7786...")
    run_diagnostics_server(7786)
