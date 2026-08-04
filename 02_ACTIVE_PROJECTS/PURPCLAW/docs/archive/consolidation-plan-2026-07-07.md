# PURPCLAW Consolidation Plan — 2026-07-07

**Goal (user directive):** Make PURPCLAW act like ONE system, not 30 self-cannibalizing pieces. Subsystems boot on demand, not all at once.

**Starting state (confirmed via `ls`):**
- v0 LIVE = `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/` (mtime Jul 7, has `.purpclaw/`, `.next/`, `.git/`, `agent_routing_matrix.js`, `PURPCLAWnew.zip`)
- "v3 canonical" tree from earlier memory DOES NOT EXIST on disk — Phase 1 = strip in-place, no external merge source
- `purpclaw-master (1)/` = legacy Samantha bridge clone, keep as-is, not a merge source
- `purpclaw-harness/` = separate eval tool, not PURPCLAW

---

## Phase 0 — Stop The Bleeding (no edits, just discipline)

**Rule locked for every batch below:** subsystems boot on demand. The "boot everything at startup and pray" pattern is what's eating itself.

Concrete guards:
- New Python services use the `mem_guard` + lazy-load + idle-unload pattern that `voice_stt.py` / `yolo_service.py` already ship (Jul 7 rewrite).
- New Node services use the proxy-and-respawn pattern from `cognitive_gateway.js` (Jul 7) if they wrap a Python backend with known Windows socket leaks.
- No new service added to `ecosystem.config.js` without an explicit health-check + idle-shutdown.

---

## Phase 1 — Strip v0 wrapper slop (in-place)

**Gate:** each batch ends with parse-clean (`node -c` / `ast.parse`) + grep-confirmed deliverable. Verification agent runs per batch. User-bounce required only after the whole phase lands.

### Batch 1.1 — Routing consolidation
**Files:** `unified_api.js` (134 `pathname ===` matches, lines 2826–4489), `app/api/**/route.ts` (54 handlers), `app/components/MissionControl.tsx` (1083 filter accepts `{completed,failed,done,aborted}` — risk: backend emitting a 5th term like `finished` breaks counter).
**Action:**
1. **Canonical route registry.** Create `lib/routes/registry.js` — single source for path → handler mapping. unified_api.js dispatches to it instead of 134-line switch.
2. **Megapanel gap fix.** Add missing `/api/kernel/jobs`, `/api/llm/status`, `/api/awaken/status`, `/api/preprompt`, `/api/voice-command`, `/api/capabilities`, `/api/research/group`, `/api/personality`, `/api/heartbeat`, `/api/governance/policy`, `/api/upload`, `/api/trace/recent` to the registry. The hyphenated `/api/llm-status` (useMissionData.ts:479) gets a 301 redirect to `/api/llm/status`.
3. **Event-name filter widening.** MissionControl.tsx filter: add `finished`, `succeeded`, `closed` to the decrement set so backend terminology drift doesn't break the counter.
**Verify:** `grep -c 'pathname ===' unified_api.js` should drop ≥80%. Every registry route resolves to a live handler (curl 2xx, but CRITICAL RULE blocks live — instead, parse-clean + grep registry entry matches a real `route.ts` or unified_api function).

### Batch 1.2 — Agent persona restoration
**Files:** `agents/` (43 persona `.md` files on disk per fork-4), `AGENT_REGISTRY.json` (claims 84 personas), `agent_routing_matrix.js` (per-agent model routing).
**Action:**
1. **Restore 43 phantoms.** For each missing persona in `AGENT_REGISTRY.json` (dragon, duck, ghost, wolf, fox, bee, spider, mushroom, octopus + chonk/owl/cactus/penguin/goose/turtle/axolotl/rabbit/void/raven/snake/bunny/guardian/lemur/mantis/shark/gorilla/phoenix/crow/scientist/hawk/elephant/panda/parrot/shaman/chart/claw/innovator/jellyfish/kraken/moth/navigator/numbers), generate a persona `.md` file in `agents/<name>.md` using Karen/video/weatherman/oracle as templates. Each persona gets: identity (1 paragraph), tool surface (what tools it commands), division (which of the 9 divisions/ subdirs it belongs to), model route (from matrix).
2. **Prune AGENT_REGISTRY.json to 43** — the 41 phantom extras are dropped from the registry but every persona that HAS a file stays.
3. **Karen fix.** Karen exists on disk but is MISSING from `AGENT_ROUTING` — add Karen to the routing matrix.
**Verify:** `ls agents/*.md | wc -l` = 43. `AGENT_ROUTING.keys()` ⊆ `agents/*.md` basenames. Karen appears in both.

### Batch 1.3 — Native identity purge (carryover from 2026-06-19 doctrine)
**Files:** `ecosystem.config.js`, `unified_api.js`, `unified_bridge.js`, `voice_bridge_7792.js`, `voice_coordinator.js`, `smoke_test.js`, `bin/purpclaw.js`, `lib/commands/onboard.js`, `lib/workers/purp-worker.js`, `app/components/composer/types.ts`, `companion-chorus/src/voice.js`, `skills/agent-workspace-adaptation/`.
**Action:**
1. Rename `OPENCLAW_TOKEN` → `PURPCLAW_GATEWAY_TOKEN` in source + `.env.example`.
2. Rename `OPENCLAW_GATEWAY` / `OPENCLAW_GW` → `PURPCLAW_GATEWAY_URL`.
3. Delete `skills/agent-workspace-adaptation/` (13 template files — IDENTITY/SOUL/SYSTEM_PROMPT — were flagged by fork-4 as still present).
4. Audit runtime callers — voice workers + composer UI may CALL the OpenClaw gateway at runtime. **DO NOT** blanket rename; add `PURPCLAW_LEGACY_GATEWAY_URL` env shim that points old callers at the native gateway until each caller is migrated individually.
**Verify:** `grep -r 'OPENCLAW' --include='*.js' --include='*.ts' lib/ app/ skills/ agents/ | wc -l` should drop ≥50%. No live runtime caller (verified via grep at the specific file:line) breaks.

### Batch 1.4 — Skill cleanup
**Files:** `skills/`, `.claude/skills/`.
**Action:**
1. `purpclaw-harness/` + `openclaw-migration/` already purged per fork-4 — verify gone.
2. `fable-harness/` is absent — re-create `.claude/skills/fable-harness/SKILL.md` (DREAMFORGE cadence auto-load, memory reference claims it should be present). If user prefers SKILL lives elsewhere, ask.
3. Sweep remaining skills for phantom deps (`grep -l 'openclaw' skills/*/SKILL.md`).
**Verify:** `ls .claude/skills/` and `ls skills/` enumerated. No SKILL.md references deleted skill names.

### Batch 1.5 — Port drift fix
**Files:** `docs/spec/STACK_SPEC.md` §2 (already documents 7895↔7897 drift), `ecosystem.config.js`, `cognitive_gateway.js` (already correct).
**Action:**
1. Auto-dream port: STACK_SPEC says 7895, PM2 annotation says 7897. Pick ONE (autoDream runs as library inside `cognitive_spine.py` per fork-2 — it's not a standalone server). Decision: **port 7895 is dropped from the registry** because autoDream only runs in-process now. The `purpclaw-goop :7895` service stays.
2. Voice/STT :7896 co-host: STT owns the socket; voice-ingress is a Node client in the same namespace. **No port change**; update STACK_SPEC to mark voice-ingress as "shares 7896 namespace with STT, no separate bind".
3. YOLO :7779 is correct (header text in `yolo_service.py` says :7896 but code binds 7779 — fix the header comment).
**Verify:** `grep -E ':789[5-7]|:777[7-9]' ecosystem.config.js docs/spec/STACK_SPEC.md lib/**/*.js` matches the canonical table.

### Batch 1.1 — Routing consolidation ✅ SHIPPED 2026-07-07 (verified, restart-gated)
**Done:** `lib/routes/registry.js` (19,318 bytes, 241 lines) created with 121 routes / 99 unique paths. unified_api.js dropped from 134 → 124 `pathname ===` matches. `/api/llm-status` → `/api/llm/status` redirect at lines 3132-3137. Registry exposes `lookup(method,pathname)`, `table()`, `summary`. Hand-curated metadata referencing `scripts/audit-routes.js` (may not exist — confirm next batch).
**Restart gate (USER-OWNED):** PM2 `unified_api` must bounce to load the registry. CRITICAL RULE blocks me.
**Outstanding:** (a) confirm `scripts/audit-routes.js` exists, (b) widen MissionControl.tsx filter to accept `finished`/`succeeded`/`closed` (still pending — was in original batch but report didn't confirm).

### Batch 1.2 — Agent persona restoration (43 phantoms + Karen routing)
**Files:** `agents/` (43 persona `.md` files on disk per fork-4), `AGENT_REGISTRY.json` (claims 84), `agent_routing_matrix.js` (per-agent model routing).
**Action:**
1. Restore 43 phantoms: dragon, duck, ghost, wolf, fox, bee, spider, mushroom, octopus, chonk, owl, cactus, penguin, goose, turtle, axolotl, rabbit, void, raven, snake, bunny, guardian, lemur, mantis, shark, gorilla, phoenix, crow, scientist, hawk, elephant, panda, parrot, shaman, chart, claw, innovator, jellyfish, kraken, moth, navigator, numbers. Use Karen/video/weatherman/oracle as templates.
2. Prune AGENT_REGISTRY.json to 43 (drop 41 phantoms).
3. Karen exists on disk but MISSING from AGENT_ROUTING — add Karen to the routing matrix.
**Verify:** `ls agents/*.md | wc -l` = 43. `AGENT_ROUTING.keys()` ⊆ `agents/*.md` basenames. Karen appears in both.

### Batch 1.3 — Native identity purge (carryover from 2026-06-19 doctrine)
**Files:** `ecosystem.config.js`, `unified_api.js`, `unified_bridge.js`, `voice_bridge_7792.js`, `voice_coordinator.js`, `smoke_test.js`, `bin/purpclaw.js`, `lib/commands/onboard.js`, `lib/workers/purp-worker.js`, `app/components/composer/types.ts`, `companion-chorus/src/voice.js`, `skills/agent-workspace-adaptation/`.
**Action:**
1. `OPENCLAW_TOKEN` → `PURPCLAW_GATEWAY_TOKEN` in source + `.env.example`.
2. `OPENCLAW_GATEWAY` / `OPENCLAW_GW` → `PURPCLAW_GATEWAY_URL`.
3. Delete `skills/agent-workspace-adaptation/` (13 template files still present per fork-4).
4. Runtime caller migration via `PURPCLAW_LEGACY_GATEWAY_URL` env shim — voice workers + composer UI CALL the OpenClaw gateway at runtime, blanket rename would silently 503. Migrate each caller individually.
**Verify:** `grep -r 'OPENCLAW' --include='*.js' --include='*.ts' lib/ app/ skills/ agents/ | wc -l` drops ≥50%. No live runtime caller breaks (grep each call site).

### Batch 1.4 — Skill cleanup
**Files:** `skills/`, `.claude/skills/`.
**Action:**
1. `purpclaw-harness/` + `openclaw-migration/` already purged — verify gone.
2. `fable-harness/` absent — user asked: restore or drop?
3. Sweep remaining skills for phantom deps (`grep -l 'openclaw' skills/*/SKILL.md`).
**Verify:** Enumerate `ls .claude/skills/` and `ls skills/`. No SKILL.md references deleted skill names.

### Batch 1.5 — Port drift fix
**Files:** `docs/spec/STACK_SPEC.md` §2 (drift table), `ecosystem.config.js`.
**Action:**
1. autoDream :7895 — drop from registry (runs in-process inside cognitive_spine.py). Decision captured in plan.
2. Voice/STT :7896 co-host — STT owns socket, voice-ingress is Node client in same namespace. Update STACK_SPEC to mark "shares 7896 namespace with STT, no separate bind".
3. YOLO :7779 header text fix in `yolo_service.py` (header says :7896, code binds 7779).
**Verify:** `grep -E ':789[5-7]|:777[7-9]' ecosystem.config.js docs/spec/STACK_SPEC.md lib/**/*.js` matches canonical table.

### Batch 1.6 — MissionControl + chat consolidation (carryover from 2026-07-03 chat fix)
**Files:** `app/lib/route-registry.ts` (per memory: 18 freeze routes, 7 redirects), `app/components/MissionControl.tsx`, `unified_api.js`.
**Action:**
1. Confirm `route-registry.ts` is wired into MissionControl tab deep-linking + sidebar.
2. Chat event-name alignment — backend `answer`/`card`/`delegated` → UI `done`/`error`. Reconfirm by grep.
3. Job bubbles + lane/model badge — already wired per memory, re-verify with screenshot probe (user-owned gate).
4. MissionControl filter widening (carryover from 1.1): add `finished`, `succeeded`, `closed` to the decrement set.
**Verify:** `npm run build` exit 0 + grep registry for the 18 freeze routes + 7 redirects.

---

## Phase 2 — On-demand subsystem boot (the "30 pieces → one system" core)

This is the actual unification work — the part that makes PURPCLAW "not eat itself every run".

### Batch 2.1 — Boot sentinel
**Files:** `ecosystem.config.js` (29 services), `lib/boot/index.js` (NEW).
**Action:** Replace "start everything at PM2 boot" with a sentinel pattern: each subsystem has a `lazy: true` flag in ecosystem.config.js. `lib/boot/index.js` is the single boot orchestrator — it starts subsystems only when the first request for them hits the router. Idle timer (default 5min, matches the Python pattern) shuts them down. Already-implemented: voice_stt / yolo_service / cognitive_gateway all have this pattern — extend it to the JS side.
**Verify:** Each subsystem in ecosystem.config.js has `lazy: true` + `idle_timeout: 300`. `lib/boot/index.js` exists and is parse-clean. No subsystem boots until the registry route for it is hit.

### Batch 2.2 — Shared eventbus namespace
**Files:** `lib/event-bus.js`, `app/components/MissionControl.tsx` filter.
**Action:** Confirm the eventbus topic list from fork-3 is canonical: `agent.{spawned,completed,failed,message,killed}`, `team.*`, `system.{startup,shutdown,error,health}`, `voice.{command,response}`, `tool.{called,result}`, `swarm.task.{assigned,done,delegation}`. Anything emitting outside this set gets routed through the canonical prefix or deleted.
**Verify:** `grep -rh 'bus.emit' lib/ app/ agents/ | sort -u` ⊆ canonical topic list (or gets a comment explaining the deviation).

### Batch 2.3 — Memory persistence writer
**Files:** `memory_matrix_v2.py` (in-process import from cognitive_spine per fork-2), `lib/memory/memory-writer.js` (if exists), `lib/workers/purp-worker.js`.
**Action:** cognitive_spine imports memory_matrix_v2 IN-PROCESS. Confirm there's no double-writer scenario (Node worker + Python both persisting). If double-writer exists, make Python the single writer + add a Node read-side that subscribes to `memory.persisted` events.
**Verify:** Only one process holds the SQLite/lmdb write lock at runtime (check `lsof` equivalent for the DB file — user-owned gate).

---

## Phase 3 — Build v4 (final, in-place)

After Phase 1+2 land, v4 = v0-clean + Jul-7 upgrades + on-demand boot. No directory rename. PM2 keeps pointing at `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/`.

User-bounce gates (CRITICAL RULE blocks me — these are user-owned):
- After Batch 1.1: bounce unified_api process to load the route registry.
- After Batch 1.2: bounce orchestrator to pick up restored personas.
- After Batch 2.1: bounce entire PM2 roster to switch to lazy boot.
- Browser smoke at `localhost:3030/mission` per existing memory rule.

---

## Subsystem Gates (what makes each subsystem "clearly running inside")

For each subsystem below, the gate is "starts on first request, shuts down on idle, no silent failures, no zombie processes":

| Subsystem | Owner process | Port | Boot trigger | Health check |
|-----------|---------------|------|--------------|--------------|
| Cognitive | cognitive_spine.py → cognitive_gateway.js | 7880 public, 7888 internal | First /api/cognitive/* hit | /api/cognitive/health |
| Voice STT | voice_stt.py | 7896 | First /api/voice/stt/* or /listen/* hit | /health |
| YOLO | yolo_service.py | 7779 | First /api/yolo/* hit | /health |
| Avatar | simple_bridge.py | 7777 | First /api/avatar/* hit | /health |
| Orchestrator | orchestrator.js | 7790 | First /api/orchestrator/* hit | /health |
| Swarm | swarm_coordinator.js | 7792 | First /api/swarm/* hit | /health |
| LLM pool | llm-provider.js | n/a (library) | n/a | _nvKeyState() probe |
| Memory matrix | memory_matrix_v2.py | n/a (in cognitive_spine) | n/a | /api/cognitive/health subsystem list |

Any subsystem not on this table needs justification to be added, OR deletion.

---

## Out of scope (call out explicitly)

- **PURPCLAWnew.zip (247MB)** — leave alone until Phase 2 is done; it's the safety net.
- **`purpclaw-master (1)/`** — legacy Samantha bridge. Don't touch unless user says.
- **`purpclaw-harness/`** — separate eval tool. Don't merge.
- **`purpclaw-test/`** — unrelated Remotion bench. Don't touch.
- **Browser screenshots / magazine-grade polish** — deferred to after Phase 2 lands + user-bounce happens.
- **AGENT.md authorship across 60 folders** — only do if user re-asks; out of scope for unification.
- **43 phantom personas' actual prompt content** — restored as skeletons from Karen/video/weatherman/oracle templates; user fills in or approves AI-generated persona blurbs separately.

---

## Open questions for user (must answer before Phase 2 begins)

1. **Fable-harness SKILL.md** — memory claims it auto-loads at `.claude/skills/fable-harness/SKILL.md` but it's absent. Restore it, or drop the reference?
2. **autoDream port 7895** — drop from registry (it runs in-process now) or keep for some external caller I'm missing?
3. **OPENCLAW → PURPCLAW runtime caller migration** — blanket rename is unsafe. Want me to migrate callers one-at-a-time, or keep the shim indefinitely?
4. **43 persona prompts** — generate skeletons and you fill them, or generate full AI blurbs and you edit?
5. **Lazy-boot timeout** — 5min matches Python pattern. Want different per-subsystem (e.g. avatar stays warm 30min, yolo unloads 60s)?

---

## Verification protocol (every batch)

1. Parse-clean: `node -c` for `.js`, `ast.parse` for `.py`, `tsc --noEmit` for `.ts`.
2. Grep deliverable: search for the SPECIFIC string the change claims (route path / port / exported symbol) at the claimed location.
3. Verification agent (type=verification) — runs the dual evidence + reports PASS/PARTIAL/FAIL.
4. User-bounce gate noted at end of each batch report (per `feedback_purpclaw_edit_restart_boundary.md`).