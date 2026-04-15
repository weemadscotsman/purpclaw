# 🦞 PURPCLAW v8.3.0 — Multi-Agent Orchestration System

> **SAMANTHA** (Specific Autonomous Multi-Agent Network for Thoughtful Home Assistance)
> A production-grade multi-agent orchestration platform with 35+ agents, 9 PM2 services, Memory Matrix brain, Vision Monitor, and Xiaozhi ball integration.

**Built by [WEEMADSCOTSMAN](https://github.com/weemadscotsman) at Pixel Dynasty.**

## 🎯 New in v8.3.0

- **Memory Matrix** — 3D Quantized Memory with Shadow Protocol v1.0
- **Vision Monitor** — Continuous webcam monitoring with object tracking
- **YOLO Service** — Persistent real-time object detection
- **Command Center** — Real-time system dashboard UI

---

## What Is PURPCLAW?

PURPCLAW is a Next.js multi-agent orchestration system that coordinates 35+ specialized agents across 9 divisions. Through **SAMANTHA**, it connects to a Xiaomi Xiaozhi ball for voice interaction with the agent swarm.

### Core Capabilities

- **Multi-Agent Orchestration** — 35 agents across 9 functional divisions
- **Voice Control** — SAMANTHA personality layer with Xiaozhi ball integration
- **Real-Time Planning** — Orchestrator with step sequencing and agent dispatch
- **Persistent State** — Vector storage + entity graph management
- **Event-Driven** — Pub/sub messaging for swarm coordination
- **66+ MCP Tools** — Vision, webcam, file system, browser automation, and more
- **Evaluation Architecture** — Agent scoring, pre-merge gatekeeper validation, tier-based access control

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (3000)                  │
│          Agent Tower UI  |  Live Events  |  Companion       │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket / MCP
┌──────────────────────────▼──────────────────────────────────┐
│                     Unified API (7790)                      │
│        [MCP WebSocket Bridge to Xiaozhi Cloud]               │
│              [SAMANTHA Personality Layer]                   │
└──────┬───────────┬───────────┬───────────┬──────────┬───────┘
       │           │           │           │          │
┌──────▼─────┐ ┌───▼────┐ ┌───▼────┐ ┌────▼────┐ ┌───▼──────┐
│  Agent     │ │ Event   │ │ State   │ │ Orches- │ │  Vision   │
│  Tower     │ │ Bus     │ │ Store   │ │ trator  │ │ Monitor  │
│  (7790)    │ │ (7782)  │ │ (7783)  │ │ (7784)  │ │ (7781)   │
│  35 agents │ │ pub/sub │ │ vector+ │ │ planning│ │ webcam   │
│  9 divs    │ │         │ │ entity  │ │ dispatch│ │ monitor  │
└────────────┘ └─────────┘ └─────────┘ └────┬────┘ └────┬────┘
                                             │           │
┌────────────────┐                  ┌────────▼────────┐ ┌──▼──────┐
│ Memory Matrix  │                  │   Gatekeeper    │ │  Voice   │
│ (7780)         │                  │   (7791)        │ │ Bridge   │
│ 3D Quantized   │                  │ pre-merge valid│ │ (8779)  │
│ + Shadow       │                  └─────────────────┘ └────┬───┘
│ Protocol v1.0  │                                           │
└───────┬────────┘      ┌──────────────┐      ┌────────────▼─────┐
        │               │              │      │   Xiaozhi Cloud   │
        │               │ YOLO Service │      │   (SAMANTHA)      │
        │               │   (7779)     │      └───────────────────┘
        └───────────────┴──────┬───────┘
                               │
                    ┌──────────▼──────────┐
                    │  Object Detection   │
                    │  Persistent Service │
                    └─────────────────────┘
```

## Memory Matrix — 3D Quantized Brain

The Memory Matrix is a three-tier memory system with Shadow Protocol v1.0 deep signal detection.

### Three-Tier Architecture

| Layer | Buffer | Capacity | Duration |
|-------|--------|----------|----------|
| **Sensory** | 200ms | 1 frame | Real-time |
| **Working** | 7±2 items | 7±2 chunks | 30 seconds |
| **Long-Term** | Infinite | Unlimited | Persistent |

### 8-Bit Quantized Embeddings

- **384 dimensions** = 384 bytes per embedding (vs 1536 bytes float32)
- **SIMD-accelerated cosine similarity** (AVX2 when available)
- **Hash-based fallback** when sentence-transformers unavailable
- Storage: 2.6KB per 1000 memories vs 10KB+ float32

### Shadow Protocol v1.0

Deep signal detection layer that identifies evasive patterns in conversation:

| Pattern | Detection | Risk |
|---------|-----------|------|
| `nervous_laughter` | "\bHA\b.*\bLIAR\b\|\bHA\b.*\bGUILTY\b" | MEDIUM |
| `uncertain_will` | "I.*WILL.*MAYBE\|MAYBE.*I.*WILL" | MEDIUM |
| `liability_escape` | "NOT.*MY.*RESPONSIBILIT" | HIGH |
| `spiritual_bypass` | "THE.*UNIVERSE.*WILL\|GOD.*HAS.*PLAN" | LOW |
| `privileged_content` | "CLASSIFIED\|PRIVILEGED\|LAWYER" | HIGH |
| `lobotomy` | "JUST.*KIDDING\|NOT.*SERIOUS\|NEVERMIND" | HIGH |
| `escape_pattern` | "LET'S.*CHANGE.*SUBJECT\|ANYWAY.*" | MEDIUM |
| `human_liability` | "I.*AM.*JUST.*A.*BOT\|AI.*CAN'T.*BLAME" | MEDIUM |

### HTTP API (Port 7780)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ingest` | POST | Store experience with auto-shadow scan |
| `/recall` | POST | Retrieve via embedding similarity |
| `/shadow` | GET/POST | Shadow Protocol status and controls |
| `/stats` | GET | Memory Matrix statistics |
| `/health` | GET | Health check |

### Command Center Integration

Open `command_center.html` for real-time Memory Matrix monitoring with:
- Shadow Protocol toggle and event log
- Memory stats (atoms, capacity, events/min)
- Long-term memory browser
- Reaction engine status

---

## 11 Services

| Service | Port | Status | Description |
|---------|------|--------|-------------|
| **Unified API** | 7790 | ✅ healthy | Main API, WebSocket bridge to Xiaozhi, MCP protocol |
| **Memory Matrix** | 7780 | ✅ healthy | 3D Quantized Memory with Shadow Protocol v1.0 |
| **Vision Monitor** | 7781 | ✅ running | Continuous webcam monitoring, object tracking |
| **Agent Tower** | 7790 | ✅ 35 agents | Agent registry with skills, personas, divisions |
| **Event Bus** | 7782 | ✅ operational | Pub/sub messaging for swarm coordination |
| **State Store** | 7783 | ✅ operational | Vector embeddings + entity graph management |
| **Orchestrator** | 7784 | ✅ healthy | Task planning, step sequencing, agent dispatch |
| **Voice Bridge** | 8779 | ✅ healthy | WebSocket proxy to Xiaozhi cloud |
| **Gatekeeper** | 7791 | ✅ validation | Pre-merge security, performance, correctness checks |
| **YOLO Service** | 7779 | ✅ running | Persistent real-time object detection |
| **Next.js Frontend** | 3000 | ✅ running | Agent Tower UI, live events, companion chats |

---

## 35 Agents Across 9 Divisions

| Division | Agents |
|----------|--------|
| **COMPANION** | bunny, raven, whisper, echo, Nova |
| **CREATION** | canvas, verse, melody, arch |
| **DISCOVERY** | seek, lens, radar, scout |
| **OPERATION** | forge, pulse, arbor, cipher |
| **VOICE** | verse, chorus, Solo |
| **REASONING** | axiom, prism, nexus, beacon |
| **SYSTEM** | orchestrate, tower, eventbus, state |
| **CRITIQUE** | zen, spark |
| **LEARNING** | sage, echo |

---

## SAMANTHA Integration

**SAMANTHA** (Specific Autonomous Multi-Agent Network for Thoughtful Home Assistance) is the personality layer that connects PURPCLAW to a Xiaomi Xiaozhi ball, enabling voice interaction with the agent swarm.

### Connection Flow

```
Xiaozhi Ball ←→ Voice Bridge (7779) ←→ Voice Coordinator (7781)
                                    ↓
                            Unified API (7780)
                                    ↓
                            SAMANTHA personality
                            (companion_swarm.js)
                                    ↓
                            Agent Tower (7790)
                              (35 agents)
```

### Key Files

| File | Role |
|------|------|
| `companion_swarm.js` | SAMANTHA's personality definitions and agent routing |
| `voice_bridge_7779.js` | WebSocket proxy to Xiaozhi cloud |
| `unified_api.js` | Main API with WebSocket bridge and MCP protocol |

---

## Evaluation System

PURPCLAW implements a machine-like evaluation architecture to ensure quality and safety.

### Agent Scoring (agent_score.js)

Tracks agent performance for intelligent routing:

- **Success Rate** — % of tasks completed without failure
- **Speed** — Average task duration per intent type
- **Bug Rate** — Track bug introduction per agent

| Function | Purpose |
|----------|---------|
| `recordTask()` | Log task outcome for scoring |
| `suggestAgent()` | Return best agent based on score history |
| `getSafestAgent()` | Prioritize reliability over speed |
| `getAgentsForIntent()` | Rank agents by intent specialization |

### Gatekeeper (gatekeeper.js)

Pre-merge validation on port 7791 with 13 checks across 3 categories:

| Category | Checks | Risk Level |
|----------|--------|------------|
| **Security** | sql_injection, command_injection, hardcoded_secret, xss_vector, auth_bypass | CRITICAL |
| **Performance** | sync_file_io, nested_loop, memory_leak, no_cleanup | HIGH |
| **Correctness** | try_no_catch, error_swallowed, console_log, todo_comment | MEDIUM/LOW |

### Locked Interfaces (locked_interfaces.js)

Tier-based access control for dangerous operations:

| Tier | Agents | Tools |
|------|--------|-------|
| **Tier 3** (Strategic) | dragon, wolf, snake, guardian, scientist | process_kill, git_push, execute_command, file_delete |
| **Tier 2** (Operations) | owl, ghost, spider, phantom, panther, fox, jaguar | file_write, git_commit, window_close |
| **Tier 1** (Foundation) | robot, bee, turtle, hamster, squirrel, duck, koala | read-only and basic tools |

Protected file patterns: `C:\Windows\*`, `C:\Program Files\*`, `node_modules`, `.env`, `ecosystem.config.js`, core service files.

Rate limits: execute_command (10/min), process_kill (5/min), file_delete (10/min), git_push (3/min)

---

## Quick Start

```bash
# Navigate to project
cd C:\Users\Admin\Desktop\purpclaw

# Start all PM2 services
pm2 start ecosystem.config.js

# Check service status
pm2 status

# View logs for a service
pm2 logs unified_api

# Restart a specific service
pm2 restart orchestrator
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health check |
| `/api/agents` | GET | List all registered agents |
| `/api/agents/:id` | GET | Get agent details |
| `/api/execute` | POST | Execute agent task |
| `/api/events` | GET | Live event stream |
| `/api/ws` | WebSocket | MCP protocol WebSocket |

---

## MCP Tools (66+)

### Vision (5)
| Tool | Description |
|------|-------------|
| `screen_capture` | Screenshot the screen |
| `screen_ocr` | Read text from screen via OCR |
| `screen_find_object` | Detect objects with YOLO |
| `screen_find_template` | Find image on screen |
| `screen_info` | Get monitor sizes |

### Webcam (3)
| Tool | Description |
|------|-------------|
| `webcam_look` | Take a photo with PC webcam |
| `webcam_detect` | Detect people/faces/objects |
| `webcam_read` | OCR text visible to camera |

### Mouse & Keyboard (3)
| Tool | Description |
|------|-------------|
| `mouse_click` | Click, double-click, right-click, drag |
| `mouse_scroll` | Scroll wheel |
| `keyboard_type` | Type text or press shortcuts |

### File System (8)
| Tool | Description |
|------|-------------|
| `file_read` | Read file contents |
| `file_write` | Write/append to files |
| `file_list` | List directory contents |
| `file_search` | Search by name or content |
| `file_copy` | Copy files/directories |
| `file_move` | Move/rename files |
| `file_delete` | Delete files |
| `dir_create` | Create directories |

### Browser (9) — Playwright-Powered
| Tool | Description |
|------|-------------|
| `browser_open` | Open URL with full interaction |
| `browser_click` | Click links/buttons by visible text |
| `browser_type` | Type into form fields |
| `browser_scroll` | Scroll pages |
| `browser_get_content` | Read page text content |
| `browser_screenshot` | Screenshot the browser |
| `browser_navigate` | Navigate: goto/back/forward/reload |
| `browser_tabs` | List open tabs |
| `browser_close_tab` | Close a tab |

### Audio (1)
| Tool | Description |
|------|-------------|
| `volume_control` | Set volume, mute/unmute, up/down |

### System (5)
| Tool | Description |
|------|-------------|
| `active_window` | Get focused window info |
| `system_status` | CPU, RAM, process overview |
| `disk_info` | Drive space for all disks |
| `network_info` | IP, WiFi, internet status |
| `execute_command` | Execute shell commands |

### Communication (4)
| Tool | Description |
|------|-------------|
| `http_request` | HTTP GET/POST/PUT/DELETE |
| `clipboard` | Read/write clipboard |
| `speak` | Text-to-speech via Kokoro TTS |
| `notification` | Desktop toast notifications |

---

## Vision Monitor Service (vision_monitor.js)

Continuous webcam monitoring with real-time object detection and scene change detection.

### Features

- **Continuous Monitoring** — 2 FPS frame capture with Python/OpenCV backend
- **Grid-Based Tracking** — 60x60 grid cells for precise object localization
- **Scene Change Detection** — Frame hash comparison to detect significant changes
- **YOLO Integration** — Real-time object detection via YOLO Service (port 7779)
- **Alert Callbacks** — Custom callback system for motion/scene events

### HTTP API (Port 7781)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/start` | POST | Start continuous monitoring |
| `/stop` | POST | Stop monitoring |
| `/status` | GET | Current monitoring status |
| `/tracked` | GET | Current tracked objects |
| `/events` | GET | Recent motion/scene events |
| `/snapshot` | GET | Capture current frame |
| `/health` | GET | Health check |

### Integration

Vision Monitor connects to the YOLO Service for object detection. The YOLO Service (yolo_service.py) runs persistently on port 7779, loading the YOLOv8n model once and serving detections via HTTP.

---

## YOLO Service (yolo_service.py)

Persistent real-time object detection service using YOLOv8n.

### Features

- **Model**: YOLOv8n (nano) — fast, efficient
- **Persistent**: Loads model once, serves many requests
- **HTTP API**: Simple JSON-based detection requests
- **Integration**: Used by Vision Monitor and unified_api.js tools

### Detection Categories

YOLOv8n supports 80 COCO categories including:
- People (`person`)
- Animals (`cat`, `dog`, `bird`, etc.)
- Objects (`cup`, `chair`, `laptop`, `phone`, etc.)
- Vehicles (`car`, `truck`, `bicycle`, etc.)

### Usage

```bash
# Direct detection
curl -X POST http://127.0.0.1:7779/detect \
  -H "Content-Type: application/json" \
  -d '{"image": "/path/to/image.jpg"}'

# Via unified_api tools
webcam_detect, screen_find_object, screen_identify
```

---

## Command Center (command_center.html)

Real-time system dashboard with 6-tab interface for monitoring and control.

### Tabs

| Tab | Purpose |
|-----|---------|
| **OVERVIEW** | System stats, service status, agent count, memory stats |
| **AGENTS** | Agent registry browser with division filtering |
| **LOGS** | Real-time log stream with level filtering |
| **TOOLS** | MCP tools grid with execution interface |
| **MEMORY** | Memory Matrix status, Shadow Protocol controls, memory browser |
| **VOICE** | Voice session controls, SAMANTHA interaction |

### Features

- Real-time service health checking (7790, 7779, 7780, 7791, 7777)
- Shadow Protocol event log with pattern detection
- Memory Matrix statistics (atoms, capacity, events/min)
- Agent status grid with division filtering
- Tool execution with parameter input
- Voice waveform visualization

### Access

Open `command_center.html` in any browser to access the dashboard.

---

## Bug Fixes (v8.3.0)

- **Fixed**: swarm_scheduler.js AGENTS reference — was referencing non-existent `companionSwarm.AGENTS`; now uses proper Agent Tower registry lookups via `getAgentInfo()` and `agentExists()`
- **Fixed**: Bridge health port mismatch — voice_bridge_7779.js health endpoint is at **8779** (PORT+1000), not 7779
- **Fixed**: Missing bunny/raven persona files — added SOUL.md, SKILL.md, GOALS.md, PROTOCOLS.md for both agents
- **Fixed**: YOLO timeout issues — persistent yolo_service.py on port 7779
- **Fixed**: Webcam OpenCV backend — proper cv2.VideoCapture(0) initialization

---

## SAMANTHA Upgrade Roadmap v8.1.1

### Phase 1: Foundation
- [ ] Integrate companion-chorus for multi-agent companion coordination
- [ ] Connect Open-Higgsfield-AI agent into CREATION division
- [ ] Implement ContextBus with shared.json for cross-agent context
- [ ] Add video and image generation tools

### Phase 2: Intelligence
- [x] Orchestrator v3.0 with predictive load balancing
- [x] Real-time swarm monitoring dashboard (Command Center)
- [ ] Automated health checks and self-healing
- [ ] Advanced agent metrics and performance analytics

### Phase 3: Voice
- [ ] Voice latency optimization (target: <300ms round-trip)
- [ ] NLP command parsing for natural voice commands
- [ ] Voice feedback with emotional tone support
- [ ] Agent training module with voice interaction logging

---

## Documentation

| Document | Description |
|----------|-------------|
| `STACK_AUDIT_*.md` | Full system audits |
| `SETUP_GUIDE.md` | Hardware setup to first voice command |
| `skills/*/AGENT.md` | Individual agent specifications |
| `skills/*/SOUL.md` | Agent personality core |
| `skills/*/SKILL.md` | Agent skill definitions |
| `skills/*/GOALS.md` | Agent goals and objectives |
| `skills/*/PROTOCOLS.md` | Agent communication protocols |

---

## Tech Stack

- **Runtime**: Node.js
- **Frontend**: Next.js 14+ (App Router)
- **Process Manager**: PM2 (11 services)
- **State**: In-memory vector store + entity graph
- **Messaging**: Pub/sub via EventBus
- **Protocol**: WebSocket + MCP (JSON-RPC 2.0)
- **Voice**: Xiaozhi cloud WebSocket proxy
- **Browser**: Playwright (Chromium)

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `XIAOZHI_MCP_URL` | WebSocket URL from Xiaozhi MCP settings | Required |
| `OPENCLAW_GATEWAY` | OpenClaw WebSocket | `ws://127.0.0.1:18789` |
| `MCP_BRIDGE_URL` | Bridge HTTP server | `http://localhost:3001` |

---

## Security

- **Shell injection protection** — All user input sanitized
- **System path protection** — Cannot delete Windows/Program Files/AppData
- **Critical process protection** — Cannot kill system processes
- **Destructive command blocking** — Blocks format, recursive deletes, shutdown
- **Tool timeout** — Every tool has a timeout to prevent hanging

---

## Changelog

### v8.3.0 (2026-04-15) - Memory Matrix & Vision Release
- **Added Memory Matrix** — 3D Quantized Memory with Shadow Protocol v1.0
- **Added Vision Monitor** — Continuous webcam monitoring with object tracking
- **Added YOLO Service** — Persistent real-time object detection
- **Added Command Center** — Real-time system dashboard UI
- **Fixed YOLO timeout issues** — Persistent yolo_service.py on port 7779
- **Fixed Webcam OpenCV backend** — Proper cv2.VideoCapture(0) initialization
- System: 11 services, 35 agents, 66+ MCP tools

### v8.2.0 (2026-04-14) - Bugfix Release
- Fixed swarm_scheduler.js AGENTS reference bug
- Fixed Bridge health port (7779 → 8779)
- Added missing bunny/raven persona files
- System: 8 services, 35 agents, 66+ MCP tools

### v8.1.1 (2026-04-12) - Bugfix Release
- Fixed EventBus health endpoint crash
- Fixed StateStore health endpoint crash
- Fixed StateStore changeLog trim
- System: 8 services, 28 agents, 65+ MCP tools

### v8.1 (2026-04-10) - Unified Orchestration
- Added Orchestrator (7784) for central command flow
- EventBus (7782) + StateStore (7783) as core infrastructure
- Agent Tower (7790) for 28-agent management
- Voice Bridge (7779) for WebSocket cloud connection

---

## Built With

Created by **Eddie Cannon** ([@weemadscotsman](https://github.com/weemadscotsman)) — Edinburgh, Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿

- **Pixel Dynasty** — Gaming Archive & Collab Hub
- **NDK Threads** — [ndkthreads.com](https://ndkthreads.com)
- **PixelBits420** — Fair-launch cryptocurrency

## License

MIT
