# PURPCLAW MASTER TODO — consolidated from every spec

Status legend: **[x] DONE** (commit ref) · **[~] PARTIAL** · **[ ] TODO** · **[live] needs running stack to verify**

Sources consolidated: `PURPCLAW_FIRST_CLASS_INSTALL_AND_PARITY_CONTRACT`, `PURPCLAW_CANONICAL_RUNTIME_INSTALL_FIRST_RUN_SPEC` (§0–25 + 20 acceptance tests), `IMPLEMENTATION_HANDOFF` (A–M), `runtime-policy.json`, `capability/harness-record schemas`, `DOORDASH_AGENT_PLATFORM_REPLICATION_BLUEPRINT` (P0–P6), `PURPCLAW_LIVE_UPDATE_RUNTIME_CONTRACT`, the 5-phase finish sweep, the frontend rebuild contract (20 rules), `luno-human-conversation`.

Authority: `docs/canonical/PURPCLAW_CANONICAL_RUNTIME_INSTALL_FIRST_RUN_SPEC.md` + `docs/parity/CANONICAL_PARITY_PRIORITY.md`. Acceptance gate: `npm run acceptance` (`docs/canonical/acceptance-tests.json`).

Scoreboard at last update: **PASS 14 / FAIL 0 / NOT_IMPLEMENTED 6** of 20.

---

## 0. P0 runtime spine (pre-session, verified)
- [x] Boot + session persistence (node:sqlite) — `94a2938` / P0 gauntlet
- [x] One permission evaluator across CLI/HTTP/MCP — P0-B
- [x] Provider/lane routing (routing-decisions, 7 lanes) — P0-C / `8d73427`
- [x] Steering resolver live in the turn path — `409ac86` (phase3)

## 1. Canonical registries & counts (spec §1, §9, §21; acceptance registry-dynamic-counts)
- [x] Canonical port registry, one source, no phantom ports — `453895a`
- [x] Agent roster read from registry, not baked arrays — `096ce11`
- [x] Canonical workflow authority declared (`registry/workflow-authority.json`) — `77e7b26`
- [x] Canonical mission authority declared (`registry/mission-authority.json`) — `6239f5a`
- [x] Souls/interviews data present (95+95) at `data/registries/registry/` — verified (false-alarm cleared)
- [ ] Full canonical registry set per §21 (actions, capabilities, agents, souls, divisions, skills, tools, plugins, services, providers, models, workflows, missions, process-types, events, surfaces, routes, aliases, steering, harnesses, runtimes, ownership, parity) — several exist ad hoc; **consolidate into `registry/` with one schema + generator**
- [ ] Canonical crosswalk (§22): capability → action → division → agent → soul → skill → tool → service → harness → runtime → provider → process → events → memory → API → CLI/TUI/Web/Desktop/Mobile

## 2. Runtime taxonomy & load classes (spec §2, §6; runtime-policy.json)
- [x] Canonical runtime identity shared by every surface (`lib/runtime/identity.js`, `/api/health`) — `bfde826`
- [~] Runtime classes exist as logical modules (agent, tool, provider, worker) — present, not formally declared as classes
- [ ] `registry/runtimes.json` + `registry/harnesses.json` (handoff step B) — declare the 10 runtimes / 10 harnesses as records
- [ ] BOOTSTRAP + SUPERVISOR as a single durable authority owning lock/lifecycle/ports/health (today: PM2 + safe-start; no single supervisor process)
- [ ] Load-class enforcement (BOOT_INDEX / CORE_RESIDENT / SESSION / TASK / INVOCATION / EPHEMERAL / IDLE_OPTIONAL) — policy declared in `runtime-policy.json`, not enforced in code

## 3. Command / Action kernel (spec §3, handoff C/D; acceptance zero-agent-utility)
- [x] Canonical CLI command registry (`lib/cli/registry.js`), dual dispatch, did-you-mean — `1812fe5`
- [x] Deterministic zero-agent command path — verified (status/help/version/completion)
- [ ] Structured Action Kernel under CLI semantics: action id + input/output schema + error contract + approval contract + events (handoff C). CLI registry is command-level; **actions with schemas are the gap**
- [ ] Every surface invokes the Action Kernel (not terminal scraping)

## 4. Harness stack (spec §3: 10 harnesses; harness-record schema)
- [x] Tool harness: one ToolRuntime gate (scope→schema→path-security→permissions→governance→steering→approval) — verified acceptance harness-path
- [x] Steering wired at all turn-path points — `3c7926e` / acceptance steering-parity
- [~] Request/Action/Agent/Provider/Workflow/Mission/Surface/Recovery/Verification harnesses — exist as code paths, **not declared as harness records** (`registry/harnesses.json`)
- [ ] Verification/eval harness with LIVE/FIXTURE/SIMULATED/SPEC_ONLY labels (DoorDash §13, spec §3.10)

## 5. Steering (spec §4)
- [x] Steering resolver + middleware + capsule, wired into agent-loop/tool-runtime/chat-agent — `409ac86`
- [x] `.steering/` source discovery + checksums — phase3
- [ ] Steering registry records per §4.2 (execution contracts, profiles, prompt contracts, soul fragments) as canonical data
- [ ] Human-steering events (pause/resume/redirect/constraint) broadcast across surfaces

## 6. Resolvers (spec §5; handoff F)
- [x] Provider/model resolver (routing-decisions) — P0-C
- [x] Tool resolver (minimal eligible set) — acceptance tool-minimal-load
- [x] Skill resolver (metadata index, lazy body) — acceptance skill-lazy-load
- [x] Plugin resolver (lazy client) — acceptance plugin-lazy-load
- [ ] Capability resolver (intent → capability, ranked deterministic fallback) — **not built as a unit**
- [ ] Agent resolver scoring on registry facts (capability/division/skills/tools/load), soul attach only when useful
- [ ] Duplicate skill identity resolution (apple-notes, google-workspace) per §5.3

## 7. Services, ports, supervisor (spec §7; acceptance port-authority, media-lazy)
- [x] Ports from one registry; 7781/7791 single-owner — acceptance port-authority PASS
- [x] Media services on-demand (voice/vision/stt asleep unless needed) — acceptance media-lazy PASS
- [x] A2A gateway service restored on canonical :9119 — `cca0155` (⚠ not in `safe-start --core` cluster yet)
- [~] Service records with class/deps/health/wake/idle (§7) — partial in `lib/runtime/ports.js` SERVICES
- [ ] Supervisor-assigned dynamic ports (no literals anywhere) + service-class enforcement
- [ ] Add `purpclaw-a2a` (+ harness) to the core startup cluster

## 8. Live update runtime (LIVE_UPDATE contract; handoff)
- [x] UpdateManager (stage, SHA-256 verify, current/previous pointer, rollback, lock, events, ndjson history, inbox) — `3deba78`
- [x] `purpclaw update status|check|apply|rollback|history|auto|channel` + `/update` slash + reload — `6a05eba`,`3deba78`
- [x] Contract test 0.3.0→0.3.1→rollback (events=18) in `npm test` — `3deba78`
- [ ] Durable supervisor that boots the runtime FROM `<DATA>/runtime/releases/<current>` (true hot-swap; CLI/TUI stay alive) — flagged in `lib/update/index.js`
- [ ] Auto-mode supervisor polling (off/notify/safe/aggressive) wired to the inbox
- [ ] Deep filesystem snapshot integration (today: pointer rollback only)

## 9. Memory (spec §12; DoorDash §5–7; acceptance memory-truth)
- [x] Memory gateway health() real per-layer probe (fixed crash) — `fdba781`
- [x] memory-truth: honest per-layer status, no blanket 7/7 claim — acceptance PASS
- [ ] Canonical memory registry (§12): layer/impl/status/persistence/read/write/retention/privacy/provenance as data
- [ ] Three-timescale separation enforced (session / long-term / conversational) — DoorDash §5
- [ ] Memory planner: intent→scope→scan→(semantic+keyword+structured)→rank→recency→dedupe→package→write-back — DoorDash P3
- [ ] Memory bank index (vocabulary before search) — DoorDash §7

## 10. Providers (spec §2.6; live-verified this session)
- [x] Chat works end-to-end (fixed stale-daemon-env shadowing .env key) — `ddaec2e`
- [x] Provider auth audited live: MiniMax OK; DeepSeek/GLM no-credit; NVIDIA 403 — reported
- [ ] Fallback-on-auth-error: when the active provider returns 401/402/403/429, route to a working provider instead of surfacing the raw upstream error (honest degradation, spec §14)
- [ ] Token/cost accounting per process (spec §2.6)

## 11. Surfaces & parity (spec §10, §11; contract §6; acceptance single-runtime, cross-surface)
- [x] single-runtime-multisurface: CLI + API share one runtimeId — `bfde826` (live PASS)
- [x] CLI top-standard (registry, help, completion, hygiene) — `1812fe5`
- [ ] [live] cross-surface-process: one task, same process_id/state on all surfaces
- [ ] [live] provenance: process records action/agent/soul/skills/tools/harnesses/steering/provider/model/worker/artifacts
- [ ] [live] web-reconnect, recovery, mobile-same-brain, agent-minimal-load
- [ ] TUI bound to canonical events/actions (not private state) — spec §10
- [ ] Parity matrix record per capability (FULL/READ_ONLY/PLATFORM_UNSUPPORTED/BLOCKED/NOT_IMPLEMENTED) — `registry/parity.json`

## 12. Install & first-run (contract §4/§5; spec §8/§9)
- [x] Installers exist (`install.ps1`, `install.sh`) — pre-session
- [ ] Audit installers against §8 phases: preflight → deploy → migrate → start(supervisor only) → verify
- [ ] One first-run wizard shared by all surfaces (spec §9, 18 steps) with one onboarding-state record (no re-onboarding per UI)
- [ ] Onboarding smoke: canonical action + harness/tool-loop + surface handshake

## 13. DoorDash platform contracts (blueprint P0–P6)
- [x] MCP/tool calls governed through one gate (ToolRuntime) — harness-path
- [x] Skills as context paging (metadata index, lazy) — skill-lazy-load
- [x] Trace store + event spine exist (`lib/trace-store.js`, `unified_eventbus.js`) — pre-session
- [ ] Governed Agent Gateway P0: bundles, credential broker, rate limits, usage events (audit `lib/agent-gateway.js`, wire production call sites)
- [ ] Task-scoped tool bundles (not all-tools) — DoorDash §2
- [ ] Trace-native runtime: every op emits traceId/sessionId/missionId/capsuleId/agentId/toolCallId/artifactId — DoorDash §10
- [ ] Eval harness from traces + LLM-judge calibration — DoorDash §11–14
- [ ] Deep-agent mission state machine (INGEST…CERTIFY…DONE) — DoorDash §18

## 14. Events / observability / recovery (spec §17–19)
- [ ] Canonical event families (runtime/session/action/mission/workflow/process/agent/tool/plugin/provider/model/approval/memory/artifact/service/worker/health/recovery/evolution/research) on one spine
- [ ] One trace request→result with lineage
- [ ] Recovery harness: journal, idempotency keys, orphan cleanup, restartable vs not

## 15. Finish-sweep phases (from the 5-phase plan)
- [x] P1 stabilize · P2 CLI · P3 steering — `94a2938`,`1812fe5`,`409ac86`
- [~] P4 honest harness: cert honest, root-misplaced requires fixed, `npm test` green (30/30) — `ebedfbd`; **remaining: run-cert-gates aggregator, CI ci:control, no-mocks scanner, control-surface tier runner**
- [ ] P5 cleanup: version truth (0.1.7 vs 0.5.0 vs 0.3.0 — pick one), one lockfile, `app/` vs `apps/web/app/` dedupe, move `services/swarm/agent_work/` to `var/`, phantom npm scripts

## 16. Frontend rebuild (rebuild contract, 20 rules)
- [ ] Commit the rebuild contract into `docs/` so it binds
- [ ] UI-001: old-frontend capability harvest + API-route ownership map (28 unowned `app/api/` routes)
- [ ] `apps/mission-control-v2/`: machine layer (Resources/Processes/Files/Security/Recovery) + org layer (Command/Missions/Org/Council/Studio/Memory/Tools/Providers/Evolution/Audit)
- [ ] Counts from runtime truth; degraded states everywhere; mobile-real at 390×844

## 17. Merge / no-loss (merge contract)
- [ ] MERGE-001: no-loss feature manifest + 9 crosswalks + status vocab (CURRENT/LEGACY/TARGET/RETIRED) on every legacy feature

## 18. Conversation behaviour (luno-human-conversation)
- [x] Installed as a skill (`skills/luno-gemini-live-voice` earlier) / applied in operator chat — behavioural, ongoing

---

## NEXT UP (execution order)
1. **Fallback-on-auth-error** (§10) — so a dead provider degrades to a working one instead of a raw 401. Directly improves "run better".
2. **cross-surface-process + provenance** (§11) — live probes now that chat works; drive a task through the API, read its process_id/lineage from another surface.
3. **`registry/runtimes.json` + `harnesses.json` + `parity.json`** (§2/§4/§11, handoff B) — declare the runtime/harness/parity records the spec requires.
4. **P5 version truth** — one canonical version.
5. **Add `purpclaw-a2a` (+harness) to core startup** — so declared authorities actually run.
6. **First-run wizard** (§9) — one shared onboarding.
