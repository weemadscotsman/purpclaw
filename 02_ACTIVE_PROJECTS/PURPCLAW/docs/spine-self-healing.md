# Spine Self-Healing — Leak Prevention System

> The cognitive spine (Python, port 7880) is a child of `cognitive_gateway.js`, not a direct PM2 service. PM2's `max_memory_restart` cannot see it. The watchdog is the only thing keeping the host alive.

## Architecture

```
cognitive_gateway.js (PM2 process, pid=X)
  └── cognitive_spine.py (child process, pid=Y, port 7880)
        ├── mem_guard.watchdog  ← self-RSS check every 15s
        ├── MemoryMatrixV2       ← vector + FAISS indices
        ├── DatalogEngine         ← symbolic rules
        ├── ModalLogicEngine     ← epistemic/doxastic/deontic
        ├── DiagnosticOrchestrator
        └── NeuroSymbolicBridge
```

**The problem being solved:** Python heavy-weights (memory_matrix, FAISS, embeddings) can grow to 5 GB+ without PM2 noticing. A runaway child that escapes PM2's restart threshold would eat a potato PC or phone host.

## The Two Guards

### 1. `scripts/mem_guard.py` — Self RSS Watchdog (child process)

**File:** `scripts/mem_guard.py`
**Install:** `import mem_guard; mem_guard.install(label='cognitive-spine', limit_mb=1500, interval_s=15)`

Every Python cognitive service calls `mem_guard.install()` at startup. A daemon thread:

1. Reads its **own process RSS** every N seconds
2. Requires **2 consecutive breaches** before exiting (transient spikes don't bounce)
3. Calls `os._exit(0)` — not `sys.exit()` — to force-exit without cleanup handlers that could hang

**Env vars:**
- `COGNITIVE_MEM_LIMIT_MB` — per-service ceiling (default: 1500 MB for spine)
- `COGNITIVE_MEM_INTERVAL_S` — check interval (default: 15 s)
- `PURPCLAW_MEM_GUARD=0` — globally disable

**Cross-platform RSS (no third-party deps):**
1. `psutil.Process().memory_info().rss` (if installed)
2. Windows `ctypes.kernel32.GetProcessMemoryInfo` via `WorkingSetSize`
3. Linux `/proc/self/statm` (resident pages × page size)
4. POSIX `resource.getrusage(RUSAGE_SELF).ru_maxrss`

### 2. `lib/child-registry.js` — Child Process Tracker (parent process)

**File:** `lib/child-registry.js`

Every spawn in PURPCLAW goes through `trackedSpawn()`, never raw `spawn()` or `exec()`:

- **No detached processes** — `detached: false` enforced; long-lived daemons go to PM2
- **Hard timeouts** — default 60 s for shells, 5 min for training jobs
- **SIGTERM → 2s grace → SIGKILL** — on SIGINT, SIGTERM, `beforeExit`, `uncaughtException`
- **`windowsHide: true`** — no pop-up console windows
- **`shell: false`** — DEP0190 security, no shell injection

```js
const { trackedSpawn, list: listChildren } = require('../lib/child-registry');
const child = trackedSpawn('python', ['cognitive_spine.py'], { tag: 'spine', timeoutMs: 0 });
// listChildren() returns all tracked PIDs with age, tag, killed status
```

### 3. Memory Retention (`scripts/memory-retention.js`)

A separate JS file (not `mem_guard`) that runs on a cron schedule:
- Scans `agent_work/memory/` directories
- Removes orphaned `.json` session files older than N days
- Prunes FAISS index entries pointing to deleted vectors
- Writes `_prune_old.log` with before/after sizes

Triggered by: **cron job** (every 6 hours) or `purpclaw dream` manual trigger.

## Startup Sequence

```
1. cognitive_gateway.js starts (PM2)
2.   spawns child process: python cognitive_spine.py
3.     cognitive_spine.py imports mem_guard
4.       mem_guard.install() arms a daemon watchdog thread
5.     spine.starts: MemoryMatrixV2, DatalogEngine, ModalLogicEngine, etc.
6.     spine.starts: _health_refresher background thread (30s cache TTL)
7.       _health_refresher publishes /health every 30s
8.   cognitive_gateway.js registers spine routes
9.   purpclaw spine status ← shows real-time health snapshot
```

## `purpclaw spine status`

```
purpclaw spine status        # pretty print
purpclaw spine status --json # machine-readable
```

Shows:
- **Spine online/PID/uptime** — from GET /health (30s cache)
- **Memory guard** — armed status, limit MB, interval
- **Index sizes** — entries, vector index, FAISS index
- **Child processes** — tracked PIDs, age, killed flag
- **Spine services** — memory, rules, modal, diagnostics, neuro, autodream, realtime, spring

## What "Self-Healing" Means

| Failure | Response |
|---|---|
| Spine RSS > 1500 MB × 2 (30s) | `os._exit(0)` → PM2 restarts spine |
| Spine child crashes | `child-registry` SIGTERM/SIGKILL cleanup |
| Orphaned child process | `child-registry` kills all on parent exit |
| Session file leak (old runs) | `memory-retention.js` cron prunes `agent_work/` |
| Vector index bloat | FAISS index rebuilt during retention sweep |
| CPU overload | `ReuseThreadingServer` caps at 48 workers, 1024-queue |

## Key Files

| File | Role |
|---|---|
| `cognitive_spine.py` | Python HTTP surface — all cognitive services |
| `scripts/mem_guard.py` | Self-RSS watchdog daemon (no deps) |
| `lib/child-registry.js` | All-spawns tracker, hard timeout, signal cleanup |
| `scripts/memory-retention.js` | Session/index retention sweep, cron-triggered |
| `bin/purpclaw.js` → `cmdSpineStatus()` | CLI entry: `purpclaw spine status` |
| `lib/spine/session-store.js` | Spine-specific session persistence |

## Env Overrides

```bash
COGNITIVE_MEM_LIMIT_MB=1500    # spine RSS ceiling
COGNITIVE_MEM_INTERVAL_S=15     # watchdog check interval
PURPCLAW_MEM_GUARD=0           # disable mem_guard globally
```
