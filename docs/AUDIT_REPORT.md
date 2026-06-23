# PURPCLAW Deep Audit Report
Generated: 2026-06-10T15:55:28.074Z

## Summary

- **68/101** checks passed
- **33** failed

## Layers

### L1-services — 11/20 pass
- ✓ **web-ui:3000** — HTTP 404
- ✓ **web-ui-pm2:3030** — HTTP 404
- ✓ **unified-api:7780** — HTTP 200
- ✓ **eventbus:7782** — HTTP 404
- ✓ **state:7783** — HTTP 404
- ✓ **orchestrator:7784** — HTTP 200
- ✗ **modal:7785** — status undefined
- ✗ **diagnostics:7786** — status undefined
- ✗ **rules:7787** — status undefined
- ✓ **agent-tower:7790** — HTTP 404
- ✓ **gatekeeper:7791** — HTTP 404
- ✗ **chorus:7797** — status undefined
- ✗ **bridge-neuro:7799** — status undefined
- ✓ **memory:7880** — HTTP 404
- ✓ **pool:7885** — HTTP 404
- ✗ **autodream:7895** — status undefined
- ✓ **worker-pool:7897** — HTTP 404
- ✗ **ollama:11434** — status undefined
- ✗ **lmstudio:1234** — status undefined
- ✗ **services-summary** — 11/19 online, 8 down

### L2-routes — 26/29 pass
- ✓ **api-routes-discovered** — 27 route files in app/api/
- ✓ **GET api/agent-scores** — HTTP 200
- ✓ **GET api/api-mega-list** — HTTP 200
- ✓ **GET api/bridge** — HTTP 404
- ✓ **GET api/chat** — HTTP 405
- ✓ **GET api/chat/swarm** — HTTP 405
- ✓ **GET api/event-timeline** — HTTP 200
- ✓ **GET api/gatekeeper-status** — HTTP 200
- ✓ **GET api/harness/missions/[id]/abort** — HTTP 405
- ✓ **GET api/harness/missions/[id]** — HTTP 404
- ✓ **GET api/harness/start** — HTTP 405
- ✗ **GET api/harness/status** — HTTP 503
- ✓ **GET api/harness-benchmarks** — HTTP 200
- ✓ **GET api/llm-ledger** — HTTP 200
- ✓ **GET api/mission-data** — HTTP 200
- ✓ **GET api/mochi** — HTTP 200
- ✓ **GET api/mochi-action** — HTTP 405
- ✓ **GET api/playwright** — HTTP 200
- ✓ **GET api/sampler** — HTTP 200
- ✓ **GET api/service-proxy** — HTTP 400
- ✓ **GET api/setup** — HTTP 200
- ✓ **GET api/skill-amendments** — HTTP 200
- ✓ **GET api/thringlets/colony-mood** — HTTP 200
- ✓ **GET api/thringlets** — HTTP 200
- ✓ **GET api/thringlets/[id]/interact** — HTTP 405
- ✗ **GET api/thringlets/[id]** — HTTP 503
- ✓ **GET api/upload** — HTTP 200
- ✓ **GET api/whoami** — HTTP 200
- ✗ **api-routes-probe-summary** — 25/27 responded

### L3-hardcoded-ports — 0/21 pass
- ✗ **no-hardcoded-ports** — 21 files with direct port references
- ✗ **port-in-/app/api/bridge/route.ts** — hits: 127.0.0.1:11434, 127.0.0.1:7780, 127.0.0.1:3030
- ✗ **port-in-/app/api/chat/route.ts** — hits: 127.0.0.1:7780
- ✗ **port-in-/app/api/chat/swarm/route.ts** — hits: 127.0.0.1:7780
- ✗ **port-in-/app/api/event-timeline/route.ts** — hits: 127.0.0.1:7782
- ✗ **port-in-/app/api/gatekeeper-status/route.ts** — hits: 127.0.0.1:7791
- ✗ **port-in-/app/api/mission-data/route.ts** — hits: 127.0.0.1:7780, 127.0.0.1:7790, 127.0.0.1:7782, 127.0.0.1:7784
- ✗ **port-in-/app/api/mochi-action/route.ts** — hits: 127.0.0.1:7885, 127.0.0.1:7892, 127.0.0.1:7895
- ✗ **port-in-/app/api/skill-amendments/route.ts** — hits: 127.0.0.1:7791
- ✗ **port-in-/app/components/CommandPanel.tsx** — hits: localhost:7792
- ✗ **port-in-/app/hooks/useAgentEvents.ts** — hits: localhost:7790, localhost:7782
- ✗ **port-in-/app/hooks/useAgentTower.ts** — hits: localhost:7790, localhost:7780
- ✗ **port-in-/app/hooks/useApi.ts** — hits: localhost:7780
- ✗ **port-in-/app/hooks/useEPSHistory.ts** — hits: localhost:7782
- ✗ **port-in-/app/hooks/useEventTimeline.ts** — hits: localhost:7782
- ✗ **port-in-/app/hooks/useGatekeeperStatus.ts** — hits: localhost:7791
- ✗ **port-in-/app/hooks/useSSE.ts** — hits: localhost:7780
- ✗ **port-in-/app/inline/page.tsx** — hits: localhost:7790, localhost:7782, localhost:7783, localhost:7780
- ✗ **port-in-/app/public/ui/app.js** — hits: localhost:7780
- ✗ **port-in-/app/public/ui/app.jsx** — hits: localhost:7780
- ✗ **port-in-/app/public/ui/data-hooks.js** — hits: localhost:7780, localhost:7790, localhost:7782, localhost:7784

### L4-module-load — 10/10 pass
- ✓ **load-lib/llm-provider.js** — OK
- ✓ **load-lib/agent-loop.js** — OK
- ✓ **load-lib/tools/index.js** — OK
- ✓ **load-lib/spend-gate.js** — OK
- ✓ **load-lib/providers/registry.js** — OK
- ✓ **load-lib/providers/openai-responses.js** — OK
- ✓ **load-lib/providers/anthropic-messages.js** — OK
- ✓ **load-lib/providers/hermes-cli.js** — OK
- ✓ **load-lib/runtime/ports.js** — OK
- ✓ **load-lib/runtime/policy-engine.js** — OK

### L5-aliases — 5/5 pass
- ✓ **alias-spawn** — resolves via alias map
- ✓ **alias-delegate_task** — resolves via alias map
- ✓ **alias-agent_spawn** — resolves via alias map
- ✓ **alias-spawn_agent** — resolves via alias map
- ✓ **alias-__nonexistent_tool__** — correctly not found

### L6-port-registry — 2/2 pass
- ✓ **port-registry-loaded** — 19 services registered
- ✓ **port-registry-probe** — 11/19 up. Down: modal, diagnostics, rules, chorus, bridge-neuro, autodream, ollama, lmstudio

### L7-drivers — 1/1 pass
- ✓ **driver-registry** — 3 drivers: openai_responses, anthropic_messages, hermes_cli

### L8-policy — 6/6 pass
- ✓ **policy-read-only-read** — ok
- ✓ **policy-read-only-write** — mode read-only denies tool write (capability: write)
- ✓ **policy-workspace-write-write** — ok
- ✓ **policy-workspace-write-bash** — mode workspace-write denies tool bash (capability: exec)
- ✓ **policy-danger-full-access-bash** — ok
- ✓ **policy-workspace-write-spawn** — tool spawn requires explicit user approval in mode workspace-write

### L9-agent-loop — 2/2 pass
- ✓ **agent-loop-loads** — runAgent + structured extractor exported
- ✓ **agent-loop-streaming-extract** — detected 2/2 tool calls mid-stream: read, write

### L10-goop — 1/1 pass
- ✓ **goop-direct-egress-blocked** — POST /api/api-mega-list -> 403 (expected 403). Body: {"ok":false,"error":"api-mega-list POST is disabled — use the GOOP broker (see lib/goop-playground)","policy":"direct-eg

### L11-spendgate — 2/2 pass
- ✓ **spendgate-on-chat** — SpendGate referenced in chat()
- ✓ **spendgate-on-stream** — SpendGate referenced in streamChat()

### L12-settings-coverage — 2/2 pass
- ✓ **settings-cog-in-layout** — SettingsCog is wired into the global layout
- ✓ **settings-page-exists** — app/settings/page.tsx exists
