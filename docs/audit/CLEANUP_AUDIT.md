# PURPCLAW Cleanup Audit — 2026-04-18

## Current Stack (19 PM2 Services)

### All PM2 Services
| Service | Script | Port | Status |
|---------|--------|------|--------|
| purpclaw-api | unified_api.js | 7780 | Active — Main API + Xiaozhi cloud WSS client |
| purpclaw-eventbus | unified_eventbus.js | 7782 | Active — Central pub/sub |
| purpclaw-state | unified_state.js | 7783 | Active — State store |
| purpclaw-orchestrator | orchestrator.js | 7784 | Active — Priority queue + SelfHealer + circuit breakers |
| purpclaw-tower | agent_tower.js | 7790 | Active — 30+ agents, 9 divisions |
| purpclaw-voice | voice_coordinator.js | 7781 | Active — Kokoro TTS + intent parsing |
| purpclaw-bridge | voice_bridge_7792.js | 7792 | Active — WebSocket voice relay |
| purpclaw-gatekeeper | gatekeeper.js | 7791 | Active — Pre-merge validation |
| purpclaw-nextjs | Next.js | 3000 | Active — Frontend UI |
| purpclaw-chorus | companion-chorus/bridge.js | — | Active — Companion species reactions |
| purpclaw-metrics | metrics_aggregator.js | 7890 | Active — Health polling + log tailing |
| purpclaw-vision | vision_monitor.js | 7881 | Active — Webcam + YOLO |
| purpclaw-memory | memory_matrix_v2.py | — | Active — Vector memory (Python) |
| purpclaw-bridge-ns | neuro_symbolic_bridge.py | 7884 | Active — Neuro-symbolic reasoning (Python) |
| purpclaw-modal | modal_logic_engine.py | — | Active — Modal logic (Python) |
| purpclaw-diagnostics | autonomous_diagnostics.py | — | Active — Self-diagnostics (Python) |
| purpclaw-rules | symbolic_rules_engine.py | — | Active — Rules engine (Python) |
| purpclaw-yolo | yolo_service.py | 7779 | Active — YOLO detection (Python) |
| purpclaw-avatar | simple_bridge.py | 7777 | Active — Avatar bridge to Electron (Python) |

### Wrapper Strategy
- **run_node.js**: spawns all Node services (max_restarts: 2, restart_delay: 10000ms)
- **run_py.js**: spawns all Python services via `pythonw.exe` (no console window)

---

## What's Connected to What

```
┌─────────────────────────────────────────────────────────────┐
│ simple_bridge.py :7777 (Avatar bridge, Python)              │
│ Electron :9999 (Xiaozhi ball avatar)                       │
└────────────────┬────────────────────────────────────────────┘
                 │ TCP
        ┌────────▼─────────────────────────────┐
        │ voice_bridge_7792.js :7792           │
        │ (Note: filename says 7779, runs on    │
        │  7792 — port conflict history)        │
        └────────┬──────────────────────────────┘
                 │ TCP :7780              │ TCP :7781
        ┌───────▼──────────┐    ┌─────────▼──────────────┐
        │ unified_api.js   │    │ voice_coordinator.js   │
        │ :7780            │    │ :7781                  │
        │ • Xiaozhi WSS   │    │ • Intent parsing       │
        │ • 66 MCP tools  │    │ • Kokoro TTS           │
        │ • Bridge :7778  │    │ Routes to:orchestrator │
        └───────┬──────────┘    └─────────┬──────────────┘
                │                          │
    ┌───────────┴──────────────────────────┴──────────────────┐
    │                                                          │
┌───▼──────────┐  ┌──────▼───────┐  ┌──────▼──────┐  ┌──────▼─────┐
│ EventBus     │  │ State Store  │  │ Orchestrator│  │ Agent Tower│
│ :7782        │  │ :7783        │  │ :7784       │  │ :7790      │
│ pub/sub      │  │ agents/tools │  │ Priority Q  │  │ 30+ agents │
│ agent.*      │  │ voice/swarm  │  │ SelfHealer  │  │ Kimi CLI   │
│ system.*     │  │ system       │  │ 3 retries   │  │ spawn      │
│ voice.*      │  │              │  │ backoff     │  │            │
│ tool.*       │  │              │  │ 1s→30s      │  │            │
│ swarm.*      │  │              │  │             │  │            │
└──────┬───────┘  └──────────────┘  └──────┬──────┘  └──────┬─────┘
       │                                      │                │
       │                                      │                │
   ┌───▼──────────────────────────────────────▼────────────────▼──────┐
   │ Python Services                                                  │
   │ memory_matrix_v2.py — vector memory        neuro_symbolic_bridge.py :7884 │
   │ symbolic_rules_engine.py — Datalog rules    autonomous_diagnostics.py    │
   │ modal_logic_engine.py — Kripke models       yolo_service.py :7779        │
   └──────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Fixes Applied (2026-04-17)

### Spawn Bomb Root Cause — FIXED
`unified_api.js` and `agent_tower.js` were using `spawn()` with `stdio: ['pipe','pipe','pipe']` WITHOUT `unref()`. Pipe handles kept parent processes tethered to children. Fixed:
```javascript
// BEFORE (unsafe — pipe handles keep parent tethered)
spawn(cmd, args, { stdio: ['pipe','pipe','pipe'] });

// AFTER (safe — detached + ignore severs the link)
spawn(cmd, args, { detached: true, stdio: 'ignore' });
child.unref();
```

### Metrics Aggregator — FIXED
Fixed-interval polling (every 2s regardless of service health) caused unnecessary load. Fixed with per-service exponential backoff: up services polled every 2s, down services 2s→4s→8s→16s→30s max.

### Voice Bridge Reconnect — FIXED
Both TCP connections (Control API + Voice Coordinator) now use exponential backoff (2s→30s max).

### Avatar Disconnect Detection — FIXED
`simple_bridge.py` now runs a background thread that checks avatar port 9999 every 10s and prints state changes.

### Companion-Chorus EventBus Reconnection — FIXED
Was fixed 5s retry (DOS risk if EventBus is slow). Now uses exponential backoff (2s→30s max), resets on successful reconnect.

---

## Dead Files — Already Cleaned Up

The following were deleted in prior sessions:
- `crossbar_integration.js` — unused library
- `agent_tower (2).js` — duplicate
- `boot (2).js` — duplicate
- `package (2).json` — duplicate
- `AGENTS.md` — was empty, rebuilt with agent directory
- `agent_tower_diff.txt`, `boot_diff.txt`, `package_diff.txt` — diff waste

---

## Orphaned Files (Not PM2-Managed, Not Imported)

| File | Status | Notes |
|------|--------|-------|
| music_analysis_service.py | Orphan | Port 7882, no consumers, not in PM2 |
| ball_to_rig_bridge.js | Legacy | Standalone bridge, no imports |
| browser_voice_commands.js | Legacy | No imports |
| clap-detector.js | Legacy | No imports |
| gen_api.js | Legacy | No imports |
| mood_engine.js | Legacy | Only imported by purpclaw_turing_core.js |
| screen-manager.js | Legacy | No imports |
| turing_face_driver.js | Legacy | Only imported by purpclaw_turing_core.js |
| visualizer_server.js | Legacy | No imports |
| swarm_scheduler.js | Legacy | No imports |
| dashboard_audit_test.js | Debug | Delete |
| eventbus_audit_test.js | Debug | Delete |
| smoke_test.js | Debug | Delete |
| tool_diagnostic.js | Debug | Delete |
| companion-chorus/test-ai.js | Debug | Delete |
| companion-chorus/test-api.js | Debug | Delete |
| playwright_compatibility.js | Debug | Delete |
| purpclaw.js | Legacy | Old entry point |
| purpclaw_cli.js | Legacy | CLI entry point |
| purpclaw_turing_core.js | Legacy | Standalone, imports orphaned files |

---

## Folders That Are Clutter

- `Open-Higgsfield-AI-main/` — unrelated AI project
- `tesseract-ocr-tesseract-9c516f4/` — old OCR waste
- `html to combine as a beter fuller ui/` — unused HTML drafts
- `agent_work/*/` — individual agent work dirs (bee, dragon, duck etc.) — EMPTY or OLD

---

## Known Issues (Open)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Companion context reloaded only at startup — lost if EventBus goes down and chorus restarts | Medium | Open |
| 2 | EventBus (7782) is a single point of failure — no secondary fallback | Medium | Open |
| 3 | Division agent Node.js fallback stub has no timeout (Kimi CLI has 45s; fallback stub has none) | Low | Open |
| 4 | Mission complete callback to user depends on SSE/TCP keepalive — no explicit "done" signal | Low | Open |
| 5 | Vision monitor bridge lift not runtime-tested | Low | Open |

---

## RECOMMENDATION

### Keep (Essential)
- unified_api.js, orchestrator.js, unified_eventbus.js, unified_state.js
- agent_tower.js, voice_coordinator.js, voice_bridge_7792.js
- gatekeeper.js, companion-chorus/bridge.js, metrics_aggregator.js
- vision_monitor.js, simple_bridge.py, yolo_service.py
- memory_matrix_v2.py, neuro_symbolic_bridge.py, modal_logic_engine.py
- autonomous_diagnostics.py, symbolic_rules_engine.py
- ecosystem.config.js, .env

### Deleted 2026-04-18 ✅
- 13 orphaned JS/TS files (see FILE_AUDIT.md for full list)
- 7 directories cleaned (Open-Higgsfield, tesseract, Samantha's Daily Log, __pycache__, html combine folder, etc.)

### Remaining Clutter (non-blocking)
- glitch_manifest.md, loop_of_shame.py, consequence_cache.json (June 2025 debug files)
- TASKS/ (old task docs), swarm_job_allocation/ (empty), swarm_jobs/ (empty)
