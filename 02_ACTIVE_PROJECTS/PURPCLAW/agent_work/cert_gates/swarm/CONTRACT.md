# SWARM CERT GATE — CONTRACT

**Cert ID:** `agent_work/cert_gates/swarm/`
**Date opened:** 2026-08-17
**Slice:** `packages/swarm/` — multi-agent dispatch (parity with Kimi 300, Antigravity 5, Claude Task, DeepSeek Harness, Hermes, ChatGPT custom, Kimi CLI)
**Status:** open

---

## What this cert certifies

The lane is open. Specifically, given a real agent registry and a real task string:

1. **Real registry load** — `agent-registry.js` reads from `agent_work/agents/root/*.md` (post-cleanup integration, 2026-08-17)
2. **Persona resolution** — `resolvePersona()` matches a task keyword against real persona metadata, not a hardcoded name
3. **Parallel dispatch** — N sub-agents (2-3 in cert, 1..16 supported) are spawned in parallel via the existing `AgentRuntime` queue
4. **Completion** — every sub-agent emits a `subagent.completed` event recorded in the SwarmReport
5. **Proof artifact** — a sha256 hash + a JSON proof file on disk, written under `proofDir/`
6. **No mocks** — every test path runs the real `agent-registry.js`, real `agent-runtime.js`, real `dispatcher.js`

## What this cert does NOT certify (honest scope)

- **Kimi 300-subagent scale** — we certify 2-3, not 300. The lane is open, the ceiling is untested.
- **Antigravity 5-parallel Manager View UI** — terminal-only cert. UI lives in `apps/desktop/src/manager/` (TODO).
- **Long-horizon 12-hour session log** — cert runs are sub-second.
- **Cross-sub-agent memory** — each sub-agent is a fresh instance.
- **MCP-backed sub-agents** — sub-agents are in-process; MCP wire-up is `lib/control/drivers/mcp.js` + future adapter.
- **Live coordinator integration** — `services/swarm/coordinator.js` is broken (task_decomposer missing, EventBus 7782 down); this cert is independent of that lane.

## Run

```
node --test tests/swarm/dispatcher.test.js
```

From project root. All 8 tests must pass.

## Assertion criteria (8/8 required for PASS)

| # | Assertion | Why it matters |
|---|---|---|
| T01 | `registry.listAgents().length >= 10` | Confirms the persona-md fallback actually loads >10 real personas |
| T02 | `resolvePersona(task)` returns a persona present in the registry | Real resolution, not a hardcoded name |
| T03 | `dispatch(parallel=2)` returns 2 completions, `all_completed=true`, `proof_path` exists | The core lane |
| T04 | Two consecutive `dispatch(parallel=3)` calls both yield 3 completions; 2+ proof files on disk | Cert mode, deterministic-shape proof hashes |
| T05 | `parallel=0` and `parallel=17` rejected with range error | Bound enforcement |
| T06 | empty task rejected | Input validation |
| T07 | null registry rejected | No silent fall-through |
| T08 | `hashArtifact` deterministic on identical content | Proof chain integrity |

## Cert verdict format

`agent_work/cert_gates/swarm/result.json`:
```json
{
  "schema": "purpclaw.cert-gate.swarm.v1",
  "cert_id": "agent_work/cert_gates/swarm/",
  "verdict": "PASS" | "DEGRADED" | "FAIL",
  "date": "2026-08-17T...Z",
  "tests_total": 8,
  "tests_pass": 8,
  "tests_fail": 0,
  "duration_ms": ...,
  "parity_gaps_closed_partial": [
    "Kimi Agent Swarm (300 sub-agents) — 2-3 in cert, lane open",
    "Antigravity 2.0 Manager View (5 parallel) — terminal cert, UI in apps/desktop/src/manager/",
    "Claude Code Task tool — persona-resolved dispatch, registry-driven"
  ],
  "parity_gaps_remaining": [
    "MCP client (Kimi CLI, Claude, Antigravity)",
    "Slash commands (/plan, /compact, /clear, /status)",
    "Resume/fork/search on event stream (DeepSeek)",
    "Built-in Chrome browser (Antigravity)",
    "Voice mode loop (ChatGPT app)",
    "Custom GPTs (ChatGPT app)"
  ]
}
```

## Honest label

This cert is **partial** parity. The substrate for multi-agent is real. The ceiling (Kimi's 300) and the surface (Antigravity's Manager View UI) are not yet tested.
