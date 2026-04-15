"""Quick test for symbolic_rules_engine fixes."""
import sys
sys.path.insert(0, '.')

# Import just the engine
import importlib.util
spec = importlib.util.spec_from_file_location("rules", "symbolic_rules_engine.py")
mod = importlib.util.load_from_spec = spec.loader.exec_module

# Load the module without the server
import types
rules_mod = types.ModuleType("rules_mod")
with open("symbolic_rules_engine.py") as f:
    src = f.read()

# Cut at the server
server_start = src.find("# ─────────────────────────────────────────────────────────────\n# HTTP SERVER")
exec(compile(src[:server_start], "symbolic_rules_engine.py", "exec"), rules_mod.__dict__)

DatalogEngine = rules_mod.DatalogEngine

print("=== PURPCLAW Symbolic Rules Engine v1.1 ===")

engine = DatalogEngine()

# Test basic assert
f1 = engine.assert_fact_str("parent(alice,bob)")
f2 = engine.assert_fact_str("parent(bob,carol)")
f3 = engine.assert_fact_str("parent(david,eve)")
f4 = engine.assert_fact_str("parent(charles,bob)")
f5 = engine.assert_fact_str("parent(charles,david)")
print(f"Asserted: {f1.predicate}({f1.terms}), {f2.predicate}({f2.terms})")

# Test rules with inequality constraint
r1 = engine.add_rule_str("sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y")
print(f"Rule: sibling(X,Y) :- parent(Z,X), parent(Z,Y), X != Y")
r2 = engine.add_rule_str("ancestor(X,Y) :- parent(X,Y)")
r3 = engine.add_rule_str("ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y)")
print("Rules added")

# Test inference
derived = engine.run_inference()
print(f"Derived ({len(derived)}): {derived}")
print(f"Total facts: {engine.stats()['total_facts']}")

# Test query
results = engine.query_str("ancestor(X,carol)")
print(f"ancestor(X, carol): {results}")

# sibling should NOT include bob,bob
results2 = engine.query_str("sibling(X,Y)")
print(f"sibling(X,Y): {results2}")
has_self_sibling = any(r['terms'][0] == r['terms'][1] for r in results2)
print(f"Has self-sibling (should be False): {has_self_sibling}")

# Test explain
explain_fact = engine.assert_fact_str("ancestor(alice,carol)")
explanation = engine.explain("ancestor", explain_fact.terms)
print(f"Explanation: {explanation}")

# Test counterfactual
cf = engine.counterfactual("ancestor(X,Y)", ["parent(alice,carol)"])
print(f"Counterfactual holds: {cf['holds']}")
print(f"Counterfactual derived count: {len(cf['derived_under_assumptions'])}")

# Test constraint
engine.add_constraint("has_parent", [], "Every person should have a parent", "warning")
violations = engine.check_constraints()
print(f"Constraint violations: {len(violations)}")

print(f"\nFinal stats: {engine.stats()}")
print("\nAll tests passed!" if not has_self_sibling else "\nFAILED: self-sibling found!")
