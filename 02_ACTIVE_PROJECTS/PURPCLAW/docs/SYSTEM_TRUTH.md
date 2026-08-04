# SYSTEM TRUTH — PurpClaw Real vs. Cosplay (2026-06-09)

> ⚠️ HISTORICAL AUDIT from 2026-06-09. Numbers below reflect that date.
> For current verified counts (2026-07-03), see `docs/generated/DOC_VS_STACK_COMPARISON.md`.
> Key changes since this audit: tools-pc.js (49 tools) deleted; OmniCode MCP confirmed separate repo.

> Grounded in code, not docs. Source: 11 end-to-end flow audits this session.
> Marketing numbers in README/ARCHITECTURE are inflated; these are the real counts.

## One-sentence truth

PurpClaw is real, ambitious code with strong organs — a genuine vault, real tool
registry, real HMAC auth, real LoRA scripts, real memory engines — but its
arteries aren't connected: the good parts are orphaned, unbootable, or reachable
from exactly one CLI command, while the GUIs, the swarm, and the docs all point
at the downgraded version.

## Fix thesis

**Contracts at the seams**: one engine, one `/api/chat` door, one event schema,
one tool-result rule. Wire those and 7 of the surface symptoms close at once.

## The honest scoreboard (11 audits)

| # | System | Verdict |
|---|---|---|
| 1 | Swarm execution (tower) | ❌ cosplay — agents are single `llmComplete()` calls, zero `tool_calls`. 35 agents produce text, can't touch the 176 tools. Mouths, not hands. Note (2026-07-03): tower now has 42 named personas; agent-loop wired for tool calls. |
| 2 | Cognitive spine loop | ❌ open loop — spine is written-to, never read-back; Swarm Coordinator :7898 (validation gate + worktree sandbox + spine fact-writes) was orphaned/bypassed by `run`. **(Wire added 2026-06-09: orchestrator `swarm <task>` → POST :7898 `/api/coordinate`.)** |
| 3 | CLI/TUI/Web parity | ❌ no agentic HTTP door — only CLI `ask` runs the real `agent-loop.runAgent`; `/api/chat` is toolless; dead `chat-agent.js`. **#1 fix.** |
| 4 | Browser/Playwright tools | ❌ `browser_open` uses banned `cmd /c start` and lies `ok:true`; `browser_screenshot` needs uninstalled `playwright-core`; `browser_click/type` vaporware. |
| 5 | Survivor router | ❌ orphaned dead code; real failover is 2-tier (primary → 1 local backstop); `streamChat` has no fallback. |
| 6 | 7-layer memory | ❌ unbootable — `numpy` imported top-level, undeclared + not installed; advanced layers silently degrade to `None`. |
| 7 | Deep-audit/scorecard | ❌ recurses, false-green. |
| 8 | Karpathy ratchet | ❌ train-and-drop — no eval, no accept/reject, no adapter deploy, no revert; torch/peft/trl not installed. |
| 9 | EventBus interconnect | ❌ write-mostly firehose — ~13 publishers, the one core subscriber (`context-bus`) is protocol-deaf (wrong route + wrong envelope). No shared client. |
| 10 | Service registry | ❌ static hardcoded list, no live discovery. |
| 11 | HMAC worker auth | ✅ real & enforced (best subsystem). Fix: no fail-open on remote bind. |

## Real counts (from code)

- **Services:** 20 defined (docs claim 25). Core: API :7780, EventBus :7782,
  State :7783, Orchestrator :7784, Tower :7790, Gatekeeper :7791, Context Bus
  :7881, Pool :7885, Metrics :7890, Workers :7897, Spine :7880. Dark: voice
  :7781, bridge :7779, vision :7889, reasoning :7892, stt :7896, yolo, avatar,
  chorus, Swarm Coordinator :7898.
- **Agents:** 42 personas (2026-07-03: was 35 in this audit). Docs claimed 152 historically.
- **Tools:** 31 native (was 176 in this audit — tools-pc.js 49-tool file now deleted).
- **Skills:** 383 dirs (was 390 in this audit).
- **Providers:** 17 + NVIDIA NIM (verified live: llama-3.3-70b tool-calling, bge-m3 embeddings).

## Security & governance status

| Component | Status |
|---|---|
| Vault (AES-256-GCM, file-lock, atomic, recovery, audit log) | ✅ real, hardened |
| SpendGate | ✅ real — but only enforced in `POCKET_MODE` |
| HMAC worker auth | ✅ real & enforced |
| Ed25519 signed updates | ⚠️ primitives real; `cfg`-crash bug + placeholder key = hash-only in practice |
| Smith+Neo adversarial pair, chaos campaign, gatekeeper | present |

## Intended end-to-end flow (and where it breaks)

```
You → CLI/TUI/WebUI
  → /api/chat (unified_api :7780)        ← SHOULD run agent-loop; today toolless
  → Orchestrator :7784 (intent routing)
  → Agent Tower :7790 (spawn agent)      ← today: 1 LLM call, no tools
      (richer path: Swarm Coordinator :7898 — validation gate + worktree
       sandbox + spine fact-writes — now reachable via `swarm <task>` intent)
  → llm-provider (17 providers, 2-tier fallback)
  → EventBus :7782 broadcasts agent.*    ← listeners mostly deaf
  → State Store :7783 / Context Bus :7881
  → Cognitive Spine :7880                ← fed, never consulted; currently down
  → Vault / SpendGate
  → result streamed back via SSE
```

## Priority wiring queue

1. **Agentic HTTP door** — route `/api/chat` through `agent-loop.runAgent` (closes #3, gives TUI/Web hands).
2. **Tower tool loop** — replace single `llmComplete()` with the agent loop so the 42 personas can use the 31 native tools (closes #1). (Numbers updated 2026-07-03: was 35 agents / 176 tools.)
3. **Spine bootable + consulted** — declare/install numpy; read-back in dispatch path (closes #6, half of #2).
4. **EventBus contract** — one shared client, one envelope; fix context-bus subscriber (closes #9).
5. **Voice ingress** — stt :7896 transcript → orchestrator /dispatch (voice-first full-auto).
6. **Ratchet close** — eval + accept/reject + adapter deploy (closes #8).

---

# VERIFIED ADDENDUM (independent code audit, 2026-06-09)

A second full-stack audit re-read every layer. It confirms most of the scoreboard,
**corrects audit #1**, and verifies the new swarm wire landed — with two blockers left.

## Corrections to the scoreboard

### #1 "Tower agents are toolless cosplay" — WRONG; it is the opposite failure
- Tower agents DO run the real tool loop: `agent_tower.js:212-238` calls `runAgent` from
  `lib/agent-loop.js`, which executes tools via `TOOLS.invoke()` (agent-loop.js:260)
  against the full registry. Tools run; side effects happen on disk.
- **The actual bug is an event-name mismatch that discards all output**:
  agent_tower.js:224 listens for `ev.type === 'tool-exec'` — an event `runAgent` NEVER
  emits (it emits `tool-call` at agent-loop.js:255, `tool-result` at :265, plus
  `token`/`done`). So `agentState.toolCalls` stays empty and every agent reports
  `'Task completed.'` while its real text and tool results vanish.
  **Hands without mouths, not mouths without hands.**
- Cosmetic: `AGENT_TOOLS` destructured at agent_tower.js:213 is not exported by
  agent-loop (:278) — undefined but harmless (runAgent builds its own tool surface
  from `lib/tools` in `buildSystemPrompt`, agent-loop.js:84-107).

### #6 numpy claim — VERIFIED TRUE
`memory_matrix_v2.py:34` and `memory_matrix.py:38` import numpy at module top;
zero matches for numpy in any `requirements*.txt`. Spine import dies without it.

### #9 EventBus — two subscribers, not one
Orchestrator is a live subscriber to `agent.*`, `tool.*`, `system.*`, `voice.*`
(orchestrator.js:~1500). The dead voice wire is a PAYLOAD-SHAPE break, not deafness:
voice_bridge publishes `{topic, payload:{transcript}}` (voice_bridge_7792.js:35-52)
while orchestrator's `handleVoiceEvent` requires top-level `event.command`
(orchestrator.js:~494). Nothing anywhere publishes `voice.command`.

## Swarm wire status (landed this session — 90% there)

CONFIRMED LANDED:
- `swarm <task>` intent → `dispatchSwarmMission()` → `POST :7898/api/coordinate`
  (orchestrator.js:103, :804, :1145-1170). Pattern ordering is correct
  (`swarm status` at :102 precedes `swarm (.+)` at :103).
- Tower `POST /api/spawn/await` implemented, output surfaced top-level as
  `{success, output: result.agent?.result}` (agent_tower.js:746-771) — matches what
  swarm_coordinator.js:807/:818 expects.
- `purpclaw-coordinator` registered in pm2 (ecosystem.config.js:323-326, :7898).

## TWO REMAINING BLOCKERS — every `swarm <task>` still fails until fixed

1. **Validation gate kills the intent before dispatch.** `swarm_mission` is declared
   `useTeam: true` (orchestrator.js:103) but has NO entry in `TEAM_TEMPLATES`
   (orchestrator.js:86-99). `validateCommand()` pushes
   `"Intent 'swarm_mission' does not support team execution"` → workflow fails at the
   parse stage; `dispatchSwarmMission` is dead code.
   **Fix (1 line)**: change :103 to `useTeam: false` (the coordinator does its own
   decomposition — no orchestrator team template is wanted), or add a `swarm_mission`
   key to TEAM_TEMPLATES.

2. **Tower output-discard bug cascades into the coordinator's validation gate.**
   Because of the `'tool-exec'` mismatch (above), `/api/spawn/await` returns
   `output: 'Task completed.'` (15 chars). swarm_coordinator's
   `validateSubtaskOutput` rejects anything under 80 chars (`output-too-short`,
   swarm_coordinator.js:436-438) → every subtask fails → retries burn → mission fails.
   **Fix (~6 lines in agent_tower.js:218-237)**: accumulate `ev.type === 'token'`
   content into a buffer; handle `'tool-call'`/`'tool-result'` instead of
   `'tool-exec'`; set `result.content` to `buffer` (falling back to the tool-call
   summary). This one fix simultaneously closes scoreboard #1 for real.

## Also still open (from the independent audit)
- Orchestrator latent crashes: `SWARM_MEMORY.metrics.toolUsage` (:507) and
  `metrics.byIntent` (:~1264 updateMetrics) are written but never initialized —
  first tool event / first completed workflow throws. Init both to `{}`.
- `service_registry.js` has no coordinator entry (health probes won't watch :7898),
  and lists voice-bridge health on :8792 while the bridge serves it on :7792
  (voice_bridge_7792.js:239) — bridge always reports down.
- Tower never publishes `agent.completed` on normal completion (only on kill,
  agent_tower.js:390) — orchestrator's event-driven completion path never fires.
- `sendToAgent()` referenced by tmux-worktree-orchestrator.js:14 does not exist.
- Orchestrator + voice_coordinator call `GET :7790/api/status`; Tower serves
  `/tower/status` → 404 (orchestrator.js:~1174, voice_coordinator.js:206).
- voice_coordinator.js:390 uses `fs` without requiring it (crashes `list tasks` intent).
- autoDream still has no scheduler — consolidation is manual (`:7880/autodream/cycle`).
- Gatekeeper :7791 still bypassed by every dispatch path.
- Legacy `boot.js` (`nukePort()` force-kills port owners) and `start_purpclaw.js`
  (binds GUARDIAN to :7781, colliding with voice coordinator) must never be run on
  this shared machine.

## Voice-first remaining gap (unchanged)
No process consumes STT transcripts (`voice_stt.py /listen/stream`, :198) — the only
consumer of `lib/voice-client.js` is the interactive TUI (scripts/tui.js:23). A ~50-line
`voice_ingress.js` (subscribe stream → wake-word filter → `POST :7784/api/orchestrate`)
closes mic→swarm end-to-end now that the orchestrator→coordinator wire exists.
