> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# PURPCLAW Surface Parity Core — Implementation Spec
**Status: READY TO BUILD**
**Generated: 2026-07-01**
**Eddie Cannon / weemadscotsman**

---

## PART 1 — WHAT WE'RE BUILDING

### Problem Statement
PURPCLAW has multiple surfaces (CLI, TUI Cockpit, TUI Ask, WebUI) that do NOT share the same session/work engine. A session created in one surface is invisible to the others. This is the classic "software pasta" goblin — multiple surfaces doing slightly different things instead of one engine with multiple skins.

### The Rule
**One PURPCLAW core engine. Many skins. Same job everywhere.**

Every surface must be able to:
1. Create/open a session
2. Resume a session
3. Show session history
4. Send a chat/work message
5. Stream model output
6. Select provider/model
7. Select agent/module/tool
8. Run a task/job
9. View jobs/status/logs
10. View memory/context
11. Attach/reference files (where surface supports it)
12. Export/save output
13. Show diagnostics/provider status

---

## PART 2 — EXISTING CODEBASE ASSESSMENT

### What's Already Good

**Session Storage (lib/session-store.js)**
- `createSession(title, provider, model)` → writes `~/.purpclaw/sessions/<id>.json`
- `saveSession(id, messages, opts)` → persists full conversation
- `loadSession(id)` → reads session file
- `listSessions(limit)` → returns index sorted by updatedAt
- `deleteSession(id)` → archives + removes
- `renameSession(id, newTitle)`
- Storage: `~/.purpclaw/sessions/_index.json` + per-session JSON files

**Spine Session Store (lib/spine/session-store.js)**
- `appendTurn(sessionId, role, content)` → appends a turn to session
- `getHistory(sessionId)` → returns conversation history
- Separate module with overlapping responsibility

**Agent Loop (lib/agent-loop.js)**
- `runAgent({prompt, history, model, provider, opts})` → async generator
- Events: `token`, `turn`, `tool-call`, `tool-result`, `done`, `error`
- This is the core execution engine

**Model Router (lib/model-router.js)**
- Already has the right architecture: MiniMax M3 as primary brain, NIM lanes for workers
- Lanes: CODE, REASON, REVIEW, LONGCTX, SWARM, FLASH
- Used by both chat surface and swarm/tower

**Surface Capabilities (lib/surface-capabilities.js)**
- 21 capabilities defined with CLI/TUI/Web mappings
- Has parity validation logic
- This is the SPEC, needs enforcement

**TUI Ask (scripts/tui-ask.js)**
- Full ANSI TUI with chat + status panels
- Uses `runAgent()` directly with in-memory history
- Calls `lib/commands/ask` for slash commands
- Status polling every 5 seconds
- This is the BEST TUI — needs to be wired to shared session engine

**Unified API (unified_api.js)**
- Has `/api/sessions` (GET list, POST create, GET id, DELETE id)
- Has `/api/chat` with session support
- Uses `lib/session-store.js` for session CRUD

**CLI Launcher (bin/purpclaw.js, 5503 lines)**
- Has `purpclaw ask`, `purpclaw tui`, `purpclaw tui ask`, `purpclaw setup`, `purpclaw doctor`
- Session flags: `--session <id>`, `--fresh`, `--status`
- No standalone `purpclaw session` subcommands

### What Needs To Change

**GAP 1: Session Store Split**
PROBLEM: `lib/session-store.js` (disk persistence) and `lib/spine/session-store.js` (append/history) are two different modules. unified_api.js uses spine session-store. tui-ask.js uses agent-loop with in-memory history. WebUI uses unified_api.js session endpoints.

RESULT: Sessions created in TUI Ask are NOT visible to WebUI or CLI `purpclaw ask --session`.

FIX: Consolidate. The disk session-store should be the SOLE session engine. Spine session-store should delegate to it. All surfaces append to and read from the same store.

**GAP 2: TUI Cockpit Is Decorative**
PROBLEM: `scripts/tui.js` (the "TUI cockpit") shows live status panels but has NO chat input, no session selector, no way to do actual work. It's a status dashboard, not a work surface.

FIX: Add a persistent chat/work input panel to the TUI cockpit, accessible from every tab. Or better — merge tui.js and tui-ask.js so the cockpit IS the work surface with tabs for Overview/Agents/Jobs/Memory/Pool/Logs alongside the chat panel.

**GAP 3: No CLI Session Subcommands**
PROBLEM: `purpclaw ask` has session flags but there's no `purpclaw session list`, `purpclaw session open`, `purpclaw session new`.

FIX: Add `purpclaw session` as a command group with list/open/new/delete subcommands.

**GAP 4: No Unified Work/Session Engine**
PROBLEM: There's no formal "this is the session engine" module that all surfaces call. Each surface reaches into different internal modules.

FIX: Create `lib/core/work-engine.js` that exposes a clean API. All surfaces call this.

**GAP 5: TUI Ask Uses In-Memory History Only**
PROBLEM: tui-ask.js keeps `state.history` and `state.messages` in RAM. If you close the TUI and reopen it, session is gone. It doesn't call `session-store.js`.

FIX: tui-ask.js should call `session-store.js` to persist and resume sessions.

**GAP 6: App/Cockpit Is A Stub**
PROBLEM: `app/cockpit/page.tsx` just does `redirect('/mission')`. The cockpit isn't a real page.

FIX: Either build it as a real TUI-like cockpit page, or acknowledge /mission is the real cockpit and remove the redirect.

**GAP 7: Provider Status Wording**
PROBLEM: Setup wizard says "DeepSeek ready" when a key is found, even if auth test fails with 401. No distinction between configured vs verified vs auth_failed.

FIX: Provider status needs explicit states: `missing`, `configured`, `verified`, `auth_failed`, `local_unavailable`, `available`.

**GAP 8: No Surface Parity Test**
PROBLEM: `surface-capabilities.js` has validation logic but no test verifies that CLI, TUI, and WebUI all expose the same capabilities.

FIX: Add `tests/surface-parity.spec.js` or equivalent.

---

## PART 3 — ARCHITECTURE

### New File Structure

```
lib/
  core/
    work-engine.js      # NEW: unified session + work engine
    surface-contract.js # NEW: capability validation
    provider-status.js  # NEW: provider state machine

lib/spine/
  session-store.js      # MODIFY: delegate to lib/session-store.js

scripts/
  tui-ask.js            # MODIFY: use work-engine.js for session persistence
  tui.js                # MODIFY: merge with tui-ask or add chat panel

bin/
  purpclaw.js           # MODIFY: add session subcommands

unified_api.js          # MODIFY: use work-engine.js

tests/
  surface-parity.spec.js # NEW: parity tests

docs/
  SURFACE_PARITY.md      # NEW: documentation
  PROVIDER_ARCHITECTURE.md # NEW: provider role docs
```

### Work Engine API (lib/core/work-engine.js)

```javascript
// Session management
work.createSession(opts)        // → session object
work.loadSession(id)            // → session object  
work.saveSession(id, messages)  // → void
work.listSessions(limit)        // → [{id, title, provider, model, updatedAt}]
work.deleteSession(id)          // → {deleted, archived}

// Chat execution
work.chat({sessionId, prompt, provider, model, opts})  // → async generator
// Events: {type: 'token', content}, {type: 'turn', turn, maxTurns},
//         {type: 'tool-call', tool, args}, {type: 'tool-result', ok, content},
//         {type: 'done', turns, tokens, toolCalls}, {type: 'error', error}

// History
work.getHistory(sessionId)      // → [{role, content, timestamp}]
work.appendTurn(sessionId, role, content) // → void

// Provider routing
work.getRouter()                // → model-router.js exports
work.getProviders()             // → provider status map
work.verifyProvider(name)      // → {configured, verified, auth_failed, ...}
```

### Surface Contract (lib/core/surface-contract.js)

```javascript
// Required capabilities per surface type
const REQUIRED = {
  chat: ['createSession', 'resumeSession', 'sendMessage', 'streamOutput',
         'selectProvider', 'selectModel', 'viewJobs', 'viewLogs', 'export'],
  tui_cockpit: ['chat', 'viewStatus', 'viewAgents', 'viewJobs', 'viewMemory',
                'viewPool', 'viewLogs', 'sessionSelector'],
  tui_ask: ['chat', 'sessionResume', 'providerSelect', 'modelSelect', 'export'],
  web: ['chat', 'sessionManagement', 'providerSelect', 'agentSelect',
        'jobManagement', 'memoryAccess', 'logs', 'export', 'diagnostics'],
};

const MINIMAL = ['createSession', 'sendMessage', 'streamOutput', 'viewStatus'];
```

### Provider Status State Machine (lib/core/provider-status.js)

```javascript
const PROVIDER_STATES = {
  MISSING:       'missing',       // no key/config found
  CONFIGURED:    'configured',    // key exists
  VERIFIED:      'verified',      // test call passed
  AUTH_FAILED:   'auth_failed',   // key rejected (401/403)
  LOCAL_UNAVAIL: 'local_unavailable', // local service not running
  AVAILABLE:     'available',    // free/local option exists but unverified
};

function getProviderState(providerName, config) { /* ... */ }
```

---

## PART 4 — IMPLEMENTATION STEPS (In Priority Order)

### Step 1: Consolidate Session Stores
**Files:** `lib/spine/session-store.js`, `lib/session-store.js`
**Action:** Make spine/session-store.js delegate to lib/session-store.js. Keep the appendTurn/getHistory API but implement it by reading/writing to the disk store.

### Step 2: Build Work Engine
**Files:** `lib/core/work-engine.js` (NEW)
**Action:** Create `lib/core/work-engine.js` with the API described in Part 3. It should:
- Import and re-export session-store.js functions
- Wrap `agent-loop.js runAgent()` with session persistence
- Auto-save session after each assistant turn
- Support session history injection

### Step 3: Wire TUI Ask to Work Engine
**Files:** `scripts/tui-ask.js`
**Action:** Replace in-memory `state.history` and `state.messages` with work-engine calls. On startup, load or create session. On submit, use `work.chat()`. After done event, save session.

### Step 4: Upgrade TUI Cockpit with Chat Panel
**Files:** `scripts/tui.js`
**Action:** Add a persistent chat input panel (bottom 30% of screen) that's always visible regardless of which tab is selected. Add session selector at top. The tabs (Overview, Agents, Jobs, Memory, Pool, Logs) become side panels or secondary views, not the main content.

Keyboard shortcuts per Eddie's spec:
- `n` = new session
- `o` = open session
- `/` = focus chat input
- `a` = select agent
- `m` = select model/provider
- `j` = jobs
- `x` = export session
- `r` = refresh
- `q` = quit

### Step 5: Add CLI Session Subcommands
**Files:** `bin/purpclaw.js`
**Action:** Add session command group:
```
purpclaw session list              — list all sessions
purpclaw session open <id>         — resume a session
purpclaw session new               — create new session
purpclaw session delete <id>       — delete a session
purpclaw session export <id>        — export session as JSON/chatml
```

### Step 6: Provider Status State Machine
**Files:** `lib/core/provider-status.js` (NEW), `lib/commands/setup.js` (MODIFY)
**Action:** Create the provider status state machine. Update setup wizard to use explicit states instead of "ready". Provider status display should show: MiniMax native → verified (primary chat/controller), NVIDIA NIM → verified (worker gateway), DeepSeek via NIM → available (backend/review worker), etc.

### Step 7: Wire Unified API to Work Engine
**Files:** `unified_api.js`
**Action:** Replace direct session-store.js calls with work-engine.js calls. The `/api/sessions/*` and `/api/chat` routes should use the shared engine.

### Step 8: Surface Parity Test
**Files:** `tests/surface-parity.spec.js` (NEW)
**Action:** Test:
1. Create session via CLI `purpclaw session new`
2. Verify it appears in WebUI via `GET /api/sessions`
3. Send message via TUI Ask
4. Verify session history visible via `GET /api/sessions/:id`
5. Verify provider status distinguishes configured from verified
6. Verify jobs created in one surface appear in others

### Step 9: Update Docs
**Files:** `docs/SURFACE_PARITY.md`, `docs/PROVIDER_ARCHITECTURE.md` (NEW)

---

## PART 5 — PROVIDER ARCHITECTURE (NVIDIA NIM Worker Lanes)

### Current State (model-router.js)
Already has the right architecture:
- `CODE` → `nvidia` + `minimaxai/minimax-m3`
- `REASON` → `nvidia` + `deepseek-ai/deepseek-v4-pro`
- `REVIEW` → `nvidia` + `z-ai/glm-5.1`
- `LONGCTX` → `nvidia` + `moonshotai/kimi-k2.6`
- `SWARM` → `nvidia` + `moonshotai/kimi-k2.6`
- `FLASH` → `nvidia` + `deepseek-ai/deepseek-v4-flash`

### What Needs Formalization

**Provider Role Schema** — formalize these roles:
- `primary_chat` — MiniMax M3 native (the commander brain)
- `planner` — task decomposition
- `delegator` — routes jobs to workers
- `tool_caller` — executes function calls
- `final_synthesizer` — composes final response
- `backend_worker` — DeepSeek V4 Pro via NIM
- `frontend_worker` — MiniMax M3 via NIM
- `fast_worker` — Flash via NIM
- `swarm_worker` — Kimi K2.6 via NIM
- `review_worker` — DeepSeek/GLM via NIM

**Config Schema** (purpclaw.config or .env):
```json
{
  "primaryChatProvider": "minimax-native",
  "primaryChatModel": "minimax-m3",
  "workerGatewayProvider": "nvidia-nim",
  "workerLanes": {
    "backend": { "provider": "nvidia-nim", "model": "deepseek-ai/deepseek-v4-pro" },
    "frontend": { "provider": "nvidia-nim", "model": "minimaxai/minimax-m3" },
    "fast": { "provider": "nvidia-nim", "model": "deepseek-ai/deepseek-v4-flash" },
    "swarm": { "provider": "nvidia-nim", "model": "moonshotai/kimi-k2.6" },
    "review": { "provider": "nvidia-nim", "model": "z-ai/glm-5.1" }
  }
}
```

**Flow:**
```
User → MiniMax M3 native (primary chat/controller)
     → Task plan/job tickets
     → NVIDIA NIM worker model by role
     → Worker result
     → MiniMax M3 synthesis
     → User response
```

**Fallback Rules:**
- If worker lane unavailable → route to MiniMax native
- If controller unavailable → fail clearly (do NOT pretend swarm can run)
- If NIM gateway unavailable → disable worker lanes, keep primary chat working if MiniMax native verified

---

## PART 6 — FILES TO CREATE / MODIFY

### Create (NEW files)
- `lib/core/work-engine.js`
- `lib/core/surface-contract.js`
- `lib/core/provider-status.js`
- `tests/surface-parity.spec.js`
- `docs/SURFACE_PARITY.md`
- `docs/PROVIDER_ARCHITECTURE.md`
- `docs/DELEGATION_ROUTING.md`

### Modify (existing files)
- `lib/spine/session-store.js` — delegate to lib/session-store.js
- `scripts/tui-ask.js` — use work-engine.js
- `scripts/tui.js` — add persistent chat panel
- `bin/purpclaw.js` — add session subcommands, wire to work-engine
- `unified_api.js` — use work-engine.js for session routes
- `lib/commands/setup.js` — provider status states
- `lib/surface-capabilities.js` — can stay as-is (it's the spec)

---

## PART 7 — VERIFICATION COMMANDS

After building, these must all work:

```bash
# Session engine
purpclaw session list
purpclaw session new
purpclaw session open <id>
purpclaw ask --session <id> "hello"

# TUI surfaces
purpclaw tui        # cockpit with chat panel
purpclaw tui ask    # full-screen chat

# Provider status
purpclaw providers status
purpclaw providers roles

# Route test
purpclaw route test "build a React landing page"
purpclaw route test --role backend_worker "inspect server API"

# Surface parity
npm run test -- surface-parity

# Web session visibility
curl http://localhost:7780/api/sessions  # should show CLI/TUI sessions
```

---

## PART 8 — WHAT NOT TO DO

- Do NOT remove existing CLI menu
- Do NOT remove the TUI cockpit (upgrade it)
- Do NOT make WebUI the only real interface
- Do NOT duplicate session logic per surface
- Do NOT fake parity by stubbing methods
- Do NOT flatten provider architecture into "pick a default"
- Do NOT rebuild the model-router — it already has the right lanes
- Do NOT touch `MissionControl.tsx` or `/mission` page (it's working)
- Do NOT touch `app/ui/` (Agent Tower static app)
- Do NOT run `npm run build` while Next.js dev is running
- Do NOT modify `ecosystem.config.js` service definitions

---

## PART 9 — MINIMAX M3 NATIVE — PRIMARY REQUIREMENT

MiniMax M3 native API (`https://api.minimax.io/v1`) MUST be the primary chat controller. This is non-negotiable.

**Current config:**
```
LLM_PROVIDER=minimax
LLM_MODEL=MiniMax-M2.7
LLM_BASE_URL=https://api.minimax.io/v1
PURPCLAW_ALLOW_MINIMAX_CHAT_BACKEND=1
```

**Keep this working.** NVIDIA NIM is for worker lanes ONLY. Do not route primary chat to NIM unless explicitly configured.

**Provider status display must show:**
```
MiniMax native     verified     primary chat + delegation controller
NVIDIA NIM         verified     worker model gateway
DeepSeek via NIM   available    backend/review worker
MiniMax via NIM    available    frontend/creative worker  
Kimi via NIM       available    swarm worker
Flash via NIM      available    fast worker
```

NOT:
```
Pick DeepSeek as default
```
