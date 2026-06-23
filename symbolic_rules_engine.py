#!/usr/bin/env python3
"""
PURPCLAW Symbolic Rules Engine v1.0
====================================
Datalog-based symbolic inference engine with:
  - Fact storage (assert/retract)
  - Rule definitions (head :- body)
  - Forward chaining inference
  - Counterfactual reasoning
  - Constraint checking
  - CozoDB integration (optional)

HTTP API on PORT 7787:
  POST /assert      — assert a fact
  POST /retract     — retract a fact
  POST /query       — run a Datalog query
  POST /rule        — add an inference rule
  POST /rules       — add multiple rules
  POST /check       — constraint check
  POST /counterfactual — counterfactual query
  GET  /facts       — all facts
  GET  /rules       — all rules
  GET  /explain     — explain query derivation
  GET  /stats       — engine stats
  GET  /health
"""

import json
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


# ─────────────────────────────────────────────────────────────
# FACT & RULE DATA STRUCTURES
# ─────────────────────────────────────────────────────────────

@dataclass
class Fact:
    predicate: str
    terms: tuple
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: float = field(default_factory=time.time)
    provenance: str = "asserted"  # 'asserted', 'derived', 'counterfactual'

    def to_tuple(self) -> tuple:
        return (self.predicate, self.terms)

    def __hash__(self):
        return hash((self.predicate, self.terms))

    def __eq__(self, other):
        if not isinstance(other, Fact):
            return False
        return self.predicate == other.predicate and self.terms == other.terms


@dataclass
class Rule:
    head_predicate: str
    head_vars: tuple
    body: list  # list of (predicate, vars) conditions
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def __repr__(self):
        body_str = ", ".join(f"{p}({v})" for p, v in self.body)
        return f"{self.head_predicate}({','.join(self.head_vars)}) :- {body_str}"


@dataclass
class Constraint:
    predicate: str
    body: list  # same structure as Rule body
    description: str
    severity: str = "error"  # error, warning


# ─────────────────────────────────────────────────────────────
# DATALOG ENGINE
# ─────────────────────────────────────────────────────────────

class DatalogEngine:
    """In-memory Datalog engine with forward chaining."""

    def __init__(self):
        self.facts: dict[tuple, Fact] = {}  # (pred, terms) -> Fact
        self.rules: list[Rule] = []
        self.constraints: list[Constraint] = []
        self.inference_log: list[dict] = []  # track derivations
        self.lock = threading.RLock()
        self._fact_counter = 0
        self._rule_counter = 0

    # ── ASSERT / RETRACT ──────────────────────────────────

    def assert_fact(self, predicate: str, terms: tuple,
                    provenance: str = "asserted") -> Fact:
        """Assert a fact. Idempotent — same fact won't be duplicated."""
        with self.lock:
            # Normalize terms: convert lists to tuples
            norm_terms = tuple(terms)
            key = (predicate, norm_terms)
            if key in self.facts:
                return self.facts[key]
            self._fact_counter += 1
            fact = Fact(predicate=predicate, terms=norm_terms,
                       provenance=provenance)
            self.facts[key] = fact
            self.inference_log.append({
                "action": "assert",
                "fact": f"{predicate}({','.join(str(t) for t in norm_terms)})",
                "provenance": provenance,
                "timestamp": time.time()
            })
            return fact

    def assert_fact_str(self, fact_str: str, provenance: str = "asserted") -> Fact:
        """Parse and assert a fact from string like 'knows(alice,bob)'."""
        fact_str = fact_str.strip()
        m = re.match(r'(\w+)\(([^)]+)\)', fact_str)
        if not m:
            raise ValueError(f"Invalid fact syntax: {fact_str}")
        pred = m.group(1)
        args = [a.strip() for a in m.group(2).split(',')]
        return self.assert_fact(pred, tuple(args), provenance)

    def retract_fact(self, predicate: str, terms: tuple) -> bool:
        """Retract a fact. Returns True if found and removed."""
        with self.lock:
            key = (predicate, tuple(terms))
            if key in self.facts:
                del self.facts[key]
                self.inference_log.append({
                    "action": "retract",
                    "fact": f"{predicate}({','.join(str(t) for t in terms)})",
                    "timestamp": time.time()
                })
                return True
            return False

    # ── RULES ──────────────────────────────────────────────

    def add_rule(self, head_pred: str, head_vars: tuple,
                 body: list, rule_id: str | None = None) -> Rule:
        """Add an inference rule. Body is list of (pred, vars) pairs."""
        with self.lock:
            rule = Rule(
                head_predicate=head_pred,
                head_vars=head_vars,
                body=body,
                id=rule_id or str(uuid.uuid4())[:8]
            )
            self.rules.append(rule)
            self._rule_counter += 1
            return rule

    def add_rule_str(self, rule_str: str) -> Rule:
        """Parse rule from string like 'ancestor(X,Y) :- parent(X,Y)' or 'ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y)'."""
        rule_str = rule_str.strip()
        if ':-' not in rule_str:
            raise ValueError(f"Rule must contain ':-': {rule_str}")
        head_part, body_part = rule_str.split(':-', 1)
        head_part = head_part.strip()
        body_part = body_part.strip()

        # Parse head
        hm = re.match(r'(\w+)\(([^)]+)\)', head_part)
        if not hm:
            raise ValueError(f"Invalid rule head: {head_part}")
        head_pred = hm.group(1)
        head_vars = tuple(v.strip() for v in hm.group(2).split(','))

        # Parse body — split by '),' to get individual predicate(args) literals
        # First add trailing ')' if missing from last literal
        body_parts = []
        depth = 0
        current = ""
        for ch in body_part:
            if ch == '(':
                depth += 1
                current += ch
            elif ch == ')':
                depth -= 1
                current += ch
            elif ch == ',' and depth == 0:
                body_parts.append(current.strip())
                current = ""
            else:
                current += ch
        if current.strip():
            body_parts.append(current.strip())

        body = []
        for lit in body_parts:
            lit = lit.strip()
            if not lit:
                continue
            # Handle inequality constraints: X != Y
            neq_m = re.match(r'(\w+)\s*!=\s*(\w+)', lit)
            if neq_m:
                body.append(('!=', (neq_m.group(1).strip(), neq_m.group(2).strip())))
                continue
            m = re.match(r'(\w+)\(([^)]+)\)', lit)
            if not m:
                raise ValueError(f"Invalid rule body literal: '{lit}'")
            pred = m.group(1)
            args = tuple(a.strip() for a in m.group(2).split(','))
            body.append((pred, args))

        return self.add_rule(head_pred, head_vars, body)

    # ── FORWARD CHAINING ──────────────────────────────────

    def run_inference(self, max_iterations: int = 100) -> list[str]:
        """
        Run forward chaining until fixed point.
        Returns list of ALL derived facts (no duplicates).
        """
        all_derived = []
        # Track which (pred, terms) keys we've already added to all_derived
        seen_keys = set()

        for iteration in range(max_iterations):
            new_facts_this_round = []

            for rule in list(self.rules):
                results = self._apply_rule(rule)
                for result in results:
                    key = (result[0], tuple(result[1]))
                    if key not in seen_keys:
                        seen_keys.add(key)
                        self.assert_fact(result[0], result[1], provenance="derived")
                        new_facts_this_round.append(
                            f"{result[0]}({','.join(str(t) for t in result[1])})"
                        )

            all_derived.extend(new_facts_this_round)

            if not new_facts_this_round:
                break

        return all_derived

    def _apply_rule(self, rule: Rule) -> list[tuple]:
        """Apply a single rule, returning list of (pred, terms) results."""
        results = []
        body = rule.body

        # Separate inequality constraints from regular predicates
        ineq_constraints = []
        pred_body = []
        for lit in body:
            if lit[0] == 'neq' or lit[0] == '!=':
                ineq_constraints.append(lit)
            else:
                pred_body.append(lit)

        # Build all possible bindings for body literals
        bindings_list = self._match_body(pred_body, {})
        for bindings in bindings_list:
            # Check all inequality constraints
            ok = True
            for ineq_lit in ineq_constraints:
                # lit is ('neq', (a, b)) or ('!=', (a, b))
                a = bindings.get(ineq_lit[1][0], ineq_lit[1][0])
                b = bindings.get(ineq_lit[1][1], ineq_lit[1][1])
                if a == b:
                    ok = False
                    break
            if not ok:
                continue

            # Construct head with bindings
            head_terms = tuple(bindings.get(v, v) for v in rule.head_vars)
            results.append((rule.head_predicate, head_terms))

        return results

    def _match_body(self, body: list, bindings: dict) -> list[dict]:
        """Recursively match body literals against facts, collecting variable bindings."""
        if not body:
            return [bindings]

        pred, args = body[0]
        # Substitute variables in args using current bindings
        subst_args = tuple(bindings.get(a, a) for a in args)

        # Find all matching facts
        matching_facts = []
        with self.lock:
            for (fp, ft), fact in self.facts.items():
                if fp == pred and len(ft) == len(subst_args):
                    match = True
                    new_bindings = dict(bindings)
                    for i, (fa, ga) in enumerate(zip(ft, subst_args)):
                        if isinstance(ga, str) and ga[0].isupper():
                            # Variable — bind it
                            if ga in new_bindings:
                                if new_bindings[ga] != fa:
                                    match = False
                                    break
                            else:
                                new_bindings[ga] = fa
                        elif fa != ga:
                            match = False
                            break
                    if match:
                        matching_facts.append((fact, new_bindings))

        results = []
        for _, new_bindings in matching_facts:
            sub_results = self._match_body(body[1:], new_bindings)
            results.extend(sub_results)
        return results

    # ── QUERY ──────────────────────────────────────────────

    def query(self, predicate: str, terms: tuple) -> list[dict]:
        """Query facts matching predicate/terms pattern. Variables start with uppercase."""
        results = []
        with self.lock:
            for (fp, ft), fact in self.facts.items():
                if fp != predicate or len(ft) != len(terms):
                    continue
                match = True
                bindings = {}
                for i, (fa, ga) in enumerate(zip(ft, terms)):
                    if isinstance(ga, str) and len(ga) > 0 and ga[0].isupper():
                        # Variable
                        if ga in bindings:
                            if bindings[ga] != fa:
                                match = False
                                break
                        else:
                            bindings[ga] = fa
                    elif fa != ga:
                        match = False
                        break
                if match:
                    results.append({"terms": ft, "fact_id": fact.id,
                                   "provenance": fact.provenance,
                                   "timestamp": fact.timestamp,
                                   "bindings": bindings})
        return results

    def query_str(self, query_str: str) -> list[dict]:
        """Query from string like 'ancestor(X, alice)'."""
        query_str = query_str.strip()
        m = re.match(r'(\w+)\(([^)]+)\)', query_str)
        if not m:
            raise ValueError(f"Invalid query: {query_str}")
        pred = m.group(1)
        terms = tuple(a.strip() for a in m.group(2).split(','))
        return self.query(pred, terms)

    def explain(self, predicate: str, terms: tuple) -> dict:
        """Explain how a fact was derived."""
        with self.lock:
            key = (predicate, tuple(terms))
            if key not in self.facts:
                return {"error": "fact not found"}
            fact = self.facts[key]
            return {
                "fact": f"{predicate}({','.join(str(t) for t in terms)})",
                "provenance": fact.provenance,
                "timestamp": fact.timestamp,
                "id": fact.id
            }

    # ── CONSTRAINT CHECKING ───────────────────────────────

    def check_constraints(self) -> list[dict]:
        """Check all constraints, return violations."""
        violations = []
        for constraint in self.constraints:
            bindings_list = self._match_body(constraint.body, {})
            if not bindings_list:
                violations.append({
                    "constraint": constraint.description,
                    "severity": constraint.severity,
                    "predicate": constraint.predicate
                })
        return violations

    def add_constraint(self, pred: str, body: list,
                      description: str, severity: str = "error") -> Constraint:
        c = Constraint(predicate=pred, body=body,
                      description=description, severity=severity)
        self.constraints.append(c)
        return c

    # ── COUNTERFACTUAL ───────────────────────────────────

    def counterfactual(self, hypothesis: str, assumptions: list[str]) -> dict:
        """
        Evaluate a hypothesis under assumed facts (counterfactual reasoning).
        hypothesis: fact string like 'causes( X, bad_outcome)'
        assumptions: list of fact strings assumed true
        """
        # Save current state
        saved_facts = dict(self.facts)

        # Assert assumptions
        derived_assumptions = []
        for assumption in assumptions:
            try:
                fact = self.assert_fact_str(assumption, provenance="counterfactual_assumption")
                derived_assumptions.append(fact)
            except ValueError:
                pass

        # Run inference
        newly_derived = self.run_inference()

        # Evaluate hypothesis
        hypothesis_result = None
        try:
            hypothesis_result = self.query_str(hypothesis)
        except ValueError:
            pass

        # Restore state
        with self.lock:
            self.facts = saved_facts
            self.inference_log = [l for l in self.inference_log
                                 if l.get("provenance") != "counterfactual_assumption"]

        return {
            "hypothesis": hypothesis,
            "assumptions": assumptions,
            "derived_under_assumptions": newly_derived,
            "hypothesis_result": hypothesis_result,
            "holds": len(hypothesis_result) > 0 if hypothesis_result is not None else None
        }

    # ── STATS ────────────────────────────────────────────

    def stats(self) -> dict:
        with self.lock:
            return {
                "total_facts": len(self.facts),
                "derived_facts": sum(1 for f in self.facts.values() if f.provenance == "derived"),
                "asserted_facts": sum(1 for f in self.facts.values() if f.provenance == "asserted"),
                "rules": len(self.rules),
                "constraints": len(self.constraints),
                "inference_steps": len(self.inference_log),
                "predicates": list(set(f.predicate for f in self.facts.values()))
            }

    def all_facts(self, predicate_filter: str | None = None) -> list[dict]:
        with self.lock:
            facts = []
            for fact in self.facts.values():
                if predicate_filter and fact.predicate != predicate_filter:
                    continue
                facts.append({
                    "predicate": fact.predicate,
                    "terms": list(fact.terms),
                    "id": fact.id,
                    "provenance": fact.provenance,
                    "timestamp": fact.timestamp
                })
            return facts

    def all_rules(self) -> list[dict]:
        with self.lock:
            return [{"id": r.id, "head": f"{r.head_predicate}({','.join(r.head_vars)})",
                    "body": [f"{p}({','.join(v)})" for p, v in r.body]}
                    for r in self.rules]


# ─────────────────────────────────────────────────────────────
# HTTP SERVER
# ─────────────────────────────────────────────────────────────

def _json_body(body: bytes) -> dict:
    try:
        return json.loads(body.decode())
    except Exception:
        return {}


def run_rules_server(port: int = 7787):
    import http.server
    import socketserver

    engine = DatalogEngine()

    # Bootstrap with example rules
    engine.assert_fact_str("parent(alice,bob)")
    engine.assert_fact_str("parent(bob,carol)")
    engine.add_rule_str("sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y")
    engine.add_rule_str("ancestor(X,Y) :- parent(X,Y)")
    engine.add_rule_str("ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y)")

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print(f"[RulesEngine:{port}] {fmt % args}")

        def send_json(self, data: dict, status: int = 200):
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        def do_GET(self):
            if self.path == "/health":
                self.send_json({"status": "healthy", "service": "rules_engine", "port": port})
            elif self.path == "/facts":
                self.send_json({"facts": engine.all_facts()})
            elif self.path == "/rules":
                self.send_json({"rules": engine.all_rules()})
            elif self.path == "/stats":
                self.send_json(engine.stats())
            elif self.path == "/explain":
                self.send_json({"error": "use /explain?predicate=X&term1=Y&..."}, 400)
            elif self.path.startswith("/explain?"):
                qs = self.path.split('?', 1)[-1]
                params = dict(p.split('=') for p in qs.split('&') if '=' in p)
                pred = params.get("predicate", "")
                terms = tuple(params.get("term", "").split(","))
                self.send_json(engine.explain(pred, terms))
            elif self.path == "/infer":
                derived = engine.run_inference()
                self.send_json({"newly_derived": derived, "total_facts": len(engine.facts)})
            else:
                self.send_json({"error": "not found"}, 404)

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            data = _json_body(body)

            if self.path == "/assert":
                fact = engine.assert_fact_str(data.get("fact", ""), data.get("provenance", "asserted"))
                self.send_json({"fact": f"{fact.predicate}({','.join(str(t) for t in fact.terms)})", "id": fact.id})
            elif self.path == "/retract":
                m = re.match(r'(\w+)\(([^)]+)\)', data.get("fact", ""))
                if m:
                    terms = tuple(t.strip() for t in m.group(2).split(','))
                    removed = engine.retract_fact(m.group(1), terms)
                    self.send_json({"removed": removed})
                else:
                    self.send_json({"error": "invalid fact"}, 400)
            elif self.path == "/query":
                results = engine.query_str(data.get("query", ""))
                self.send_json({"results": results})
            elif self.path == "/rule":
                try:
                    rule = engine.add_rule_str(data.get("rule", ""))
                    self.send_json({"rule_id": rule.id, "rule": str(rule)})
                except ValueError as e:
                    self.send_json({"error": str(e)}, 400)
            elif self.path == "/rules":
                rules = []
                for r in data.get("rules", []):
                    try:
                        rule = engine.add_rule_str(r)
                        rules.append({"rule_id": rule.id, "rule": str(rule)})
                    except ValueError:
                        pass
                self.send_json({"added": len(rules), "rules": rules})
            elif self.path == "/check":
                violations = engine.check_constraints()
                self.send_json({"violations": violations, "count": len(violations)})
            elif self.path == "/counterfactual":
                result = engine.counterfactual(
                    data.get("hypothesis", ""),
                    data.get("assumptions", [])
                )
                self.send_json(result)
            elif self.path == "/infer":
                derived = engine.run_inference()
                self.send_json({"newly_derived": derived})
            else:
                self.send_json({"error": "not found"}, 404)

    class ReuseAddrTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    with ReuseAddrTCPServer(("", port), Handler) as httpd:
        print(f"[RulesEngine] Symbolic Rules Engine running on port {port}")
        print(f"[RulesEngine] Datalog: facts, rules, constraints, counterfactuals")
        httpd.serve_forever()


# ─────────────────────────────────────────────────────────────
# STANDALONE TEST
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== PURPCLAW Symbolic Rules Engine v1.0 ===")
    print()

    engine = DatalogEngine()

    # Test basic assert
    print("[TEST] Assert facts...")
    f1 = engine.assert_fact_str("parent(alice,bob)")
    f2 = engine.assert_fact_str("parent(bob,carol)")
    f3 = engine.assert_fact_str("parent(david,eve)")
    print(f"  Asserted: {f1.predicate}({f1.terms}), {f2.predicate}({f2.terms})")

    # Test rules
    print("[TEST] Adding rules...")
    r1 = engine.add_rule_str("sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y")
    print(f"  Rule: {r1}")
    r2 = engine.add_rule_str("ancestor(X,Y) :- parent(X,Y)")
    r3 = engine.add_rule_str("ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y)")
    print(f"  ancestor rules added")

    # Test inference
    print("[TEST] Running inference...")
    derived = engine.run_inference()
    print(f"  Newly derived: {derived}")
    print(f"  Total facts: {engine.stats()['total_facts']}")

    # Test query
    print("[TEST] Query...")
    results = engine.query_str("ancestor(X,carol)")
    print(f"  ancestor(X, carol): {results}")

    # Test explain
    print("[TEST] Explain...")
    # Find a derived ancestor fact
    explain_fact = engine.assert_fact_str("ancestor(alice,carol)")
    explanation = engine.explain("ancestor", (explain_fact.terms))
    print(f"  Explanation: {explanation}")

    # Test counterfactual
    print("[TEST] Counterfactual...")
    cf = engine.counterfactual("ancestor(X,Y)", ["parent(alice,carol)"])
    print(f"  Holds under assumption: {cf['holds']}")
    print(f"  Derived: {cf['derived_under_assumptions']}")

    # Test constraint
    print("[TEST] Constraints...")
    engine.add_constraint(
        "has_parent", [],
        "Every person should have a parent",
        "warning"
    )
    violations = engine.check_constraints()
    print(f"  Violations: {len(violations)}")

    print(f"\n[STATS] {engine.stats()}")
    print()
    print("All tests passed.")
    print()

    print("[SERVER] Starting HTTP server on port 7787...")
    run_rules_server(7787)
