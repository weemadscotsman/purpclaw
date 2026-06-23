# Knowledge Pool Architecture (PURPCLAW — updated May 24 2026)

## Concept

NOT a closed loop where the orchestrator decides upfront what context agents receive. Instead: an always-queryable shared knowledge pool that any service in the stack can hit at any time.

```
                 KNOWLEDGE POOL :7880
                 skills/    agents/
                 failures/  preferences/
                 workspace/ session_history/

Any process queries whenever it needs context:
  orchestrator  →  routing hints for task dispatch
  agent_tower   →  agent specialist profiles at dispatch time
  spawned agents →  relevant skills when they're uncertain
  CLI           →  manual interrogation
  Mission Control UI → live telemetry
```

## Why Open Over Closed

Closed loop: orchestrator decides what agent needs → agent gets frozen context at spawn → can't ask follow-up questions → context goes stale

Open pool: agent decides when it needs context → queries at runtime → writes back learnings → next agent benefits

## pool_service.js Architecture

```
pool_service.js (Node.js, PM2 service on :7880)
  ├── Reads: agent_work/.pool_index.json  (pre-built index)
  ├── Index: skillsIndex[] + agentsIndex[]  (in-memory)
  └── Endpoints: GET /pool/skills/search, /pool/skills/<name>,
                 /pool/routing/for-task, /pool/stats,
                 /pool/health, /pool/recent
                 POST /pool/failures/record, /pool/memory/append
```

**Index building** (Python, separate from pool_service.js):
- Scan `skills/*/SKILL.md`
- Extract YAML frontmatter: `name:`, `description:`, `tools:`, `keywords:`
- Extract first prose paragraph from content body
- Build `keywords` as Set of meaningful tokens (3-25 chars, noise-filtered)
- Write `agent_work/.pool_index.json`

**Pool service loading** (Node.js):
- Read `agent_work/.pool_index.json`
- Convert `keywords: []` arrays to `keywords: new Set([])` in memory
- Search via token overlap scoring

## Key Implementation Detail: Windows Path __dirname Trap

`path.resolve(__dirname, '..')` on Windows produces backslash paths. When those paths contain spaces (e.g., `E:\god folder\02_ACTIVE_PROJECTS`), Node.js's path handling can silently mangle them during string concatenation or URL construction.

**Fix:**
```javascript
// BEFORE (broken on Windows with spaces in path):
const PURP_DIR = path.resolve(__dirname, '..');

// AFTER (works everywhere):
const PURP_DIR = path.dirname(__filename).replace(/\\/g, '/');
```

Verify with: `node -e "const path=require('path'); console.log(path.join('E:\\god folder\\02_ACTIVE_PROJECTS','agent_work','.pool_index.json'))"` — if the path contains backslashes with spaces, the join is already broken.

## CLI Integration

```
purpclaw pool query "<text>"     keyword-search 139 skills
purpclaw pool show <name>        full SKILL.md content
purpclaw pool routing "<task>"    routing hints for a task
purpclaw pool stats              index counts + uptime
purpclaw pool recent            last N pool queries (audit trail)
purpclaw resume list            list sessions from agent_work/sessions/
purpclaw resume <id>             session metadata + message count
purpclaw bg "<task>"            fire-and-forget dispatch to agent_work/bg-sessions/
```

CLI uses `http.request()` with Promise wrapper to query pool. Pool service can be down — CLI degrades gracefully with error message. Pool service port: **7880** (NOT 7885 — that was a typo that cost 2 hours May 24 2026).

## POOL CLI Bug Fixed May 24 2026 (IMPORTANT — don't repeat)

`purpclaw pool query` returned "Pool returned unexpected format" even though pool service was online and curl confirmed valid JSON. **Root cause**: `http.request()` in Node.js fires `res.on('end')` AFTER `req.destroy()` from `setTimeout`, even when the timer fires first. The `req.aborted` guard was not enough — used both a `called` boolean flag AND removed the `req.destroy()` in favour of just letting the timeout callback fire once.

Working pattern (May 24):
```javascript
function poolReq(method, path, body) {
  return new Promise((resolve, reject) => {
    var called = false;
    var req = http.request({ hostname: '127.0.0.1', port: POOL_PORT, path, method,
      headers: { 'Content-Type': 'application/json', 'X-Pool-Caller': 'cli' } },
      res => { var data = ''; res.on('data', c => data += c); res.on('end', () => {
        if (called) return; called = true;
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      }); });
    req.setTimeout(4000, () => { if (called) return; called = true; req.destroy(); reject(new Error('timeout')); });
    req.on('error', e => { if (called) return; called = true; reject(e); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
```

**Key lessons**:
1. `http.get()` callback fires AFTER `setTimeout` destroy in Windows Node.js — use `called` guard
2. Pool port was wrong (7885 vs 7880) — grep both pool_service.js AND bin/purpclaw.js to find port mismatches
3. The callback was firing twice — first with valid results, second with undefined. The `called` flag is NOT optional.

## PM2 Service Registration

In `ecosystem.config.js`:
```javascript
{
  name: 'purpclaw-pool',
  script: './pool_service.js',
  exec_mode: 'fork',
  wait_ready: false,
  instances: 1,
}
```

In `service_registry.js`:
```javascript
pool: { url: 'http://localhost:7880', type: 'http' }
```

Boot order: pool service starts without dependencies, other services can query it whenever they're ready.

## Key Learnings from Build (May 24 2026 update)

1. **Pool index must be pre-built**: Python builds `.pool_index.json`, Node.js reads it. Both on the same machine — no network call needed for indexing.

2. **Pool port is 7880**: NOT 7885. pool_service.js uses `parseInt(process.env.POOL_PORT || '7880')` but bin/purpclaw.js had hardcoded `'7885'` default. Grep both files when debugging port mismatches — mismatch cost 2 hours May 24.

3. **http.request() double-fire on Windows Node.js**: `setTimeout` + `req.destroy()` still allows `res.on('end')` to fire afterward. Fix: `called` boolean flag on ALL resolve/reject paths. Not optional. The callback fires TWICE — first with valid data, second with `undefined`. Symptoms: "Pool returned unexpected format" even though pool is online and curl works.

4. **Pool service must bind to 0.0.0.0**: Not `localhost` — otherwise PM2 services on Windows can't reach it from other PM2 services on the same machine.

5. **Port conflicts persist across restarts**: `netstat -ano | grep <port>` and `taskkill //F //PID <pid>` needed before restarting the service.

6. **item.file in pool index is ABSOLUTE PATH (Windows)** — `path.join(PURP_DIR, item.file)` when `item.file` is already absolute (e.g. `E:\god folder\...\skills\ck\SKILL.md`) produces the WRONG path. Node.js `path.join` discards the first argument when the second is absolute. Fix: use `item.file` directly, not `path.join(PURP_DIR, item.file)`. Symptom: `purpclaw pool show <name>` returns `content: ""` even though the file exists. Verify with curl first: `curl http://localhost:7880/pool/skills/<name>` returns the raw JSON — if it has `file:` field with backslashes, the path is absolute and needs direct use.

7. **poolMeta not updated on rebuildIndex()** — `rebuildIndex()` updated in-memory `skillsIndex[]` and `agentsIndex[]` arrays but left the `poolMeta` object stale. Stats endpoint returned `{skillsCount: 0, agentsCount: 0}` after reindex. Fix: inside `rebuildIndex()`, add after the index building loop: `poolMeta.skillsCount = skillsIndex.length; poolMeta.agentsCount = agentsIndex.length; poolMeta.indexedAt = new Date().toISOString();`

## Hermes Goop Audit (May 24 2026)

PURPCLAW's CLI is stateless between commands. Hermes has a **persistent event loop** — the TUI runs all the time, responding to both user input and system events. This is the core architectural difference.

What Hermes has that PURPCLAW doesn't yet:
- Live status bar (always-on bottom showing token count, context, cost, queue depth)
- Slash command autocomplete (readline tab-complete for all agents, skills, pool queries)
- True session resume (full conversation continuation, not just session metadata listing)
- Background task live panel (streaming results back to CLI while agent works)
- Tool progress feed (animated thinking faces, streaming tool names)
- Persistent TUI loop (`hermes` with no args boots the REPL)

What PURPCLAW now has (stolen from Hermes May 24):
- `purpclaw status` → live service health + KNOWLEDGE POOL section + APPROVAL QUEUE section
- `purpclaw pool query` → keyword search across 139 skills
- `purpclaw resume list` + `purpclaw resume <id>` → session checkpoint listing and metadata
- `purpclaw bg "<task>"` → fire-and-forget background dispatch

The next architectural shift for PURPCLAW CLI: **persistent TUI loop** — `purpclaw` with no args boots a live REPL with status bar, not just a help print.