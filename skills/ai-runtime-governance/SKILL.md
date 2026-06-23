---
name: ai-runtime-governance
description: Governed autonomous AI runtime patterns — approval gates, risk classification, self-healing loops, rollback primitives, and measurable code health (spaghetti) auditing. For building/operating local AI orchestration stacks where agents can self-propose changes but cannot execute risky ones without human approval. Triggered when building agent orchestrators, adding self-healing, or designing autonomous loops with adult supervision.
origin: ECC / PURPCLAW build — 2026-05-23
---

# AI Runtime Governance

## What this skill covers

Building and operating a governed autonomous AI runtime — what was called "BabySkynet" during the PURPCLAW build. The key insight: agents that can **perceive, reason, delegate, validate, maintain themselves, and escalate to human signoff** are fundamentally different from assistants. They need constitutional law, not just prompts.

The governance model: **risky jobs get held for approval, not silently executed.**

---

## Core Design Principles

1. **Governed autonomy over silent execution** — if a job has any risk flag (destructive, self-modification, deployment, secret-change), it MUST route through an approval gate before executing. No exceptions.

2. **Risk classification comes first** — every incoming job gets classified as `read-only`, `draft`, `test`, `destructive`, `dependency-change`, `deployment`, `secret-change`, `self-modification`, `external-network`, or `optional-service-launch`. Risk determines the gate.

3. **Job contracts as abstraction layer** — classify jobs by type (code/writing/graphics/testing/security/research/ops/architecture) and assign gates based on type + risk.

4. **CLI-first governance surface** — all approvals, rejections, rollback points, policy changes visible through command surface. No hidden state.

5. **Spaghetti law as measurable signal** — score files on complexity, fan-in/out, hidden globals, side effects, circular refs. Turn subjective "this feels bad" into evidence-based verdicts with cleanup priority.

6. **Self-healing must be staged** — proactive maintenance proposals are read-only + opt-in. The system can notice weakness and propose fixes; it cannot auto-deploy fixes without approval.

---

## Implementation Architecture

### Files and their roles

| File | Role |
|------|------|
| `lib/governance.js` | Risk classification, approval ledger, policy enforcement (JSONL-based) |
| `lib/job-contract.js` | Job type classification, gate assignment, agent contract formatting |
| `lib/proactive-maintenance.js` | Read-only maintenance proposals (opt-in only) |
| `lib/spaghetti-audit.js` | Code health scoring with ANNONA/BIN/QUARANTINE/REFACTOR verdicts |
| `lib/snapshot.js` | Pre-execution snapshots for rollback (immutable, append-only) |
| `orchestrator.js` | Preflight gate — calls `checkWorkflow()`, holds risky jobs with `requestApproval()` |

### The Orchestrator Preflight Gate

```javascript
const governance = require('./lib/governance.js');

const check = governance.checkWorkflow(__dirname, workflow.command, workflow.contract, {
  approvalId: workflowInput.approvalId,
});

if (!check.requiresApproval || check.approved) {
  // proceed
} else {
  const approval = governance.requestApproval(__dirname, workflowId, workflow.command, workflow.contract, check);
  workflow.status = 'waiting_approval';
  workflow.result = { status: 'approval_required', approvalId: approval.id, risks: check.risks };
  return; // held until operator approves
}
```

### Risk Levels and Actions

| Risk | Action |
|------|--------|
| `read-only`, `diagnostic`, `draft`, `test` | auto-execute |
| `destructive`, `dependency-change`, `self-modification`, `deployment`, `secret-change`, `external-network` | hold for approval |
| `optional-service-launch` | hold if not explicitly started |

### Verdict Thresholds (spaghetti-audit.js)

| Score | Verdict | Action |
|-------|---------|--------|
| ≥85 | ANNONA | Archive, do not touch. Move to `/annona/` |
| ≥70 | BIN/REWRITE | Rewrite — high blast radius but clean to start |
| ≥45 | QUARANTINE | Contain first, rewrite second. Do not edit incrementally |
| ≥25 | REFACTOR | Schedule, fix incrementally |
| <25 | TRACEABLE | Healthy |

---

## CLI Command Surface

```
purpclaw doctor              — health check, no processes spawned
purpclaw policies            — show governance mode and what's risky
purpclaw jobs                — governance status summary
purpclaw jobs pending        — held jobs waiting for approval
purpclaw jobs recent         — last 20 approval decisions
purpclaw approve <id>        — approve a held job
purpclaw reject <id>          — reject a held job
purpclaw rollback list       — completed jobs with rollback metadata
purpclaw rollback undo <id>   — rollback (surface only, needs snapshot manifest)
purpclaw introspect          — runtime self-inspection
purpclaw introspect risks    — live classifyRisk() demo

## CLI Integration

```
purpclaw pool query "<text>"     keyword-search 139 skills
purpclaw pool show <name>        full SKILL.md content
purpclaw pool routing "<task>"    routing hints for a task
purpclaw pool stats              index counts + uptime
purpclaw pool recent            last N pool queries (audit trail)
purpclaw pool reindex           POST /pool/reindex
purpclaw resume list            list sessions from agent_work/sessions/
purpclaw resume <id>             session metadata + message count
purpclaw bg "<task>"            fire-and-forget dispatch to agent_work/bg-sessions/
```

```
purpclaw pool query "<text>"     keyword-search 139 skills
purpclaw pool show <name>        full SKILL.md content
purpclaw pool routing "<task>"    routing hints for a task
purpclaw pool stats              index counts + uptime
purpclaw pool recent            last N pool queries (audit trail)
purpclaw pool reindex           POST /pool/reindex (needs endpoint wiring)
purpclaw resume list            list sessions from agent_work/sessions/
purpclaw resume <id>             session metadata + message count
purpclaw bg "<task>"            fire-and-forget dispatch to agent_work/bg-sessions/
```

CLI uses `http.request()` with Promise wrapper to query pool. Pool service can be down — CLI degrades gracefully with error message. Pool service port: **7885** (NOT 7880 — fixed May 24 2026. service_registry.js registers pool at 7885. pool_service.js and bin/purpclaw.js CLI default both unified to 7885.)

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
4. **item.file in pool index is an ABSOLUTE path (Windows)** — `path.join(PURP_DIR, item.file)` when `item.file` is already absolute (e.g. `E:\god folder\...\skills\ck\SKILL.md`) produces the wrong path. Node.js `path.join` discards the first argument when the second is absolute. Fix: use `item.file` directly. Symptom: `purpclaw pool show <name>` returns `content: ""` even though file exists on disk.
5. **poolMeta not updated on rebuildIndex()** — `rebuildIndex()` updated in-memory arrays but not `poolMeta` object. Stats returned `{skillsCount: 0}` after reindex. Fix: `rebuildIndex()` must update `poolMeta.skillsCount`, `poolMeta.agentsCount`, `poolMeta.indexedAt`.

## PM2 Service Registration
## Governance Module API (lib/governance.js)

```javascript
// Risk classification
classifyRisk(command, contract = {}) → ['destructive', 'self-modification', ...]

// Policy enforcement
checkWorkflow(rootDir, command, contract, options = {}) → {
  mode, risks, requiresApproval, approved, allowed, approvalId
}

// Approval flow
requestApproval(rootDir, workflowId, command, contract, governance) → entry
setApprovalStatus(rootDir, id, status) → entry  // 'approved' | 'rejected'
pendingApprovals(rootDir) → [{id, workflowId, command, risks, status, createdAt}]
listApprovals(rootDir) → [entry]

// Policy
readPolicy(rootDir) → { mode, requireApprovalFor, allowWithoutApproval, ... }
writePolicy(rootDir, policy) → void
```

Approval log format: JSONL at `agent_work/approval_requests.jsonl` (one JSON object per line).

---

## Known Cleanup Order (from PURPCLAW spaghetti audit)

1. **bin/purpclaw.js** — 92KB god-file. BIN/REWRITE 75. Lowest blast radius, cleanest win.
2. **unified_api.js** — ANNONA 88. Facade decompose before full surgery.
3. **orchestrator.js** — QUARANTINE 67. Extract preflight / dispatch / approval gate.
4. **agent_tower.js** — QUARANTINE 62. Role/lifecycle separation after orchestrator stabilises.

---

## PURPCLAW Governance Hardening (May 23 2026 — this session)

### Critical lesson: PM2 BACKGROUND PROCESSES = HARD STOP

Spawning the full PURPCLAW PM2 stack (19 processes) caused Ted's PC to nearly freeze with dozens of CMD windows open simultaneously. Every CLI command must be self-contained with zero background spawns. `purpclaw doctor` is the reference implementation — it reads state via HTTP probes, not process spawning.

**Rule (HARD STOP)**: Do NOT start PM2 services unless explicitly requested by the user. Every CLI command must be self-contained with zero background spawns. `purpclaw doctor` is the reference implementation — it reads state via HTTP probes, no process spawning, no CMD windows.

2. **Windows Python PATH resolves to Hermes venv** — bare `python` in a bash terminal resolves to `hermes-agent/venv/Scripts/python`, NOT system Python 3.11. This causes silent failures when spawning Python services (autoDream, cognitive backends): services appear to run but fail to import modules (numpy, opencv, faiss) that only exist in system Python's site-packages. **Always hardcode absolute Python path** in ecosystem.config.js AND when spawning Python processes from orchestrator.js: `'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe'`. Symptom: autoDream says "done" but consolidation never actually runs. The venv Python is for Hermes agent tools only.

2. **Bypass detection method**: Scan source for `exec\(/spawn\(` patterns ±100 chars. If no governance context within ±20 lines, it's a bypass. Both `spawnDivisionAgent()` and `purpclaw_pipeline` in `unified_api.js` were HIGH-risk bypasses — patched May 24, 2026. Run this scan whenever adding new execution paths.

3. **Governance preflight verification (critical)**: "Is orchestrator preflight wired?" is not enough. The real check: find every execution trigger in the codebase, trace it to orchestrator.preflight(), confirm checkWorkflow() is called. Scan for `exec(`, `spawn(`, `child_process` — if there's no governance call within ±20 lines, it's an ungoverned path. Method used May 24: grep → classify by risk → inspect context → patch → verify.

### Snapshot-based rollback — lib/snapshot.js
### Snapshot-based rollback — lib/snapshot.js

Every workflow admission gets pre-execution snapshot (config file hashes, workflow metadata) in `agent_work/.snapshots/<workflowId>.snap.json`. Snapshot surface implemented; auto-trigger on failure is the remaining piece.

### Open knowledge pool — pool_service.js (port 7880)

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
```

Pool index is pre-built by Python, loaded by Node.js pool_service.js. 139 skills currently indexed from `skills/*/SKILL.md`.

---

## Anti-Patterns

**Never do:**
- Silently execute risky jobs without routing through the approval gate
- Run unbounded autonomous loops without confidence thresholds and rollback
- Let agents spawn agents without governance tracking (audit trail gets lost)
- Start the full PM2 stack without checking which services are actually needed
- Use `output: 'standalone'` in Next.js config when running via `next start` (breaks port binding)
- Spawn background processes from CLI commands without explicit user request

**Always do:**
- Verify orchestrator preflight actually calls `checkWorkflow()` before adding new job types
- Score files before refactoring — spaghetti diff proves refactors reduce risk, not just change code
- Treat ANNONA files as quarantined — no incremental edits, full rewrite only
- Log governance decisions to the JSONL ledger, not just stdout
- Verify new modules export their functions (`node -e "const s=require('./lib/foo.js'); console.log(Object.keys(s))"`) before wiring into orchestrator

---

## Dependencies

- Node.js (for CLI + orchestrator governance layer)
- PM2 (for service management — but do NOT start the full stack blindly; start core only)
- Python 3.11 + mss + Pillow (for screen capture / vision in `screen-look.js`)
- No external services required for the governance layer itself — fully local

---

## What Was Built This Session (May 24 2026)

### pool_service.js — Knowledge Pool Service (port 7880)

A Node.js PM2 service that:
- Loads pre-built `agent_work/.pool_index.json` (built by Python indexer)
- Maintains in-memory `skillsIndex[]` + `agentsIndex[]` (139 skills, 38 agents, 44 routing profiles as of May 24)
- Serves: `/pool/skills/search`, `/pool/skills/<name>`, `/pool/agents/search`, `/pool/routing/for-task`, `/pool/stats`, `/pool/health`, `/pool/recent`, `/pool/memory/append`, `/pool/failures/record`
- Binds to `0.0.0.0:7880` (not localhost — PM2 cross-service access on Windows)
- Appends every query to `agent_work/pool/queries.jsonl` (audit trail)

**Key bugs fixed during build** (see `references/pool-service-bugs.md` for full detail):
1. Port mismatch (7885 vs 7880) — unify to 7880 in both pool_service.js AND bin/purpclaw.js
2. `path.join(abs_path, abs_path)` wrong on Windows — use `item.file` directly since it's already absolute
3. `poolMeta` not updated after `rebuildIndex()` — must update poolMeta.skillsCount/agentsCount/indexedAt after array rebuild
4. `http.request()` double-fire with `called` guard fix — required on Windows Node.js
5. `__dirname` with spaces on Windows — normalize with `replace(/\\\\/g, '/')`

### CLI Commands Added (May 24 2026)

```
purpclaw pool query "<text>"    keyword search across skills + agents
purpclaw pool show <name>        full SKILL.md content, frontmatter stripped, 4000 char limit
purpclaw pool stats             skills/agents/routing/queries/uptime/last-indexed
purpclaw pool recent            last 15 queries with timestamps
purpclaw pool reindex           POST /pool/reindex → rebuilds + returns counts
purpclaw pool routing "<text>"  routing hints for a task
purpclaw bg "<task>"            fire-and-forget → agent_work/bg-sessions/<jobId>.json
purpclaw resume list            lists sessions from agent_work/sessions/*.jsonl
purpclaw resume <id>            session metadata + last user/assistant messages
purpclaw status                 now includes KNOWLEDGE POOL section + APPROVAL QUEUE
purpclaw install <name>         shortcut → cmdRegistry(['install', ...])
purpclaw search "<text>"        shortcut → cmdRegistry(['search', ...])
purpclaw registry browse         list all 139 skills + 38 agents with install status
purpclaw registry install <name> copy skill/agent into active skills/ or agents/
purpclaw registry publish <name> step-by-step PR guide to contribute
purpclaw registry update        rebuild registry/index.json from disk

purpclaw context stats          cross-agent state (active agents, workflows, locks)
purpclaw context team <intent>   active team for an intent (dragon+ghost, octopus+mushroom, etc.)
purpclaw context agent <name>    agent state snapshot from context-bus
purpclaw context workflows       all workflow states
purpclaw context lock <res> <agent> <ttlMs>  acquire resource lock

### Context Bus (lib/context-bus.js — port 7881)

Cross-agent shared state service. Monitors EventBus (port 7782) via polling every 2s. Maintains in-memory state for agents/workflows/locks. Persists to `agent_work/shared.json`.

**Endpoints**: `GET /context/stats`, `GET /context/agent/:name`, `GET /context/team/:intent`, `GET /context/workflows`, `POST /context/lock`, `GET /health`

**Architecture rule**: Build the event stream connection FIRST. A context bus with no agents reporting in is a ghost. The service itself can be built and tested with `curl http://localhost:7881/context/stats` before the orchestrator is wired to it — but wire it to orchestrator `agent.spawned` / `agent.completed` events before shipping to YOLO mode.

**PM2 registration**: `purpclaw-context` in `ecosystem.config.js`, registered in `service_registry.js` (core group, port 7881).
```

### Installers

- `installers/install.sh` — macOS/Linux: `curl -fsSL https://... | sh`
- `installers/install.ps1` — Windows: `irm https://... | iex`
- `QUICKSTART.md` — product description, stranger onboarding, architecture diagram, FAQ
- `registry/index.json` — machine-readable catalog: 139 skills + 38 agents with sizes, origins, descriptions

### Wizard Completion (May 24 2026 — this session added the boot step)

`cmdInitWizard` was already wired in bin/purpclaw.js but was missing the final boot step — it would write `.env`, hatch the mochi, smoke-test the LLM, then just print "PURPCLAW IS READY" with manual instructions. **Added**: "Boot the swarm now? [Y/n]" prompt that spawns `purpclaw start` as a detached background process using `spawn()` with `{ detached: true, shell: true }` + `proc.unref()`. The wizard exits immediately; the swarm keeps running in the background.

**E2E Verification (May 24 2026)**: All 13 phases green — clone, install.sh syntax check, wizard exists, start --dry-run, status with pool, search, install, pool query, pool routing, bg dispatch, workflows, resume list, pool show, stop --dry-run. See `references/wizard-pattern.md` for full implementation patterns and E2E phase log.

**Commit status**: Committed to `f0410c8` "POOL-1: knowledge pool, registry, wizard, governance — the haunted workshop is born". Successfully pushed to GitHub May 24 2026 — `https://github.com/weemadscotsman/purpclaw`. Second commit `f4e6ace` "POOL-2: port fix 7885, orphaned PIDs cleaned, pool CLI unified" pushed same night.

Full implementation patterns: see `references/wizard-pattern.md` and `references/context-bus-impl.md` for the context-bus build details.

## Code Archaeology Pattern (286-file audit — May 24 2026)

When auditing a codebase for dormant/wired/orphan modules, use a three-way classification:

**WIRED** — loaded by orchestrator/PM2/bin. Leave as-is.
**CLI_ONLY** — documented in runbooks/docs but not auto-started. Manual tools. Keep.
**ORPHAN** — no code reference, no doc reference. Deletion candidates.

Detection pattern:
```bash
# Check code references (wiring points)
grep -rn "filename" orchestrator.js ecosystem.config.js bin/purpclaw.js service_registry.js

# Check documentation (CLI_ONLY, not orphan)
grep -rn "filename" docs/ PURPCLAW_Runbook.md

# Only orphan if neither code nor docs reference it
```

See `references/orphan-classification-2026-05-24.md` for full audit results (286 files, deleted files list, archived directories, Python path pitfall).
1. Provider pick (9 options: MiniMax, Anthropic, OpenAI, Kimi, Groq, DeepSeek, OpenRouter, Ollama, Custom)
2. API key (masked input via TTY raw mode, backspace, Ctrl-C handling — `askSecret()`)
3. Model name (defaults per provider)
4. Companion seed (determines Mochi species/eye/hat from username)
5. Persist to `.env` via `setEnvKey()` function, re-export into `process.env`
6. Hatch mochi → smoke-test LLM → boot offer → done

Key implementation detail: `askSecret()` uses `stdin.setRawMode(true)` on TTY for character-by-character reading, `*` echo for each character, backspace handling (`\b \b`), and Ctrl-C (`\u0003`) exit with code 130.

```javascript
// Best-effort masked input (TTY raw mode)
const askSecret = (q) => new Promise(r => {
  process.stdout.write(`  ${col(C.cyan, '?')} ${q} `);
  const stdin = process.stdin;
  if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(true);
  let buf = '';
  const onData = (b) => {
    const ch = b.toString('utf8');
    if (ch === '\r' || ch === '\n') {
      if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(false);
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      r(buf);
    } else if (ch === '\u0003') {  // ctrl-c
      if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(false);
      process.stdout.write('\n');
      process.exit(130);
    } else if (ch === '\u007f' || ch === '\b') {  // DEL / backspace
      if (buf.length) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); }
    } else {
      buf += ch;
      process.stdout.write('*');
    }
  };
  stdin.on('data', onData);
  stdin.resume();
});
```

The boot offer spawns detached:
```javascript
const proc = spawn('node', ['bin/purpclaw.js', 'start'], {
  cwd: PURP_DIR, stdio: 'inherit', detached: true, shell: true,
});
proc.unref();  // wizard exits, swarm keeps running
console.log('PURPCLAW is booting in the background. Watch: purpclaw status');
```

---

## Additional Patterns Added May 24 2026

### Windows Node.js __dirname Trap

```javascript
// BROKEN on Windows with spaces in path:
const PURP_DIR = path.resolve(__dirname, '..');

// CORRECT — works everywhere:
const PURP_DIR = path.dirname(__filename).replace(/\\/g, '/');
```

Always normalize to forward slashes on Windows when paths might contain spaces.

### Registry Architecture — Local Git-Backed Distribution

```
registry/
  index.json          — {version, updated, skills[], agents[], total_skills, total_agents}
skills/                — source of truth
agents/                — source of truth
```

**Index structure:** `index.json` has `skills[]` and `agents[]` arrays. Each entry has `name`, `description`, `origin`, `file` (absolute path on Windows), `size_kb`. `origin` field tracks whether a skill came from ECC (bundled) or community (contributed).

**IMPORTANT — `file` field is ABSOLUTE path on Windows.** Use `item.file` directly — NOT `path.join(PURP_DIR, item.file)` because Node.js `path.join` discards the first argument when the second is already absolute (e.g. `E:\god folder\...\skills\ck\SKILL.md`). Symptoms: `purpclaw pool show <name>` returns `content: ""` even though file exists on disk. Fix: use `item.file` directly as the file path.

Built commands:
```
purpclaw registry browse              list skills + agents, show install status + size + origin
purpclaw registry search "<text>"      keyword search across all 139 skills + 38 agents
purpclaw registry install <name>        copy skill/agent from local index to active skills/
purpclaw registry publish <name>        step-by-step guide to contribute a new skill/agent
purpclaw registry update               rebuild registry/index.json from disk
purpclaw install <name>                shortcut → cmdRegistry(['install', ...args])
purpclaw search "<text>"               shortcut → cmdRegistry(['search', ...args])
```

### Context Bus — lib/context-bus.js (built May 24 2026)

Cross-agent shared state service on port 7881. Monitors EventBus (port 7782) via polling, maintains in-memory state for agents/workflows/locks, persists to `agent_work/shared.json`.

**Endpoints**: `GET /context/stats`, `GET /context/agent/:name`, `GET /context/team/:intent`, `GET /context/workflows`, `POST /context/lock`

**Architecture rule (from this build)**: Build the event stream connection FIRST. A context bus with no agents reporting in is a ghost. The service itself can be built and tested with `curl http://localhost:7881/context/stats` before the orchestrator is wired to it — but wire it to orchestrator `agent.spawned` / `agent.completed` events before shipping to YOLO mode.

**PM2 registration**: Added to `ecosystem.config.js` as `purpclaw-context` and to `service_registry.js` in the `core` group.

**CLI Scope Ordering Bug — FIXED May 24 2026 — DO NOT REPEAT**

Symptom: `purpclaw status` threw `ReferenceError: ctxGet is not defined` and skipped KNOWLEDGE POOL section entirely (even though pool was online and curl confirmed valid JSON).

Root cause: `ctxGet()` was defined as a local function inside `cmdContext()` (line ~108581 in bin/purpclaw.js), but called from `cmdStatus()` (line ~29068). Since `cmdContext` function body appears later in the file than `cmdStatus`, the local variable wasn't in scope.

Fix: Moved `CTX_PORT` and `ctxGet()` to module scope (lines 67-76, before `const PORTS = {`). Also fixed the call from full URL `ctxGet('http://127.0.0.1:7881/context/stats')` to path-only `ctxGet('/context/stats')` — ctxGet already prepends the host:port.

**Rule**: In a single-file CLI with many `async function cmdX(args)` definitions, all shared helpers (HTTP request wrappers, formatters, config constants) MUST be defined at module scope BEFORE any command function. Never rely on function declaration hoisting across separate command functions in a single file. If you add a helper to `cmdContext`, add it to module scope too.

**Pattern — module-level HTTP helper:**
```javascript
const CTX_PORT = parseInt(process.env.CONTEXT_PORT || '7881', 10);
function ctxGet(path) {
  return new Promise(resolve => {
    http.get({ hostname: '127.0.0.1', port: CTX_PORT, path }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}
```
Then call `ctxGet('/context/stats')` from any command function.

### Git Push — Confirmed Working May 24 2026

```
git remote: https://github.com/weemadscotsman/purpclaw
Commits pushed:
  f0410c8 POOL-1: knowledge pool, registry, wizard, governance
  f4e6ace POOL-2: port fix 7885, orphaned PIDs cleaned, pool CLI unified
```

Pool service at 7885 (139 skills, 38 agents, 78+ queries, 7000s+ uptime). Context-bus at 7881. Both registered in service_registry.js and ecosystem.config.js. All green.

**Commit history (May 24 2026):**
```
7e1c3e1 POOL-3: context-bus, pool port unified to 7885, status ctxGet fixed
  - lib/context-bus.js: cross-agent state store :7881, HTTP API + EventBus poll
  - ecosystem.config.js: +purpclaw-context PM2 entry
  - service_registry.js: +context-bus registration (core group, port 7881)
  - bin/purpclaw.js: cmdContext(), ctxGet() moved to module scope (FIXED),
    pool port fixed to 7885, cmdStatus async + ctxGet path fix (/context/stats)

f4e6ace POOL-2: port fix 7885, orphaned PIDs cleaned, pool CLI unified
f0410c8 POOL-1: knowledge pool, registry, wizard, governance
```

**Current services (all online May 24 2026):**
```
:7885  Knowledge Pool    — 139 skills, 38 agents, 40,800s+ uptime  ✓
:7881  Context Bus       — HTTP API responding, EventBus polling      ✓
:7782  EventBus          — 11h+ uptime, 4 clients, 26 events         ✓
:7784  Orchestrator      — online                                      ✓
:7780  Unified API        — online                                      ✓
:7790  Agent Tower      — online                                      ✓
:7791  Gatekeeper       — online                                      ✓
:7890  Metrics          — online                                      ✓
:3000  Mission Control   — online                                      ✓
```

**YOLO handoff status**:
- Pool: fully working. `purpclaw pool query/show/stats/routing` all green.
- Context Bus: service alive, CLI `purpclaw context stats/team/workflows` all working. Orchestrator event wiring (agent.spawned → POST /context/agent) still pending — agents register but context-bus sees 0 because orchestrator hasn't called home yet.
- Git: pushed. `git clone https://github.com/weemadscotsman/purpclaw` gets the full workshop.
- `purpclaw status`: KNOWLEDGE POOL ✔ online, CONTEXT BUS showing live data, all sections correct.

**Remaining piece before full autonomous YOLO**: Wire `orchestrator.js` → context-bus via EventBus poll. Poll `/agent.spawned` events, call `POST /context/agent` with agent state. Poll `/workflow.completed`, call `POST /context/workflow`.

### Fire-and-Forget Background Dispatch

Track in `agent_work/bg-sessions/<jobId>.json` with `task`, `status`, `dispatchedAt`. Log written to `<jobId>.log`. List running: `purpclaw bg`.

### Session Resume (JSONL-based)

Sessions stored as `agent_work/sessions/<sessionId>.jsonl` — one JSON object per message. Resume list shows timestamp + last output per session. Resume shows message count breakdown and last user/assistant turn.

---

## What Was Built This Session (May 24 2026)