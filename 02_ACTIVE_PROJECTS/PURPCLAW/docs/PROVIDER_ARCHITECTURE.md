# PURPCLAW Provider Architecture

> MiniMax M3 is your primary command brain.
> NVIDIA NIM powers the worker swarm.
> PURPCLAW routes jobs to the right model, gathers the results, and brings the answer back into one session.

---

## The Brain Stack

PURPCLAW runs a **two-plane architecture**:

### Control Plane — MiniMax M3 Native

The **primary chat controller**. You talk to this. It never changes.

```
provider:  minimax-native (api.minimax.io)
model:    MiniMax-M3
role:     primary-chat, planner, delegator, tool_caller, final_synthesizer
```

Everything the user sends goes here first. MiniMax M3 decides:
- What the user is asking for
- Whether to handle it directly or delegate to a worker
- How to split complex jobs into parallel tasks
- How to synthesize worker results back into a response

This is the **commander brain**. It owns the session, the memory, and the final word.

---

### Worker Plane — NVIDIA NIM

Workers are **sharp tools invoked by the commander**. They don't own the session. They receive job tickets, do specialized work, and hand results back.

```
provider:  nvidia-nim (integrate.api.nvidia.com)
key:      NVIDIA_NIM_API_KEY
```

Worker lanes:

| Lane | Model (via NIM) | Role | Used when |
|------|----------------|------|----------|
| `backend` | DeepSeek V4 Pro | backend_worker | API, server, database, Rust, Go, SQL |
| `frontend` | DeepSeek V4 Pro | frontend_worker | UI, React, CSS, Three.js components |
| `fast` | DeepSeek Flash | fast_worker | Quick patches, formatting, cheap jobs |
| `swarm` | Kimi K2.6 | swarm_worker | Multi-agent coordination, parallel fan-out |
| `review` | DeepSeek V4 Pro | review_worker | Security audit, logic review, architecture critique |

---

## How a Request Flows

```
User message
    │
    ▼
MiniMax M3 native (control plane)
    │
    ├─ "write a function"        → handles directly (primary chat)
    │
    ├─ "build a full API"        → plans + delegates to backend lane
    │                               DeepSeek V4 Pro via NIM
    │                               returns code artifact
    │
    ├─ "coordinate 5 agents"     → delegates to swarm lane
    │                               Kimi K2.6 via NIM
    │                               coordinates parallel workers
    │                               returns synthesis
    │
    └─ "audit this for security" → delegates to review lane
                                    DeepSeek V4 Pro via NIM
                                    returns vulnerability report
    │
    ▼
MiniMax M3 native (final synthesis)
    │
    ▼
User response (one session, one answer)
```

---

## Provider Status States

| State | Meaning | Action |
|-------|---------|--------|
| `missing` | No key / env var not set | Configure it |
| `configured` | Key found in env | Not yet tested |
| `verified` | Test call passed | Ready to use |
| `auth_failed` | Key rejected (401/403) | Fix the key |
| `local_unavailable` | Local service not running | Start the service |
| `available` | Free/local option exists | Ready |

> **Never show "ready" when the key hasn't been tested.** A 401 after showing "ready" is a tiny UI lie that becomes a big debugging pain.

---

## Environment Variables

```
# Primary controller — NEVER point to NIM
MINIMAX_API_KEY          MiniMax native API key
MINIMAX_BASE_URL         https://api.minimax.io/v1  (default)
MINIMAX_MODEL            MiniMax-M3  (default)

# Worker gateway — NVIDIA NIM for specialist models
NVIDIA_NIM_API_KEY      NVIDIA NIM API key
NVIDIA_NIM_BASE_URL      https://integrate.api.nvidia.com/v1  (default)

# Per-model overrides (optional)
DEEPSEEK_API_KEY         DeepSeek direct (not via NIM)
KIMI_API_KEY             Kimi/Moonshot direct
```

---

## Configuration

Config file: `~/.purpclaw/brain-stack.json`

```json
{
  "controller": {
    "provider": "minimax-native",
    "model":    "MiniMax-M3",
    "role":     "primary-chat"
  },
  "workerGateway": {
    "provider":  "nvidia-nim",
    "apiKeyEnv": "NVIDIA_NIM_API_KEY",
    "enabled":   true
  },
  "lanes": {
    "backend":  { "provider": "nvidia-nim", "model": "deepseek-ai/deepseek-v4-pro", "enabled": true },
    "frontend": { "provider": "nvidia-nim", "model": "deepseek-ai/deepseek-v4-pro", "enabled": true },
    "fast":     { "provider": "nvidia-nim", "model": "deepseek-ai/deepseek-v4-flash", "enabled": true },
    "swarm":    { "provider": "nvidia-nim", "model": "moonshotai/kimi-k2.6",         "enabled": true },
    "review":   { "provider": "nvidia-nim", "model": "deepseek-ai/deepseek-v4-pro", "enabled": true }
  }
}
```

---

## Provider Status CLI

```bash
purpclaw providers status    # show all providers + states
purpclaw providers verify     # test API connection for a provider
purpclaw providers roles      # show provider roles
```

---

## Routing Rules

| Task type | Lane | Via |
|-----------|------|-----|
| General chat, quick answers | controller (MiniMax M3) | minimax-native |
| Backend, API, server, database | `backend` | nvidia-nim / DeepSeek V4 Pro |
| Frontend, UI, components | `frontend` | nvidia-nim / DeepSeek V4 Pro |
| Quick patches, formatting | `fast` | nvidia-nim / DeepSeek Flash |
| Multi-agent, swarm, parallel | `swarm` | nvidia-nim / Kimi K2.6 |
| Security audit, code review | `review` | nvidia-nim / DeepSeek V4 Pro |
| Complex multi-step reasoning | controller | MiniMax M3 |

---

## Fallback Behaviour

```
Worker lane fails → route back to MiniMax M3 controller
NIM gateway down  → disable worker lanes, keep primary chat working
Controller down   → FAIL clearly. Swarm cannot substitute as the boss.
```

---

## What This Is NOT

- **NOT a flat provider picker** — DeepSeek is not a chatbot option
- **NOT equal providers** — MiniMax M3 is the boss, workers are tools
- **NOT a free-for-all** — NIM models are invoked by the controller, not the user
- **NOT a chatbot selector** — PURPCLAW is a delegation machine

---

## Provider Role Summary

```
minimax-native     primary-chat      primary command brain — you talk to this
nvidia-nim        worker-gateway    gateway for specialist models
deepseek-nim      backend_worker   backend, API, architecture, review
minimax-nim       frontend_worker  frontend, UI, creative tasks
kimi-nim          swarm_worker    multi-agent coordination
flash             fast_worker     quick patches and cheap jobs
```
