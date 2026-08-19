# PURPCLAW IMPLEMENTATION HANDOFF

Use this file as the ordered build instruction for the working codebase.

## Goal

Do not redesign the product.

Consolidate the existing estate into the canonical contract in `PURPCLAW_CANONICAL_RUNTIME_INSTALL_FIRST_RUN_SPEC.md`.

## Ground Rules

1. Start from the live repository and the discovery outputs.
2. Re-scan current code before changing anything.
3. Treat discovery counts as audit facts, not constants.
4. Do not delete/move unknown code before ownership is proven.
5. Keep CLI working throughout.
6. Build the structured Action Kernel under CLI command semantics.
7. Make TUI/Web/Desktop/Mobile clients of the same kernel/state/events.
8. Preserve human supervision and approvals.
9. Lazy-load agents/skills/tools/plugins/workers whenever possible.
10. Do not resurrect unverified memory claims.
11. Do not preserve duplicate workflow/mission engines as equal authorities.
12. Do not create more permanent processes merely to make the architecture look modular.

## Ordered Work

### A. Reconcile live truth
- regenerate/validate registries against live files;
- verify service entrypoints;
- verify current command/action ownership;
- verify provider/model registry;
- verify memory implementations;
- verify current UI surfaces.

### B. Add canonical runtime records
- runtimes.json;
- harnesses.json;
- steering.json;
- ownership.json;
- parity.json.

### C. Build Action Kernel
- structured request/result;
- schema validation;
- canonical errors;
- canonical events;
- approvals.

### D. Refactor CLI onto Action Kernel
CLI remains reference surface but no longer owns hidden business logic.

### E. Supervisor
- runtime lock;
- lifecycle;
- service classes;
- dynamic ports;
- health;
- recovery.

### F. Resolver chain
- capability;
- agent;
- soul;
- skill;
- tool/plugin;
- provider/model.

### G. Harnesses
Implement request/action/agent/tool/provider/workflow/mission/surface/recovery/verification harnesses as shared modules.

### H. Steering/context
One precedence stack and one context assembler.
Record steering versions/hashes in process provenance.

### I. Workflow and mission consolidation
Pick authoritative implementation from evidence.
Bridge/migrate remaining implementations.
Remove alternate mutation paths.

### J. Memory
Only real layers.
Test record/recall.
Make UI show real status.

### K. Surface gateway/parity
One action/query/event/approval/artifact/health contract.
Move each surface to it.
Delete hard-coded counts.
Make cross-surface IDs identical.

### L. First install/first run
One bootstrap.
One onboarding record.
One provider/plugin setup.
One smoke suite.
One chosen entry surface.

### M. Acceptance
Run every test in `acceptance-tests.json`.
No FULL release while a must-pass test is red.
