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

So the default `pm2 start ecosystem.config.js` now defines **12** apps, not 34.
`PURPCLAW_SERVICES=all` restores every service; an explicit comma list selects
exactly those. This landed after a mass start of all 34 saturated the machine.

**Consequence:** the service registry lists 27 services while the default PM2
config defines 12. That is intentional, not drift — but nothing documented it,
and a health sweep reading the registry will report 15 services "down" that were
never meant to start.

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
| coordinator | — | REMOVED | no | 0 | Tombstoned 2026-07-31 — swarm mission dispatch moved to orchestrator + agent_tower |
| goop | 7895 | goop | no | 2 | GOOP playground |
| tts-gateway | 7799 | voice | no | — | Kokoro TTS |
| xiaozhi | — | voice | no | — | Xiaozhi cloud bridge |
| discord | 7796 | companions | no | — | Discord adapter |
| slack | 7797 | companions | no | — | Slack adapter |
| voice-coordinator | 7781 | voice | no | 3 | voice coordinator |
| voice-bridge | 7792 | voice | no | 3 | voice WebSocket bridge |
| stt | 7896 | voice | no | 3 | faster-whisper STT |
| voice-ingress | — | voice | no | 0 | voiceorchestrator dispatch |
| chorus | — | companions | no | 0 | companion reactions |
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

`metrics` (7890) is CORE, `required: true`, always on. Its only references are
health-check registries:

- `orchestrator.js:2190` — `{ pm2Name: 'purpclaw-metrics', port: 7890, class: 'core' }`
- `app/hooks/useMissionData.ts:335` — dashboard service row
- `scripts/tui.js:45` — port map

Nothing fetches data from it. It is **monitored, not consumed** — three places
check that it is alive and none use its output. That makes it the strongest
embed-or-delete candidate in the CORE tier, but the state it owns has not yet
been traced, so it stays for now.

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

## Proposed classification (draft — not yet acted on)

| class | services |
|---|---|
| Embedded core module | eventbus, state, context-bus, metrics, pool, workers, gatekeeper (candidates — pending state-ownership proof) |
| Lazy on-demand worker | vision, yolo, stt, voice-*, avatar, chorus, telegram, remotion/render, python sandbox |
| External dependency | nextjs (WebUI), cognitive spine's python backend (7888) |
| Developer-only | goop, harness, drift-watcher, reasoning |

This table is a proposal derived from reference counts and tier membership. It
is **not** a mandate to merge. Each row needs its state ownership and startup
order established first.

## Next slice

1. Trace state ownership for the CORE seven (what each writes: files, DB, sockets).
2. Supervisor/bootstrap owning lifecycle, with an embedded/lazy/external registry.
3. Move the memory spine's start/stop under the core process.
4. Real read/write health probes everywhere (`lib/doctor.js` already does this
   for memory as of `2103fd0`; `purpclaw doctor` in `bin/purpclaw.js` still
   prints OK for services that are not running and needs the same treatment).
