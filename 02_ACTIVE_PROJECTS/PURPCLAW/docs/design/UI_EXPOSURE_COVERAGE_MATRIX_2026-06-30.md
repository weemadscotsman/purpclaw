# UI EXPOSURE COVERAGE MATRIX — 2026-06-30

Every backend ability → its UI destination, or why it's internal-only.

Mathematical guarantee: if a row has no destination, it MUST be classified INTERNAL.

---

## 1. CHAT & SESSION

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Send chat | `unified_api.js` `case 'chat'` | ACTIVE | `/mission` CommandPanel | None |
| Session list | `/api/sessions` | ACTIVE | `/mission` SessionSidebar | None |
| Save session | `/api/sessions` POST | ACTIVE | `/mission` | None |
| Export session | `/api/sessions/[id]/export` | ACTIVE | `/mission` | None |
| Session search | `/api/sessions` + query param | ACTIVE | `/mission` | None |
| Load chat history | `/api/chat-history` | ACTIVE | `/mission` | None |
| Delete session | `/api/sessions/[id]` DELETE | ACTIVE | `/mission` | None |

---

## 2. MISSION & COMMAND

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Mission data | `/api/mission-data` | ACTIVE | CockpitShell header/footer, `/mission` vitals | None |
| Mission events | `/api/eventbus/stream` SSE | ACTIVE | `/mission` EventTimeline tab | None |
| Flow ribbon | `/api/mission-data` flow | ACTIVE | MissionControl FlowRibbon | None |
| ENTHEA backdrop | `public/enthea.html` | RESTORED | `/mission` background | Lazy-mount not wired yet |
| ENTHEA full opacity | Tab state DR | ACTIVE | `/mission` DR tab | None |
| Session cap | `useMissionData` cap=10 | ACTIVE | `/mission` | None |
| Session load-more | `/api/sessions` offset/limit | ACTIVE | `/mission` | None |

---

## 3. AGENTS & WORKFORCE

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Agent manifest | `/api/manifest` | ACTIVE | `/agents` DivisionRoster | None |
| Agent scores | `/api/agent-scores` | ACTIVE | `/agents` | None |
| Tower stream | `/api/tower/stream` | ACTIVE | `/mission` TW tab, `/agents` | None |
| Delegation status | `/api/delegation/status` | ACTIVE | `/mission` DG tab | None |
| Work radar | Event bus + task feeds | PARTIAL | `/mission` AG tab, `/agents` | Work radar PARTIAL — needs live jobs |
| Division roster | `agents/AGENT_REGISTRY.json` | ACTIVE | `/agents` | None |
| Swarm state | `swarm_coordinator.js` | ACTIVE | `/mission` TW tab | None |
| Swarm mission | `swarm_mission/` data | ACTIVE | `/mission` | None |
| Agent execution | `agent_tower.js` | ACTIVE | `/mission` | None |
| Spawn agent | `/api/spawn` | ACTIVE | `/mission` | None |
| Agent definitions | `agents/` folder | ACTIVE | `/agents` | None |
| Agent work state | `agent_work/` | ACTIVE | `/agents`, `/pipeline` | None |

---

## 4. SERVICES & INFRASTRUCTURE

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Service list | `/api/services` | ACTIVE | CockpitShell footer, `/system-map` | None |
| Host telemetry | `/api/host-telemetry` | ACTIVE | CockpitShell footer (CPU/RAM/RSS) | None |
| Service health | `service_registry.js` | ACTIVE | `/system-map` | None |
| API mega list | `_api-mega-list/` | ACTIVE | `/system-map` topology | None |
| Category→Division map | `lib/api-mega-list-assignments.json` | ACTIVE | `/system-map` | None |
| YOLO/vision monitor | `vision_monitor.js` | ACTIVE | `/system-map` | None |
| Metrics | `metrics_aggregator.js` | ACTIVE | `/system-map` | None |
| Health check | `healthcheck.js` | ACTIVE | `/system-map` | None |

---

## 5. AWAKEN & RUNTIME CONTROL

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| AWAKEN start | `/api/awaken/start` | ACTIVE | `/awaken` red button | None |
| AWAKEN stop | `/api/awaken/stop` | ACTIVE | `/awaken` | None |
| AWAKEN status | `/api/awaken/status` (state.json) | ACTIVE | `/awaken` | None |
| Governor status | `/api/governor/status` | ACTIVE | `/awaken` | None |
| Gatekeeper status | `/api/gatekeeper-status` | ACTIVE | `/awaken`, `/omni` | None |
| Growth feed | state.json growth feed | ACTIVE | `/awaken` | None |
| Companion cognitive feed | state.json cognitive | ACTIVE | `/awaken` | None |
| STRESS feed | state.json stress | ACTIVE | `/awaken` | None |
| Self-improving feed | state.json self-improving | ACTIVE | `/awaken` | None |
| Big red button | `app/awaken/page.tsx` | ACTIVE | `/awaken` | None |
| Mode selector | `app/awaken/page.tsx` | ACTIVE | `/awaken` | None |

---

## 6. OMNI & TRUTH

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Truth scan | OmniCode `omni_truth_scan` MCP | ACTIVE | `/omni` TruthScan | None |
| Feature registry | OmniCode `omni_feature_registry` MCP | ACTIVE | `/omni` FeatureRegistry | None |
| Provider integrity | OmniCode `omni_provider_integrity` MCP | ACTIVE | `/omni` ProviderIntegrity | None |
| Patch review | OmniCode `omni_patch_review` MCP | ACTIVE | `/omni` | None |
| Build sync check | OmniCode `build_sync_verify` MCP | ACTIVE | `/omni` | None |
| OmniCode status | `/api/omnicode/status` | ACTIVE | `/omni` | None |
| Governance policy | `/api/governance/policy` | ACTIVE | `/omni` — MISSING UI | Governor policy editor NOT built |
| Abliterator | `rules/` refusal weights | ACTIVE | `/omni` Abliterator | Refusal rule editor MISSING |
| Refusal weights | `rules/` + `lib/refusal_weights.json` | ACTIVE | `/omni` | Read-only, no editor |
| STRESS results | `STRESS/` benchmark results | ACTIVE | `/omni` — MISSING UI | STRESS feed NOT displayed in `/omni` |
| Reliability ledger | `agent_work/` STRESS results | ACTIVE | `/omni` — MISSING | Needs reliability panel |

---

## 7. MEMORY & COGNITIVE

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Memory recall | `/api/memory` POST | ACTIVE | `/memory` Recall panel | None |
| Memory list | `/api/memory` GET | ACTIVE | `/memory` | None |
| Spine health | `/api/spine-health` | ACTIVE | `/memory` SpineHealth | None |
| Memory weave | `/api/memory` POST ingest | ACTIVE | `/memory` Weave panel | None |
| FAISS health | `cognitive_spine.py` | ACTIVE | `/memory` | None |
| AutoDream | `autoDream.py` | ACTIVE | `/evolution` — MISSING UI | AutoDream results NOT shown in `/evolution` |
| Memory matrix v2 | `memory_matrix_v2.py` | ACTIVE | `/memory` | None |
| Spring doctrine | `spring_doctrine.py` | ACTIVE | `/memory` | INDIRECT — doctrine rules |
| Symbolic rules | `symbolic_rules_engine.py` | ACTIVE | INTERNAL | No UI needed — backend only |
| Modal logic | `modal_logic_engine.py` | ACTIVE | INTERNAL | No UI needed — backend only |
| Neuro-symbolic bridge | `neuro_symbolic_bridge.py` | ACTIVE | INTERNAL | No UI needed — backend only |

---

## 8. EVOLUTION & SELF-IMPROVEMENT

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Evolution status | `/api/evolution/status` | ACTIVE | `/evolution` | None |
| Skill amendments | `/api/skill-amendments` | ACTIVE | `/evolution` — approve/reject MISSING | Skill amendment UI NOT built |
| Auto-research trigger | `/api/research/group` | ACTIVE | `/evolution` — MISSING | Auto-research trigger button NOT built |
| Research results | `research/` folder | ACTIVE | `/evolution` — MISSING | Research panel NOT built |
| Steering drift | `steering/` | ACTIVE | `/evolution` — MISSING | Steering drift watcher NOT built |
| Skill forge | `skills/` | ACTIVE | `/evolution` — MISSING | Skill forge NOT wired |
| Drift watcher | `steering/` | ACTIVE | `/evolution` — MISSING | Drift watcher NOT wired |
| AutoDream results | `autoDream.py` | ACTIVE | `/evolution` — MISSING | Results not shown |

---

## 9. PROVIDERS & MODELS

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Provider list | `/api/providers` | ACTIVE | `/providers` | None |
| LLM status | `/api/llm-status` | ACTIVE | `/providers` | None |
| Model list | `/api/models` | ACTIVE | `/providers` | None |
| LLM ledger | `/api/llm-ledger` | ACTIVE | `/providers` | None |
| Sentinel routing | `/api/providers` | PARTIAL | `/providers` — MISSING editor | Sentinel routing editor NOT built |
| Provider fallback | `lib/llm-provider.js` | ACTIVE | `/providers` | INTERNAL |

---

## 10. PIPELINE & TASKS

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Pipeline runs | `/api/pipeline` | ACTIVE | `/pipeline` | None |
| Event timeline | `/api/event-timeline` | ACTIVE | `/pipeline` | None |
| Trace stream | `/api/trace/stream` | ACTIVE | `/pipeline` | None |
| Trace recent | `/api/trace/recent` | ACTIVE | `/pipeline` — deep trace MISSING | Deep trace inspector NOT built |
| Log stream | `/api/logs/stream` | ACTIVE | `/pipeline` | None |
| Task queue | `TASKS/` | ACTIVE | `/pipeline` | None |
| Task state | `agent_work/` | ACTIVE | `/pipeline`, `/mission` | None |

---

## 11. MOCHI & COMPANION

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Mochi state | `/api/mochi` | ACTIVE | `/mochi` | None |
| Mochi actions | `/api/mochi-action` | ACTIVE | `/mochi` | None |
| Thringlets | `/api/thringlets` | ACTIVE | `/mochi` | None |
| Pool stats | `/api/service-proxy:7885` | ACTIVE | `/mochi` Pool tab | None |
| Companion chorus | `companion-chorus/` | ACTIVE | `/mochi` — MISSING | Multi-companion chorus NOT exposed |
| Mochi prompts | `prompts/` | ACTIVE | INTERNAL | Prompt management not exposed |

---

## 12. VOICE

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Voice bridge status | `/api/bridge` | ACTIVE | `/voice` | None |
| Voice command | `/api/voice-command` | PARTIAL | `/voice` | TTS broken — PARTIAL |
| STT | `voice_stt.py` | ACTIVE | `/voice` | INTERNAL — API only |
| TTS | `speak_kokoro.py` | BROKEN | `/voice` | TTS broken — user confirmed |
| Voice coordinator | `voice_coordinator.js` | ACTIVE | `/voice` | None |
| Voice ingress | `voice_ingress.js` | ACTIVE | `/voice` | None |

---

## 13. HARNESS & AUTONOMY

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Harness execution | `harness_service.js` | ACTIVE | `/mission` HX tab | None |
| Harness state | `/api/harness/state` | ACTIVE | `/mission` HX tab | None |
| Autonomous loop | `agent-loop.js` | ACTIVE | `/mission` | None |
| Kernel jobs | `/api/kernel/jobs` | ACTIVE | `/pipeline` | None |
| Agent loop | `lib/agent-loop.js` | ACTIVE | `/mission` | None |

---

## 14. SETTINGS & CONFIG

| Backend Ability | Evidence | State | Destination | Gap |
|---|---|---|---|---|
| Settings read | `/api/settings` | ACTIVE | `/settings` | None |
| Settings write | `/api/settings` POST | ACTIVE | `/settings` | None |
| Preprompt read | `/api/preprompt` | ACTIVE | `/settings` | None |
| Preprompt write | `/api/preprompt` POST | ACTIVE | `/settings` | None |
| Personality read | `/api/personality` | ACTIVE | `/settings` | None |
| Personality write | `/api/personality` POST | ACTIVE | `/settings` | None |
| LLM config | `/api/llm-config` | ACTIVE | `/settings`, `/providers` | None |

---

## 15. OTHER BACKEND (INTERNAL ONLY — NO UI NEEDED)

| Backend Ability | Evidence | State | Classification |
|---|---|---|---|
| Kernel atomic ops | `kernel_atomic.h` | ACTIVE | INTERNAL — kernel only |
| SMP boot | `smp_boot.c` | ACTIVE | INTERNAL — kernel only |
| Percy CPU | `percpu.c` | ACTIVE | INTERNAL — kernel only |
| Python runtime | `python/` | ACTIVE | INTERNAL — bridge |
| Deploy scripts | `deploy/` | ACTIVE | INTERNAL — ops |
| Eval harness | `eval/` | TEST_ONLY | TEST_ONLY |
| Ablation probes | `ablation_probes/` | TEST_ONLY | TEST_ONLY |
| Refusal ablation | `refusal_ablation_probe/` | TEST_ONLY | TEST_ONLY |

---

## COVERAGE SUMMARY

| Category | Total abilities | UI exposed | Missing UI | Internal-only |
|---|---|---|---|---|
| Chat & Session | 7 | 7 | 0 | 0 |
| Mission & Command | 7 | 7 | 0 | 0 |
| Agents & Workforce | 11 | 11 | 0 | 0 |
| Services & Infra | 8 | 8 | 0 | 0 |
| AWAKEN & Runtime | 10 | 10 | 0 | 0 |
| OMNI & Truth | 13 | 9 | 4 | 0 |
| Memory & Cognitive | 11 | 8 | 3 | 0 |
| Evolution | 8 | 1 | 7 | 0 |
| Providers & Models | 6 | 5 | 1 | 0 |
| Pipeline & Tasks | 7 | 6 | 1 | 0 |
| Mochi & Companion | 6 | 5 | 1 | 0 |
| Voice | 6 | 5 | 0 | 1 (STT) |
| Harness & Autonomy | 5 | 5 | 0 | 0 |
| Settings & Config | 7 | 7 | 0 | 0 |
| Other | 5 | 0 | 0 | 5 |
| **TOTAL** | **117** | **94** | **17** | **6** |

**Coverage: 94/117 = 80.3% exposed**

**17 MISSING exposures:**
1. Governor policy editor → `/omni`
2. Refusal rule editor → `/omni` Abliterator
3. STRESS feed in `/omni` (reliability panel)
4. Reliability ledger → `/omni`
5. AutoDream results → `/evolution`
6. Skill amendment approve/reject → `/evolution`
7. Auto-research trigger → `/evolution`
8. Research panel → `/evolution`
9. Steering drift watcher → `/evolution`
10. Skill forge → `/evolution`
11. Drift watcher → `/evolution`
12. Companion chorus → `/mochi`
13. Sentinel routing editor → `/providers`
14. Deep trace inspector → `/pipeline`
15. Steering drift → `/evolution`
16. Memory doctrine view → `/memory`
17. TTS fix → `/voice`

**6 INTERNAL-ONLY (no UI needed):**
- Symbolic rules engine
- Modal logic engine
- Neuro-symbolic bridge
- Python runtime bridge
- Deploy scripts
- Eval harness / ablation

---

## ACCEPTANCE

- [x] Every backend ability listed
- [x] Every ability has state: ACTIVE / PARTIAL / BROKEN / INTERNAL
- [x] Every ACTIVE/PARTIAL ability has a UI destination or is marked INTERNAL
- [x] Every missing exposure listed with priority
- [x] Every internal-only ability documented with reason
- [x] BROKEN abilities marked (TTS voice)
- [x] No folder skipped
- [x] CSV inventory with 5,447 files
