# PURPCLAW Routing Map

Generated: 2026-06-21T20:56:05.847Z
Canonical live root: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`
Canonical UI: `http://127.0.0.1:3030/mission`

## Port Truth

`3030` is the PM2 `purpclaw-nextjs` process for this repo. `3000` is a separate Vite process and must not be treated as the PURPCLAW canonical UI.

## Canonical Surfaces

| Surface | Route | Owner |
|---|---:|---|
| Main work/chat surface | `/mission` | `app/mission/page.tsx` + `app/components/MissionControl.tsx` |
| Mochi pet page | `/mochi` | `app/mochi/page.tsx` |
| Cognitive/memory backend | `:7880` | `cognitive_spine.py` |
| Service proxy | `/api/service-proxy` | `app/api/service-proxy/route.ts` |
| Mission aggregate data | `/api/mission-data` | `app/api/mission-data/route.ts` |

## Memory End To End

The active memory system is not a visual prop. The path is:

1. UI/composer and mission operations call app API routes or harness/kernel code.
2. Runtime memory wrapper `lib/memory-client.js` calls `http://127.0.0.1:7880/memory/ingest` and `/memory/recall`.
3. `cognitive_spine.py` owns transport on `7880` and delegates to `MemoryMatrixV2` from `memory_matrix_v2.py`.
4. `MemoryMatrixV2` writes atoms, working context, temporal index, counterfactual branches, lifted facts, and symbolic bridge output.
5. Mission UI reads memory proof through `app/api/mission-data/route.ts`, `app/hooks/useMissionData.ts`, and `app/components/MissionControl.tsx`.
6. Agent self-context now tells agents to use `/memory/recall` and `/memory/ingest`, not stale `/recall` and `/ingest`.

Verified live: `POST /memory/ingest` returned a memory id and `POST /memory/recall` returned the same memory.

## Cognitive Spine Endpoints

- `GET /cognitive/health`
- `GET /memory/health`, `/memory/stats`, `/memory/context`, `/memory/lifted`
- `POST /memory/ingest`, `/memory/recall`, `/memory/react`, `/memory/lift`, `/memory/ground`
- `POST /diagnostics/diagnose`
- `GET /diagnostics/vote`, `/diagnostics/causal-graph`, `/diagnostics/causal-graph/dot`
- `GET /rules/stats`, `/rules/infer`; `POST /rules/query`, `/rules/assert`, `/rules/rule`, `/rules/check`
- `GET /modal/engine/stats`
- `GET /neuro-symbolic/stats`; `POST /neuro-symbolic/query`, `/neuro-symbolic/lift/anomaly`
- `POST /autodream/dream`

## App Routes Found

| Route | File |
|---|---|
| /agents | `app/agents/page.tsx` |
| /bridge | `app/bridge/page.tsx` |
| /cockpit | `app/cockpit/page.tsx` |
| /dash | `app/dash/page.tsx` |
| /evolution | `app/evolution/page.tsx` |
| /inline | `app/inline/page.tsx` |
| /mission/harness | `app/mission/harness/page.tsx` |
| /mission | `app/mission/page.tsx` |
| /mochi | `app/mochi/page.tsx` |
| /omni | `app/omni/page.tsx` |
| /pipeline | `app/pipeline/page.tsx` |
| /preprompt | `app/preprompt/page.tsx` |
| /providers | `app/providers/page.tsx` |
| /settings | `app/settings/page.tsx` |
| /skyscraper | `app/skyscraper/page.tsx` |
| /swarm | `app/swarm/page.tsx` |
| /system-map | `app/system-map/page.tsx` |
| /voice | `app/voice/page.tsx` |

## PM2 Services

| Name | Status | PID | CWD |
|---|---|---:|---|
| purpclaw-api | online | 15028 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-cognitive | online | 1468 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-context | online | 14536 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-coordinator | online | 16448 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-eventbus | online | 14656 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-gatekeeper | online | 15544 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-harness | online | 5812 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-metrics | online | 16436 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-nextjs | online | 12440 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-orchestrator | online | 9824 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-pool | online | 7316 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-state | online | 14524 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-tower | online | 15000 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |
| purpclaw-workers | online | 12920 | E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW |

## Listening Ports

| Port | PID | Command |
|---:|---:|---|
| 3000 | 2940 | "C:\nvm4w\nodejs\node.exe" node_modules/vite/bin/vite.js --port 3000  |
| 3030 | 12440 | C:\nvm4w\nodejs\node.exe "E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\node_modules\next\dist\bin\next" start -p 3030 |
| 5040 | 1620 |  |
| 5432 | 4676 |  |
| 5432 | 4676 |  |
| 7778 | 15028 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7780 | 15028 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7782 | 14656 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7783 | 14524 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7784 | 9824 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7790 | 15000 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7791 | 15544 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js --server |
| 7798 | 5812 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7880 | 15248 | C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe "E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\cognitive_spine.py" --port 7880 |
| 7881 | 14536 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7885 | 7316 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7890 | 16436 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js --port 7890 |
| 7897 | 12920 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |
| 7898 | 16448 | node C:\Users\Admin\AppData\Roaming\npm\node_modules\pm2\lib\ProcessContainerFork.js |

## Cleanup Rule

No new page should be added unless it replaces at least two duplicate pages. Existing extra routes should be merged into `/mission` or `/mochi` only after their working features are mapped and preserved. The old static `app/public/ui` and `public/skyscraper` surfaces are legacy baggage unless proven to own unique working behavior.
