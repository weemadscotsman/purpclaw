# Delegation Routing

> You → MiniMax M3 native → planner/delegator → NIM worker models → MiniMax M3 synthesis → You

---

## The Delegation Loop

PURPCLAW's delegation engine is the layer between a user message and a model response.

### Step 1 — Receive

User sends a message. It arrives at the **control plane** (MiniMax M3 native).

### Step 2 — Classify

MiniMax M3 reads the message and classifies what kind of work it is:

- **Primary work** — handles it directly (general chat, planning, tool orchestration)
- **Specialist work** — splits into job tickets and dispatches to worker lanes
- **Synthesis work** — coordinates multiple workers and composes a final answer

### Step 3 — Dispatch (optional)

If the task matches a worker lane, MiniMax M3 sends a job ticket:

```
TO: backend_worker (DeepSeek V4 Pro via NIM)
TASK: Implement a REST API for user authentication
CONTEXT: [session history, related files]
RETURN: [code artifact, explanation]
```

### Step 4 — Gather

Worker completes and returns its artifact. If multiple workers ran in parallel, PURPCLAW gathers all results.

### Step 5 — Synthesize

MiniMax M3 receives worker results and composes the final response. The user gets one answer — they don't see the delegation internals.

---

## Lane Routing Rules

Each worker lane has keyword triggers. Keywords are OR-matched against the message.

### backend

**Model:** DeepSeek V4 Pro via NVIDIA NIM

**Keywords:**
```
api, server, backend, database, sql, rust, golang,
microservice, endpoint, rest, graphql, grpc,
authentication, authorization, middleware, worker, queue
```

**Examples:**
- "implement a user authentication API"
- "add a message queue to the worker service"
- "design a database schema for the inventory system"

### frontend

**Model:** DeepSeek V4 Pro via NVIDIA NIM

**Keywords:**
```
ui, frontend, component, react, vue, css, threejs,
canvas, animation, layout, page, dashboard, form,
button, modal, navigation, theme, styling
```

**Examples:**
- "build a login form with validation"
- "add a 3D product viewer with Three.js"
- "redesign the settings page"

### fast

**Model:** DeepSeek Flash via NVIDIA NIM

**Keywords:**
```
fix, patch, format, lint, tiny, quick, small, simple,
typo, spelling, css override, one-liner, hotfix
```

**Examples:**
- "fix the typo in the footer"
- "format this code with prettier"
- "change the button color to blue"

### swarm

**Model:** Kimi K2.6 via NVIDIA NIM

**Keywords:**
```
swarm, multi-agent, parallel, orchestrate, coordinate,
fan-out, delegation, split this into jobs, run agents,
dispatch to workers, parallel execution
```

**Examples:**
- "analyze this entire repo in parallel with 5 agents"
- "split this refactor into 10 parallel tasks"
- "run a team of 3 agents on this architecture problem"

### review

**Model:** DeepSeek V4 Pro via NVIDIA NIM

**Keywords:**
```
review, audit, security, critique, analyze, assess,
vulnerability, bug, risk, quality, performance,
compare to best practice, check for issues
```

**Examples:**
- "audit this code for security vulnerabilities"
- "review the API design for performance issues"
- "check if this follows best practices"

---

## Fallback Chains

Each lane has a fallback chain. If the primary model fails (429 rate limit, 500 error, timeout), the next model in the chain is tried.

```
backend:  deepseek-v4-pro → deepseek-v4-flash → minimax-m3
frontend: deepseek-v4-pro → deepseek-v4-flash → minimax-m3
fast:     deepseek-v4-flash → minimax-m3
swarm:    kimi-k2.6 → minimax-m3 → deepseek-v4-flash
review:   deepseek-v4-pro → minimax-m3 → kimi-k2.6
```

If all workers in a lane fail → route back to the controller (MiniMax M3).

---

## Controller Unavailable — Fail Hard

If MiniMax M3 is down, PURPCLAW does **not** let a worker pretend to be the boss.

```
✗ Controller down
✗ PURPCLAW does not route to a worker instead
✗ Swarm cannot self-coordinate without a commander
✓ System reports: "Primary brain unavailable"
```

This is a deliberate design choice. The delegation machine needs a boss. Without one, it wanders.

---

## Testing the Router

```bash
# Test routing for a message
purpclaw route "build a React login form"
purpclaw route "audit this code for SQL injection"

# Test routing to a specific lane
purpclaw route --lane backend "implement user authentication"
purpclaw route --lane swarm "split this into 5 parallel agent jobs"

# Verbose — show full routing decision
purpclaw route -v "design a microservice architecture"
```

Expected output:
```
CONTROLLER:  minimax-native / MiniMax-M3
  lane:      default
  reason:    primary chat, planning, delegation

SUGGESTED WORKER: backend
  provider:  nvidia-nim
  model:     deepseek-ai/deepseek-v4-pro
  role:      backend_worker
  reason:    matched 'backend' (score 3): backend, API, server, database
```

---

## Implementation

- **Lane routing:** `lib/core/deployment-config.js` — `routeToLane()`, `explainRouting()`
- **Keyword scoring:** keyword → lane matching with score counting
- **CLI command:** `bin/purpclaw.js` — `cmdRoute` function
- **Work engine integration:** `lib/core/work-engine.js` — `chat()` wraps model-router automatically

---

## What Gets Logged

Every delegation decision is logged with:
- Message (first 100 chars)
- Detected lane
- Controller / worker used
- Fallback chain if applicable
- Result (success / failed / fallback used)
