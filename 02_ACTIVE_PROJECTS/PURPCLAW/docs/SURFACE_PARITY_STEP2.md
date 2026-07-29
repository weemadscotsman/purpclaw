> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# PURPCLAW Surface Parity — Step 2: TUI Cockpit + Web Session Wiring
**Status: READY TO BUILD**
**Generated: 2026-07-01**

---

## Overview

After Step 1, we have:
- `lib/core/work-engine.js` — shared session + chat engine
- `lib/core/provider-status.js` — provider state machine
- `lib/spine/session-store.js` — delegates to main session-store
- `bin/purpclaw.js` — session subcommands added
- `scripts/tui-ask.js` — wired to work-engine

Step 2: Upgrade the TUI cockpit to be a real work surface, and wire WebUI to the same session engine.

---

## TASK G: Upgrade TUI Cockpit with Persistent Chat Panel

**File:** `scripts/tui.js`

### Current State
- 959 lines
- 7 tabs: OVERVIEW, ACTIONS, AGENTS, JOBS, MEMORY, POOL, LOGS
- No chat input, no session selector
- Only shows status — can't do real work

### Required Changes

**1. Add a persistent chat panel (bottom 30% of screen)**

The chat panel must always be visible regardless of which tab is active. Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  STATUS BAR: provider · model · session-id · services · tokens  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    MAIN PANEL (70%)                             │
│         (Overview / Actions / Agents / Jobs / etc.)             │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  CHAT PANEL (30%)                                               │
│  [message history]                                               │
│  ❯ [input]                                                     │
└──────────────────────────────────────────────────────────────────┘
│  HELP: n=new s=session o=open /=focus a=agent m=model q=quit  │
```

**2. Session state**

Load work-engine on startup. Track `currentSessionId`. Show in status bar. Persist to `~/.purpclaw/sessions/_current.json`.

**3. Chat panel key bindings**
- `Enter` = submit message
- `Esc` = clear current input
- `/` = focus chat input (from any tab)
- `s` = show session list, allow switching
- `n` = new session
- `o` = open session (select from list)
- `q` = quit

**4. Chat panel rendering**

Same rendering as tui-ask.js but in the bottom 30%:
```
[user messages in cyan]
[assistant tokens stream here]
[tool calls in magenta]
[done meta in dim]
```

**5. Status bar additions**

Show: `provider · model · session:[id] · [session title truncated]`

**6. Tab behavior**

When a tab is selected, the MAIN PANEL shows that tab's content. The CHAT PANEL remains visible and functional at the bottom. This is the key difference from tui-ask.js — the cockpit has ALL tabs PLUS chat, not just chat.

**7. Use work-engine**

```javascript
const work = require(path.join(PURP_DIR, 'lib', 'core', 'work-engine'));

// On submit:
for await (const ev of work.chat({
  sessionId: state.sessionId,
  prompt: text,
  provider: state.provider,
  model: state.model,
  opts: { maxTurns: 10 }
})) {
  // same event handling as tui-ask.js
  // render tokens to chat panel
  // on done: save session
}

// On startup:
// Load current session from ~/.purpclaw/sessions/_current.json
// If none: create new session via work.createSession()
// Show session title in status bar
```

**8. Backward compatibility**

Keep existing behavior when no session is loaded. The chat panel is an ADDITION to the status dashboard, not a replacement.

---

## TASK H: Wire WebUI to Work Engine Session APIs

**Files:** `app/mission/page.tsx` (or `app/api/`)

### Current State
- `/mission` is the main WebUI (MissionControl.tsx)
- `/api/sessions` endpoints exist in unified_api.js
- They use `lib/session-store.js` directly (not work-engine)

### Required Changes

**1. Update unified_api.js to use work-engine**

In `/api/sessions/*` routes, replace:
```javascript
const S = require('./lib/session-store');
```
with:
```javascript
const work = require('./lib/core/work-engine');
```

The work-engine wraps session-store, so all session operations go through it.

**2. Ensure session visibility across surfaces**

After Step 1, `GET /api/sessions` returns all sessions from `~/.purpclaw/sessions/_index.json`. TUI Ask sessions should appear in WebUI.

**3. Add session selector to WebUI**

The WebUI (MissionControl or /mission) should show a session selector in the top bar:
- Current session title + ID
- Button to open session list
- Button to create new session

**4. Wire chat route to work-engine**

The `/api/chat` route should use `work.chat()` for execution. Currently it uses `runAgent` directly and appends to spine/session-store. After Step 1, the spine store delegates to the main store, so this should work. But verify:

```javascript
// In unified_api.js /api/chat handler:
// Before: runAgent() + spine session-store
// After: work.chat({sessionId, prompt, provider, model})
// work.chat() handles session persistence internally
```

---

## TASK I: Surface Parity Test

**File:** `tests/surface-parity.spec.js` (NEW)

### Test Cases

```javascript
// Test 1: CLI session appears in WebUI
async function test_cli_session_visible_in_web() {
  // 1. Create session via CLI: purpclaw session new
  const { execSync } = require('child_process');
  const output = execSync('node bin/purpclaw.js session new', {
    cwd: 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW',
    encoding: 'utf8'
  });
  const sessionId = extractSessionId(output); // parse from output
  
  // 2. Call GET /api/sessions
  const http = require('http');
  const sessions = await fetchJson('http://localhost:7780/api/sessions');
  
  // 3. Verify session appears
  const found = sessions.sessions.find(s => s.id === sessionId);
  if (!found) throw new Error(`Session ${sessionId} not found in WebUI`);
}

// Test 2: TUI Ask session appears via API
async function test_tui_session_visible_in_api() {
  // This requires the TUI Ask to be running
  // Skip if TUI is not available
}

// Test 3: Provider status distinguishes configured from verified
async function test_provider_states() {
  const ps = require('./lib/core/provider-status');
  
  const minimax = ps.getProviderStatus('minimax');
  // Should show actual state, not just "ready"
  if (minimax.state === 'unknown') throw new Error('Provider state should be defined');
  
  // Verify function should test the actual API
  const verified = await ps.verifyProvider('minimax');
  if (!['verified', 'auth_failed', 'configured'].includes(verified.state)) {
    throw new Error('verifyProvider should return a defined state');
  }
}

// Test 4: Work engine session persistence
async function test_work_engine_persistence() {
  const work = require('./lib/core/work-engine');
  
  // Create session
  const session = work.createSession({ title: 'Test Session', provider: 'minimax', model: 'MiniMax-M2.7' });
  const id = session.id;
  
  // Save messages
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi' }
  ];
  work.saveSession(id, messages);
  
  // Load and verify
  const loaded = work.loadSession(id);
  if (loaded.messages.length !== 2) throw new Error('Messages not persisted');
  
  // List and verify
  const list = work.listSessions();
  const found = list.find(s => s.id === id);
  if (!found) throw new Error('Session not in list');
}

// Test 5: Jobs created in one surface visible in others
async function test_job_visibility() {
  // Skip — requires running services
}

// Run all tests
async function runTests() {
  const tests = [
    { name: 'work-engine-persistence', fn: test_work_engine_persistence },
    { name: 'provider-states', fn: test_provider_states },
    // Add more as services become available
  ];
  
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✓ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`✗ ${t.name}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
}
```

### Run Command
```bash
node tests/surface-parity.spec.js
```

---

## TASK J: Update Docs

**Files:** `docs/SURFACE_PARITY.md` (NEW)

Write documentation covering:
1. Required surface capabilities (the 13-item checklist)
2. Shared layout model
3. CLI/TUI/Web command mapping table
4. Provider status states
5. Current known gaps

---

## VERIFICATION COMMANDS

```bash
# Step 2 complete:
purpclaw tui        # cockpit with chat panel at bottom
# Switch tabs 1-7, chat panel stays visible
# Press s → session list
# Press n → new session
# Type message → should stream via work-engine

# WebUI session visibility
curl http://localhost:7780/api/sessions | jq '.sessions[].id'
# Should show sessions from TUI Ask and CLI

# Surface parity tests
node tests/surface-parity.spec.js
```

---

## DEPENDENCIES

Step 2 requires Step 1 to be COMPLETE. Specifically:
- `lib/core/work-engine.js` must exist and work
- `lib/core/provider-status.js` must exist
- `lib/spine/session-store.js` must delegate to main store

Do NOT start Step 2 until Step 1 is verified working.
