# GOOP-SIGIL Architecture Exorcism Plan
**Project:** weemadscotsman/purpclaw (master)
**Date:** 2026-05-29
**Score:** 0/100
**Files Scanned:** 199 | **Lines of Code:** 71,846

---

## Confession Summary

| Sins | Count |
|------|-------|
| Circular dependencies (prayer wheels) | 1 |
| Tangled logic files (spaghetti labyrinths) | 64 |
| Dead code files (sleeping, not dead) | 125 |
| Files missing type hints (unbound entities) | 2 |

**Penance:** Break circular imports by extracting shared event buses.
**Blessing:** _May your imports be direct and your event loops shallow. GOOP._
**Absolution:** Pending (Exorcism Required)

---

## Proposed Directory Structure

```
.
├── apps/
│   ├── cli/                      # Command-Line Interface (formerly bin/purpclaw, purpclaw_cli)
│   │   ├── commands/             # Individual CLI commands (start, status, run, config, memory, rollback, jobs, pool)
│   │   ├── services/             # CLI-specific utilities/helpers
│   │   └── utils/                # Common CLI parsing, output, etc.
│   ├── studio/                   # Higgsfield AI Studio UI
│   │   ├── components/           # Broken down (ImageStudio -> ImageUpload, ImagePreview, etc.)
│   │   ├── hooks/                # Studio-specific React hooks
│   │   ├── lib/                  # Studio-specific utilities
│   │   └── pages/                # Top-level studio pages
│   └── web/                      # Main Web Application UI
│       ├── components/           # Broken down (AgentTower -> AgentCard, AgentStatusDisplay)
│       ├── hooks/                # Web app-specific React hooks
│       ├── lib/                  # Web app-specific utilities
│       └── pages/                # Top-level web pages
├── core/
│   ├── agent_management/         # Agents, orchestration, scheduling
│   │   ├── models/               # Data models
│   │   ├── orchestrator/         # task_executor.js, workflow_handler.js
│   │   ├── scheduler/            # swarm_scheduler -> scheduler.js
│   │   └── tower/                # agent_lifecycle, sse_server
│   ├── api_gateway/              # Central API handling
│   │   ├── routes/               # API endpoint definitions
│   │   └── services/            # tool_runner.js, websocket_manager.js, api_client.js
│   ├── infrastructure/           # Boot and process management
│   │   ├── boot/                 # Startup/shutdown logic
│   │   └── process_utils/        # Process/port utilities
│   ├── messaging/               # Unified Event Bus
│   │   ├── event_bus/            # Event publishing/subscribing
│   │   └── context_bus/          # Context locking and sharing
│   └── state_management/         # Unified State
├── services/                     # Standalone backend services
│   ├── ai_interaction/          # AI client, reasoning
│   │   ├── kimi_client/         #
│   │   ├── digital_shaman/       # AI-driven decisions
│   │   └── reasoning_engines/   # Modal logic, neuro-symbolic bridges
│   ├── browser_automation/       # Playwright, Puppeteer, voice commands
│   │   ├── playwright/
│   │   │   ├── launcher.js      # Browser launch (from playwright_compat)
│   │   │   ├── page_actions.js  # Navigate, fill, click
│   │   │   └── utils.js        # Shared config/helpers
│   │   ├── puppeteer/
│   │   └── voice_commands/
│   ├── hardware_bridges/         # Ball, LCD, Turing Face, Xiaozhi
│   │   ├── ball_rig/
│   │   ├── lcd/
│   │   ├── turing_face/
│   │   └── xiaozhi/
│   ├── monitoring_auditing/     # Health, security, performance
│   │   ├── gatekeeper/
│   │   ├── spaghetti_audit/
│   │   ├── diagnostics/
│   │   └── vision/
│   ├── memory_persistence/      # Memory matrix, snapshots
│   │   ├── matrix/
│   │   └── snapshot/
│   ├── mood_engine/
│   ├── resource_pool/
│   ├── voice_processing/
│   │   ├── coordinator/
│   │   ├── bridge/
│   │   └── audio_analysis/
│   └── crossbar/
├── skills/                       # Modular agent capabilities
│   ├── common/                  # Base classes, shared interfaces
│   ├── axolotl/ ... guardian/    # All individual skill units
│   └── guardian/
│       ├── scanner/             # secret_scanner, dependency_auditor, vulnerability_scanner
│       └── voice_handler/
├── shared/                       # Global utilities, types, constants
│   ├── config/
│   ├── constants/
│   ├── errors/
│   ├── types/
│   └── utils/
└── arch_archive/                 # Dead/deprecated code (pre-deletion staging)
```

---

## Anti-Patterns and Resolutions

### 1. Circular Dependency: `playwright_compatibility -> playwright_compatibility`

**Anti-pattern:** A module directly importing itself. Indicates a monolithic file with multiple intertwined responsibilities.

**Resolution:** Decompose into three unidirectional modules:
- `services/browser_automation/playwright/launcher.js` — browser launch logic
- `services/browser_automation/playwright/page_actions.js` — navigate_page, fill_forms, etc.
- `services/browser_automation/playwright/utils.js` — shared config/helpers

Breaks the self-referential cycle. Each module depends only on shared/utils, never on itself.

---

### 2. God Objects (64 tangled files, depths to 15, 220 complex functions)

Key examples: `agent_tower`, `orchestrator`, `unified_api`, `bin/purpclaw`, `boot`, `lib/puppeteer`, `skills/guardian/security_scanner`, and Open-Higgsfield studio components.

**Resolutions:**

#### `core/agent_management/`
- `agent_tower` → `tower/manager.js` (lifecycle) + `messaging/event_bus/sse_server.js` (SSE logic)
- `orchestrator` → `orchestrator/task_executor.js` + `orchestrator/workflow_handler.js` + delegates to `api_gateway/services/api_client.js`
- `swarm_scheduler` → `scheduler/scheduler.js`

#### `core/api_gateway/`
- `unified_api` → `routes/` (endpoints) + `services/tool_runner.js` (runTool) + `services/websocket_manager.js` (connectWS)

#### `apps/cli/`
- `bin/purpclaw`, `purpclaw_cli` → `commands/` (start, status, run, config, memory, rollback, jobs, pool) + `utils/` (common CLI utilities)

#### `services/browser_automation/puppeteer/`
- `lib/puppeteer` → `puppeteer_automation.js` with internal refactor: state machines, command patterns, single-purpose functions

#### `skills/guardian/`
- `security_scanner` → `guardian/scanner/secret_scanner.js` + `guardian/scanner/dependency_auditor.js` + `guardian/scanner/vulnerability_scanner.js`

#### UI Components (`apps/studio/` and `apps/web/`)
- `CinemaStudio`, `ImageStudio`, `VideoStudio` → `ImageUpload`, `ImagePreview`, etc.
- `AgentTower` → `AgentCard`, `AgentStatusDisplay`
- Presentation logic separated from data fetching
- Custom hooks (`useAgentEvents`) → `apps/web/hooks/` and simplified

---

## Phase Order

**Phase 1 — Break the Prayer Wheel**
- Fix the single circular import first
- `playwright_compatibility` self-reference
- This is the scar tissue that blocks everything else

**Phase 2 — Isolate the God Objects**
- `agent_tower` decomposition
- `orchestrator` decomposition
- `unified_api` decomposition

**Phase 3 — CLI and Boot Sanity**
- `bin/purpclaw` breakdown
- `boot` cleanup

**Phase 4 — Service Layer**
- Browser automation, voice processing, hardware bridges

**Phase 5 — UI Components**
- Studio and web app decomposition

**Phase 6 — Dead Code Purge**
- 125 sleeping files → `arch_archive/` → review → delete

**Phase 7 — Shared Layer**
- Types, constants, errors, utils extraction

---

## What NOT To Do

- Do not refactor blind — run the confession tool again after each phase to confirm score improving
- Do not delete dead files until Phase 6 — they may be import dependencies for live code
- Do not add new islands to Pulse Island World during exorcism — context switching kills momentum
- Do not touch the live PURPCLAW harness while exorcising it — use the confession tool as the sensor, not your gut
