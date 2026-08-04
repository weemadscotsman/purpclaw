# PURPCLAW vs Hermes — Corrected Coverage Audit + Round 1 Ship Blockers
**Date:** 2026-07-17
**Author:** Quill
**Method:** walked every folder, read every key file, compared line counts against ~/AppData/Local/hermes/hermes-agent directly

---

## EXECUTIVE VERDICT

PURPCLAW is NOT a Hermes clone. PURPCLAW is an operations/organism runtime
built around an agent loop. Hermes is a coding-agent CLI built around a
conversation loop. They share the same general category but optimise for
different things.

**Correction to my initial (over-stated) gap list:** the bulk of the safety
infrastructure IS already present in PURPCLAW — ContextEngine, ToolRuntime
governance gate, permission profiles, checkpoint manager, approval callback,
gatekeeper RBAC. I missed most of it on first walk because I assumed
"missing feature" instead of reading the actual source. Round 1 ship
blockers close the visible wiring gaps, not the underlying capability.

---

## HONEST NUMBERS

| Metric | Hermes Agent | PURPCLAW |
|---|---|---|
| Files (excl tests/website/node_modules) | 1,593 | 206 lib + 70 root + 88 agents + 399 skills + 17 apps |
| Total LOC | 834,447 | ~31K lib (excluding app/, skills/, agents/) + 5,063 unified_api.js + 1,278 agent_tower.js + 2,393 orchestrator.js |
| Python | 670K LOC | ~140K LOC (8 root Python services + cognitive spine) |
| JS/TS | 164K LOC | ~50K LOC + large Next.js app |
| Skills | 234 | 399 |
| LLM providers | 20+ | 17 (unified base list) |
| Agent personas | 0 | 88 .md files |
| API routes | ~50 | 294 |
| Native tools | ~80 | 76 (31 native + 45 OmniCode MCP) |

---

## WHAT HERMES HAS THAT PURPCLAW DOES NOT (corrected — smaller list than first audit)

These were genuinely absent (verified by file:line search):

1. **Credential pool** — Hermes: agent/credential_pool.py = 2,554 lines.
   Multi-key rotation, OAuth refresh, source priority, exhaustion tracking.
   PURPCLAW: zero credential*. files. Flat .env only. No per-provider key
   rotation. Eddie pays $ when first key throttles.

2. **Multi-key per-provider failover at session level** — Hermes transparently
   rotates through pooled credentials on 401/429. PURPCLAW has one key per
   provider in .env; the agent-router.js does model failover but not key
   failover within a provider.

3. **Tirith-style prompt-injection scanner** — Hermes has tirith_security.py
   that scans tool output for indirect injection. PURPCLAW has no equivalent.

4. **Skill provenance + bundles** — Hermes agent/skill_bundles.py +
   skill_preprocessing.py + skills_ast_audit.py + skills_guard.py. Provenance
   tracks skill origin (bundled / hub / agent-created). PURPCLAW's
   lib/skill-registry.js does not track provenance.

5. **Per-call billing view** — Hermes has billing_view.py + account_usage.py
   + credits_tracker.py. PURPCLAW's cost-ledger.js logs to file but no UI
   surfaces per-call cost live.

These are 5 real gaps. The remaining 15 from the first audit were WRONG —
the infrastructure exists, just wasn't wired into every surface.

---

## WHAT PURPCLAW HAS THAT HERMES DOES NOT (sample of the 70+ items)

PURPCLAW wins on organism breadth, not on coding-agent narrow waist:

- **Cognitive spine** (cognitive_spine.py:7880) — 9-module cognitive layer
  with memory atoms, rules, modal logic, neuro-symbolic bridge, AutoDream,
  Spring Doctrine. Hermes has Honcho/Mem0 plugin.
- **7-layer memory model** vs Hermes's 1 (Honcho or Mem0).
- **88 agent personas** in agents/ — Hermes has 0 personas (single agent).
- **Swarm coordinator** (swarm_coordinator.js, 60K) + tower + divisions.
- **Digital Shaman** (creativity co-processor with controlled entropy).
- **Mochi companion** + companion chorus (18 species).
- **Personal Model Growth** — every kernel job recorded to training buffer,
  idle engine retrains between sessions.
- **Provider lane classification** (DIRECT_CHAT / HYBRID_TASK) via
  Usage Governor.
- **ACP / A2A** for inter-agent comms.
- **Knowledge Pool** (RAG service).
- **TUI taint mode** ("oopsie woopsie the packets did a fucky wucky").
- **400+ skills** as first-class runtime objects (Hermes skills are doc-only
  with tools to view them).

---

## ROUND 1 SHIP BLOCKERS — APPLIED 2026-07-17

### S1 — PATH SECURITY ✅ NEW (lib/path-security.js, 239 lines)
**Hard-block writes to:**
- C:\Windows, System32, SysWOW64, WinSxS
- C:\Program Files*, ProgramData
- /bin, /sbin, /etc, /boot, /proc, /sys (POSIX)
- ~/.ssh, ~/.aws, ~/.gnupg, ~/.kube, ~/.docker
- ~/.purpclaw/secrets, ~/.npmrc, ~/.gitconfig
- Outside project root (unless operator-initiated)
- Symlink escapes (realpath check)

**Wired into lib/tool-runtime.js** — runs after schema/guardrail,
before permission/governance. Returns `PATH_SECURITY_BLOCKED`.

**Override:** `PURPCLAW_PATH_SECURITY=off` (NOT recommended).

**E2E test result:**
- write to C:\Windows\System32 → PATH_SECURITY_BLOCKED ✓
- write to ~/.ssh/id_rsa → PATH_SECURITY_BLOCKED ✓
- write to project → APPROVAL_DENIED (correctly fires approval gate) ✓
- write to system32 + operator override → STILL BLOCKED ✓ (system paths
  are never allowed even for operator)

### S2 — INTERACTIVE APPROVAL PROMPT ✅ NEW (lib/approval-prompt.js, 100 lines)
**Module exports:** `prompt()` and `apply()`.

**Wired into bin/purpclaw.js run command's SSE handler** via fire-and-
forget Promise (sync SSE callback can't await).

User sees `[y]es/[n]o/[s]ession/[a]lways/[d]eny` prompt inline. Decision
written to lib/governance.js store synchronously, POSTed to
/api/approvals/:id as best-effort. Falls back to "deny" if stdin is
not a TTY (automation safety).

### S3 — LIVE COST DISPLAY ✅ MODIFIED (bin/purpclaw.js workflow_complete)
On every `workflow_complete` SSE event, the CLI now reads
lib/cost-ledger.js and prints:

```
  ─── cost ───────────────────────────────────────────────
  $0.0845  ·  1,234 in + 567 out tokens  ·  3 call(s)
```

TaskId-scoped when workflowId present, else global totals.

### S4 — CLEAN SIGINT ABORT ✅ MODIFIED (bin/purpclaw.js cmdRun)
- First Ctrl+C: prints "⚠ Ctrl+C — aborting workflow" + destroys SSE
  subscription + POSTs to /api/orchestrate/abort with reason='user_sigint'.
  Exits 130.
- Second Ctrl+C: force-exits immediately.
- SIGINT handler removed in `finally{}` to prevent leak into next CLI.

### S5 — CONTEXT COMPRESSION ✅ MODIFIED (lib/context-engine.js, lib/agent-loop.js)
**lib/context-engine.js** — defaults: contextLength 200K (was 204.8K),
threshold 0.4 (was 0.5). Env overrides:
```
PURPCLAW_CTX_LENGTH=200000
PURPCLAW_CTX_THRESHOLD=0.4
```

**lib/agent-loop.js** — re-check compression AT THE TOP OF EVERY TURN
(after turn 1). If the agent has expanded context past threshold
again after a previous compact, we compact again. Prevents
"context_length_exceeded" mid-session on long agent runs.

**Test:** 200 msgs (26.6K tokens) → compress → 4.3K tokens (84% reduction).

### S6 — ALL SMOKE TESTS PASS ✅

---

## FILES TOUCHED

```
NEW:
  E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/path-security.js   (239)
  E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/approval-prompt.js (100)

MODIFIED:
  E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/tool-runtime.js     (+14)
  E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/context-engine.js   (+10/-4)
  E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/agent-loop.js       (+13/-1)
  E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/bin/purpclaw.js         (+60)
```

Total: 6 files, ~340 lines added.

---

## WHAT THESE PATCHES ACTUALLY CHANGE

| Before | After |
|---|---|
| Agent could write to C:\Windows\System32 | Hard blocked by path security |
| CLI said "rerun with --approval=" | Inline Y/N prompt |
| Cost was logged to file | Live cost line on every completion |
| Ctrl+C killed CLI + orphaned orchestrator workflow | Clean abort, orchestrator notified |
| 100-turn agent session would explode | Re-compact every turn after threshold |

---

## ROUND 2 CANDIDATES (if you want it)

| # | Item | Effort | Class |
|---|---|---|---|
| G2 | Real approval queue on /api/chat too | 4 hr | safety |
| G5 | Workspace context model (auto-read relevant files) | 8 hr | quality |
| G8 | Tab completion for bash/zsh | 1 hr | polish |
| N1 | Credential pool (multi-key rotation per provider) | 6 hr | safety/cost |
| N2 | Schema validation tightening | 2 hr | discipline |
| N3 | Prompt-caching discipline (stable prefix markers) | 3 hr | cost |
| N4 | Tirith-style prompt-injection scanner | 4 hr | security |
| N5 | Skill provenance + bundles | 3 hr | hygiene |

Round 2 closes the safety/discipline class. Round 1 closes the user-
facing gap class. Both are real; Round 1 was the louder one.

---

## LESSON LEARNED (Quill self-note)

**Don't assume "missing" without reading the file.** First audit pass
declared 20 gaps; on the walk, ~15 of them were actually wired. The
trick: read lib/tool-runtime.js, lib/agent-loop.js, lib/governance.js,
lib/permission-manager.js, lib/checkpoint-manager.js BEFORE claiming
something is absent. Default assumption: if a Hermes-style feature
exists in the same category, PURPCLAW probably has it wired somewhere.
Verify with file:line, not inference.

— Quill, 2026-07-17
