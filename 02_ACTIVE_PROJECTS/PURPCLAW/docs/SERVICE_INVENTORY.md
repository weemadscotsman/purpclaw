# PURPCLAW Service Inventory

Audit date: 2026-07-31. Canonical tree only (`E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`, branch `main`).
Produced before any consolidation, per the rule: **do not merge or delete a
service until its consumers and state ownership are proven.**

## Headline: the service tiering already exists

`ecosystem.config.js:47-58` gates the PM2 app list:

```js
const CORE = new Set([ 12 services ]);
const SERVICES = (process.env.PURPCLAW_SERVICES || 'core').split(',');
const ENABLED = SERVICES.includes('all') ? null
              : SERVICES.includes('core') ? CORE
              : new Set(SERVICES);
const isDark = name => ENABLED !== null && !ENABLED.has(name);
// ...
].filter(a => !isDark(a.name))
```

So the default `pm2 start ecosystem.config.js` starts **11 CORE apps** (when `PURPCLAW_SERVICES=core`), filtered from the 38 defined in the file. `PURPCLAW_SERVICES=all` restores everything; an explicit comma list selects exactly those. This landed after a mass start of all 38 saturated the machine.

**Consequence:** the service registry lists 26 services while the default PM2
config starts 11. That is intentional — `safe-start` and `doctor` now derive from
`service_registry.js` as the single source of truth.

## Inventory

`tier` = present in the default CORE set. `req` = `required` flag in
`service_registry.js`. `refs` = files referencing the port.

| service | port | tier | req | refs | entry point |
|---|---|---|---|---|---|
| eventbus | 7782 | CORE | yes | 17 | `unified_eventbus.js` |
| state | 7783 | CORE | yes | 7 | `unified_state.js` |
| api | 7780 | CORE | yes | 44 | `unified_api.js` (5036-line monolith: HTTP + WebSocket + LLM routing) |
| tower | 7790 | CORE | yes | 20 | agent registry + spawning (dual: PM2 service + CLI-embedded) |
| orchestrator | 7784 | CORE | yes | 21 | `orchestrator.js` (workflow queue + job contracts) |
| gatekeeper | 7791 | CORE | yes | 10 | rate limiting + API keys |
| metrics | — | EMBEDDED | no | — | REMOVED 2026-07-31 — inline counters only; was passive scraper (monitored but NOT consumed by any decision system) |
| pool | 7885 | CORE | yes | 8 | skill/agent index — PERSISTENT: `.purpclaw/hivemind/`, `agent_work/pool/` |
| workers | 7897 | CORE | yes | 4 | overflow worker lane |
| context-bus | 7881 | CORE | yes | 2 | context bus messages |
| nextjs | 3030 | CORE | yes | 14 | `next` dev server (production build broken — BUILD_ID missing since 2026-07-30) |
| cognitive | 7880 | CORE | no | 18 | `cognitive_gateway.js` (Python spine subprocess: 1GB Node + up to 8GB Python) |
| gateway-server | 9119 | gateway | no | — | `bin/purpclaw.js serve` — /v1/* API endpoints, A2A agent-card, SSE streaming |
| coordinator | — | REMOVED | no | 0 | Tombstoned 2026-07-31 — swarm mission dispatch moved to orchestrator + agent_tower |
| goop | 7895 | goop | no | 2 | GOOP playground |
| tts-gateway | 7799 | voice | no | — | Kokoro TTS |
| xiaozhi | — | voice | no | — | Xiaozhi cloud bridge |
| discord | 7796 | companions | no | — | Discord adapter |
| slack | 7797 | companions | no | — | Slack adapter |
| voice-coordinator | 7781 | voice | no | 3 | voice orchestration + session management |
| voice-bridge | 7792 | dark | no | 3 | voice WebSocket bridge |
| stt | 7896 | voice | no | 3 | faster-whisper STT |
| voice-ingress | — | dark | no | 0 | voiceorchestrator dispatch |
| chorus | — | dark | no | 0 | companion reactions |
| telegram | 7795 | companions | no | 0 | Telegram adapter |
| vision | 7889 | vision | no | 0 | camera/screen monitor |
| yolo | 7779 | vision | no | 3 | YOLO detection |
| avatar | 7777 | optional | no | 2 | avatar bridge |
| reasoning | 7892 | optional | no | 1 | proactive heartbeat (opt-in) |
| harness | 7798 | developer | no | 4 | harness executor |
| drift-watcher | — | optional | no | 0 | registry/capability drift monitor |
| static-server | 3000 | developer | no | — | static file server (note: port shared with nextjs dev) |
| cowork | — | developer | no | — | desktop overlay HUD |
| email | 7798 | companions | no | — | Email gateway (port shared with harness — confirm actual assignment) |

## Monitored vs used — read this before deleting anything

`metrics` (port 7890) was a **passive scraper** — three places checked it was alive
but none consumed its output. Removed 2026-07-31; replaced with inline counters.
If any consumer is later found that depends on its output stream, it can be restored
as a lightweight pull-based scraper.

## Method and its limits

- Scanned 1225 source files (`.js/.mjs/.ts/.tsx`), excluding `node_modules`,
  `.next`, `vendor`, `.omnicode`, build output and — importantly — the removed
  worktree copies.
- Reference counts come from matching the port in a URL/host position. This
  **undercounts**: the first pass reported `metrics` as zero-consumer because
  the references use the `port: 7890` object-property form, not `:7890`. Treat
  the numbers as a lower bound and confirm per service before acting.
- Not yet established, and required before any merge: **state ownership** (which
  service owns which file/DB/socket) and **startup order**. Neither is inferable
  from port references.

## State ownership — what persists to disk

**Scope**: CORE services + services with file/DB state. Read-only observability
tools (commands, temp scripts) excluded.

| Service | File / Directory | Type | Owner | Notes |
|---------|-----------------|------|-------|-------|
| `pool` | `~/.purpclaw/hivemind/skills/` | dir | pool_service | skill index shards — JSON files |
| `pool` | `~/.purpclaw/hivemind/doctrine/` | dir | pool_service | doctrine index shards — JSON files |
| `pool` | `~/.purpclaw/hivemind/spring-index.json` | file | pool_service | spring registry — atomic write via `spring-index.json.tmp` |
| `pool` | `agent_work/pool/index.json` | file | pool_service | pool index |
| `pool` | `agent_work/pool/queries.jsonl` | file | pool_service | append-only query log — 10K line rotation |
| `pool` | `agent_work/pool/memory.jsonl` | file | pool_service | append-only memory log — 5K line rotation |
| `pool` | `agent_work/pool/failures.jsonl` | file | pool_service | append-only failure log |
| `workers` | `agent_work/worker-tasks.json` | file | worker_service | persistent task store — JSON full-rewrite |
| `context-bus` | `agent_work/shared.json` | file | context-bus | cross-agent context — write via fcntl lock |
| `context-bus` | `agent_work/.context.lock` | file | context-bus | fcntl lock file — prevents concurrent writes |
| `orchestrator` | `~/.purpclaw/sessions/<sessionId>/result.json` | file | orchestrator | workflow result per session — mkdir + write |
| `orchestrator` | `lib/hivemind/` (in-process) | module | orchestrator | HIVEMIND loaded as in-process module, not a separate service |
| `api` (unified_api) | `loop_state.json` | file | api | loop state — full-rewrite on update |
| `api` | `purpclaw_settings.json` | file | api | settings — full-rewrite on save |
| `api` | `samantha_memory.json` | file | api | Samantha memory — full-rewrite on save |
| `api` | `agent_score.json` | file | api | agent scoring |
| `api` | `agent_work/llm_ledger.json` | file | api | LLM cost ledger |
| `api` | `agent_work/mochi.json` | file | api | mochi state |
| `api` | `agent_work/evolution.json` | file | api | evolution log |
| `api` | `agent_work/harness_benchmark.jsonl` | file | api | harness benchmarks |
| `api` | `agent_work/harness-benchmark-latest.json` | file | api | latest harness result |
| `lib/a2a-runtime` | `~/.purpclaw/state.db` | sqlite | **SHARED** | SQLite — multiple lib modules write to same file |
| `lib/agent-component` | `~/.purpclaw/state.db` | sqlite | **SHARED** | same DB as a2a-runtime |
| `lib/artifact-manager` | `~/.purpclaw/state.db` | sqlite | **SHARED** | same DB |
| `lib/attachment-manager` | `~/.purpclaw/state.db` | sqlite | **SHARED** | same DB |
| `lib/teleport` (cmd) | `~/.purpclaw/teleport/<name>/manifest.json` | file | teleport cmd | snapshot export — one-shot |
| `lib/teleport` (cmd) | `~/.purpclaw/teleport/<name>/context.json` | file | teleport cmd | snapshot export |
| `lib/teleport` (cmd) | `~/.purpclaw/teleport/<name>/pool.json` | file | teleport cmd | snapshot export |
| `lib/teleport` (cmd) | `~/.purpclaw/teleport/<name>/orchestrator.json` | file | teleport cmd | snapshot export |
| `lib/continuity` | `~/.purpclaw/sessions/<id>/snapshot.json` | file | continuity | session snapshots |

**Key findings:**

- **`pool_service.js`** is the most disciplined — append-only JSONL with rotation,
  spring-index atomic writes, single-writer guarantee documented in
  `docs/POOL_SERVICE_STATE_CONTRACT.md`.
- **`context-bus`** uses fcntl lock on `shared.json` — two-process safe write.
- **`orchestrator`** writes per-session results to `~/.purpclaw/sessions/` — mkdir
  then write, not atomic.
- **`unified_api`** is the most write-heavy — 8+ separate files, mostly full-rewrites
  with no atomicity guarantees.
- **`state.db` SQLite is shared** across 4 lib modules (a2a-runtime,
  agent-component, artifact-manager, attachment-manager). No WAL/AUTO_VACUUM
  observed — concurrent writes from multiple processes are a risk.
- **hivemind** runs as an in-process module inside orchestrator, not as a separate
  service. Its state lives in orchestrator's memory.
- **nextjs, tower, gatekeeper, eventbus, state** — no local file writes observed
  in scanned source. Eventbus and state are pure in-memory pub/sub and state
  containers respectively.

**No defined startup order** — services using fcntl locks (context-bus) or
SQLite (state.db) implicitly require the lock-holder to release before another
process starts. No explicit `waitFor()` chains found in scanned source.

## Proposed classification (draft — not yet acted on)

| class | services |
|---|---|
| Embedded core module | eventbus, state, context-bus, pool, workers, gatekeeper, api, tower, orchestrator (pending state-ownership proof per service) |
| Lazy on-demand worker | vision, yolo, stt, voice-coordinator, avatar, telegram, reasoning, voice-ingress |
| Dark (flaky/optional) | chorus, goop, voice-bridge |
| External dependency | nextjs (WebUI — production build broken since 2026-07-30), cognitive spine (Python subprocess on 7888) |
| Developer-only | harness, drift-watcher |
| Removed | coordinator (tombstoned), metrics (removed — inline counters only), thringlet (tombstoned — Next.js API route) |

This table is a proposal derived from reference counts and tier membership. It
is **not** a mandate to merge. Each row needs its state ownership and startup
order established first.

## Next slice

1. **State ownership**: trace what each CORE service writes (files, DB, sockets) — especially pool, workers, context-bus.
2. **Next.js production build**: BUILD_ID missing since 2026-07-30 — determine if it is a production dependency or dev-only tool.
3. **Pool atomic writes**: write the state contract before touching the code (atomic writes, append-log replay, compaction rule, single-writer guarantee, crash test).
4. **Fill registry gaps**: 7 ecosystem services (xiaozhi, gateway-server, static-server, cowork, tts-gateway, discord, slack, email) not yet in `service_registry.js`.
5. **Health probes**: doctor already has profile-filtered probes; verify all core services return real health responses.
