# PURPCLAW Python Cross-Reference Matrix

> Generated: 2026-06-25 · Source: live filesystem + ecosystem.config.js
> Method: walked every active .py, extracted ports/imports/cross-refs; cross-checked
>  against `ecosystem.config.js` (PM2) and every JS `spawn`/`fetch` site that
>  reaches into Python.

---

## Summary

| Metric | Value |
|---|---|
| Total active .py files in project (root scope) | 67 |
| .py files wired into PM2 (`ecosystem.config.js`) | 4 |
| .py files NOT in PM2 (orphans) | 21 |
| .py candidates for dead code (no PM2 + no JS call site) | 20 |
| Port collisions (multiple .py files claiming the same port) | 3 |
| JS → Python call sites (spawn/fetch) | 10 |

---

## Python services wired into PM2 (active runtime)

| Service | Port | Caller(s) |
|---|---|---|
| `cognitive_spine.py` | `7880` | lib/memory-client.js, app/api/heartbeat, app/api/mochi-action, app/hooks/useCognitiveServices |
| `yolo_service.py` | `7779` | unified_api.js (HTTP /api/yolo, /api/vision) |
| `simple_bridge.py` | `7777` | — (no JS caller found; possible test/stub) |
| `voice_stt.py` | `7896` | lib/stt/gateway.js (spawn) |

---

## JS → Python call sites (the live wiring)

| JS source | Calls (Python) | Mechanism | Line |
|---|---|---|---|
| `lib/commands/training.js` | `autoDream.py` | `spawnSync('python', ['autoDream.py', '--once'])` | 143 |
| `lib/commands/autoresearch.js` | `prepare.py` | `spawnSync('python', [prepare.py])` | 60 |
| `lib/deep-audit.js` | `audit script` | `spawnSync('python', [audit_script])` | 86 |
| `lib/stt/gateway.js` | `STT transcribe script` | `spawn(python, [TRANSCRIBE_SCRIPT])` | 73 |
| `lib/tts/gateway.js` | `kokoro_tts.py` | `spawn('python', [KOKORO_SCRIPT])` | 83 |
| `lib/vector/providers/faissProvider.js` | `faiss_sidecar.py` | `spawn(pythonBin, [sidecarPath])` | 36 |
| `lib/memory-client.js` | `cognitive_spine.py:7880` | `HTTP fetch` | 26 |
| `app/api/heartbeat/route.ts` | `cognitive_spine.py:7880` | `HTTP fetch /cognitive/health` | 61 |
| `app/api/mochi-action/route.ts` | `cognitive_spine.py:7880` | `HTTP fetch /autodream` | 8 |
| `app/hooks/useCognitiveServices.ts` | `cognitive_spine.py:7880` | `comment in code` | 28 |

---

## Port collisions (3 found)

Three ports are claimed by multiple .py files. Only one can bind — the others
are dead code or were never wired correctly.

| Port | Conflict type | Files | Resolution |
|---|---|---|---|
| `7778` | `multi-py-claim` | `lcd_bridge_server.py`, `lcd_log_monitor.py` | `lcd_bridge_server.py` + `lcd_log_monitor.py`. Neither is in PM2. They form a paired bridge (server+monitor). Both are dead unless re-wired. **Either add both to PM2, or archive as a pair.** |
| `7780` | `multi-py-claim` | `memory_matrix.py`, `docs/legacy/ghostbusters-2026-06-06/memory_matrix.py` | `memory_matrix.py` (active) + `docs/legacy/ghostbusters-2026-06-06/memory_matrix.py` (legacy). Legacy is in docs/legacy/ which is the de-facto archive. **Remove legacy file** or move to `docs/archive/legacy-2026-06-06/`. |
| `7880` | `multi-py-claim` | `cognitive_spine.py`, `memory_matrix_v2.py` | `cognitive_spine.py` is in PM2 → wins. `memory_matrix_v2.py` is orphan (would only bind if PM2 not running it). The JS code calls `cognitive_spine.py`, NOT `memory_matrix_v2.py`. **Archive `memory_matrix_v2.py`** (or rename so it never runs by default). |

---

## Full port ownership table (Python)

| Port | .py file | Purpose (from docstring or path) |
|---|---|---|
| `443` | `skills/domain-intel/scripts/domain_intel.py` | ? |
| `7777` | `simple_bridge.py` | simple bridge (also :9999 - dual-bind!) |
| `7778` | `lcd_bridge_server.py` | LCD bridge (orchestrator hook) |
| `7778` | `lcd_log_monitor.py` | LCD log monitor |
| `7779` | `yolo_service.py` | YOLO object detection |
| `7780` | `memory_matrix.py` | memory matrix (active?) |
| `7780` | `docs/legacy/ghostbusters-2026-06-06/memory_matrix.py` | ? |
| `7782` | `music_analysis_service.py` | music analysis service |
| `7880` | `cognitive_spine.py` | cognitive spine / memory + AutoDream |
| `7880` | `memory_matrix_v2.py` | memory matrix v2 (legacy/duplicate) |
| `7895` | `autoDream.py` | autonomous dream loop |
| `9999` | `simple_bridge.py` | simple bridge (also :9999 - dual-bind!) |

Note: `simple_bridge.py` claims BOTH `:7777` AND `:9999`. This is a dual-bind —
`ecosystem.config.js` only starts it on `:7777`, so `:9999` never binds unless
someone runs the file manually.

---

## Orphan .py files (in repo, NOT in PM2)

These .py files exist on disk and are valid Python, but they are not wired into
`ecosystem.config.js`. Some are called by JS code (live), some are dead.

| File | Lines | Status | Called by JS? |
|---|---|---|---|
| `autoDream.py` | see port | ORPHAN-BUT-CALLED (JS spawns it) | ✅ autoDream.py |
| `autonomous_diagnostics.py` | ? | ORPHAN (no JS caller) | — |
| `boston_analysis.py` | ? | ORPHAN (no JS caller) | — |
| `create_db.py` | ? | ORPHAN (no JS caller) | — |
| `diag_audio.py` | ? | ORPHAN (no JS caller) | — |
| `find_pulse.py` | ? | ORPHAN (no JS caller) | — |
| `gacha.py` | ? | ORPHAN (no JS caller) | — |
| `lcd_bridge_server.py` | see port | ORPHAN (no JS caller) | — |
| `lcd_log_monitor.py` | see port | ORPHAN (no JS caller) | — |
| `mem_guard.py` | ? | ORPHAN (no JS caller) | — |
| `memory_matrix.py` | see port | ORPHAN (no JS caller) | — |
| `memory_matrix_v2.py` | see port | ORPHAN (no JS caller) | — |
| `mimi_speak.py` | ? | ORPHAN (no JS caller) | — |
| `modal_logic_engine.py` | ? | ORPHAN (no JS caller) | — |
| `music_analysis_service.py` | see port | ORPHAN (no JS caller) | — |
| `neuro_symbolic_bridge.py` | ? | ORPHAN (no JS caller) | — |
| `symbolic_rules_engine.py` | ? | ORPHAN (no JS caller) | — |
| `scripts/lora-train.py` | ? | ORPHAN (no JS caller) | — |
| `scripts/lora-eval.py` | ? | ORPHAN (no JS caller) | — |
| `scripts/phoenix_smoke.py` | ? | ORPHAN (no JS caller) | — |
| `scripts/smoke_test.py` | ? | ORPHAN (no JS caller) | — |

---

## Dead code candidates

These .py files have NO entry in `ecosystem.config.js` AND NO JS caller.
They are valid Python, but nothing in the live runtime ever invokes them.
They may be experimental, scratch, or abandoned. Verify before deletion.

| File | Lines | Action |
|---|---|---|
| `autonomous_diagnostics.py` | varies | verify with `git log --follow autonomous_diagnostics.py` then archive or delete |
| `boston_analysis.py` | varies | verify with `git log --follow boston_analysis.py` then archive or delete |
| `create_db.py` | varies | verify with `git log --follow create_db.py` then archive or delete |
| `diag_audio.py` | varies | verify with `git log --follow diag_audio.py` then archive or delete |
| `find_pulse.py` | varies | verify with `git log --follow find_pulse.py` then archive or delete |
| `gacha.py` | varies | verify with `git log --follow gacha.py` then archive or delete |
| `lcd_bridge_server.py` | varies | verify with `git log --follow lcd_bridge_server.py` then archive or delete |
| `lcd_log_monitor.py` | varies | verify with `git log --follow lcd_log_monitor.py` then archive or delete |
| `mem_guard.py` | varies | verify with `git log --follow mem_guard.py` then archive or delete |
| `memory_matrix.py` | varies | verify with `git log --follow memory_matrix.py` then archive or delete |
| `memory_matrix_v2.py` | varies | verify with `git log --follow memory_matrix_v2.py` then archive or delete |
| `mimi_speak.py` | varies | verify with `git log --follow mimi_speak.py` then archive or delete |
| `modal_logic_engine.py` | varies | verify with `git log --follow modal_logic_engine.py` then archive or delete |
| `music_analysis_service.py` | varies | verify with `git log --follow music_analysis_service.py` then archive or delete |
| `neuro_symbolic_bridge.py` | varies | verify with `git log --follow neuro_symbolic_bridge.py` then archive or delete |
| `symbolic_rules_engine.py` | varies | verify with `git log --follow symbolic_rules_engine.py` then archive or delete |
| `scripts/lora-train.py` | varies | verify with `git log --follow scripts/lora-train.py` then archive or delete |
| `scripts/lora-eval.py` | varies | verify with `git log --follow scripts/lora-eval.py` then archive or delete |
| `scripts/phoenix_smoke.py` | varies | verify with `git log --follow scripts/phoenix_smoke.py` then archive or delete |
| `scripts/smoke_test.py` | varies | verify with `git log --follow scripts/smoke_test.py` then archive or delete |

---

## Redundant PURPCLAW/ subdirectory

A `PURPCLAW/` subdirectory at root mirrors 23 root .py files. Sizes:

| File | Root | PURPCLAW/ | Diff |
|---|---|---|---|
| `autoDream.py` | 19,235 | 19,235 | 0 (identical) |
| `autonomous_diagnostics.py` | 34,883 | 34,883 | 0 (identical) |
| `boston_analysis.py` | 3,555 | 3,555 | 0 (identical) |
| `cognitive_spine.py` | 19,534 | 15,150 | +4,384 (root NEWER) |
| `memory_matrix.py` | 56,435 | 47,122 | +9,313 (root NEWER) |
| `memory_matrix_v2.py` | 53,282 | 46,970 | +6,312 (root NEWER) |
| `music_analysis_service.py` | 42,122 | 41,881 | +241 (root NEWER) |
| `scripts/lora-train.py` | 19,714 | 17,603 | +2,111 (root NEWER) |
| (20 other files) | — | — | 0 (identical) |

**Conclusion**: The `PURPCLAW/` subdir is a snapshot/duplicate. Root is the live tree.
**Recommendation**: Move `PURPCLAW/` to `docs/archive/purpclaw-snapshot-2026-06-XX/` or
simply `rm -rf PURPCLAW/` once you have the 3 files where root > PURPCLAW/ in size
backed up elsewhere. The 20 identical files are pure waste (23 redundant files).

---

## Special note: cognitive_spine.py vs memory_matrix_v2.py on port 7880

This is the most consequential collision. Both files claim port 7880.

- `cognitive_spine.py` (19,534 bytes) — **in PM2**, **in JS code paths**
  (`lib/memory-client.js`, `app/api/heartbeat`, `app/api/mochi-action`,
  `app/hooks/useCognitiveServices.ts`). This is the **live** cognitive spine.
- `memory_matrix_v2.py` (53,282 bytes) — **NOT in PM2**, **NOT in any JS caller**.
  The size and the `_v2` suffix suggest this is the historical python memory store
  that was **superseded** by `cognitive_spine.py` (which wraps the same routes plus more).

**Critical**: the JS comment at `unified_api.js:43` says
`"cognitive spine on :7880 via memory_matrix_v2.py"`. This comment is **stale** — the
real backend is `cognitive_spine.py`, not `memory_matrix_v2.py`. Fix this comment.

---

## Memory matrix v1 vs v2 vs cognitive_spine: the real picture

Three files, all with `memory` in the name, plus a legacy duplicate:

| File | Size | Port | Status | Role |
|---|---|---|---|---|
| `cognitive_spine.py` | 19,534 | 7880 | **active (PM2 + JS)** | modern unified memory + AutoDream + cognitive |
| `memory_matrix_v2.py` | 53,282 | 7880 (CONFLICT) | **dead** | superseded by cognitive_spine.py |
| `memory_matrix.py` | 56,435 | 7780 | **active?** | standalone memory matrix service |
| `docs/legacy/.../memory_matrix.py` | 46,048 | 7780 (CONFLICT) | **legacy** | old ghostbusters-era version |

The JS-side `lib/memory-client.js` calls `:7880` → resolves to `cognitive_spine.py`.
The `unified_api.js:7780` is the **Node** unified_api service (JavaScript), NOT python.
So `memory_matrix.py` on `:7780` is **a second Python service**, neither in PM2 nor
called by JS. It would only start if someone ran it manually. **Archive it.**

---
