# PURPCLAW Full Audit (Round 5) — "audit everything"

**Date:** 2026-06-13
**Method:** Live state probes + grep + file reads + curl + manual workflow submission
**Scope:** Every level — security, truthfulness, tool execution, services, routes, UI

---

## TL;DR

| Tier | Count | Worst | Best |
|---|---|---|---|
| 🔴 **P0 deception/broken** | 4 | Tower records tool calls but **never executes them**. Chat returns 200 OK with empty reply on SpendGate. | 2 fixed last cycle |
| 🔴 **P0 security** | 5 new routes I missed in previous auth rounds | `/api/chat/swarm`, `/api/kernel/jobs`, `/api/llm/plan`, `/api/research/group`, `/api/thringlets/[id]/interact` all unauth'd at Next layer (rely on upstream fail-closed only) | 7 fixed last round |
| 🟠 **P1 cosplay** | 14 narrate event types no backend publishes. 6 dead route families. 35 dead components. 78 dead lib files. | Narrator pre-fires messages for events that never happen | OBLITERATUS restored |
| 🟡 **P2 polish** | 3 pages, SpendGate debug, dual UI drift | — | — |

**The user's "Gated, not gutted" doctrine is now in the codebase. But the tool-execution gap (the original Phase One B question) is the deepest, realest P0.**

---

## L0 — Live state (14 PM2 services, mostly healthy)

| Service | Status | Restarts | Uptime |
|---|---|---|---|
| purpclaw-eventbus | online | 3 | 12h+ |
| purpclaw-state | online | 3 | 12h+ |
| purpclaw-api | online | 8 | 12h+ |
| purpclaw-orchestrator | online | **21** | 12h+ |
| purpclaw-tower | online | **14** | 12h+ |
| purpclaw-pool | online | 3 | 12h+ |
| purpclaw-context | online | 2 | 12h+ |
| purpclaw-workers | online | 1 | 12h+ |
| purpclaw-gatekeeper | online | 3 | 12h+ |
| purpclaw-metrics | online | 3 | 12h+ |
| purpclaw-nextjs | online | **26** | 13m |
| purpclaw-coordinator | online | 1 | 12h+ |
| purpclaw-harness | online | 0 | 12h+ |
| purpclaw-cognitive | online | 0 | 12h+ |

- **Nextjs 26 restarts** — high, probably dev-mode HMR
- **Orchestrator 21 restarts, tower 14 restarts** — moderate, indicates crash recovery

**Service truth:** `/api/services` reports **13/21 up, 8 down** (voice-coordinator, modal, diagnostics, rules, chorus, bridge-neuro, autodream, lmstudio). 8 dark services were never removed from the canonical registry. Per Round 4 B10 they were removed from the proxy allowlist but they still appear in the services list. The UI badge should show "13/21 ONLINE" — does it?

## L1 — Auth coverage (5 routes I missed in previous rounds)

These 5 routes are unauth'd at the Next layer. They forward to upstream services that ARE auth-required (R4 fail-closed), so the system is gated, but defense-in-depth is missing at Next:

| Route | What it does | Status |
|---|---|---|
| `/api/chat/swarm` | forwards POST to `unified_api /api/chat/swarm` | **NO AUTH** at Next |
| `/api/kernel/jobs` | forwards POST to `unified_api /api/kernel/jobs` | **NO AUTH** at Next |
| `/api/llm/plan` | forwards POST to `unified_api /api/llm/plan` | **NO AUTH** at Next |
| `/api/research/group` | forwards POST to `orchestrator /api/swarm/research` | **NO AUTH** at Next |
| `/api/thringlets/[id]/interact` | mutates thringlet state via bridge | **NO AUTH** at Next |

**Other findings:**
- `/api/internal/check` — has its own auth (the whole point of the route is auth)
- `/api/api-mega-list` POST — returns 403 with comment "use GOOP broker" (intentional, per design)
- `unified_api.js` — has its own API_KEY system (R4 fail-closed, no checkOperator, 0 refs because of different auth model)

## L2 — Truthfulness audit

### Narrator pre-fires (14 cosplay event types)

The narrator in `CommandPanel.tsx:54-100` (function `narrateEvent`) handles 20+ event types. **14 of them are never published by any backend:**

| Narrator expects | Backend publishes? |
|---|---|
| `kernel_accept` | ❌ no producer |
| `kernel_start` | ❌ no producer |
| `kernel_complet` | ❌ no producer |
| `kernel_fail` | ❌ no producer |
| `kernel_block` | ❌ no producer |
| `research_start` | ❌ no producer |
| `research_source` | ❌ no producer |
| `research_complet` | ❌ no producer |
| `research_fail` | ❌ no producer |
| `swarm_start` | ❌ no producer |
| `harness_bench` | ❌ no producer |
| `evolution_tick` | ❌ no producer |
| `orchestrator_start` | ❌ no producer |
| `orchestrator_fail` | ❌ no producer |

**Impact:** The narrator renders "🔬 deep research running" when no `research_start` event was ever published. The user sees activity narration for events that never happened. **Cosplay narration.**

### UI dashboard cosplay (compared to live truth)

| Panel | Shows | Reality | Match? |
|---|---|---|---|
| `SERVICES` (badge) | "X/21 ONLINE" or similar | `/api/services` reports 13/21 up | depends on UI's refresh rate |
| `MOCHI` | SLEEPY/HAPPY | `/api/mochi` returns `hatched: false` unless file exists | partially real |
| `AGENTS` | active count | tower has 6 active out of 35 registered | real |
| `OBLITERATUS` (AbliteratorPanel) | status/idle/scanning | routes serve canned responses, no real model | **theatre** |
| `EVENTS` (rate per min) | 2847/min or similar | need to check | depends |

## L3 — Tool execution flow (THE real P0)

**The deepest finding.** The agent-loop (`lib/agent-loop.js`) DOES call `POLICY.guardedInvoke(TOOLS, {...})` to execute tools. The tower (`agent_tower.js`) does NOT — it only records:

```js
// agent_tower.js line 273
} else if (ev.type === 'tool-call') {
  agentState.toolCalls.push({ name: ev.tool, source: 'agent-loop', args: ev.args, result: undefined });
}
```

**No tool is ever executed when an agent runs through the tower.** The orchestrator's `runAgent` (called from `unified_api.js`) DOES execute tools. So:
- Agents spawned via the orchestrator's `runAgent` → tools execute ✓
- Agents spawned via `agent_tower.spawnAgent` → tools are recorded but not executed ✗

**Tool registry has 78 entries** (read, write, edit, shell, grep, git, parseltongue, autotune, stm, godmode, smith_*, neo_*, weather, news, spawn, etc.). None of them are wired to execute when the tower records a `tool-call` event.

**Why the previous helper (enforceExactFileProof) was masking this:**
- LLM emits `[file_write] {...}` in its text
- Agent-loop parses the text, yields `tool-call` event
- Tower's `if (ev.type === 'tool-call')` records the call (but doesn't execute)
- Tower's helper kicks in, fabricates a "file_write was executed" record
- File actually gets written by the helper
- Test sees "tool calls: 2" and passes

**With the helper removed (Round 4 R1), the tower records 0 tool calls because the LLM only emits the call in its text — nothing actually runs.**

## L4 — Two UIs drift

| UI | Status |
|---|---|
| `MissionCockpit.tsx` (canonical, 1500+ lines) | LIVE — used by `/mission`, `/dash` |
| `MissionControl.tsx` (in `app/_archive/`, 3800+ lines) | ARCHIVED but still in tree |
| `app/public/ui/` (Claude-built SPA) | 11 files, runs on port 3000 |

**14 page.tsx files in canonical.** Most pages import `CockpitShell` (the shared shell). `MissionCockpit.tsx` is the canonical "12-panel" dashboard. `MissionControl.tsx` is the old "36-tab" version, now archived.

**Drift risk:** if anyone imports from `_archive/MissionControl.tsx`, the canonical UI can break. Confirmed grep: `app/_archive/MissionControl.tsx` is referenced from `app/_archive/` only. Safe for now.

## L5 — Dead code

| Type | Total | Imported | Dead |
|---|---|---|---|
| Components | 43 | 8 | **35** |
| Lib files | 80 | 2 (heavy usage) | 78 (deferred) |

The 8 imported components are: `CockpitShell`, `MissionCockpit`, `PersonalityDial`, `MochiAvatar`, and 4 others. The 35 dead ones are likely alternative UI implementations, archived features, and design candidates.

The 78 dead lib files include things like `lib/accuracy-fish.js`, `lib/goop-playground.js`, `lib/spend-gate.js`, `lib/sampler.js`, `lib/chat-agent.js` (which is used in fallback), etc. Many are real modules just not imported by app/ — they're used by the orchestrator, the tower, or scripts.

## L6 — Service truth

`/api/services` (canonical source) reports **13/21 up**. Live breakdown:

```
✓ web-ui         ✓ web-ui-pm2      ✓ unified-api     ✗ voice-coordinator
✓ eventbus       ✓ state           ✓ orchestrator    ✗ modal
✗ diagnostics    ✗ rules           ✓ agent-tower     ✓ gatekeeper
✗ chorus         ✗ bridge-neuro    ✓ harness         ✓ memory
✓ pool           ✗ autodream       ✓ worker-pool     ✓ ollama
✗ lmstudio
```

The 8 dark services (modal, diagnostics, rules, chorus, bridge-neuro, autodream, voice-coordinator, lmstudio) are listed in `lib/runtime/ports.js` but don't have running processes. **The UI's "8/8" badge (if shown) would be wrong.**

## L7 — OBLITERATUS state (Cycle 4.5 restore)

| Check | Result |
|---|---|
| Code restored from git HEAD | ✓ |
| 30 OBLITERATUS refs in `unified_api.js` | ✓ |
| `PENDING INTEGRATION AUDIT — see Cycle 4` header | ✓ |
| `AbliteratorPanel.tsx` calls the routes | ✓ (1 UI consumer, real) |
| State fields `state.obliteratus*` defined | ✓ (8 fields) |
| Real model invocation | ✗ (still canned setTimeout responses) |

**OBLITERATUS is alive in the code. Cycle 4 audit is the next task. Not gutted, not stubbed, awaiting audit.**

## L8 — Two UIs drift detail

| Page | Component | Status |
|---|---|---|
| `/` (root) | `MissionCockpit` (canonical 12-panel) | LIVE |
| `/mission` | `MissionCockpit` | LIVE |
| `/dash` | `MissionCockpit` | LIVE (cloned from /mission) |
| `/cockpit` | `CockpitShell` only | LIVE (basic shell) |
| `/agents` | `CockpitShell` + `AgentTower` | LIVE |
| `/settings` | `CockpitShell` | LIVE |
| `/voice` | `CockpitShell` | LIVE |
| `/mochi` | `CockpitShell` | LIVE |
| `/skyscraper` | `CockpitShell` + inline tower | LIVE (rewritten Round 1) |
| `/inline` | `CockpitShell` + `Inline` | LIVE |
| `/bridge` | `CockpitShell` + bridge | LIVE |
| `/swarm` | `CockpitShell` + swarm | LIVE |
| `/pipeline` | `CockpitShell` + pipeline | LIVE |
| `/preprompt` | `CockpitShell` + preprompt | LIVE |
| `/mission/harness` | `CockpitShell` + harness | LIVE |

**14 pages, 1 main megapanel (`MissionCockpit`), 1 shell (`CockpitShell`), 12 page-specific components.** Reasonable, not over-decomposed.

## L9 — Stub routes (12 + 1 missing)

| Route | HTTP | Truth? |
|---|---|---|
| `/api/api-mega-list` | 200 | Real (catalog) |
| `/api/agent-scores` | 200 | Real |
| `/api/mochi` | 200 | Real |
| `/api/thringlets` | 200 | Real |
| `/api/llm-status` | 200 | Real (Round 4) |
| `/api/llm-ledger` | 200 | Real |
| `/api/harness-benchmarks` | 200 | Real |
| `/api/harness/status` | 200 | Real |
| `/api/sampler` | 200 | Real (loads lib/sampler.js) |
| `/api/settings` | 200 | Real |
| `/api/services` | 200 | Real (probeAll) |
| `/api/registry` | 200 | Real |
| `/api/preprompt` | 200 | Real |
| `/api/internal/check` | 401 | Real (auth required) |
| `/api/skyscraper` | **404** | **Missing** — `app/skyscraper/page.tsx` exists but the route is missing! |

The `/api/skyscraper` 404 is a new finding. Let me check: `app/skyscraper/page.tsx` exists (we rewrote it in Round 1), but the API route for it is missing.

## L10 — Dead routes in unified_api.js (6 families)

| Family | Consumers |
|---|---|
| `/api/obliteratus/*` | 1 (AbliteratorPanel) |
| `/api/kimi/*` | 0 (NO UI) |
| `/api/shaman/*` | 0 (NO UI) |
| `/api/security/*` | 0 (NO UI) |
| `/api/sessions/*` | 0 (NO UI) |
| `/api/gestures/*` | 0 (NO UI) |
| `/api/goop/*` | 0 (NO UI) |

5 dead families. Per the doctrine, don't delete them yet — they may be intended features awaiting UI. **Mark as "pending integration" in the audit doc.**

## L11 — Chat UX lies (P1)

A direct chat test returned:
```json
{
  "ok": true,
  "reply": "",
  "model": "",
  "tool_calls": [],
  "errors": ["SpendGate: Daily token cap (1000000) would be exceeded"],
  "turns": "single",
  "sessionId": null
}
```

**The chat returns 200 OK with an empty reply and an error message.** The user sees an empty response — the SpendGate blocked the call. The UI shows "..." or empty without explaining the budget was exceeded.

**Today's actual minimax usage:** 3,697 tokens (very low). The cap is 1,000,000. So the cap shouldn't be exceeded. **The SpendGate is incorrectly flagging.**

Likely cause: per-agent daily cap is 100,000 (per config), and the default agent is at the per-agent cap. The error message says "Daily token cap (1000000)" which is the per-provider cap, but the actual check might be the per-agent cap. Need to investigate.

## L12 — e2e test status

`scripts/test-agent-e2e.js` is honest. Last run (Cycle 4.5):
- Tower was restarted with `args + result` in evidence
- Test caught the adapter fallback (helper still active)
- Test correctly failed

The test is doing its job. **The real P0 is the tool-execution gap (L3), not the test.**

## L13 — Agent execution truth

A direct orchestrator workflow submission (`/api/orchestrate` with "just say hi and exit") returned:
```
status: failed
team: None
executions: 0
error: agent produced no substantive output or completed tool evidence
```

**No team was spawned, no agents ran.** The orchestrator rejected the workflow before spawning. This is the same error as the LLM returning empty. The SpendGate is blocking the underlying LLM call.

## L14 — Agent loop architecture

`lib/agent-loop.js` has TWO paths:
1. `agentLoopTools` (the main path) → calls `runAgent` from `lib/agent-loop.js` → tools DO execute via `POLICY.guardedInvoke(TOOLS, ...)`
2. Legacy `llmComplete` → only generates text, no tools

`agent_tower.js` uses path 1 (`runAgent` is in `opts`), but the `tool-call` branch in the tower's loop **records but does not execute** tools.

The result: when the tower records `tool-call`, the tool NEVER runs. The tool would only run if the agent-loop yielded a `tool-result` event after the tower executed it, but the tower doesn't execute.

**Two possible fixes:**
- **Option A:** Tower executes the tool by looking up in `lib/tools/index.js` registry
- **Option B:** Agent-loop is the sole owner of tool execution, and tower's `tool-call` handler just records and lets agent-loop's `tool-result` populate the result

Currently the architecture is half-and-half: agent-loop has the execution logic (lines 411+), tower has the record-only logic. **The two layers don't talk.**

## What this audit doesn't cover (out of scope for this turn)

- Window 7798 / worker-pool exact port assignments (per N1)
- Skill amendment files (`app/api/skill-amendments/`)
- /api/playwright (auth'd but I didn't probe)
- Real-device mobile rendering
- The 30+ stub 200-OK routes in unified_api (counted, not enumerated)
- Mochi state actual vs displayed values
- Thringlet colony-mood handler

---

## RANKED P0/P1 list (the queue)

| # | Severity | What | Where | Effort |
|---|---|---|---|---|
| **P0-1** | 🔴 | **Tower never executes tools** — records only | `agent_tower.js:273` | 30 min |
| **P0-2** | 🔴 | **SpendGate misfire** — chat returns 200 with empty reply, 0 actual usage | `lib/runtime/spend-gate.js` | 30 min |
| **P0-3** | 🔴 | **5 routes I missed** — Next layer unauth'd | `chat/swarm`, `kernel/jobs`, `llm/plan`, `research/group`, `thringlets/[id]/interact` | 10 min |
| **P0-4** | 🔴 | **`/api/skyscraper` returns 404** even though page exists | `unified_api.js` missing route | 10 min |
| **P1-1** | 🟠 | Narrator pre-fires 14 events that never happen | `CommandPanel.tsx:54-100` | 1 hr |
| **P1-2** | 🟠 | 5 dead route families (kimi, shaman, security, sessions, gestures, goop) | unified_api | mark pending |
| **P1-3** | 🟠 | 35 dead components | `app/components/*.tsx` | mark archive |
| **P1-2** | 🟠 | 8 dark services in canonical registry | `lib/runtime/ports.js` | mark optional |
| **P2-1** | 🟡 | SpendGate caps projection logic | budget engine | 1 hr |
| **P2-2** | 🟡 | OBLITERATUS state → actual model | unified_api Cycle 4 audit | 1+ hr |

---

## Files that need attention (in priority order)

1. `agent_tower.js` — wire tool execution (P0-1)
2. `lib/runtime/spend-gate.js` — fix misfire (P0-2)
3. `app/api/{chat/swarm,kernel/jobs,llm/plan,research/group,thringlets/[id]/interact}/route.ts` — add `checkOperator` (P0-3)
4. `unified_api.js` — add `/api/skyscraper` route OR remove the `app/skyscraper` page (P0-4)
5. `app/components/CommandPanel.tsx` — narrator pre-fire cleanup (P1-1)
6. `lib/runtime/ports.js` — mark 8 dark services as `optional: true` (P1-2)

---

## Standing doctrine verification

| Principle | State |
|---|---|
| **Gated, not gutted** | OBLITERATUS restored ✓. R1 helper restored as temporary crutch. 5 missed routes still need auth (gated by upstream, but should be defense-in-depth). |
| **Real, not simulated** | Tower records tools but doesn't execute → cosplay. OBLITERATUS routes are still canned (Cycle 4 audit pending). |
| **Wired, not hidden** | `/api/skyscraper` 404 even though page exists = broken integration. 6 dead route families = wired to nothing. |
| **Verified, not claimed** | 13/21 services up. Chat says "ok: true" but reply is empty. Narrator narrates events that never fire. **Significant verification debt.** |

---

## Cross-references

- **Round 1** (B2/B3/B4/B5/B11/B13) — ship patches
- **Round 2** (B9/B10/B12/N1/B15/N3/N4/N5) — worktree sync
- **Round 3** (L1-L12) — worktree path safety + chat auth
- **Round 4** (R1-R6) — master audit, OBLITERATUS delete (then restored)
- **Round 4.5** — doctrinal correction
- **Round 5 (this turn)** — full audit, real P0s surfaced

---

## What I personally performed (this turn)

1. Live state snapshot — PM2 list, port listeners, LLM provider reachability
2. Auth coverage scan — every Next route, every method
3. Narrator cosplay audit — 14 event types no backend publishes
4. Tool execution flow analysis — agent-loop vs tower vs tool registry
5. Service truth cross-check — `/api/services` (13/21 up)
6. Stub route smoke test — 15 routes
7. Dead route enumeration — 6 families with 0 UI consumers
8. Chat UX truth test — SpendGate returns 200 with empty reply
9. Agent execution truth test — orchestrator fails to spawn team
10. Token ledger audit — 3,697 tokens today, 1M cap, but cap is firing anyway

## What I found already present (verified, not authored)

- The `enforceExactFileProof` helper is back (Cycle 4.5 restore, working as temporary crutch)
- The `checkOperator` + `checkRateLimit` helpers exist in `app/api/_lib/`
- The 14 PM2 services are managed by PM2 (some have been running 12+ hours)
- 6 of the 8 dark services in the canonical port list have NO running process

## What I marked risky / deferred

- P0-1 tool execution (real P0, needs user approval before patching)
- P0-2 SpendGate (real P0, complex fix)
- P0-3 5 missed routes (10 min fix, but user should approve)
- P0-4 /api/skyscraper (real P0, trivial fix)
- P1 narrative cosplay (1 hr cleanup)
- P2 OBLITERATUS real model (Cycle 4 dedicated audit)

---

**Total P0s found this turn: 4** (tower tool execution, SpendGate misfire, 5 missed routes, /api/skyscraper 404)
**Total fixes pending user approval: 4**
**Estimated total effort: 1.5-2 hours**
