# PURPCLAW Stack Audit - v8.2.0 (2026-04-14)

## EXECUTIVE SUMMARY

PURPCLAW is a Xiaozhi voice ball → cloud → 35-agent swarm PC control system with SAMANTHA personality layer.
Core is operational. 66+ tools integrated. Orchestrator v2.0 provides centralized command flow.
SAMANTHA Upgrade Roadmap v8.1.1 in progress.

---

## ARCHITECTURE (CURRENT)

```
[BALL] → [Xiaozhi Cloud] → [unified_api.js:7780] → [SAMANTHA] → [66 MCP Tools]
                              ↓
                    [ORCHESTRATOR:7784]
                    /    |    \      \
                   /     |     \      \
         EventBus  State  Tower  Voice  Bridge
              \      |    /        |
               [EVENTBUS:7782] ←→ [Agent Tower:7790]
                                       ↓
                               [35 Agent Divisions]
                                       ↓
                      [companion-chorus: 18 terminal sprites]

[DASHBOARD] → [Next.js:3000] → [Open-Higgsfield-AI integration]
```

### Orchestrator v2.0 Features:
- Priority queue with urgent bypass
- Workflow pipeline (parse → route → validate → execute → respond)
- Agent pool with load balancing
- Self-healing with automatic retry (exponential backoff)
- SSE streaming for real-time responses
- Swarm memory for context persistence
- EventBus integration via SSE subscriptions

### Active Services (PM2 ecosystem.config.js):
| Service | Port | Status | Version |
|---------|------|--------|---------|
| purpclaw-eventbus | 7782 | online | v1.0 |
| purpclaw-state | 7783 | online | v2.0 (SSE subscriptions) |
| purpclaw-orchestrator | 7784 | online | v2.0 |
| purpclaw-api | 7780 | online | (66 tools) |
| purpclaw-tower | 7790 | online | v1.0 |
| purpclaw-voice | 7781 | online | |
| purpclaw-bridge | 7779/8779 | online | |
| purpclaw-nextjs | 3000 | online | |
| purpclaw-gatekeeper | 7791 | online | v1.0 |

---

## PROJECT COMPONENTS (NOT DELETED - INTEGRATION PENDING)

### companion-chorus/ (Phase 1 - Building)
- 18 terminal companion sprites (duck, ghost, dragon, octopus, robot, mushroom, chonk, owl, cactus, penguin, turtle, goose, rabbit, cat, axolotl, capybara, blob, snail)
- Each in own terminal window, watching code, commenting
- Integration: Agent Tower → divisions → companion chorus
- Status: Phase 1 MVP (3 companions: Duck, Ghost, Dragon)
- Stack: Node.js + Blessed + sessions_spawn
- Entry: `companion-chorus/main.js`

### Open-Higgsfield-AI-main/ (Phase 1 - Building)
- Video/Image/Cinema studio AI tools
- Integration: Next.js dashboard → Open-Higgsfield-AI
- Status: Needs integration once PURPCLAW core is fully operational
- Stack: Next.js + Vite + Tailwind + Electron

---

## INTEGRATION STATUS

### Phase 1 - MVP (DONE):
- [x] Xiaozhi Ball → Cloud → unified_api.js
- [x] 66 MCP tools integrated
- [x] Agent Tower with divisions
- [x] PM2 unified boot (START.bat/STOP.bat)
- [x] WebSocket unified (single connection)

### Phase 2 - Integration (PENDING):
- [ ] companion-chorus → Agent Tower divisions
- [ ] companion-chorus → ContextBus shared.json
- [ ] Open-Higgsfield-AI → Next.js dashboard
- [ ] Open-Higgsfield-AI → Video/Image generation tools

---

## DEAD FILES (DELETE)

### Obsolete Launchers (use START.bat/STOP.bat instead):
- `BOOT.bat` - deprecated
- `LAUNCH_CLEAN.bat` - deprecated
- `LAUNCH_EVERYTHING.bat` - deprecated
- `LAUNCH_PURPCLAW.bat` - deprecated
- `LAUNCH_GOOP_MASTER.bat` - deprecated
- `run_smoke_test.bat` - redundant (use `node smoke_test.js`)
- `START_RIG_LCD_TERMINAL.bat` - unused
- `RIG_TERMINAL.bat` - unused

### Obsolete Node Scripts:
- `boot.js` - deprecated (PM2 manages services now)
- `launch_clean.js` - deprecated
- `launch_detached.js` - deprecated
- `start_purpclaw.js` - deprecated
- `start_xiaozhi_bridge.bat` - use START.bat
- `start_bridge.ps1` - use START.bat

### Single-use Scripts:
- `replace.js` - one-time OpenClaw→PURPCLAW rename
- `visualizer_server.js` - unclear purpose
- `crossbar_integration.js` - unused
- `gen_api.js` - unclear purpose

### External Dependencies (not project code):
- `tesseract-ocr-tesseract-9c516f4/` - Tesseract OCR library, not project

### Worktrees (backup, not active):
- `.claude/worktrees/agent-a8e943ec/` - old agent worktree

---

## TECHNICAL DEBT

### Fixed (this session):
1. ✅ `substr()` → `substring()` in 4 files
2. ✅ `rmdirSync()` → `rmSync()` in unified_api.js
3. ✅ Port 7781 conflict (Guardian→7784, Voice→7781)
4. ✅ Redundant WebSocket connections (merged into single connectWS())
5. ✅ Webcam timeouts (buffer flush + 60s timeout)
6. ✅ Added 6 missing tools (get_weather, search_music, play_music, search_knowledge, search_memory)
7. ✅ **Orchestrator EventBus SSE subscription** - Fixed broken fetch-based subscription, now uses EventSource for proper SSE
8. ✅ **Orchestrator in PM2** - Added to ecosystem.config.js for proper service management
9. ✅ **Agent Scoring System** - `agent_score.js` tracks agent performance (speed, success rate, bug rate)
10. ✅ **Gatekeeper Agent** - `gatekeeper.js` validates changes before merge (security, performance, correctness)
11. ✅ **Orchestrator → Agent Score Integration** - Smart routing based on agent track record

### Remaining Issues:

1. **agent_tower.js** - Division checks mostly case-insensitive via `.toLowerCase()` at line 115, 248

2. **companion_swarm.js:217** - Mock agent spawning (uses echo instead of actual spawning)

3. **lib/xiaozhi_bridge.ts** - Duplicate implementation (not used by main system)

4. **Skills directory** - Agent skills are just markdown files (AGENT.md, SOUL.md, etc.)
   - No actual skill implementations
   - Real implementations in unified_api.js TOOLS array

5. **Digital Shaman layer** - Disabled (needs KIMI_API_KEY)

---

## DEBUG STATUS

### Working Tools (39):
- get_device_status, audio_speaker set_volume, screen set_brightness, screen set_theme
- purpclaw start/status/logs/stop, git command, http request, clipboard read
- execute_command, open_application, speak
- memory remember/recall/forget/list, notification, task schedule/list
- webcam_look, file copy/move/delete, dir create, process_list
- window_list, window_focus, window_close
- active_window, system_status, system_paths, disk_info, network_info
- volume_control, load_toolset

### New Tools Added (this session):
- get_weather, search_music, play_music, search_knowledge, search_memory

### Timeouts Fixed:
- webcam_detect - now 60s timeout, buffer flush
- webcam_read - now 60s timeout, buffer flush

### Untested (40+ tools):
- screen_capture, screen_ocr, screen_find_object, screen_find_template, screen_info
- mouse_click, mouse_scroll, keyboard_type, find_and_click
- file_read, file_write, file_list, file_search
- browser_* (12 tools)
- zip_create, zip_extract, install_package
- process_kill

---

## HIDDEN ASSUMPTIONS

1. **Python 3.11** - All webcam/OCR tools call `py -3.11`
2. **Tesseract path** - `C:\Program Files\Tesseract-OCR\tesseract.exe`
3. **Kokoro TTS** - `C:\Users\Admin\.openclaw\kokoro_send.bat`
4. **Node.js v18+** - Uses fetch, WebSocket, fs promises
5. **Windows only** - PowerShell commands, backslash paths

---

## EVALUATION SYSTEM (v1.0)

*"You built a society. You need a machine." - Compound Monster*

The system now has **memory of which agents are good** and a **gatekeeper that blocks bad changes**.

### agent_score.js - Agent Performance Tracking
**File:** `agent_score.js`
**Port:** N/A (module, not service)
**Purpose:** Track which agents are fast, which cause bugs, which excel at certain task types

**Features:**
- Per-agent task counts, success rates, average durations
- Per-intent agent rankings (who's best at "fix"? "build"?)
- Bug tracking (agents that often produce buggy code)
- Persistent storage to `agent_score.json`

**API:**
```javascript
agentScore.recordTask(agentName, intent, success, duration, {bugIntroduced: bool})
agentScore.getAgentScore(agentName)  // 0-100
agentScore.getAgentsForIntent(intent)  // ranked list
agentScore.suggestAgent(intent)  // best agent for intent
agentScore.getSafestAgent(intent)  // lowest bug rate
```

**Integration:** Orchestrator v2.0 calls `agentScore.recordTask()` on task completion/failure

---

### gatekeeper.js - Pre-Merge Validation
**File:** `gatekeeper.js`
**Port:** 7791
**Purpose:** Intercept changes BEFORE they merge/deploy and validate

**Checks:**
| Category | Count | Examples |
|----------|-------|----------|
| Security | 5 | SQL injection, command injection, hardcoded secrets, XSS, auth bypass |
| Performance | 4 | Sync file I/O, nested loops, memory leaks, missing cleanup |
| Correctness | 4 | Try without catch, swallowed errors, console logs, TODOs |

**Risk Levels:**
- **CRITICAL** - Blocks merge, requires security review
- **HIGH** - Requires experienced reviewer
- **MEDIUM** - Standard review
- **LOW** - Minor issues

**API:**
```
GET  /health              - Status
GET  /api/status          - Gatekeeper stats
POST /api/validate        - Validate a change
POST /api/validate-file   - Validate single file
```

**Reviewer Assignment:** Based on issue type and agent scores
- Security issues → ghost, owl, snake (or top scorers for "security")
- Performance issues → cactus, chonk (or top scorers for "optimize")
- Correctness issues → turtle, rabbit

---

### PM2 Service Added:
```javascript
{
  name: 'purpclaw-gatekeeper',
  script: './gatekeeper.js',
  args: '--server',
  port: 7791
}
```

### compound_monster feedback addressed:
1. ✅ **Evaluation layer** - agent_score tracks performance
2. ✅ **Scoring memory** - agent_score.json persists across restarts
3. ✅ **Gatekeeper** - Validates changes before merge/deploy
4. ✅ **Strategic orchestrator** - suggestAgent() picks best agent based on history
5. ✅ **Context-aware retries** - Failed agent is tracked; retry uses a different agent based on score rankings
6. ✅ **Locked interfaces** - `locked_interfaces.js` protects critical tools, files, and enforces tier-based access

---

### locked_interfaces.js - Tool & File Protection
**File:** `locked_interfaces.js`
**Purpose:** Protect critical tools and files from unauthorized agent access

**Tier System:**
| Tier | Name | Agents |
|------|------|--------|
| 3 | Strategic | dragon, wolf, snake, guardian, scientist |
| 2 | Operations | owl, ghost, spider, octopus, axolotl, penguin, mantis, shark, gorilla, parrot, hawk, fox, karen, lemur |
| 1 | Foundation | robot, bee, turtle, chonk, cactus, rabbit, duck, goose, bunny, crow, panda |

**Tiered Tools (require minimum tier):**
- **Tier 3:** process_kill, git_push, git_force_push, execute_command, file_delete, install_package, system_reboot
- **Tier 2:** file_write, clipboard_write, git_commit, window_close, process_list

**Protected File Patterns:**
- `C:\Windows\*`, `C:\Program Files\*`, `node_modules\`
- `.env`, `ecosystem.config.js`, core `.js` files
- `.git\config`, `.git\hooks`

**Rate Limiting:**
- execute_command: 10/min
- process_kill: 5/min
- file_delete: 10/min
- git_push: 3/min

**API:**
```javascript
checkAccess(agentName, toolName, args)  // Returns { allowed, reason, escalate }
canEscalate(agentName, requiredTier)    // Check if agent can request elevation
isFileProtected(filePath)              // Check if file is protected
getAccessLog(filter)                   // Get audit log
getStats()                            // Get access statistics
```

**Port availability:** 7780,7781,7782,7783,7779,7790,7791,3000
**Xiaozhi token:** Hardcoded in ecosystem.config.js (not .env)
**PM2:** Uses PM2 for process management, not raw child_process

---

## FILES TO DELETE

```
DELETE THESE (deprecated/obsolete):
- BOOT.bat
- LAUNCH_CLEAN.bat
- LAUNCH_EVERYTHING.bat
- LAUNCH_PURPCLAW.bat
- LAUNCH_GOOP_MASTER.bat
- run_smoke_test.bat
- START_RIG_LCD_TERMINAL.bat
- RIG_TERMINAL.bat
- boot.js
- launch_clean.js
- launch_detached.js
- start_purpclaw.js
- start_xiaozhi_bridge.bat
- start_bridge.ps1
- replace.js
- visualizer_server.js
- crossbar_integration.js
- gen_api.js
- tesseract-ocr-tesseract-9c516f4/ (external dependency)

CAREFUL - These are PART OF PROJECT, DO NOT DELETE:
- companion-chorus/ (18 sprites for Agent Tower)
- Open-Higgsfield-AI-main/ (video/image studio for dashboard)
- .claude/worktrees/agent-a8e943ec/ (backup - keep but don't use)
```

---

## RECOMMENDATIONS

1. **Delete dead files** - Reduce confusion (see list above)
2. **Test remaining 40+ tools** - Especially browser_* tools
3. **Implement actual agent spawning** - companion_swarm.js is mocked
4. **Get Kimi API key** - Enable Digital Shaman layer
5. **Integrate companion-chorus** - Connect to Agent Tower divisions
6. **Integrate Open-Higgsfield-AI** - Connect to Next.js dashboard

---

## FIXES APPLIED (2026-04-12)

### Critical Crash Bugs Fixed:
1. **unified_eventbus.js:144** - Health endpoint referenced undefined variables → Fixed to use state.events.length, state.subscriptions.size, state.clientCount
2. **unified_state.js:198** - Health endpoint referenced undefined variables → Fixed to use process.memoryUsage() and Object.keys()
3. **unified_state.js:63** - ChangeLog trim was 500 instead of 1000 → Fixed

### Configuration Fixes:
4. **.env** - Updated XIAOZHI token (fresh iat: 1776010874, exp: 1807568474), added XIAOZHI_WS_URL
5. **ecosystem.config.js** - Updated fallback token with fresh credentials
6. **agent_tower.js:306** - forwardSpawnToApi path wrong (/api/tower-spawn → /api/tower/spawn)
7. **page.tsx** - Voice health port 8781→7881, Bridge health port fixed to 8779 (was 7779)
8. **AgentTower.tsx** - Bridge health port fixed to 8779 (was 7779)

### Documentation Updated:
- PURPCLAW_ARCHITECTURE.md → v8.1.1
- AGENT_DIRECTORY.md → v1.1
- README.md → v8.1.1
- ecosystem.config.js → token updated

### Bug Fixes Applied (2026-04-12 Session):
9. **swarm_scheduler.js** - Changed all companionSwarm.AGENTS references to use getAgentInfo() and agentExists() from Agent Tower registry (lines 39-44, 268, 311)
10. **page.tsx:17** - Bridge health port 7779→8779
11. **AgentTower.tsx:123** - Bridge health port 7779→8779
12. **skills/bunny/** - Added SOUL.md, SKILL.md, GOALS.md, PROTOCOLS.md (bunny persona complete)
13. **skills/raven/** - Added SOUL.md, SKILL.md, GOALS.md, PROTOCOLS.md (raven persona complete)

### Architecture (Current):
- 8 services: EventBus(7782), StateStore(7783), Orchestrator(7784), UnifiedApi(7780), AgentTower(7790), VoiceCoordinator(7781), VoiceBridge(7779), Next.js(3000)
- 35 agents across 9 divisions
- 66+ MCP tools

## NEW BUGS FOUND (2026-04-12)

### ~~Critical - Swarm Scheduler Broken~~ ✅ FIXED:
**swarm_scheduler.js** references `companionSwarm.AGENTS[key]` but companion_swarm.js does NOT export AGENTS object. Fixed by using Agent Tower registry with getAgentInfo() and agentExists() helper functions.

### ~~Medium - Bridge Health Port Wrong~~ ✅ FIXED:
**page.tsx & AgentTower.tsx** check Bridge health at port 7779 but health endpoint is at 8779. Fixed both files to use port 8779.

### ~~Low - Incomplete Agent Personas~~ ✅ FIXED:
- **bunny/** - Added SKILL.md, GOALS.md, PROTOCOLS.md, SOUL.md
- **raven/** - Added SKILL.md, GOALS.md, PROTOCOLS.md, SOUL.md

### Info - Agent Registry Mismatch:
Skills directories exist for agents NOT in agent_tower.registry: chart, innovator, jellyfish, kraken, moth, navigator, numbers (7 agents). Also, skills_registry.json shows 28 approved but agent_tower has 35 registered.

---

## CURRENT LAUNCH COMMAND

```bat
START.bat   (PM2 ecosystem.config.js - 7 services)
STOP.bat    (pm2 delete all)
```

## TO LAUNCH COMPANION CHORUS (separate):
```bat
cd companion-chorus
node main.js
```

---

## CURRENT PATH

```
[BALL] → [Xiaozhi Cloud] → unified_api.js:7780 (single WS)
                              ↓
                         66 MCP Tools
                              ↓
                         Agent Tower:7790
                              ↓
                    [35 Agent Divisions]
                              ↓
                   [companion-chorus sprites]
```

---

## BUG FIXES (v8.2.0 - 2026-04-14)

### file_read tool truncation issue
- **Problem**: `file_read` was truncating at 4000 chars via `ok()` function, causing SAMANTHA to cut off mid-read
- **Fix 1**: Increased `ok()` output limit from 4000 to 8000 chars
- **Fix 2**: Added explicit truncation at 8000 chars within file_read with `...(truncated at 8000 chars)` indicator
- **Fix 3**: Added proper argument type checking (`typeof args.path === 'string'`)

### Related tools fixed:
- `ok()` function now returns up to 8000 chars (was 4000)
- `screen_ocr` output now properly handled by `ok()`
- All file tools now use consistent truncation behavior