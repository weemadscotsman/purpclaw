---
name: parallel-swarm-and-live-feed-pattern
description: Backend + frontend pattern for parallel agent fan-out (swarm mode) and live event streaming for the cognitive panel. Used by /api/chat/swarm, /api/cognitive/events, and similar multi-agent / live-feed endpoints.
when_to_use: Adding a new endpoint that fans out work to N parallel agents; adding a new live event stream to the cognitive panel; extending swarm mode with new event types
---

# Parallel Swarm + Live Feed Pattern — PURPCLAW

Two complementary patterns for runtime that feels alive:

1. **SWARM** — one user message → N specialized agents → synthesizer. Each agent streams tokens in parallel. Frontend renders one bubble per agent.
2. **LIVE FEED** — server-side ring buffer + SSE. Client subscribes, gets backlog + live updates.

## SWARM — `/api/chat/swarm`

### Backend (in `unified_api.js`)

```js
async function handleChatSwarm(req, res) {
  const body = await parseBody(req);
  const { message, agents: override } = body;
  if (!message) { /* error event */ return; }

  // Default 3-agent roster: distinct system prompts
  const defaultAgents = [
    { id: 'planner',    role: 'Planner',    emoji: '🧭', system: '...' },
    { id: 'researcher', role: 'Researcher', emoji: '🔬', system: '...' },
    { id: 'builder',    role: 'Builder',    emoji: '🛠️', system: '...' },
  ];
  const agents = override?.length ? override : defaultAgents;

  sseStart(res);
  sseEvent(res, 'phase', { phase: 'received', agentCount: agents.length });
  sseEvent(res, 'phase', { phase: 'spawning' });

  // Spawn all agents in parallel — each streams its own tokens
  const results = await Promise.allSettled(agents.map(async (a) => {
    sseEvent(res, 'agent', { id: a.id, role: a.role, emoji: a.emoji, status: 'started' });
    let text = '';
    for await (const c of llm.streamChat([
      { role: 'system', content: a.system },
      { role: 'user', content: message },
    ], { temperature: 0.4, maxTokens: 600 })) {
      if (c.content) {
        text += c.content;
        sseEvent(res, 'token', { agentId: a.id, content: c.content, model: c.model });
      } else if (c.done) break;
    }
    sseEvent(res, 'agent_done', { id: a.id, role: a.role, ok: true, length: text.length, elapsed: ms });
    return { id: a.id, content: text };
  }));

  // Synthesizer merges
  sseEvent(res, 'phase', { phase: 'synthesizing' });
  let synth = '';
  for await (const c of llm.streamChat([...], { temperature: 0.2 })) {
    if (c.content) { synth += c.content; sseEvent(res, 'token', { agentId: 'synthesizer', content: c.content }); }
  }
  sseEvent(res, 'synthesis', { content: synth });
  sseEvent(res, 'done', { ok: true, agents: [...], synthesis: synth, totalElapsed: ms });
  return res.end();
}
```

### Event vocabulary (stick to these)

| event | data | when |
|---|---|---|
| `phase` | `{ phase: 'received'\|'spawning'\|'synthesizing'\|'done' }` | lifecycle |
| `agent` | `{ id, role, emoji, status: 'started', model }` | new agent bubble appears |
| `token` | `{ agentId, content, model }` | per LLM token (per agent) |
| `agent_done` | `{ id, role, ok, length, elapsed, error? }` | per agent finish |
| `synthesis` | `{ content, model }` | final synthesized answer |
| `done` | `{ ok, agents, synthesis, totalElapsed }` | swarm complete |
| `error` | `{ error, agentId? }` | any failure |

### Frontend (in `CommandPanel.tsx`)

```ts
const streamSwarmSend = useCallback(async (msgId, body) => {
  // Open SSE stream
  const res = await fetch('http://localhost:7780/api/chat/swarm', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ message: body.message, agents: body.agents }),
  });
  const reader = res.body.getReader();
  const agentBubbles = new Map<string, string>();   // agentId → msgId
  const tokenBodies: Record<string, string> = {};   // agentId → accumulated content
  let synthesisMsgId: string | null = null;

  // On each event:
  //   agent      → spawn a new message bubble
  //   token      → append to that bubble's content
  //   agent_done → mark bubble as done with elapsed time
  //   synthesis  → set the synthesis bubble content
  //   done       → push a final summary bubble

  // Each agent appears as its own bubble. Tokens stream in parallel
  // because they update independent state entries — React batches
  // them but they all flush in the same frame.
}, [updateMsg, setMessages, uid, stamp]);
```

### Pitfalls

- **A failed agent must not kill the swarm** — use `Promise.allSettled`, never `Promise.all`. Emit `agent_done { ok: false, error }` for failures.
- **Don't synthesize if no agents succeeded** — return `done { ok: false }`.
- **Bubbles need stable IDs** — use a `Map<agentId, msgId>` so tokens route to the right bubble.
- **Synthesis bubble should appear LATE** — create it on first `token` with `agentId: 'synthesizer'`, not eagerly.
- **API is BOTH streaming and JSON** — non-streaming JSON path calls all agents in parallel with `Promise.allSettled` and returns `{ ok, agents, total }`. Streaming path adds the synthesis step.

## LIVE FEED — `/api/cognitive/events`

### Backend (in `unified_api.js`)

```js
// Module-level subscriber set
const logSubscribers = new Set();

// Modify the existing log() to broadcast
function log(msg) {
  const entry = { timestamp: ..., type: msg.type, data: msg };
  state.logs.unshift(entry);
  if (state.logs.length > state.maxLogs) state.logs.pop();
  for (const fn of logSubscribers) try { fn(entry); } catch {}
}

// SSE endpoint
if (pathname === '/api/cognitive/events' && method === 'GET') {
  sseStart(res);
  // Backfill: send the last 50 entries so the client has context
  for (const ev of state.logs.slice(0, 50).reverse()) {
    sseEvent(res, 'event', { kind: 'history', log: ev });
  }
  sseEvent(res, 'phase', { phase: 'live', total: state.logs.length });
  // Subscribe to new entries
  const onLog = (log) => sseEvent(res, 'event', { kind: 'live', log });
  const interval = setInterval(() => sseComment(res, 'keepalive'), 15000);
  logSubscribers.add(onLog);
  req.on('close', () => {
    clearInterval(interval);
    logSubscribers.delete(onLog);
    try { res.end(); } catch {}
  });
  return;
}
```

### Frontend (in `MissionControl.tsx` or `CognitivePanel.tsx`)

```ts
useEffect(() => {
  const ac = new AbortController();
  (async () => {
    const res = await fetch('/api/cognitive/events', { signal: ac.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // Parse SSE blocks
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
        // parse event:/data: lines, dispatch
      }
    }
  })();
  return () => ac.abort();
}, []);
```

### Pitfalls

- **Module-level subscriber set** — must be at the top of the file, not inside the request handler. Otherwise the Set is per-request and broadcasts go nowhere.
- **Backfill on connect** — the first 50 events should be sent immediately so the client has content. Don't make the user wait for the next event to render.
- **Cleanup on disconnect** — `req.on('close', ...)` removes the subscriber. Without this, every connection leaks a closure.
- **Keepalive comments** — every 15s, send `: keepalive\n\n` to keep the connection through reverse proxies.
- **Don't double-broadcast** — if you have multiple broadcast points (log, broadcast, etc), centralize through ONE function that fans out to subscribers.

## Verification

```bash
# Swarm SSE
curl -N -X POST http://localhost:7780/api/chat/swarm \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"test"}' | head -30

# Cognitive events SSE
curl -N -X GET http://localhost:7780/api/cognitive/events | head -10

# Manual event injection (for testing)
# Any code path that calls `log({type: 'foo', ...})` will fire to subscribers
```

## Where It's Already Wired

- `unified_api.js:3053-3080` — `/api/cognitive/events` SSE handler
- `unified_api.js:725-729` — `logSubscribers` Set
- `unified_api.js:2418-2425` — `log()` broadcasts to subscribers
- `unified_api.js:430-560` — `handleChatSwarm` (parallel fan-out + synthesis)
- `unified_api.js:3060-3110` — `/api/chat/swarm` JSON + SSE route
- `app/components/CommandPanel.tsx:1287-1413` — `streamSwarmSend` frontend
- `app/components/CommandPanel.tsx:1816-1831` — swarm route uses `streamSwarmSend`
