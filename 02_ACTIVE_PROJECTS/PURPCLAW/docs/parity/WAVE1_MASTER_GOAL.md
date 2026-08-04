# Wave 1: Stabilise the Spine

**Canonical reference:** `docs/parity/CANONICAL_PARITY_PRIORITY.md` — Priority 0 items 1–5

**Resource policy:** `docs/AGENT_RESOURCE_POLICY.md`

**Reasoning budget policy:** Ultra/Max reserved for chief decomposition, integration ownership, and final conformance review. All subagents Standard or High only. One Ultra/Max max at a time.

---

## Binding model and reasoning policy

`docs/AGENT_RESOURCE_POLICY.md` is part of this master goal.
Its builder and critic prompt blocks are mandatory for every spawned lane.

- Child agents do not inherit the parent agent's reasoning mode.
- A subagent may not select Ultra/Max for itself.
- Escalation applies to one recorded unresolved task, never an entire lane.
- After an escalated task completes, the lane returns to its normal tier.
- The chief rejects any allocation stronger than the task requires.
- Every allocation records its role, model, reasoning tier, task, and escalation
  reason in `.purpclaw/CAMPAIGN_STATE.md`.

---

## Tranche map

```
WAVE 1
├── TRANCHE A — One canonical agent runtime
│   ├── A1: Surface audit — which loop(s), registry/ies, and provider layer does each surface actually call today?
│   └── A2: Unify — route all surfaces through one agent-loop + tool-registry + provider-layer entry point
│
├── TRANCHE B — Session engine
│   ├── B1: Audit — map every surface's session create/read/update/delete/inspect path
│   └── B2: Unify — one session subsystem with full lifecycle, one store, ancestry tracking
│
├── TRANCHE C — Permission and sandbox engine
│   ├── C1: Audit — which surfaces have which permission checks today? Are they the same logic?
│   └── C2: Unify — one policy layer, one evaluation, all surfaces call it
│
├── TRANCHE D — Tool execution spine
│   ├── D1: Audit — which tools exist? Which surface calls which? Any duplication or divergence?
│   └── D2: Unify — one tool registry, one execution path, identical behaviour across surfaces
│
├── TRANCHE E — Provider and routing layer
│   ├── E1: Audit — map every call-site that selects or switches a model/provider
│   └── E2: Unify — one routing decision point; surfaces read from it, never call providers directly
│
└── TRANCHE F — Verification harness
    ├── F1: Write the parity harness — runs live probes against all five layers
    └── F2: Baseline current state — produces a machine-readable WAVE1_BASELINE.json
```

---

## Tranche A — One canonical agent runtime

### A1: Surface audit
**Builder:** Inventory every file that calls `agent-loop`, `agent-runtime`, `agent-gateway`, or equivalent. For each surface (CLI, TUI, Web UI, API server, desktop, IDE plugin, messaging), identify:
- Which loop file is actually called
- Which tool registry is actually used
- Which provider layer is actually used

**Acceptance:** A table listing each surface and the files/entry points it calls.

### A2: Unify entry points
**Builder:** After A1 audit is reviewed:
- Identify the one best existing implementation for each of: loop, registry, provider layer
- Add shim wrappers for any surface that calls a non-canonical entry point
- No surface may call its own loop variant — all routes through the chosen canonical one
- Session store, skills, hooks, memory — wire all surfaces to the shared instances

**Acceptance:** One `bin/purpclaw.js ask` and one `purpclaw tui` and one web API call all exercise the same loop, registry, and provider layer. No copy-paste loops.

---

## Tranche B — Session engine

### B1: Session audit
**Builder:** Map every surface's session path for: create, list, inspect, resume, fork, rename, archive, delete, export, search, prune, attach, background execution, live logs, cancellation.

Identify which session store(s) exist today and which surface uses which.

**Acceptance:** A table listing each lifecycle operation and which file/store handles it for each surface.

### B2: Unify session subsystem
**Builder:** After B1 audit is reviewed:
- Designate one canonical session store
- Implement any missing lifecycle operations
- Wire all surfaces to the canonical store
- Parent-child relationships and ancestry tracking

**Acceptance:** Session started in CLI resumes in web with identical history and permissions. Background and delegated sessions appear in the same searchable store.

---

## Tranche C — Permission and sandbox engine

### C1: Permission audit
**Builder:** For each surface, trace every permission or approval check. Identify which files contain the logic. Note any divergence in how the same check is implemented in two places.

**Acceptance:** A list of every distinct permission check, which file contains it, and which surface triggers it.

### C2: Unify policy layer
**Builder:** After C1 audit is reviewed:
- Designate one canonical permission evaluation file
- All surfaces call it — no inline permission checks remain
- Support the required policy tiers: trusted/full, workspace write, workspace read-only, sandboxed, deny-by-default, unattended safe mode
- Audit log of every policy decision

**Acceptance:** The same policy decision is made regardless of whether the command came from CLI, scheduler, subagent, or remote gateway. A test can simulate each policy tier and observe the correct result.

---

## Tranche D — Tool execution spine

### D1: Tool audit
**Builder:** Inventory every tool. For each, identify: name, file that implements it, which surfaces load it, which surfaces actually execute it via which path. Note any duplication or surface-specific variants of the same tool.

Tools to verify: read, write, patch, file search, text search, directory listing, terminal, long-running process control, structured code execution, web search, web fetch, browser, MCP, skill loading, task delegation, image inspection.

**Acceptance:** A canonical tool table: tool name, implementation file, surfaces that load it, surfaces that execute it, any divergence from the reference definition.

### D2: Unify tool execution
**Builder:** After D1 audit is reviewed:
- Designate one canonical tool registry
- Designate one canonical execution path
- Surface-specific shims call the canonical path — no surface has its own tool execution fork
- Add missing tools that are required by the reference definition
- Implement: streamed stdout/stderr, timeouts, cancellation, output truncation, structured errors, retry classification, tool call IDs, evidence capture

**Acceptance:** Each core tool behaves identically when called from any surface. A tool called from CLI produces the same result as the same tool called from web or subagent context.

---

## Tranche E — Provider and routing layer

### E1: Provider audit
**Builder:** Find every call-site that selects a model or routes to a provider. List each: file, line, what triggers it, which model/provider is selected, whether fallback logic exists.

Identify all provider configuration files and credential handling paths.

**Acceptance:** A map of every provider routing decision point, the logic it uses, and which surfaces reach it.

### E2: Unify routing layer
**Builder:** After E1 audit is reviewed:
- Designate one canonical routing decision file
- All surfaces read from it — no surface calls a provider directly
- Implement: multiple provider profiles, API key and OAuth auth, model aliases, primary and fallback models, per-agent model overrides, per-task routing, cheap/strong routing, rate-limit failover, token and cost tracking

**Acceptance:** A user can route planning, coding, and verification agents to different models via the shared routing layer without restarting or copying credentials.

---

## Tranche F — Verification harness

### F1: Write the harness
**Builder:** Design and implement a parity harness that:
- Reads the canonical WAVE1_BASELINE.json
- Runs live probes against all five unified layers (runtime, session, permissions, tools, routing)
- Each probe produces: pass/fail, evidence (output, screenshot, or structured result), machine-readable status
- "Completed" is impossible unless all acceptance checks pass or the agent explicitly returns blocked
- Produces a WAVE1_DELTA.json showing delta from baseline

**Acceptance:** `npm run verify:harness` runs end-to-end and exits 0 only when all five layers pass their probes.

### F2: Baseline current state
**Builder:** Run the harness against the current codebase BEFORE any unification changes. Produce WAVE1_BASELINE.json — the ground truth of where we start.

**Acceptance:** A machine-readable JSON file documenting the current state of each of the five layers, with probe results and evidence.

---

## Integration ownership (me — chief)

- Cross-tranche dependency tracking: A→B→C→D→E are sequential within each surface; F baselines first
- Conflict resolution between tranches
- Ensuring no two builders step on the same file without coordination
- Final conformance review before delivery to final critic

---

## Exit criteria for Wave 1

All five layers (runtime, session, permissions, tools, routing) satisfy:
1. One canonical entry point used by all surfaces
2. Automated acceptance tests that pass
3. Identical behaviour across all surfaces
4. Respects permission policy
5. Produces auditable evidence

WAVE1_DELTA.json shows zero remaining gaps.
