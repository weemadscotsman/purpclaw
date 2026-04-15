# PURPCLAW — Agent Context

## Project Overview

PURPCLAW (v8.3.0) is a Next.js 15+ multi-agent orchestration system built around the persona **SAMANTHA** (Specific Autonomous Multi-Agent Network for Thoughtful Home Assistance). It coordinates 35+ animal-themed agents across 9 divisions through a hybrid Node.js/Python service mesh. The frontend is a dark, cyberpunk-style dashboard powered by Tailwind CSS v4, React 19, and TypeScript.

The codebase is intentionally experimental. You will find multiple competing boot scripts, ad-hoc Python cognitive services, standalone HTML dashboards, and a large number of root-level `.js` files that act as microservices. Do not assume a single canonical launcher—check which services are actually running before making changes.

---

## Technology Stack

| Layer | Tech |
|-------|------|
| Frontend Framework | Next.js 15+ (App Router, `output: 'standalone'`) |
| Runtime | Node.js (implied 18+; Next.js 15 requires it) |
| Language | TypeScript 5.9+ |
| Styling | Tailwind CSS v4.1.11 + `@tailwindcss/postcss` |
| UI Libraries | React 19, `lucide-react`, `motion` (transpiled), `d3`, `@xyflow/react` |
| Process Manager | PM2 (`ecosystem.config.js`) |
| Voice Integration | Xiaozhi cloud WebSocket proxy |
| Vision / AI | Python 3.11, OpenCV, YOLOv8n (`yolo_service.py`), Tesseract OCR |
| Linting | ESLint 9.39.1 + `eslint-config-next` |

---

## Project Structure

```
PURPCLAW/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Command Center (main dashboard)
│   ├── layout.tsx                # Root layout + dark theme
│   ├── globals.css               # Tailwind v4 import + CSS variables
│   ├── agents/page.tsx           # Agent Tower panel
│   ├── swarm/page.tsx            # Swarm Monitor panel
│   ├── pipeline/page.tsx         # Task Pipeline panel
│   ├── components/               # App-level components (AgentTower, LogFeed, etc.)
│   ├── hooks/                    # useAgentTower, useApi, useSSE
│   └── particle-viz/             # (currently empty)
├── components/                   # Root-level shared components
│   ├── InterventionPanel.tsx
│   ├── OrchestratorWithSwarm.tsx
│   ├── TranscriptViewer.tsx
│   └── useSwarmControl.ts
├── lib/                          # Utilities + standalone servers
│   ├── utils.ts                  # cn() helper
│   ├── puppeteer.ts              # CLI execution engine (server-side)
│   └── xiaozhi_bridge.ts         # MCP bridge for Xiaozhi ball
├── skills/                       # Agent personality definitions
│   ├── guardian/                 # Only a few agents have code (guardian, spider)
│   ├── dragon/
│   ├── wolf/
│   └── ... (45+ agent directories)
├── *.js / *.py / *.html          # Root-level microservices & dashboards
├── ecosystem.config.js           # PM2 process definitions
├── next.config.ts
├── tsconfig.json
└── package.json
```

**Important:** The project root is dense with standalone scripts. They are not inside `app/` or `src/`. Key services like `unified_api.js`, `agent_tower.js`, `orchestrator.js`, and `voice_coordinator.js` live directly at the root.

---

## Service Mesh & Port Map

The system is a collection of microservices. Many hardcode their ports. **Be extremely careful when changing port numbers—grep the entire repo before editing.**

### Core Node.js Services

| Service | Port | File | Notes |
|---------|------|------|-------|
| Unified API | **7780** | `unified_api.js` | Main MCP tool surface, Xiaozhi WS proxy |
| Voice Coordinator | **7781** | `voice_coordinator.js` | Intent routing, TTS |
| Event Bus | **7782** | `unified_eventbus.js` | Pub/sub SSE server |
| State Store | **7783** | `unified_state.js` | Namespaced KV + SSE |
| Orchestrator | **7784** | `orchestrator.js` | Command router, agent dispatch |
| Agent Tower | **7790** | `agent_tower.js` | 35+ agents, team coordination |
| Gatekeeper | **7791** | `gatekeeper.js` | Pre-merge validation API |
| Voice Bridge | **7779** | `voice_bridge_7779.js` | WS voice input; health check on **8779** |
| Visualizer | **3030** | `visualizer_server.js` | Serves `thought_visualizer.html` |
| Next.js | **3000** | `next.config.ts` | Frontend dev server |

### Python Cognitive Services

| Service | Port | File | Notes |
|---------|------|------|-------|
| Memory Matrix | **7780** | `memory_matrix.py` / `memory_matrix_v2.py` | 3D quantized memory |
| Modal Logic Engine | **7785** | `modal_logic_engine.py` | Kripke-model epistemic/temporal logic |
| Autonomous Diagnostics | **7786** | `autonomous_diagnostics.py` | Multi-agent causal diagnosis |
| Symbolic Rules Engine | **7787** | `symbolic_rules_engine.py` | Datalog + forward chaining |
| Neuro-Symbolic Bridge | **7784** | `neuro_symbolic_bridge.py` | Neural ↔ symbolic bridge |
| Music Analysis | **7782** | `music_analysis_service.py` | Librosa-based audio analysis |
| YOLO Service | **7779** | `yolo_service.py` | Persistent object detection |
| LCD Bridge | **7778** | `lcd_bridge_server.py` | Turing Smart Screen proxy |

### ⚠️ Known Port Conflicts

Several services default to the **same port**. Only one can bind at a time unless you reconfigure them:

- **7780**: `unified_api.js`, `purpclaw_turing_core.js`, `memory_matrix.py`, `memory_matrix_v2.py`
- **7781**: `voice_coordinator.js`, `vision_monitor.js`
- **7782**: `unified_eventbus.js`, `music_analysis_service.py`
- **7784**: `orchestrator.js`, `neuro_symbolic_bridge.py`

The standard PM2/ecosystem startup only launches the Node services (`unified_api.js`, etc.). Python services must be started manually on non-conflicting ports if you need them.

---

## Boot & Process Management

There are **multiple competing boot scripts**. Do not assume one is the "official" launcher.

| Script | What it starts |
|--------|----------------|
| `ecosystem.config.js` | **PM2 definitions** for 9 Node services: EventBus, State, Unified API, Agent Tower, Voice Coordinator, Voice Bridge, Next.js, Gatekeeper, Orchestrator. This is the most reliable way to run the core mesh. |
| `boot.js` | Master boot orchestrator (v8.1). Starts EventBus → State → Unified API → Agent Tower → Voice Coordinator → Voice Bridge → Next.js. Does **not** start Gatekeeper, Orchestrator, or Python services. |
| `launch_clean.js` | Stripped launcher (v8.0). Explicitly kills "dead weight" (LCD, avatar, Python bridge) and starts only: Unified API, Agent Tower, Voice Coordinator, Voice Bridge, Next.js. |
| `unified_bridge.js` | Auto-restart launcher for critical services with exponential backoff. |
| `start_purpclaw.js` | Minimal v7.0 startup. Spawns only Guardian Security API and Voice Command Bridge. Avoids Control API to prevent `EADDRINUSE`. |
| `purpclaw_turing_core.js` | Avatar/TURING takeover core. Runs Control API (7780), Mood Engine, Voice Bridge, agent swarm, and optional LCD face display. |

### Recommended startup

```bash
# Start the core Node mesh
pm2 start ecosystem.config.js

# Check health
pm2 status
pm2 logs purpclaw-api
```

---

## Build and Run Commands

From `package.json`:

```bash
npm run dev      # Next.js dev server on :3000
npm run build    # Next.js production build (standalone output)
npm run start    # Start production server
npm run lint     # ESLint across the project
npm run clean    # next clean
```

**Note:** `npm run build` / `npm run dev` only starts the frontend. The backend services (Agent Tower, Unified API, etc.) are **not** started by npm. Use PM2 or the boot scripts above.

---

## Testing Strategy

There is **no centralized test suite** (no Jest, Vitest, or pytest configuration in `package.json`). Testing is ad-hoc via standalone scripts:

| Test File | How to run | What it checks |
|-----------|------------|----------------|
| `smoke_test.js` | `node smoke_test.js` | Health-checks 7 core services, tests MCP tools, Kokoro TTS, and agent spawn |
| `test_memory.py` | `python test_memory.py` | Basic import/creation sanity check for `memory_matrix.py` |
| `test_rules_inline.py` | `python test_rules_inline.py` | Inline Datalog inference, constraints, counterfactuals for `symbolic_rules_engine.py` |
| `playwright_compatibility.js` | `node playwright_compatibility.js` | Browser automation compatibility (Playwright / Puppeteer detection + screenshot) |

If you add new features, prefer adding a standalone `<feature>_test.js` or `<feature>_test.py` at the root rather than introducing a new test framework, to match existing conventions.

---

## Code Style & Conventions

1. **Tailwind v4:** Import via `@import "tailwindcss";` in CSS. No `tailwind.config.js` exists—use utility classes and CSS variables from `globals.css`.
2. **Dark Theme Only:** All UI is dark cyberpunk. Key accents:
   - Cyan `#22d3ee`
   - Emerald `#34d399`
   - Violet `#a78bfa`
   - Pink `#f472b6` (Strategic/Tier 3)
3. **Typography:** Use `font-mono` (JetBrains Mono) for data/labels. Headers often use `text-[10px] uppercase tracking-[0.3em]`.
4. **React:** All interactive pages/components must declare `'use client';`. Server components are the default.
5. **TypeScript:** Strict mode is on. Avoid `any`. Explicit interfaces are preferred.
6. **Imports:** Most files use relative paths (`../hooks/useApi`). The `@/*` path alias is configured but rarely used.
7. **API Calls:** Direct `fetch()` to hardcoded `localhost` endpoints. Use `AbortSignal.timeout(2500)` for health checks.
8. **Styling Mix:** Some components combine Tailwind with `<style jsx>` (e.g., `LogFeed.tsx`, `PerkplerDashboard.tsx`).

---

## Security Considerations

- **Hardcoded Secrets:** `ecosystem.config.js` reads `.env` but contains fallback values, including a hardcoded Xiaozhi WebSocket token. `purpclaw_settings.json` also stores API keys (OpenAI, DeepSeek, MiniMax, Xiaozhi). Treat these files as sensitive.
- **Tier-Based Access:** `locked_interfaces.js` implements Tier 1–3 access control for tools and files. Critical tools are gated behind higher tiers.
- **File Safety:** Do NOT modify files under `C:\Windows\*`, `C:\Program Files\*`, `.env`, `ecosystem.config.js`, or core service bootstrappers without explicit user confirmation.
- **Shell Execution:** `lib/puppeteer.ts` and `unified_api.js` spawn local CLI processes (`cmd.exe`, PowerShell). Be cautious when editing command-construction logic to avoid injection.
- **Port Exposure:** Services bind to `127.0.0.1` or `localhost` by default, but some HTTP servers may bind to all interfaces. Verify `host` parameters in Python services before exposing them.

---

## Critical Rules

- **Do NOT delete or overwrite** `ecosystem.config.js`, `package.json`, `next.config.ts`, or `.env` unless explicitly asked.
- **Do NOT change service ports** without grepping every reference across `.js` and `.py` files.
- **Do NOT run `git commit` / `git push` / `git reset`** without explicit user confirmation.
- `next.config.ts` has `output: 'standalone'` and `transpilePackages: ['motion']`—preserve these settings.
- `DISABLE_HMR=true` disables webpack file watching in dev mode to prevent flickering during agent edits. Do not remove this logic.
- `project_architecture.md` at the root is **legacy boilerplate** and does not reflect the actual PURPCLAW architecture. Rely on this `AGENTS.md`, `README.md`, and `TEAM_HANDOVER.md` instead.
- The `voice_bridge_7779.js` health endpoint is on **8779**, not 7779.

---

## Quick Reference: File to Function Mapping

| Functional Area | Key Files |
|-----------------|-----------|
| Boot / PM2 | `ecosystem.config.js`, `boot.js`, `launch_clean.js`, `unified_bridge.js` |
| Main API / MCP Tools | `unified_api.js`, `lib/xiaozhi_bridge.ts`, `lib/puppeteer.ts` |
| Agent Orchestration | `agent_tower.js`, `orchestrator.js`, `swarm_scheduler.js`, `companion_swarm.js` |
| Voice / TTS | `voice_coordinator.js`, `voice_bridge_7779.js`, `browser_voice_commands.js` |
| Vision / OCR | `vision_monitor.js`, `yolo_service.py`, `playwright_compatibility.js` |
| Memory / Cognition | `memory_matrix.py`, `memory_matrix_v2.py`, `neuro_symbolic_bridge.py` |
| Logic / Rules | `modal_logic_engine.py`, `symbolic_rules_engine.py`, `autonomous_diagnostics.py` |
| Mood / Avatar | `mood_engine.js`, `turing_face_driver.js`, `purpclaw_turing_core.js`, `digital_shaman.js` |
| Dashboards (HTML) | `brain_dashboard.html`, `command_center.html`, `swarm_dashboard.html`, `memory_explorer.html` |
| CLI Utilities | `purpclaw.js`, `purpclaw_cli.js`, `tool_diagnostic.js`, `smoke_test.js` |
