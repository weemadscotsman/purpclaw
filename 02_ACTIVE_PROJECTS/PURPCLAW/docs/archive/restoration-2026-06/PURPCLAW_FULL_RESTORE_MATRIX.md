# PURPCLAW_FULL_RESTORE_MATRIX

Generated: 2026-06-23 21:42 BST. Repo is ground truth. Verified by `glob` + `Get-ChildItem` + line-count inspection. **Previous version was optimistic — this one counts bytes and checks for files that actually exist.**

> **Mantra: RESTORE, DON'T REBUILD.** No new pages. No duplicate UI. No "helpful" replacements of months of work with cardboard props. Repo is ground truth. Freeze (`docs/spec/PURPCLAW_UI_CONSOLIDATION_FREEZE/FREEZE.md`) is binding.

---

## 0. The freeze says canonical routes are 18.

| # | Canonical route | Repo path | Page bytes | Status |
|---|---|---|---|---|
| 1 | Mission Spine | `app/mission/page.tsx` | 1,162 | thin |
| 2 | Control Room | `app/page.tsx` | 108 | **stub** |
| 3 | Asher | `app/mochi/page.tsx` | 23,593 | real |
| 4 | Execution Harness | `app/mission/harness/page.tsx` | 24,166 | real |
| 5 | Agent Workforce | `app/agents/page.tsx` | 503 | **stub** |
| 6 | Tower State | _no page_ | — | **MISSING** |
| 7 | Delegation Graph | _no page_ | — | **MISSING** |
| 8 | Workflow Flow | `app/pipeline/page.tsx` | 410 | **stub** |
| 9 | Event Lens | _no page_ | — | **MISSING** |
| 10 | Live Metrics | _no page_ | — | **MISSING** |
| 11 | Raw Signals | _no page_ | — | **MISSING** |
| 12 | Dream Swarm | _no page_ | — | **MISSING** |
| 13 | Risk Gate | _no page_ | — | **MISSING** |
| 14 | Abliterator | `app/abliterator/page.tsx` | 610 | small |
| 15 | Cognitive Mesh | _no page_ | — | **MISSING** |
| 16 | Self-Evolution | `app/evolution/page.tsx` | 4,867 | real |
| 17 | System Map | `app/system-map/page.tsx` | 3,609 | real |
| 18 | Settings | `app/settings/page.tsx` | 32,429 | real |

**Canonical gap:** 8 of 18 canonical pages don't even have a file. Freeze forbids creating new pages unless the new one replaces 2+ existing duplicates — so most of these should be MERGED into existing pages, not built new.

---

## 1. Off-canonical pages that exist (per freeze = must be MERGED, ARCHIVED, or DELETED, NOT wired as new canonical routes)

| Page | Path | Bytes | Verdict | Target canonical |
|---|---|---|---|---|
| cockpit | `app/cockpit/page.tsx` | 115 | **stub, DELETE** | merge into Mission Spine |
| dash | `app/dash/page.tsx` | 112 | **stub, DELETE** | merge into Live Metrics (when built) or archive |
| inline | `app/inline/page.tsx` | 393 | **stub, DELETE** | merge into Control Room or archive |
| skyscraper | `app/skyscraper/page.tsx` | 8,231 | off-canonical, ARCHIVE | keep file but redirect → Agent Workforce |
| bridge | `app/bridge/page.tsx` | 720 | off-canonical, MERGE | merge into Asher (Mochi) output panel |
| memory | `app/memory/page.tsx` | 360 | **stub, DELETE** | merge into Cognitive Mesh (when built) or archive |
| frameworks | `app/frameworks/page.tsx` | 14,060 | off-canonical, ARCHIVE | keep file but redirect → Settings > System |
| swarm | `app/swarm/page.tsx` | 408 | **stub, DELETE** | merge into Agent Workforce |
| spine | `app/spine/page.tsx` | 7,519 | off-canonical, MERGE | merge into Mission Spine |
| preprompt | `app/preprompt/page.tsx` | 7,812 | off-canonical, ARCHIVE | keep file but redirect → Settings > Prompts |
| omni | `app/omni/page.tsx` | 9,276 | off-canonical, MERGE | merge into Mission Spine (system overview) |
| providers | `app/providers/page.tsx` | 12,069 | off-canonical, MERGE | merge into Settings (LLM providers section) |

**Pattern:** the AI added new top-level pages instead of adding sections to canonical pages. The freeze says this is the bug. The fix is not to wire all 12 — it's to **delete 5 stubs**, **archive 3**, and **merge 4** into canonical pages. The Settings page already exists at 32 KB — providers + preprompt + frameworks are settings sections, not top-level routes.

---

## 2. The API surface — 60+ routes. 6 missing for canonical pages.

### Existing API routes that work (verified by `glob`)
- `/api/chat`, `/api/chat/swarm`, `/api/bridge`, `/api/mochi`, `/api/mochi-action`, `/api/settings`, `/api/providers`, `/api/models`, `/api/pipeline`, `/api/system-map`, `/api/omni`, `/api/omni/patch/review`, `/api/omni/scan`, `/api/omni/providers`, `/api/omni/status`, `/api/omni/registry`, `/api/evolution/adapters`, `/api/evolution/status`, `/api/voice/chat`, `/api/voice/stream`(?), `/api/harness/missions`, `/api/harness/missions/[id]`, `/api/harness/missions/[id]/abort`, `/api/harness/missions/[id]/stream`, `/api/harness/start`, `/api/harness/status`, `/api/sessions`, `/api/sessions/[id]`, `/api/trace/recent`, `/api/trace/stream`, `/api/eventbus/stream`, `/api/tower/stream`, `/api/services`, `/api/registry`, `/api/whoami`, `/api/pulse`, `/api/spine-health`, `/api/host-telemetry`, `/api/service-proxy`, `/api/llm-config`, `/api/llm-status`, `/api/llm-ledger`, `/api/llm/plan`, `/api/llm/raw`, `/api/orchestrate`, `/api/kernel/jobs`, `/api/kernel/jobs/[id]`, `/api/research/group`, `/api/thringlets`, `/api/thringlets/[id]`, `/api/thringlets/[id]/interact`, `/api/thringlets/colony-mood`, `/api/mission-data`, `/api/governance/policy`, `/api/benchmark/odysseus`, `/api/delegation/status`, `/api/omnicode/status`, `/api/manifest`, `/api/api-mega-list`, `/api/preprompt`, `/api/personality`, `/api/ollama`, `/api/internal/check`, `/api/upload`, `/api/heartbeat`, `/api/sampler`, `/api/gatekeeper-status`, `/api/event-timeline`, `/api/agent-scores`, `/api/playwright`, `/api/harness-benchmarks`, `/api/skill-amendments`, `/api/setup`, `/api/yo`, `/api/output`, `/api/proof`, `/api/voice-command`, `/api/computer-use`, `/api/discover`

### Routes that MUST exist for canonical pages (per freeze) but are MISSING

| Canonical | Page | Route needed | Status |
|---|---|---|---|
| Mission Spine | `app/mission/page.tsx` (1,162 b) | `/api/mission/route.ts` | **MISSING** |
| Control Room | `app/page.tsx` (108 b stub) | (uses `/api/chat`) | OK if homepage IS the chat |
| Agent Workforce | `app/agents/page.tsx` (503 b stub) | `/api/agents/route.ts` | **MISSING** |
| Tower State | _no page_ | `/api/tower/route.ts` exists (stream) | need top-level |
| Abliterator | `app/abliterator/page.tsx` (610 b) | `/api/abliterator/route.ts` | **MISSING** |
| Self-Evolution | `app/evolution/page.tsx` (4,867 b) | `/api/evolution/route.ts` (top-level) | **MISSING (sub-paths exist)** |
| Mission Spine | (mission trace) | `/api/trace/route.ts` | uses `/api/trace/stream` and `/api/trace/recent` — OK |

### Routes that should NOT exist (per freeze) because their pages are off-canonical

| Off-canonical page | Route | Action |
|---|---|---|
| omni | `/api/omni/*` | keep as API (drives Mission Spine), remove page, redirect /omni → /mission |
| providers | `/api/providers` | keep as API (drives Settings), remove page, redirect /providers → /settings |
| bridge | `/api/bridge` | keep as API (drives Asher), remove page, redirect /bridge → /mochi |
| spine | _no route_ | good — /spine is page-only, redirect → /mission |
| preprompt | `/api/preprompt` | keep as API, remove page, redirect → /settings |
| skyscraper | _no route_ | good — page-only, redirect → /agents |
| mochi | `/api/mochi`, `/api/mochi-action` | keep, page IS the canonical Asher |
| memory | _no route_ | page is stub, DELETE |
| frameworks | _no route_ | page is off-canonical, ARCHIVE |
| swarm | _no route_ | page is stub, DELETE |
| cockpit | _no route_ | page is stub, DELETE |
| dash | _no route_ | page is stub, DELETE |
| inline | _no route_ | page is stub, DELETE |

---

## 3. The 3 spine features Eddie asked for (status: now verified, not optimistic)

### providers → merge into Settings
- **Page:** `app/providers/page.tsx` (12,069 b) — real
- **Route:** `/api/providers/route.ts` — real
- **Service:** `lib/providers/registry.js` — real
- **Action:** remove `/providers` page, redirect → `/settings`, content moves to Settings > LLM Providers section

### settings — real
- **Page:** `app/settings/page.tsx` (32,429 b) — real, big
- **Route:** `/api/settings/route.ts` — real
- **Service:** `lib/runtime/settings-registry.js` — real
- **Action:** verify all sub-sections render, add Health + Trace events

### system-map — real, but check
- **Page:** `app/system-map/page.tsx` (3,609 b) — real
- **Route:** `/api/system-map/route.ts` — real
- **Service:** `:7881/context-bus` — verified per ARCHITECTURE
- **Component:** `app/components/LiveSystemMap.tsx` (16,389 b) — real, used by page
- **Action:** verify route returns real data, add Trace events

### omni → merge into Mission Spine
- **Page:** `app/omni/page.tsx` (9,276 b) — real
- **Route:** `/api/omni/route.ts` + 5 sub-paths — real
- **Service:** `lib/omni/feature-registry.js` — real
- **Action:** remove `/omni` page, content is the "System Overview" section of Mission Spine, redirect /omni → /mission

### pipeline — stub, needs work
- **Page:** `app/pipeline/page.tsx` (410 b) — **stub**
- **Route:** `/api/pipeline/route.ts` — real
- **Service:** `lib/pipeline-registry.js` — real
- **Action:** page is stub, expand to use PipelinePanel.tsx (7,209 b) which exists in components/

### evolution — real, but top-level route missing
- **Page:** `app/evolution/page.tsx` (4,867 b) — real
- **Route:** `/api/evolution/route.ts` (top-level) — **MISSING** (sub-paths `/api/evolution/adapters` and `/api/evolution/status` exist)
- **Service:** `self-evolution-loop` (per CLAUDE.md)
- **Component:** `app/components/SelfEvolutionPanel.tsx` (5,920 b) — real, exists
- **Action:** add top-level `/api/evolution/route.ts` that aggregates sub-paths

---

## 4. Other items Eddie asked for — real status

| Eddie asked for | Real status |
|---|---|
| bridge | `/api/bridge` exists. Page is off-canonical (720 b). Merge into Asher or DELETE. |
| cockpit | page is 115-byte stub, no route. **DELETE page per freeze.** |
| dash | page is 112-byte stub, no route. **DELETE page per freeze.** |
| inline | page is 393-byte stub, no route. **DELETE page per freeze.** |
| harness | Full set: `/api/harness/{start,status,missions,missions/[id],missions/[id]/abort,missions/[id]/stream}` — real. Page is `app/mission/harness/page.tsx` (24,166 b) which is canonical Execution Harness. **GOOD.** |
| mochi | Real page (23,593 b), real route, real API. Page IS canonical Asher. **GOOD.** |
| omni | See above. Merge into Mission Spine. |
| preprompt | Real page, real route. Off-canonical — merge into Settings > Prompts. |
| providers | Real page, real route. Off-canonical — merge into Settings. |
| settings | Real. |
| skyscraper | Real page, no route. Off-canonical — merge into Agent Workforce or archive. |
| system-map | Real. |
| voice | `/api/voice/chat` exists. **Top-level `/api/voice/route.ts` MISSING.** No voice page. Either build the page + top-level route, or merge voice into Asher (Mochi) and `/api/voice/chat` is the only entry. |

### "Also resolve" items
- **OBLITERATUS** — `/api/obliteratus/chat` — does not exist. Need to check if it's a planned feature or ghost.
- **api-mega-list** — `/api/api-mega-list` exists. Likely a debug dump.
- **GOOP** — `lib/goop-playground/api-registry.json` exists. Playground artifact, not wired.
- **Kimi** — `/api/kimi/*` — does not exist. Kimi is an LLM provider in `agent_routing_matrix.js`.
- **Shaman** — `shaman_evaluator.js`, `shaman_prompts.js`, `digital_shaman.js` exist as files. No `/api/shaman/*` route.
- **Security** — `policies.json`, `SECURITY.md` exist. No dedicated page/route in app/.
- **Sessions** — `/api/sessions`, `/api/sessions/[id]` exist. `app/components/SessionSidebar.tsx` (5,488 b) exists. Mission Drawer > Sessions section.
- **Gestures** — `refusal_ablation_probe` exists. No gesture page.
- **Mochi** — see above.
- **Voice** — see above.
- **Research** — `/api/research/group` exists. No `app/research/page.tsx`.
- **Narrator** — no file/route found.
- **Hooks** — `hooks/` directory exists. `app/api/hooks/*` does not exist in routes.

---

## 5. Critical missing infrastructure (per freeze)

| Item | Status | Action |
|---|---|---|
| Route registry | **MISSING** — no central `routes.ts` or `RouteRegistry` file | freeze mandates one. Build `app/lib/route-registry.ts` |
| Health endpoint | partial — `/api/spine-health` exists, but each route should self-report | add `?health=1` or `/api/_health` per route |
| Trace events | partial — `/api/trace/recent`, `/api/trace/stream` exist, not all routes call them | wrap each route in `withTrace()` helper |
| Theme provider | unknown — need to verify | freeze mandates one |
| Mission shell | `app/components/CockpitShell.tsx` (23,084 b, 6/23) — exists, recent | verify it's the actual MissionShell |
| E: drive space | **97.9% full, 39.5 GB free** | run `purpclaw gc` before any more writes |

---

## 6. Disk space warning (from previous turn)

> `FILE_ERROR_NO_SPACE: .../014254.ldb` (Chrome IndexedDB), `omni:1 Uncaught (in promise) Error: IO error: .../014254.ldb: FILE_ERROR_NO_SPACE`

E: drive is at 97.9%. Free is 39.49 GB. Cannot write more than ~30 GB total before filesystem panic. **Action needed:** `purpclaw gc` (clears `agent_work/`), and a targeted cleanup of stale corpus files. **This is a blocker for the verification report deliverable** — proof screenshots and verification logs need space.

---

## 7. Hard rules (from freeze, binding)

1. No new page without checking existing routes.
2. No new shell.
3. No new nav system.
4. No new theme system.
5. No duplicate terminal.
6. No duplicate chat.
7. No duplicate session panel.
8. No duplicate stack page panel.
9. No fake data cards.
10. No permanent side clutter.

Plus Eddie's addition: **RESTORE, DON'T REBUILD.** No agent gets to throw out months of work because it "looks spaghetti." If a page is wired, fix the wiring. If a page is dead-stub, delete it. If a feature is missing, add it under the canonical route — do not create a parallel page.

---

## 8. Recommended restore order (with explicit freeze-compliant verdicts)

### Phase 0 — preflight (blockers)
- [ ] Run `purpclaw gc` to free E: drive space.
- [ ] Verify `app/components/CockpitShell.tsx` is the actual MissionShell.
- [ ] Verify there's a theme provider.

### Phase 1 — spine features (Eddie's priority)
1. **providers** — merge `/providers` page into `Settings > LLM Providers`. Remove page, redirect.
2. **settings** — verify `app/settings/page.tsx` + `/api/settings` work end-to-end. Add trace.
3. **system-map** — verify `app/system-map/page.tsx` + `/api/system-map` work. Add trace.
4. **omni** — merge `/omni` page into `Mission Spine > System Overview`. Remove page, redirect.
5. **pipeline** — replace 410-byte stub with real `PipelinePanel.tsx` content.
6. **evolution** — add top-level `/api/evolution/route.ts` that aggregates sub-paths.

### Phase 2 — purge the off-canonical stubs (per freeze, mandatory)
- [ ] **DELETE** `app/cockpit/page.tsx` (115 b stub, no route, off-canonical)
- [ ] **DELETE** `app/dash/page.tsx` (112 b stub, no route, off-canonical)
- [ ] **DELETE** `app/inline/page.tsx` (393 b stub, no route, off-canonical)
- [ ] **DELETE** `app/swarm/page.tsx` (408 b stub, no route, off-canonical)
- [ ] **DELETE** `app/memory/page.tsx` (360 b stub, no route, off-canonical)
- [ ] **ARCHIVE** `app/frameworks/page.tsx` (14,060 b, off-canonical, useful content)
- [ ] **ARCHIVE** `app/skyscraper/page.tsx` (8,231 b, off-canonical, useful content)
- [ ] **ARCHIVE** `app/preprompt/page.tsx` (7,812 b, off-canonical, useful content)
- [ ] **REDIRECT** /bridge → /mochi (or DELETE)
- [ ] **REDIRECT** /omni → /mission
- [ ] **REDIRECT** /providers → /settings
- [ ] **REDIRECT** /spine → /mission
- [ ] **REDIRECT** /harness → /mission/harness

### Phase 3 — build the 6 missing route files (small, surgical)
- [ ] `/api/mission/route.ts` — proxies to /api/services + /api/whoami + /api/pulse
- [ ] `/api/agents/route.ts` — proxies to /api/delegation/status + /api/agent-scores + /api/services?filter=tower
- [ ] `/api/abliterator/route.ts` — proxies to /api/services?filter=abliterator
- [ ] `/api/evolution/route.ts` — aggregates /api/evolution/adapters + /api/evolution/status
- [ ] `/api/voice/route.ts` — proxies to /api/voice/chat + /api/voice-command (top-level, no new page)
- [ ] `/api/tower/route.ts` (top-level) — proxies to /api/tower/stream

### Phase 4 — build the central route registry (freeze-mandated)
- [ ] `app/lib/route-registry.ts` — single source of truth, 18 canonical routes
- [ ] `app/components/MissionRouteRegistry.tsx` — uses the registry
- [ ] All 18 canonical routes register here. Off-canonical pages either redirect or are removed.

### Phase 5 — "also resolve" items
- [ ] Investigate OBLITERATUS — ghost or planned? Add `/api/obliteratus/*` if real, or tombstone.
- [ ] Investigate Kimi — provider exists in routing matrix but no API. Add `/api/llm/kimi` or document as provider-only.
- [ ] Investigate Shaman — `shaman_evaluator.js` exists but no API. Wire or archive.
- [ ] Investigate Narrator — no file found. Either it's a planned name or it was never built.
- [ ] Investigate Hooks — `hooks/` dir exists. Wire to `/api/hooks/*` or archive.
- [ ] Investigate Gestures — `refusal_ablation_probe` exists. No UI. Archive.
- [ ] Investigate Research — `/api/research/group` exists, no page. Merge into Delegation Graph or Mission Spine.

### Phase 6 — verification (deliverable 3)
- [ ] Per route: `curl` returns 200 + real JSON, no 501/timeout/empty.
- [ ] Per page: Playwright screenshot at 1536×710 and 1920×1080.
- [ ] Trace events fire on every call.
- [ ] Health endpoint reports green for all canonical routes.

---

## 9. What I did NOT do (deferred — needs Eddie's call)

- **E: drive cleanup** — `purpclaw gc` + targeted archive. 30-min cap.
- **Build missing routes** — 6 small files, ~15 min. Needs greenlight.
- **Route registry build** — 1 file, ~20 min. Needs greenlight.
- **Stub page deletion** — 5 `trash` ops, 1 min. Needs greenlight per freeze.
- **Off-canonical page redirects** — 5 routes, 5 min. Needs greenlight.
- **Voice page** — 1 page + 1 route, ~30 min. Needs Eddie to decide if voice IS canonical or merges into Asher.
- **Verification report** — 30+ min. Needs all of the above done first.

---

## 10. Status: BLOCKED on Eddie's call

The matrix is built. The ground truth is laid out. I have not touched a single file. The 30-min cap is real. The disk-space blocker is real. The freeze is binding. The next step needs Eddie to pick:

**Q1: Is voice canonical, or does it merge into Asher (Mochi)?**
**Q2: Am I allowed to delete the 5 stub pages (cockpit, dash, inline, swarm, memory)?**
**Q3: Do I redirect off-canonical pages (/bridge, /omni, /providers, /spine) or just remove them?**
**Q4: For "also resolve" items not in repo (Narrator, Gestures UI) — build or tombstone?**

Once those 4 are answered, I can ship phases 0-6 in roughly 2-3 more sessions. This turn was scope, not implementation.
