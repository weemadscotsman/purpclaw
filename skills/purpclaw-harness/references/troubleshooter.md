# PURPCLAW Troubleshooter — Session Patterns

Diagnosed failure modes with exact symptoms, root causes, and fixes.

---

## Next.js API route returns 404 — but the file exists

**Symptom:** `curl POST http://localhost:3000/api/playwright` returns 404 HTML. File `app/api/playwright/route.ts` exists and looks correct.

**Root cause:** PM2 zombie. When `pm2 restart purpclaw-nextjs` fires, the old Next.js process (PID A) doesn't exit before the new one (PID B) starts. PID A still holds port 3000. PID B either fails to bind or binds to a different port. All requests go to PID A (the old process that doesn't know about the new route file).

**Diagnosis:**
```bash
netstat -ano | grep ":3000" | grep LISTENING
# Shows ALL PIDs holding port 3000. Should be exactly 1.
```

**Fix:** Kill all PIDs on port 3000, then let PM2 restart clean.
```bash
# Kill every PID on port 3000
taskkill //PID <PID1> //F
taskkill //PID <PID2> //F
# ...then PM2 restarts to a clean port
pm2 restart purpclaw-nextjs
```

**Prevention:** Before any PM2 restart: check `netstat -ano | grep ":3000"`. If more than 1 PID, kill the stale one first.

---

## Next.js build fails — all routes go dark

**Symptom:** After adding a new API route file, ALL `/api/X` routes return 404. Previous routes that worked also fail.

**Root cause:** Next.js TypeScript build is all-or-nothing. A single TypeScript error in ANY file blocks the entire build. When the build fails, Next.js falls back to the old compiled output (which doesn't include the new route).

**This session's specific pattern:**
```
./app/api/playwright/route.ts:92:9
Type error: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
```
`playwright`'s `textContent()` returns `string | null`, not `string`. TypeScript strict mode rejects assigning null to a `string` variable.

**Fix:** Add null coalescing to every `textContent()` call:
```typescript
// BEFORE (TypeScript error)
text = await p.locator(selector).first().textContent().catch(() => '');

// AFTER (TypeScript clean)
text = (await p.locator(selector).first().textContent().catch(() => '')) ?? '';
```

**Verify:**
```bash
cd E:/god\\ folder/02_ACTIVE_PROJECTS/PURPCLAW
npm run build 2>&1 | grep -E "playwright|Error|Failed|Route|✓|✗"
# Look for "✓ Compiled successfully" before assuming it's fixed
```

**Then restart Next.js after the build succeeds.** PM2 may still be running the old process.

---

## Orchestrator `/api/orchestrate` fails — "Active agent cap reached"

**Symptom:** `POST /api/orchestrate` returns `{status: "failed", error: "Active agent cap reached (N)"}`.

**Root cause:** `agent_tower.js` has `MAX_ACTIVE_AGENTS` (default 4, production 2 via env var). Zombie agents from crashed sub-processes stay in `AGENT_TOWER.activeAgents` map. The map fills up, legitimate requests get blocked.

**Diagnosis:**
```bash
curl -s http://127.0.0.1:7790/api/status | grep totalActive
# Shows activeAgents count vs maxActiveAgents
```

The tower status endpoint also shows which agents are stuck (look for `status: "error"` in activeAgents array).

**Fix:**
```bash
pm2 restart purpclaw-tower
# Wait 4 seconds for restart to complete
curl -s http://127.0.0.1:7790/api/status | grep totalActive
# Should show 0 active after clean restart
```

**After restart:** Orchestrator can again dispatch agents. Run the original command.

---

## Orchestrator fails at step N/8 — reading the step map

**Symptom:** `POST /api/orchestrate` returns `{status: "failed", steps: {total: 8, completed: N}}`.

**Step map (orchestrator.js):**
```
1 parse   — Classify command intent and target
2 contract — Create typed job contract and required gates
3 governance — Check policy and approval requirements
4 route   — Choose orchestration path
5 preflight — Validate safety, queue, and service readiness
6 delegate — Spawn best-fit agent
98 verify — Run required verification gates
99 record — Publish workflow events and expose status
```

**Known failure points:**
- Steps 1-4: never fail for legitimate commands
- Step 5 (preflight): fails if a required service is down or pool is unhealthy
- Step 6 (delegate): fails if agent tower is at cap (see above), or if OpenClaw is unreachable
- Step 7 (verify): fails if the agent returned something the verification gate rejects (e.g., "hello" command has no build artifact to verify)
- Step 8 (record): rarely fails

**Diagnosis:** Check the step number, then look at what that step does:
```bash
curl -s -X POST http://localhost:7784/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"command":"your command"}' | python -c "
import sys,json
j=json.load(sys.stdin)
j['workflow']['plan'].forEach(lambda s: print(s['order'], s['stage'], s['operation']))
print('FAILED AT STEP:', j['workflow']['steps']['completed']+1)
"
```

**Quick health check — what's actually failing:**
```bash
# Step 5 preflight — check pool health
curl -s http://localhost:7885/health

# Step 6 delegate — check tower active count
curl -s http://127.0.0.1:7790/api/status | grep totalActive

# Step 7 verify — this is often command-appropriate, not a system failure
# "Verification failed: build" for a "hello" command means no build artifact exists
```

---

## PM2 shows hundreds of restarts — but process is healthy

**Symptom:** `pm2 list` shows 400+ restarts for a process, or uptime of "0s" with status "online".

**Root cause:** PM2 restart count is CUMULATIVE across the process lifetime. A process that crashed 500 times last month and has been stable for 3 weeks still shows "503/503". Uptime of "0s" after a PM2 restart shows the process restarted but is currently running.

**Diagnosis:**
```bash
pm2 list | grep orchestrator
# Check uptime column — if non-zero and status is online, process is healthy
# Restart count alone means nothing without uptime context
```

**Fix:** None needed if uptime is healthy. If uptime is "0s" and status is "online", the process just restarted and will warm up.

**Key insight:** Always pair restart count with uptime. PM2 logs are append-only — old crash entries stay even after the fix.

---

## Python 3 not found in bash

**Symptom:** `python3: command not found` in bash terminal.

**Root cause:** This Windows system's MSYS/git-bash environment doesn't have `python3` on the PATH. `python` works (resolves to system Python or Hermes venv Python depending on context).

**Fix:** Use `python` instead of `python3`, or use the absolute path:
```bash
C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe
```

This matters when calling Python from shell scripts or when a tool tries `python3` automatically.