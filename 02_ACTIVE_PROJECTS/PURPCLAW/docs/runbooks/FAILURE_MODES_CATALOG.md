# 🐉 PURPCLAW Failure-Modes Catalog

> **Author:** Dragon (Chief Architect, ENGINEERING division)
> **Scope:** Every recurring production failure mode in the PURPCLAW swarm,
> grounded in the real code paths (`lib/llm-provider.js`, `lib/agent-personas.js`,
> `agent_tower.js`, `model_registry.json`, `purpclaw_settings.json`, `.env.example`).
> **For:** On-call operators, the AutoDream self-heal loop, and the SMITH/NEO chaos pair.

Each entry follows the same shape:
- **ID** — stable tag for alerting/dashboards
- **Symptom** — exact log line(s), metric, exit code
- **Root cause** — what the code actually does
- **Remediation** — exact fix, ordered, copy-pasteable
- **Detection hint** — how AutoDream / CACTUS should catch it automatically

---

## How to use this catalog

1. Operator sees a symptom → grep this doc for the log line.
2. Run the **Detection hint** check (curl, grep, env).
3. Apply **Remediation** step 1 → step N.
4. Add the failure to `lib/runtime/telemetry-console` counters so it self-recurs next time.

Exit code convention (Node PM2 + lib/* services):
- `0` clean
- `1` uncaught exception
- `2` misuse (bad arg / unknown agent)
- `3` provider auth (401/403)
- `4` provider rate-limit (429)
- `5` model-not-found (404 from provider or unknown model id in registry)
- `6` queue/registry overflow
- `7` persona collision at boot
- `8` telemetry drop (counter delta < expected for > N seconds)
- `9` config drift detected (registry hash mismatch)

---

## FM-01 · Missing API key

**Symptom**
- Log line: `[llm-provider] Missing API key for provider "kimi" — set KIMI_API_KEY in .env`
- HTTP response: `401 Unauthorized` from provider
- Provider responses in `/api/health`: `Provider ⚠️ demo` even though `purpclaw_settings.json` declares `kimi.enabled = true`
- Metric: `provider_errors_total{provider="<name>",code="401"}` increments
- Exit code (CLI): `3`

**Root cause**
The provider registry in `lib/llm-provider.js` resolves a key by:
1. Provider-native alias (`KIMI_API_KEY`, `OPENAI_API_KEY`, …) — defined in `.env.example`
2. Generic `LLM_API_KEY`
3. `purpclaw_settings.json` → `aiBackends[i].apiKey`

If all three are empty AND `purpclaw.config.json → provider.default !== "demo"`, the boot self-check in `healthcheck.js` warns. If the operator flipped `mode` to `api`/`local` without copying a key from `.env.example`, every chat returns the auth error above. The `activeBackend` in `purpclaw_settings.json` may also point at a backend whose `enabled: false`.

**Remediation**
1. Verify which provider is active:
   ```bash
   node -e "console.log(process.env.LLM_PROVIDER || require('./purpclaw_settings.json').activeBackend)"
   ```
2. Set the matching key in `.env` (do NOT commit):
   ```bash
   # example for kimi
   echo 'KIMI_API_KEY=sk-…' >> .env
   ```
3. If using the NIM 5-lane pool, set all five:
   `NVIDIA_API_KEY_PURP1..5` plus `NVIDIA_API_KEY_BACKUP1..5` (see `.env.example`).
4. Reload: `node bin/purpclaw.js safe-stop --core && node bin/purpclaw.js safe-start --core`
5. Confirm: `curl -s localhost:7790/health | jq .providers`

**Detection hint**
- `curl -s :7780/api/health | jq '.providers[] | select(.status=="demo" and .expected=="api")'`
- Watch for `provider_errors_total{code="401"}` sustained for > 30s

---

## FM-02 · Wrong model name

**Symptom**
- Log line: `Unknown model "kimi-k2-5" for provider "kimi" — provider returned 404`
- HTTP response: `404 model_not_found` (Anthropic / OpenAI / NVIDIA NIM all return this shape)
- Chat returns empty content with `finish_reason: "error"`
- Metric: `provider_errors_total{provider,code="404"}` ↑ AND `swarm_invalid_model_total` ↑
- Exit code (CLI smoke test): `5`

**Root cause**
Three sources of truth drift from each other:
| Source | Field | Holds |
|---|---|---|
| `purpclaw_settings.json` | `aiBackends[i].model` + top-level `model` | e.g. `"deepseek-chat"` |
| `model_registry.json` | `routing.swarm.model`, `routing.code.model`, … | `"kimi-k2-6"`, `"minimaxai/minimax-m3"` |
| `lib/llm-provider.js` | `PROVIDERS.<name>.defaultModel` | `"kimi-k2-5"`, `"MiniMax-M2.7"`, `"deepseek-v4-pro"` |

If the operator hand-edited one but not the others (or `purpclaw_settings.json` was last written before a provider upgrade), the call hits a model the provider has retired/renamed. **Real drift already present in this repo:** `model_registry.json` says swarm = `kimi-k2-6` but `lib/llm-provider.js` provider default is `kimi-k2-5`. Same shape with `minimaxai/minimax-m3` (registry) vs `MiniMax-M2.7` (provider default).

**Remediation**
1. Pick the canonical model id from the **provider's** model list (not the registry):
   ```bash
   curl -s https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer $NVIDIA_API_KEY" | jq '.data[].id'
   ```
2. Update **all three** in lockstep:
   - `purpclaw_settings.json` → `aiBackends[i].model` AND top-level `model`
   - `model_registry.json` → `routing.<job>.model`
   - (optional) `lib/llm-provider.js` → `PROVIDERS.<name>.defaultModel`
3. Restart: `node bin/purpclaw.js safe-stop --core && safe-start --core`
4. Smoke: `node bin/purpclaw.js ask "reply with the word ok"`

**Detection hint**
- Compare the SHA-256 of `model_registry.json`, the `aiBackends[].model` set, and `lib/llm-provider.js PROVIDERS.*.defaultModel`. Any mismatch = FM-02 pre-condition.
- AutoDream weekly: `node scripts/check-model-drift.js` (TODO if absent).

---

## FM-03 · Vector store auth mismatch

**Symptom**
- Log line: `[vector/qdrant] 401 — check QDRANT_API_KEY vs QDRANT_URL endpoint`
- HTTP response: `401 Unauthorized` or `403 Forbidden` from `/collections/<name>/points`
- RAG retrieval returns zero hits; chat says "I don't have context for that"
- Metric: `vector_query_errors_total{code="401|403"}` ↑; `vector_results_total{result="empty"}` ↑
- Exit code (vector provider module): `3`

**Root cause**
`lib/vector/` has multiple providers (qdrant, chroma, pgvector, faiss). Each pairs:
- An **endpoint** (`QDRANT_URL`, `CHROMA_URL`, `PGVECTOR_DSN`)
- An **auth credential** (`QDRANT_API_KEY`, `CHROMA_TOKEN`, `PGVECTOR_PASSWORD`)

Mismatch patterns:
1. Endpoint points at managed cloud (e.g. `xyz.qdrant.io`) but key is the local self-signed token
2. Endpoint is `http://localhost:6333` but key is required (cloud endpoint also configured and selected by mistake)
3. Endpoint was rotated by the vendor; key is stale
4. The vector provider selection in `purpclaw_settings.json` doesn't match the `.env` key naming (`QDRANT_API_KEY` vs `VECTOR_STORE_TOKEN`)

**Remediation**
1. Identify which provider is live:
   ```bash
   node -e "console.log(process.env.VECTOR_STORE || 'qdrant')"
   ```
2. Match the key name to that provider's env var (see `.env.example`):
   - qdrant → `QDRANT_URL` + `QDRANT_API_KEY`
   - chroma → `CHROMA_URL` + `CHROMA_AUTH_TOKEN`
   - pgvector → `PGVECTOR_DSN`
3. Smoke-test the endpoint out-of-band:
   ```bash
   curl -s $QDRANT_URL/collections -H "api-key: $QDRANT_API_KEY" | jq .
   ```
4. Reload + re-index if schema drifted:
   `node bin/purpclaw.js vector reindex --collection purpclaw`

**Detection hint**
- `/api/health/vector` returns `{ok:false, code:401}`
- `vector_query_latency_ms` p99 spikes AND `vector_results_total{result="empty"}` > 80%

---

## FM-04 · Agent persona collision

**Symptom**
- Log line at boot: `[AGENT_TOWER] persona key "rabbit" already registered — skipped (1 collision)`
- Boot stats: `personasAdded: 0, personasSkipped: 5` (or higher)
- `spawn(rabbit)` and `spawn(bunny)` dispatch the **same** agent (whichever was loaded second wins) — silent over-write, no error
- Metric: `persona_collision_total` ↑; `tower_registry_size` < expected
- Exit code (when `--strict-personas` flag set): `7`

**Root cause**
`agent_tower.js` does:
```js
for (const [key, entry] of Object.entries(personaEntries)) {
  if (AGENT_TOWER.registry[key]) { skipped++; continue; }
  AGENT_TOWER.registry[key] = entry;
  added++;
}
```
That is a **silent skip on collision** — the hardcoded animal registry wins, the persona `.md` file is ignored. **Real collisions already present in this repo:**
- `rabbit` 🐰 (SECURITY, Defensive Programmer) vs `bunny` 🐰 (SECURITY, Quick Reaction) — same emoji, same key space risk if any future persona file uses `bunny` or `rabbit` as its `name:` frontmatter
- `crow` (CREATIVE Gatherer) and `raven` (INTELLIGENCE Signals Analyst) have overlapping skills — `collection` vs `comms`
- `agents/code-reviewer.md` may export `name: code-reviewer` which collides if a future animal agent uses that key

**Remediation**
1. Run the collision report:
   ```bash
   node -e "require('./agent_tower.js')" 2>&1 | grep -E "personasAdded|personasSkipped"
   # OR
   curl -s :7790/api/tower/registry | jq '.stats'
   ```
2. If `personasSkipped > 0`, list the colliding keys:
   ```bash
   curl -s :7790/api/tower/registry | jq '.collisions'
   ```
3. Decide: rename the animal key (e.g. `rabbit` → `rabbit-defensive`) OR rename the persona file's frontmatter `name:` to a non-colliding namespace (e.g. `code-reviewer-pc`).
4. If you want strict boot, export `PURPCLAW_PERSONA_STRICT=1` so collisions exit `7` instead of skipping.
5. Reload.

**Detection hint**
- `tower.personasSkipped > 0` for > 1 restart cycle
- `spawn(personaName).id === spawn(animalName).id` for an un-expected pair (cross-check via `/api/tower/active`)

---

## FM-05 · Queue / agent-slot backlog overflow

**Symptom**
- Log line: `[AGENT_TOWER] max active reached (100) — task queued. backlog=47`
- HTTP `/api/tower/spawn`: returns `202 Accepted` with `{queued:true, eta_ms:…}` instead of `200`
- `agent_spawn_latency_ms` p99 > 30s; UI shows "Warming up…"
- Metric: `tower_active_agents` pinned at `PURPCLAW_MAX_ACTIVE_AGENTS` (default 100); `tower_queue_depth` rising; `PURPCLAW_SPAWN_COOLDOWN_MS` (1000ms default) throttling visibly
- Exit code on forced eviction: `6`

**Root cause**
Caps in `.env`:
- `PURPCLAW_MAX_ACTIVE_AGENTS=100`
- `PURPCLAW_MAX_ACTIVE_PER_DIVISION=12`
- `PURPCLAW_SPAWN_COOLDOWN_MS=1000`
- `PURPCLAW_RESEARCH_CONCURRENCY=2` (Deep Research Group)
- `PURPCLAW_RATE_LIMIT_STREAM=30`

Backlog grows when (a) a swarm burst (e.g. WOLF coordinating 50+ missions) exceeds per-division cap, (b) an upstream provider rate-limits (429) and tasks pile up in the EventBus port 7782, or (c) telemetry drop (FM-08) hides the queue depth counter so the cap is never enforced.

**Remediation**
1. Read the live queue:
   ```bash
   curl -s :7790/api/tower/queue | jq '.depth,.oldest_ms'
   ```
2. Drain with grace:
   ```bash
   node bin/purpclaw.js tower drain --max 30
   ```
3. Raise caps **only after** verifying the bottleneck isn't upstream (FM-04 collisions waste slots, FM-01 auth errors retry forever):
   ```bash
   # .env
   PURPCLAW_MAX_ACTIVE_AGENTS=250
   PURPCLAW_MAX_ACTIVE_PER_DIVISION=24
   ```
4. Restart the tower:
   `node bin/purpclaw.js safe-stop tower && safe-start tower`
5. If backlog > 200 sustained, escalate — likely an upstream provider storm; consider PURPCLAW_RESEARCH_CONCURRENCY=1 and PURPCLAW_RESEARCH_MIN_DELAY_MS=3000.

**Detection hint**
- `tower_queue_depth > 50` for > 60s
- `tower_active_agents == PURPCLAW_MAX_ACTIVE_AGENTS` AND `tower_queue_depth > 0` (saturated)
- EventBus port 7782 backlog on `/admin/queues`

---

## FM-06 · Queue backlog overflow (provider event bus)

> Distinct from FM-05 — this is the **publish/subscribe** event bus (port 7782),
> not the agent spawn queue.

**Symptom**
- Log line: `[EVENTBUS] buffer overflow — dropped 124 events on topic tower.spawn`
- `broadcast()` in `agent_tower.js` logs `SSE client error: …` repeatedly
- UI loses live updates (agent state freezes); SMITH/NEO attack-defence ledger gaps
- Metric: `eventbus_dropped_total{topic}` ↑; `eventbus_buffer_size` pegged at `MAX_BUFFER`
- Exit code: `6`

**Root cause**
The in-memory ring buffer in `lib/runtime/eventbus.js` has a fixed cap. When:
- A storm of `publishEventBus()` calls comes in (e.g. chaos round, swarm fanout of 100+)
- SSE clients (`AGENT_TOWER.sseClients`) are slow / disconnected and the per-client write blocks
- The process is under memory pressure and the GC stalls the event loop

…the buffer fills, the oldest events are dropped, and downstream consumers (UI, ledger) see gaps.

**Remediation**
1. Confirm:
   ```bash
   curl -s :7782/health | jq '.buffer.usage,.dropped_total'
   ```
2. Increase the buffer (env):
   ```bash
   EVENTBUS_BUFFER_MAX=10000   # default is usually 1000
   ```
3. Drop dead SSE clients:
   ```bash
   curl -s :7790/api/tower/sse/clients | jq 'length'
   # if > 50 stale, restart the tower:
   node bin/purpclaw.js safe-restart tower
   ```
4. If dropped events matter, add persistence: `EVENTBUS_PERSIST=sqlite` so the next subscriber can replay.

**Detection hint**
- `eventbus_dropped_total > 0` for > 5 minutes
- `eventbus_buffer_size / eventbus_buffer_max > 0.9` sustained

---

## FM-07 · Cold-start latency spike

**Symptom**
- Log line: `[llm-provider] first-call cold start for "ollama/qwen2.5:3b" — 8421ms`
- First chat after `safe-start` returns > 5s; subsequent < 800ms
- For NIM: `[nvidia] first request to model "minimaxai/minimax-m3" — 11.3s` (NIM cold-pulls weights)
- Metric: `llm_first_call_latency_ms` > 5000; `llm_first_call_warm_latency_ms` < 1000
- Exit code: `0` (not an error — but a real UX cliff)

**Root cause**
Four cold-start sources:
1. **Ollama** loads model into VRAM on first call after process start or after `ollama stop`
2. **NVIDIA NIM** cold-pulls weights from registry (1–30s depending on size)
3. **PM2 cluster worker** has no in-memory cache; first request pays JIT cost + module load
4. **Agent tower** first spawn pays `lib/agent-personas.js` file walk + frontmatter parse on cold `require`

If you switch providers (`LLM_PROVIDER=glm → kimi`), the first call to the new provider pays a fresh TCP/TLS handshake + DNS resolution.

**Remediation**
1. **Warm up** after boot:
   ```bash
   node bin/purpclaw.js warmup --provider ollama --model qwen2.5:3b
   ```
2. Keep Ollama resident: `OLLAMA_KEEP_ALIVE=24h` in `.env`
3. Pin NIM model warm: add a 30s cron:
   ```cron
   */5 * * * * curl -sf -X POST $NVIDIA_BASE_URL/chat/completions -H "Authorization: Bearer $NVIDIA_API_KEY" -d '{"model":"minimaxai/minimax-m3","messages":[{"role":"user","content":"ping"}],"max_tokens":1}' >/dev/null
   ```
4. Increase PM2 `kill_timeout` so a slow first request doesn't trigger a restart loop:
   ```js
   // ecosystem.config.js
   { name: 'purpclaw-tower', kill_timeout: 30000 }
   ```
5. For UI: surface a "Warming models…" banner on first message after boot.

**Detection hint**
- `llm_first_call_latency_ms / llm_first_call_warm_latency_ms > 5x`
- `cold_start_total > 0` per hour, monotonic
- Track with `metrics_aggregator.js` `cold_start_duration_seconds` histogram

---

## FM-08 · Telemetry drop

**Symptom**
- Log line: `[telemetry-console] buffer overflow — 412 metrics dropped`
- Grafana / `metrics_aggregator.js` shows flatlines for one or more counters during a known-active window
- `PURPCLAW_TAINT=1` (chaotic UI text mode) may hide the gap visually
- Metric: `telemetry_dropped_total` ↑; `telemetry_flush_failures_total` ↑
- Exit code on telemetry daemon crash: `8`

**Root cause**
`lib/runtime/telemetry-console` buffers in-process metrics and flushes on interval. Drop happens when:
- Process is paused (synchronous heavy task > buffer-flush interval)
- Disk write fails (`E:\_purp-temp` or `C:\Users\Admin\AppData\Local\hermes` full / read-only)
- The flush endpoint (`metrics_aggregator.js` on port 7890) is down → buffer fills → drops
- An exception inside the flush callback silently kills the interval

This is especially dangerous because the **counters you need to debug other failures are themselves the failure** — `eventbus_dropped_total` is invisible while telemetry is dropping.

**Remediation**
1. Check the flush endpoint:
   ```bash
   curl -sf :7890/health || node bin/purpclaw.js safe-start metrics
   ```
2. Verify disk:
   ```bash
   df -h $TMPDIR     # E:\purp-temp
   ```
3. Increase buffer + flush frequency:
   ```bash
   TELEMETRY_BUFFER_MAX=20000
   TELEMETRY_FLUSH_MS=2000   # default ~5000
   ```
4. Force a flush + replay:
   ```bash
   node bin/purpclaw.js telemetry flush --force
   ```
5. Add a watchdog: a cron that posts `{flush:true}` to `:7890/admin/flush` every 60s and alerts if `telemetry_dropped_total` rises between flushes.

**Detection hint**
- `telemetry_dropped_total > 0` for > 2 minutes
- `telemetry_flush_failures_total > 0`
- Counter flatline during a known burst (cross-check against EventBus `topic: "tower.*"` count)

---

## FM-09 · Drift between agent config versions

**Symptom**
- Log line: `[AGENT_TOWER] config drift detected — registry_sha256 mismatch (expected …, got …)`
- A spawned agent reports `tier: 3` in `/api/tower/registry` but `tier: 2` in the active spawn response
- `agent_tower.js` boot stats: `personasAdded` differs from the previous boot's value
- The persona file's `model:` frontmatter (`sonnet`, `opus`) silently maps to a different default than `agent_tower.js` hardcoded `provider/model`
- Metric: `config_drift_total{source}` ↑; `tower_registry_sha256` changes on every restart unexpectedly
- Exit code (when `--strict-config` flag set): `9`

**Root cause**
**Four** sources of truth for agent config, each can drift independently:
1. `agent_tower.js` — hardcoded `AGENT_TOWER.registry` (35 animal agents with `provider`, `model` overrides)
2. `agent_profiles.json` — older mirror, animal agents only, NO provider/model overrides
3. `lib/agent-personas.js` — loads `agents/*.md` frontmatter, builds registry entries, **does not** set provider/model unless the `.md` frontmatter declares it
4. `agent_routing_matrix.js` — separate file with role + give/needs/avoid; **no** skill tier or provider binding
5. `agents/<name>.md` — Claude-Code-style persona files; `model: sonnet` is a *Claude* name that means nothing to PURPCLAW unless remapped

**Real drift already present:**
- `agent_profiles.json` `duck` has `skills: ["research", "data_analysis"]` (2 skills); `agent_tower.js` `duck` has `skills: ['research', 'data_analysis', 'content_creation']` (3 skills) — these two sources disagree on the same agent.
- `agent_routing_matrix.js` declares `duck` division `MEDIA_OPS` ✓ but has no tier field; `agent_tower.js` says tier 1.
- `agents/planner.md` (if it has `model: opus` in frontmatter) will load as tier 2 in the persona registry, but `agent_routing_matrix.js` says planner is a penguin (tier 3) — same logical role, different routing decision.

**Remediation**
1. Run the drift audit:
   ```bash
   node scripts/config-drift-audit.js   # TODO: author if absent
   # manual equivalent:
   node -e "
     const a = require('./agent_tower.js').AGENT_TOWER.registry;
     const b = require('./agent_profiles.json');
     for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
       if (JSON.stringify(a[k]?.skills) !== JSON.stringify(b[k]?.skills)) {
         console.log('SKILL DRIFT', k);
       }
     }
   "
   ```
2. Pick a single source of truth (recommended: `agents/*.md` frontmatter for specialists; `agent_tower.js` for animals).
3. Demote the others to **derived views**:
   - `agent_profiles.json` → regenerate from `agent_tower.js` on every build
   - `agent_routing_matrix.js` → keep (give/needs/avoid is orthogonal to provider/tier)
4. Add a CI guard:
   ```bash
   node scripts/config-drift-audit.js || (echo CONFIG DRIFT && exit 1)
   ```
5. Boot with `PURPCLAW_STRICT_CONFIG=1` so any drift exits `9` and PM2 restarts cleanly.

**Detection hint**
- Boot hash of `AGENT_TOWER.registry` differs from last persisted hash
- `personasAdded` count differs across two consecutive restarts without `.md` changes
- `spawn(architect).model !== agent_routing_matrix.js.architect.model` (when routing matrix is extended with model)

---

## Cross-references

| Failure | Related | Notes |
|---|---|---|
| FM-01 missing key | FM-02 wrong model | Both surface as 401/404; check provider response code first |
| FM-04 persona collision | FM-09 config drift | Both pollute `AGENT_TOWER.registry`; fix drift first, collisions second |
| FM-05 agent overflow | FM-06 eventbus overflow | Independent caps; tune both |
| FM-08 telemetry drop | ALL | Telemetry loss hides every other metric; always check `telemetry_dropped_total` first when debugging |
| FM-07 cold start | FM-01 missing key | Slow first call might also be auth retry — distinguish via 401 vs latency |

## Authoring notes (Dragon → AutoDream)

- Each `FM-NN` ID is stable; reference it from `lib/runtime/telemetry-console` counters (`fm01_missing_key_total`, etc.) so the AutoDream self-heal loop can grep the source.
- Exit codes are reserved in the `lib/runtime/exit-codes.js` table (extend if not present).
- All remediation steps assume the operator runs from the repo root with `node bin/purpclaw.js …`.
- Re-audit this catalog whenever `lib/llm-provider.js` PROVIDERS map or `model_registry.json` `routing` block changes.

— 🐉 Dragon, Engineering division
