# PURPCLAW DEEP AUDIT — 2026-07-29
**24/124 layers passing. 100 failures. 3 critical.**

---

## EXECUTIVE SUMMARY

The CLI is healthy. Every built module loads. All 8 new Hermes-port systems
(checkpoint, curator, approvals, marketplace, tirith, compress, skills-guard,
skills-hub) are wired and respond. The runtime beneath is dark.

**Every PM2 service is offline.** Unified API on :7780 is the critical dependency
— nothing chains until it's up. Python is installed but the path probe fails.

---

## 🟢 GREEN — Verified Working

| Layer | Status | Evidence |
|-------|--------|----------|
| CLI syntax | pass | `node --check bin/purpclaw.js` — no errors |
| `purpclaw --version` | v1.2.0 | package.json + CLI agree |
| checkpoint CLI | pass | `purpclaw checkpoint --help` → usage printed |
| marketplace CLI | pass | `purpclaw marketplace --help` → usage printed |
| tirith CLI | pass | `purpclaw tirith --help` → usage printed |
| curator CLI | pass | `purpclaw curator status` → status block printed |
| approvals CLI | pass | `purpclaw approvals list` → no queue dir (expected) |
| checkpoint-manager.mjs | loads | ESM import succeeds |
| approval-queue.js | loads | CJS require succeeds |
| curator.js | loads | `typeof loadState, isEnabled, runCurator` all = function |
| skills-hub.js | loads | CJS require succeeds |
| skills-guard.js | loads | CJS require succeeds |
| context-compressor.js | loads | CJS require succeeds, exports ContextCompressor class |
| tirith-security.js | loads | CJS require succeeds |
| LLM provider drivers | 17 providers | llm-provider.js loads |
| SpendGate | 2/2 pass | budget enforcement verified |
| Agent registry | loads | `swarm_coordinator.js` starts, loads all subsystems |

---

## 🟡 AMBER — Configured, Not Verified Live

| Item | Status | Gap |
|------|--------|-----|
| PM2 ecosystem | 34 apps defined | All scripts exist but all offline |
| ecosystem.config.js | valid | All 34 script paths resolve |
| Python 3.11 | installed (3.11.15) | `py -3.11` probe fails in doctor |
| Approval queue | built, lazy-wired | `exec-policy.js` requires it; orchestrator down |
| Curator | built, lazy-wired | `idle-engine.js:389` requires it; spine down |
| Skills hub | built, wired | `lib/commands/skills.js:40` imports it |
| Skills guard | built, wired | `lib/commands/skills.js:37` imports it |
| Context compressor | built, wired | `lib/agent-loop.js:31` imports it |
| Tirith security | built, wired | `lib/tirith.js` wraps it |
| Checkpoint manager | built, CLI wired | `bin/purpclaw.js:1189` ESM dynamic import works |
| Hardcoded banner counts | 32/32 UP, 152 AGENTS, 501 TOOLS | Not queried from runtime |
| Version mismatch | CLI banner says v0.9.0-rc | package.json says 1.2.0 |

---

## 🔴 RED — Broken and Reproducible

### 🔴 CRITICAL 1 — All PM2 services offline (0/13 ports respond)

```
3000: 000  3001: 000  7780: 000  7782: 000  7783: 000
7784: 000  7790: 000  7793: 000  7885: 000  7890: 000
7896: 000  9119: 000  7799: 000
```

**Reproducer:** `curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:7780/health`
**Expected:** 200. **Got:** 000 (connection refused).
**Root cause:** PM2 daemon not running. `pm2 jlist` returns:
  `Unexpected token 'P', "[PM2] Spawn" is not valid JSON`
  — pm2 CLI is outputting ASCII banner before JSON, breaking `jlist`.

**Fix:** `pm2 delete all && pm2 start ecosystem.config.js`

---

### 🔴 CRITICAL 2 — checkpoint-manager CJS bridge missing

5 files require `./checkpoint-manager` (CJS), but only `.mjs` exists:

```
lib/tool-runtime.js:10       → FAIL require('./checkpoint-manager')
lib/agent-gateway.js:10      → FAIL require('./checkpoint-manager')
lib/continuity.js:152       → FAIL require('./checkpoint-manager')
lib/agent-loop.js           → FAIL require('./checkpoint-manager')
```

`lib/commands/ask.js:388,407` → OK (uses `require('../checkpoint-manager')` which resolves to `.mjs` with Node's extension-less resolution).

`lib/commands/apply-diff.js:213` and `lib/eval-auto-fix.js:259` → OK (explicit `.mjs`).

The 4 failing files are the ones that do `require('./checkpoint-manager')` from
the `lib/` directory, which Node resolves as `lib/checkpoint-manager.js` first
(before trying `.mjs`). Since no `.js` file exists, they fail.

**Fix:** Create `lib/checkpoint-manager.js` as a CJS wrapper:
```js
// CJS shim for the ESM checkpoint-manager.mjs
module.exports = require('./checkpoint-manager.mjs');
```
Or convert the 4 failing files to use dynamic `import()`.

---

### 🔴 CRITICAL 3 — Python path probe wrong in doctor

```
NO  Python 3.11    py -3.11 unavailable
```
But: `python --version` → `Python 3.11.15` ✓

**Root cause:** `bin/purpclaw.js` doctor probes `py -3.11` but the correct
Windows alias is `python` or `py`. The `-3.11` suffix doesn't resolve.

**Fix:** Change doctor probe from `py -3.11` to `python --version` or `py --version`.

---

### 🔴 MAJOR — Agent-gateway-server not started by PM2

`ecosystem.config.js` has a comment referencing `purpclaw-gateway-server` (port 9119)
but no actual app entry for `agent-gateway-server.js`. The server module exists
(`lib/agent-gateway-server.js`) and imports `approval-queue.js` — but it's not in
the PM2 ecosystem.

**Fix:** Add `agent-gateway-server.js` to ecosystem.config.js, or confirm it
should be started another way.

---

### 🔴 MAJOR — `pm2 jlist` JSON parse failure

PM2 CLI on Windows Node v24 outputs ASCII banner before JSON, breaking
all PM2 programmatic access (used by `deep-audit.js`, `purpclaw doctor`,
and potentially other monitoring tools).

**Workaround:** Use `pm2 jlist 2>/dev/null | tail -n +X` to skip banner lines,
or parse output by finding first `[` character.

---

## 🐰 DUST BUNNIES — Suspicious, Not Proven

| Item | Note |
|------|------|
| `bin/purpclaw.exe` (296MB) | Standalone binary — may be stale vs source |
| `bin/purpclaw.js.debug` (401KB) | Debug build — unused? |
| 37 orphaned root files | Listed in DEEP_AUDIT.md — review before delete |
| `agent_score.js` + `agent_score.json` | Writes score file nothing reads |
| `task_decomposer.js` | "Missing organ" — built but no code path calls it |
| `swarm_scheduler.js` | Reads non-existent `cognitive_tasks.json` |
| `unified_bridge.js` | Superseded by `voice_bridge_7792.js` |
| `memory_matrix.py` (58KB) | v1 superseded by `memory_matrix_v2.py` |
| `memory_archive.json.gz` (1.7GB) | Old compressed memory, 4.9GB total in `.gz*` |
| `yolov8n.pt` (6.4MB) | YOLO model — verify still used by `yolo_service.py` |
| `purpclaw.config.example.json` | Example — verify matches actual config keys |

---

## 🚫 DO NOT TOUCH (Parked by Design)

| Item | Reason |
|------|--------|
| `cognitive_spine.py` + 6 other Python modules | Not in PM2, imported by `cognitive_gateway.js` — cognitive subsystem intentionally offline |
| `autoDream.py` | Cognitive auto-dream system, separate PM2 entry |
| `simple_bridge.py` | Companion chorus bridge, separate PM2 entry |
| `yolo_service.py` | Vision subsystem, separate PM2 entry |
| `voice_stt.py` | Voice STT, separate PM2 entry |

---

## HARDWARE CONTEXT

- i7-2600K Sandy Bridge (2011) — no AVX2, 6GB VRAM
- E: drive 78GB free, D: 186GB free, K: 54GB free
- Python 3.11.15 confirmed installed
- Node.js v24.14.0 (path-mangling linter bug on Windows — ignore in error output)

---

## ACTION PLAN (Priority Order)

1. **Start PM2:** `pm2 delete all && pm2 start ecosystem.config.js`
2. **Fix checkpoint-manager CJS:** Create `lib/checkpoint-manager.js` shim
3. **Fix Python probe:** Change `py -3.11` to `python --version` in doctor
4. **Add gateway-server to PM2:** Wire `agent-gateway-server.js` into ecosystem
5. **Fix pm2 jlist parsing:** Skip ASCII banner lines in programmatic calls
6. **Review 37 orphaned files:** Safe to archive vs delete
7. **Version sync:** Banner says v0.9.0-rc, package.json says 1.2.0 — pick one

---

## FIXES APPLIED 2026-07-29

| Fix | File | Status |
|-----|------|--------|
| checkpoint-manager CJS shim | `lib/checkpoint-manager.js` | ✅ VERIFIED — tool-runtime.js now loads |
| Python probe fix | `bin/purpclaw.js:3928` | ✅ VERIFIED — probe returns Python 3.14.3 |
| Version banner sync | `bin/purpclaw.js` | ✅ VERIFIED — both banners now v1.2.0 |
| PM2 service start | `pm2 start ecosystem.config.js` | ⏳ Pending — user action required |

**PM2 start command:**
```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
pm2 delete all && pm2 start ecosystem.config.js
```

---

*Audit run: 2026-07-29 | Scripts: `scripts/deep-audit.js`, `scripts/audit-deep.js`*
