# PURPCLAW Multi-CLI Gauntlet Bootstrap
## Universal Campaign Prompt — All Slots

**P0 findings from prior audit:**
1. Broken session construction + silent persistence fallback
2. HTTP/MCP permission bypasses
3. Provider settings not controlling real execution

**Sequencing rule (enforced):** Runtime → Permissions → Provider Routing → Integration

**Model budget (enforced on every agent):**
```
RESOURCE BUDGET:
- Slots 0 and 8 (Chief + Final Critic): Max/Ultra only
- Slots 1–7: Standard or High. No Ultra/Max.
- Child agents: Standard for searches/tests/inventory, High for implementation
- Child agents CANNOT inherit Ultra/Max from parent
```

---

## SLOT ALLOCATION

| Slot | Role | Model | Task |
|------|------|-------|------|
| 0 | Chief + Integration Owner | Max/Ultra | Owns ACTIVE_ASSIGNMENTS.json, worktrees, provenance, final integration |
| 1 | Runtime-audit verifier | Standard/High | Verify runtime loop, tool registry, session lifecycle against canonical parity doc |
| 2 | P0-A Persistence Builder | High | Fix broken session construction + silent persistence fallback |
| 3 | P0-A Blind Critic | High | Verify P0-A fixes, no overclaims |
| 4 | P0-B Permissions Builder | High | Fix HTTP/MCP permission bypasses |
| 5 | P0-B Blind Critic | High | Verify P0-B fixes |
| 6 | P0-C Provider Routing Builder | High | Fix provider settings not controlling real execution |
| 7 | P0-C Blind Critic | High | Verify P0-C fixes |
| 8 | Final Conformance Critic | Max/Ultra | Full system audit + sign-off |

---

## WORKING DIRECTORY
`E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW`

---

## SHARED STATE FILES

### ACTIVE_ASSIGNMENTS.json
Located at `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/agent_work/ACTIVE_ASSIGNMENTS.json`

Each slot updates their row when they start and finish.
```json
{
  "schema_version": 1,
  "slots": {
    "0": { "role": "chief", "status": "todo", "started_at": null, "done_at": null },
    "1": { "role": "runtime-audit", "status": "todo", "started_at": null, "done_at": null },
    "2": { "role": "P0-A-builder", "status": "todo", "started_at": null, "done_at": null },
    "3": { "role": "P0-A-critic", "status": "todo", "started_at": null, "done_at": null },
    "4": { "role": "P0-B-builder", "status": "todo", "started_at": null, "done_at": null },
    "5": { "role": "P0-B-critic", "status": "todo", "started_at": null, "done_at": null },
    "6": { "role": "P0-C-builder", "status": "todo", "started_at": null, "done_at": null },
    "7": { "role": "P0-C-critic", "status": "todo", "started_at": null, "done_at": null },
    "8": { "role": "final-critic", "status": "todo", "started_at": null, "done_at": null }
  },
  "handoffs": {
    "P0-A": { "builder": "2", "critic": "3", "status": "pending" },
    "P0-B": { "builder": "4", "critic": "5", "status": "pending" },
    "P0-C": { "builder": "6", "critic": "7", "status": "pending" }
  },
  "updated_at": null,
  "updated_by": null
}
```

---

## SLOT 0 — CHIEF + INTEGRATION OWNER

**Start after:** Nothing (initiates everything)
**Model:** Max/Ultra

**Tasks:**
1. Create `agent_work/ACTIVE_ASSIGNMENTS.json` with the schema above
2. Create 9 worktree branches: `git worktree add ../purpclaw-slot-N -b gauntlet/slot-N`
3. Read `docs/parity/CANONICAL_PARITY_PRIORITY.md` and `docs/parity/WAVE1_MASTER_GOAL.md`
4. Create `docs/parity/GAUNTLET_P0_FINDINGS.md` documenting the three P0 issues with evidence
5. For each P0 (A, B, C): verify the builder lane is unblocked before allowing them to start
6. Coordinate handoffs: builder completes → critic reviews → integration owner confirms
7. After all three P0s pass, slot 8 (final critic) is unblocked

**Output:** ACTIVE_ASSIGNMENTS.json updated, GAUNTLET_P0_FINDINGS.md written, all worktrees created

---

## SLOT 1 — RUNTIME-AUDIT VERIFIER

**Start after:** Slot 0 creates worktrees
**Model:** Standard/High

**Tasks:**
1. Read `lib/agent-loop.js`, `lib/agent-runtime.js`, `lib/agent-session.js`
2. Audit: which surfaces (CLI, TUI, WebUI, API) call which loop, registry, and provider?
3. Audit: session create/read/update/delete/inspect — is the lifecycle consistent?
4. Audit: tool registry — are tools deduplicated? any divergence?
5. Output: `agent_work/RUNTIME_AUDIT.md` with findings (present/not-present/failing)
6. Set ACTIVE_ASSIGNMENTS.json slot 1 = done

---

## SLOT 2 — P0-A PERSISTENCE BUILDER

**Start after:** Slot 1 (runtime audit) confirms session subsystem has issues
**Model:** High
**Branch:** `gauntlet/slot-2`

**P0 finding:** Broken session construction + silent persistence fallback

**Tasks:**
1. Read `lib/agent-session.js`, `lib/agent-loop.js` — find session construction code
2. Find where silent fallback to persistence happens (no error thrown, just fails quietly)
3. Fix: session construction must throw on failure OR fall back with an explicit warning log
4. Add `session:construction_audit` to the proof ledger
5. Write test: construct invalid session, verify it either throws or logs explicit warning
6. Set ACTIVE_ASSIGNMENTS.json slot 2 = done
7. Notify slot 3 (critic) via: update ACTIVE_ASSIGNMENTS.json handoffs.P0-A.status = 'builder_done'

---

## SLOT 3 — P0-A BLIND CRITIC

**Start after:** Slot 2 marks P0-A done in ACTIVE_ASSIGNMENTS.json
**Model:** High
**Branch:** `gauntlet/slot-3`

**Tasks:**
1. Read the P0-A fix in `lib/agent-session.js`
2. Verify: does the fix actually address broken session construction?
3. Verify: does the silent fallback get an explicit warning or throw?
4. Run the test from slot 2: does it pass?
5. Do NOT look at the fix in advance — judge purely by the test result
6. If fail: update ACTIVE_ASSIGNMENTS.json handoffs.P0-A.status = 'critic_reject' + notes
7. If pass: update ACTIVE_ASSIGNMENTS.json handoffs.P0-A.status = 'critic_pass'
8. Set ACTIVE_ASSIGNMENTS.json slot 3 = done

---

## SLOT 4 — P0-B PERMISSIONS BUILDER

**Start after:** Slot 3 (P0-A critic) passes P0-A
**Model:** High
**Branch:** `gauntlet/slot-4`

**P0 finding:** HTTP/MCP permission bypasses — tools can make outbound HTTP requests that bypass the permission engine

**Tasks:**
1. Read `lib/exec-policy.js`, `lib/tools/http.js` or equivalent HTTP tool
2. Read `lib/mcp/index.js` — MCP tool permission handling
3. Find the bypass: how does an HTTP tool call escape the permission engine?
4. Fix: all HTTP/MCP outbound calls must pass through `exec-policy.js` evaluation first
5. Add `permission:bypass_audit` to the proof ledger
6. Write test: attempt HTTP request through MCP without permission — should be blocked
7. Set ACTIVE_ASSIGNMENTS.json slot 4 = done
8. Notify slot 5 (critic)

---

## SLOT 5 — P0-B BLIND CRITIC

**Start after:** Slot 4 marks P0-B done
**Model:** High
**Branch:** `gauntlet/slot-5`

**Tasks:**
1. Run the HTTP bypass test from slot 4
2. Verify: does the fix actually block unauthorized HTTP/MCP calls?
3. If fail: update ACTIVE_ASSIGNMENTS.json handoffs.P0-B.status = 'critic_reject'
4. If pass: update ACTIVE_ASSIGNMENTS.json handoffs.P0-B.status = 'critic_pass'
5. Set ACTIVE_ASSIGNMENTS.json slot 5 = done

---

## SLOT 6 — P0-C PROVIDER ROUTING BUILDER

**Start after:** Slot 5 (P0-B critic) passes P0-B
**Model:** High
**Branch:** `gauntlet/slot-6`

**P0 finding:** Provider settings in config do not control which provider is actually called at runtime

**Tasks:**
1. Read `lib/llm-provider.js`, `lib/model-router.js`, `lib/agent-loop.js`
2. Trace: from `LLM_PROVIDER=minimax` env var → actual provider selected at runtime
3. Find where the disconnect happens: config says one thing, execution uses another
4. Fix: routing layer must read from canonical config, not fall back to hardcoded defaults
5. Add `provider:routing_audit` to the proof ledger
6. Write test: set `LLM_PROVIDER=deepseek`, verify actual calls go to deepseek
7. Set ACTIVE_ASSIGNMENTS.json slot 6 = done
8. Notify slot 7 (critic)

---

## SLOT 7 — P0-C BLIND CRITIC

**Start after:** Slot 6 marks P0-C done
**Model:** High
**Branch:** `gauntlet/slot-7`

**Tasks:**
1. Run the provider routing test from slot 6
2. Verify: does setting LLM_PROVIDER actually control the called provider?
3. If fail: update ACTIVE_ASSIGNMENTS.json handoffs.P0-C.status = 'critic_reject'
4. If pass: update ACTIVE_ASSIGNMENTS.json handoffs.P0-C.status = 'critic_pass'
5. Set ACTIVE_ASSIGNMENTS.json slot 7 = done

---

## SLOT 8 — FINAL CONFORMANCE CRITIC

**Start after:** Slots 3, 5, 7 all mark their P0s as 'critic_pass'
**Model:** Max/Ultra

**Tasks:**
1. Read all three P0 fixes (slots 2, 4, 6) in their worktrees
2. Read the canonical parity statement from CANONICAL_PARITY_PRIORITY.md
3. Verify: do all three fixes satisfy the canonical parity statement?
4. Verify: do fixes use shared runtime, have tests, work across surfaces, respect permission policy?
5. Produce: `docs/parity/GAUNTLET_FINAL_REVIEW.md` with:
   - Each P0 fix: evidence tested / evidence missing
   - Integration sign-off or rejection
   - Remaining items from sprint still open
6. If sign-off: update ACTIVE_ASSIGNMENTS.json slot 8 = done + status = 'APPROVED'
7. If rejection: update slot 8 = done + status = 'REJECTED' + list of blockers

---

## RULES FOR ALL SLOTS

1. **File ownership:** Each slot writes to its own worktree. No slot writes to another slot's worktree without permission.
2. **No enthusiastic modification:** If a slot encounters a file it doesn't own being modified, it reports in ACTIVE_ASSIGNMENTS.json notes and defers.
3. **Sequencing enforced:** P0-B cannot start until P0-A is critic_pass. P0-C cannot start until P0-B is critic_pass.
4. **Proof ledger:** Every fix adds a proof ledger entry with: P0 id, fix description, test run, result.
5. **Child agents:** Any spawned child agent uses Standard reasoning. No Ultra/Max children.
6. **ACTIVE_ASSIGNMENTS.json is the single source of truth** for who is doing what and whether they've passed.
7. Each slot appends to `agent_work/gauntlet-log.jsonl` on completion with: slot, role, status, output_summary
