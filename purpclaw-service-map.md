# purpclaw-service-map

**Date:** 2026-06-14
**Verdict:** hybrid. Microservice core + modular capabilities.
**Doctrine:** no deletions without proof. Mark, don't delete.

## Endpoint classes

The 21 canonical health endpoints are now reported by lifecycle class:

- **Core:** 10 endpoints expected for the stable control plane.
- **Optional dark:** 5 capability/provider endpoints that may be intentionally parked.
- **Deprecated:** 6 legacy endpoints superseded by the cognitive spine or production cockpit.

`bigboss status` reports each class separately plus the overall configured count.

## Capability recovery state

| Lane | State | Verified result |
|---|---|---|
| Telegram | **Ready / Not Configured** | PM2 preserves `TELEGRAM_BOT_TOKEN`; gateway health is good and reports `not_configured`. Live bot identity/message proof requires a token. |
| Voice coordinator | **Code-ready, parked** | Health port corrected to `7781`; destructive voice commands now stop at the signed approval gate before orchestration. |
| STT/TTS | **STT live / TTS not configured** | STT service is online; TTS now returns an honest `503 not_configured` without a backend key. |
| Vision | **Live, operator-triggered** | Health and explicit snapshot capture are verified; continuous capture remains parked unless `VISION_AUTOSTART=1`. |
| YOLO | **Live** | Model loaded and inference returned a valid zero-object result for a generated blank image. |

## Broader stack capability checkpoint

Verified live on 2026-06-14:

| Capability | Proof |
|---|---|
| Backend / CLI / TUI | `8/8` backend gates passed |
| Runtime smoke | `9/9` smoke checks passed |
| Live chat | Primary MiniMax failure recovered through configured Ollama fallback |
| Bridge chat | Live reply verified |
| Orchestration | Workflow creation and polling verified |
| Governance | Destructive workflow held for approval |
| Agents | Tower online with canonical registry |
| Tools and skills | 456 local tools, including 378 Hermes skills |
| Cockpit | Production build completed; 46 API routes built and restarted |
| Registry / jobs / OMNI / harness | Cockpit APIs returned HTTP 200 |
| Service health | Core 10/10; 15/21 configured endpoints responding |
| Bughunt | 42 OK, 0 failures; two environment/documentation warnings |

Provider behavior is now fail-operational: API, Tower, and Orchestrator receive
explicit Ollama fallback settings. Provider authentication/network failures may
fall back to `qwen2.5:3b`; policy and governance failures remain blocked.

| Service | Verdict | Reason |
|---|---|---|
| `purpclaw-api` | **Keep** | gateway |
| `purpclaw-orchestrator` | **Keep** | jobs |
| `purpclaw-tower` | **Keep** | agents |
| `purpclaw-pool` | **Keep** | workers |
| `purpclaw-state` | **Keep** | state |
| `purpclaw-eventbus` | **Keep** | messaging |
| `purpclaw-gatekeeper` | **Keep** | security |
| `purpclaw-metrics` | **Keep** | telemetry |
| `purpclaw-cognitive` | **Keep** | memory (Python+FAISS) |
| `purpclaw-nextjs` | **Keep** | cockpit |
| `purpclaw-context` | **Check** | different boundary from state, but verify usage |
| `purpclaw-coordinator` | **Check** | different from orchestrator/tower, but verify overlap |
| `purpclaw-workers` | **Check** | different from pool (background vs request), but verify |
| `purpclaw-harness` | **Check** | could be CLI-only unless always-on audit needed |
| `purpclaw-voice` | **Keep-Dark** | voice TTS/STT, known-flaky |
| `purpclaw-voice-ingress` | **Keep-Dark** | STT → orchestrator |
| `purpclaw-bridge` | **Keep-Dark** | voice bridge |
| `purpclaw-vision` | **Keep-Dark** | vision monitor |
| `purpclaw-yolo` | **Keep-Dark** | YOLO detection |
| `purpclaw-avatar` | **Keep-Dark** | avatar bridge |
| `purpclaw-chorus` | **Keep-Dark** | companion chorus |
| `purpclaw-stt` | **Keep-Dark** | speech-to-text |
| `purpclaw-reasoning` | **Keep-Dark** | reasoning loop |
| `purpclaw-telegram` | **Keep-Dark** | optional surface, ready/not_configured |
| `purpclaw-thringlet` | **Keep-Dark** | thringlet bridge |

## What is NOT a service (correctly already modules)

| Thing | What it should be |
|---|---|
| 73 agents | agent configs/personas |
| 378 skills | tool registry entries |
| 17 provider definitions | config/module |
| 6 OMNI tools | modules |
| Bigboss dispatcher | slash command module |
| Coding eval runner | CLI command |
| Eval datasets | data |
| Prompt templates | files |

## Currently online (6)

`api`, `eventbus`, `state`, `coordinator`, `harness`, `cognitive` (and `nextjs` actually, false positive on doctor).

## Defined-but-dark (19)

The 19 services in `ecosystem.config.js` that aren't running. The ecosystem comment says these are known-flaky on Windows. Use `purpclaw safe-start --core` to bring up the stable 14, or `purpclaw safe-start --all` for everything. **Never** `pm2 start ecosystem.config.js` — that triggered the cascade.

## To bring the dark cluster up

```bash
purpclaw safe-start --core    # 14-service stable baseline
purpclaw safe-start --dark    # wake the dark cluster
purpclaw safe-start --all     # everything
```

## Full audit doc

See `STRESS/PURPCLAW-SERVICE-MAP.md` for the 260-line version with:
- Per-service 7-question keep-test
- Port map (port + calls + called-by)
- Doctor's "7 required issues" with explanations
- SpendGate status (1M cap tripped)
- Recommendation matrix

## Final rule

> **Eyes live. Ears on. Mouth honest. Hands locked. Brain classified.**

> **Do not delete anything yet.**
> Mark it: Keep / Check / Merge later / CLI-only later.
> That's enough. Future Eddie at 3am will thank past Eddie for the map.

## Scent status

**Low Tide Regret** — confirmed for the next product launch. Tags: `kelp`, `old sand`, `mild despair`. Avoiding `Clam Chowder Surprise` to keep the FDA off our back.
