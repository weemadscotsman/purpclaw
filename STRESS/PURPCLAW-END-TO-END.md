# PURPCLAW — End-to-End Description

**Author:** weemadscotsman (Eddie Cannon) · **Repo:** `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW` · **Status as of 2026-06-13:** 14 PM2 services up, 378 skills loaded, 73 agents spawnable, all native loops proven.

---

## What she is

PURPCLAW is a **local-first AI workstation OS**. The user gives it a prompt through `/api/chat` (or the Next.js shell at `localhost:3030`), the Provider Router picks an LLM, the Agent Tower runs that prompt through a real agent loop with **456 tools** (378 skills + 12 native + 60+ MCP), the Memory Spine stores the result, the SpendGate records cost, and a Cockpit at `/omni` shows what's running. Between prompts, the Idle Engine wakes up and runs its own evolution loop — harvesting training data, running 6 quality gates, consolidating memory, self-diagnosing.

She is **not** a chat wrapper. She's a self-running stack where the human is the operator, not the consumer. The doctrine: **gated, not gutted. real, not simulated. wired, not hidden. verified, not claimed.**

---

## The four layers

### Layer 1 — Provider Router (`lib/llm-provider.js`)
**What:** Single function-call entrypoint that resolves 17+ LLM providers (minimax, deepseek, openrouter, kimi, ollama, nvidia, together, mistral, anthropic, openai, huggingface, plus env-aliases) into OpenAI-compatible HTTP calls.

**How:** 3-place config — `.env` vars, `PROVIDERS` map (default baseUrl + model), `PROVIDER_ENV_ALIASES` (per-provider env keys). SpendGate caps live in `~/.purpclaw/pocket/spend-config.json` (user-config, NOT in repo): per-request, per-agent, per-provider caps. Streaming-consumer fallback in `unified_api.js:384,3463` if the provider returns empty.

**Currently routing:** `minimax` (`MiniMax-M2.7` via `api.minimax.io/v1`) for live chat, with a 1000 cap unblocking the previous test-blocked config.

### Layer 2 — Agent Tower (`lib/agent-loop.js`, `agent_tower.js`)
**What:** Spawns any of 73 agents (35 animals + 38 specialist personas from `agent-personas.js`), runs them through `runAgent` (the canonical loop), and dispatches tool calls back to the executor.

**How:** Every spawned agent pulls tools from the **same global registry** (`TOOLS.list()` → 456 entries). The system prompt is built by `buildSystemPrompt` which lists those tools. Function-calling is **native per provider** (native schemas for OpenAI/Anthropic, text-JSON for minimax/deepseek). Execution is `POLICY.guardedInvoke(TOOLS, …)` — every tool call is rate-limited, sandbox-checked, and audit-logged.

**Verified live:** the swarm E2E proved 12 real `agent-loop` tool calls (write/read) byte-exact through minimax. Every agent gets the full toolbox, no per-agent subsets.

### Layer 3 — Memory Spine (`memory_matrix_v2.py:7880`, `lib/memory-client.js`, `lib/memory-consistency.js`)
**What:** 7-layer cognitive model — long-term, mid-term, working, episodic, semantic, vector, counterfactual. Tracks per-atom provenance (uuid, source, confidence, decay, audit trail). FAISS 1.13.2 for vector similarity.

**How:** `lib/memory-client.js` is the JS shim; `memory_matrix_v2.py:7880` is the Python spine. Every agent call posts a memory atom; reads return ranked lists; consistency checks compare memory clients' views against the source of truth.

**Honest note:** Eddie's i7-2600K lacks AVX2, so `turbovec` (Rust SIMD) is parked — FAISS CPU path is the primary spine.

### Layer 4 — The 14 PM2 services (the runtime)
**All verified live as of this session:**

| Service | Port | Role |
|---|---:|---|
| `purpclaw-api` | 7778 | Unified API (the only port the user typically hits) |
| `purpclaw-orchestrator` | 7784 | High-level job dispatch |
| `purpclaw-tower` | 7790 | Agent spawn + runAgent loop |
| `purpclaw-pool` | 7794 | Worker pool for batched tasks |
| `purpclaw-state` | 7782 | Persistent state (KV + journal) |
| `purpclaw-eventbus` | 7780 | Pub/sub for cross-service events |
| `purpclaw-context` | 7792 | Context-packet assembly |
| `purpclaw-workers` | 7796 | Background workers |
| `purpclaw-gatekeeper` | 7786 | Operator-policy enforcement (auth, secrets, mutation gates) |
| `purpclaw-coordinator` | 7798 | Multi-agent coordination |
| `purpclaw-metrics` | 7783 | Token + latency + quality telemetry |
| `purpclaw-harness` | 7797 | Audit + test harness |
| `purpclaw-cognitive` | 7880 | Memory spine Python process |
| `purpclaw-nextjs` | 3030 | Web shell (the `/omni` cockpit) |

---

## The 456 tools (registry)

| Source | Count | Examples |
|---|---:|---|
| **Native tools** | 12 | `read`, `write`, `edit`, `shell`, `grep`, `git`, `spawn`, `web-fetch`, `code-search`, `csv`, `memory`, `skill` |
| **Hermes skills** | 378 | All of your `.hermes/skills/` library, registered as native tool adapters on api + tower boot |
| **MCP tools** | 60+ | `omni_truth_scan`, `omni_feature_registry`, `omni_patch_review`, `omni_provider_integrity`, `omni_cockpit_status`, `omni_feature_status` (6 OMNI tools) + 42 OmniCode repo-intelligence tools + 12 from OmniDoc/OmniData (donor MCPs) |

**Every agent — all 73 — gets all 456 tools.** The system prompt lists them; the function-calling surface uses the same list; the executor is a single `TOOLS.list()` call. No per-agent subsets. (The `AGENT_TOOLS` destructure in `agent_tower.js` is a leftover dead param that gets ignored; the loop pulls from the global registry instead.)

---

## The 73 agents (35 animals + 38 specialists)

**35 animals** (the "AGENT division" — researcher, coder, analyst etc.) are the original 3-letter-codename team: DRAGON, GOOSE, SCIENTIST, etc., grouped into 9 divisions (CREATIVE, ENGINEERING, INFRASTRUCTURE, INTELLIGENCE, MANAGEMENT, MEDIA_OPS, OPERATIONS, SCIENCE, SECURITY).

**38 specialist personas** are user-defined characters that ride the same `runAgent` loop. The 73-agent figure includes both.

**Spawn flow:** all agents go through the same `runAgent` loop, which:
1. Builds system prompt with `TOOLS.list()`
2. Calls the provider with `messages` + `canonicalTools` (the function-calling schema)
3. Streams tokens back, parsing tool calls as they arrive
4. Executes tool calls via `POLICY.guardedInvoke(TOOLS, …)`
5. Appends tool results, calls again until done
6. Persists the final message to memory as a new atom

---

## The 7-layer memory model (per the master thesis)

| Layer | Type | Where it lives |
|---|---|---|
| **Long-term** | Persistent atoms | `memory_matrix_v2.py` (Python spine) |
| **Mid-term** | Session-grouped | `purpclaw-state` + `lib/memory-consistency.js` |
| **Working** | Per-call context | In-process, the agent loop's `messages` array |
| **Episodic** | Time-stamped events | `eventbus` + `purpclaw-state` journal |
| **Semantic** | Embeddings + FAISS | `lib/cognitive-client.js` → spine |
| **Vector** | High-dim similarity | FAISS CPU index, parked for SIMD upgrade |
| **Counterfactual** | "What didn't happen but could have" | OMNI doctrine's `mem/consistency/decision-state` |

**Three ledgers** track everything: memory ledger (atoms), ratchet ledger (improvements), reliability ledger (failures + fixes).

---

## The 4 self-running loops (all proven working this session)

### Loop 1 — Self-audit / Bug-hunt (`bin/purpclaw bughunt`)
**Verified:** ran clean, 37 OK / 12 WARN / 0 FAIL. Catches syntax errors, port collisions, gatekeeper violations, spaghetti smells, and core service health. **`bughunt` found a real bug in itself** — `ping()` returned false for any 3xx redirect, so `/mission` (307) was flagged offline. Fixed centrally; now status-aware.

### Loop 2 — Auto-evolution (`lib/idle-engine.js`)
**Verified:** 175 cycles before, 176 after force-trigger. Pipeline runs: dataset export → 6 gate pipeline (Karpathy ratchet: regret, compilation, git diff, semantic variance, session quality, historical footprint) → memory consolidation → diagnostics → train-skip (correctly held off at 5 examples, gate works).

### Loop 3 — Swarm (proven earlier in this session)
**Verified:** 12 real tool calls through minimax, byte-exact. E2E spawn → message → tool call → tool result → response, all real.

### Loop 4 — Patch Governor + Provider Integrity (governance)
**`lib/omni/patch-governor.js`:** 6 rules auto-block unsafe patches (no-stub-on-registered-feature, no-auth-without-proof, tower-honesty-required, no-raw-secrets, no-mass-deletion, claimed-work-without-evidence) + 2 OMNICODE-backed rules (blast-radius, churn). Operator can override P0 with `--operator` flag.

**`lib/omni/provider-integrity.js`:** read-only diagnostic, 6 providers × 5 prompts × 3 paths = 90 probes per run, surfaces Provider Integrity Events to JSONL log. Never auto-routes (per master spec doctrine).

---

## The 6 OMNI-SURGEON MCP tools (just integrated this session)

| Tool | What |
|---|---|
| `omni_truth_scan` | Repo truth snapshot via OMNICODE MCP backend |
| `omni_feature_registry` | Classify every feature as active/partial/missing-wiring/failing/operator-disabled/legacy/external/planned. Never "dead." |
| `omni_feature_status` | Read current registry state, no rebuild |
| `omni_patch_review` | Review a candidate patch against doctrine + OMNICODE blast-radius |
| `omni_provider_integrity` | Run provider diagnostic probes |
| `omni_cockpit_status` | Combined truth + features + patch + providers in one call |

All 6 exposed via OmniCode MCP, all 6 verified live (`HTTP 200` through `localhost:3030/api/omni/*`). Rbac'd as read-only in both `read-only` and `agent` roles.

---

## The 4 user-facing surfaces

| Surface | URL | What |
|---|---|---|
| **Web shell** | `http://localhost:3030/` | The dashboard with all dashboards — `/omni` is the OMNI cockpit |
| **OMNI Cockpit** | `http://localhost:3030/omni` | Live truth snapshot, feature registry, patch review, provider integrity — auto-refreshes every 5s |
| **Unified API** | `http://localhost:3030/api/chat` (or 7778) | The single chat endpoint — picks provider, runs agent loop, streams response |
| **CLI** | `node bin/purpclaw.js <subcommand>` | Doctor, status, bughunt, bigboss, idle, evolve, tools, memory, jobs, etc. |

---

## The doctrine (encoded in `docs/AGENT.md` and `docs/LOOP.md`)

> **Gated, not gutted.** Real, not simulated. Wired, not hidden. Verified, not claimed.
>
> No deletion by confusion. No stubs as repairs. No feature amputation. No synthetic evidence. No raw secrets in docs, logs, patches, or summaries.

**Operator-gated actions** (always require Eddie's approval, never auto): Twilio send, Windows install, OMNI MCP reconnect, anything that touches the gatekeeper boundary.

---

## How a typical prompt flows

```
User types in /api/chat
   ↓
unified_api.js line 384
   ↓ picks provider (minimax by default)
   ↓ SpendGate checks budget
   ↓
lib/agent-loop.js runAgent
   ↓ buildSystemPrompt lists TOOLS.list() → 456 tools
   ↓ calls provider with messages + canonicalTools
   ↓ streams response
   ↓ parses tool calls
   ↓ POLICY.guardedInvoke(TOOLS, …)
   ↓ appends tool results
   ↓ loops until done
   ↓
Memory spine writes atom (uuid, source, confidence, decay)
   ↓
SpendGate records cost
   ↓
Provider Integrity Engine emits Provider Integrity Event
   ↓
Response streamed back to user
```

Between prompts, every ~30s of idle, the Idle Engine wakes, runs the 6-phase evolution cycle, gates the data, and waits for the next round.

---

## What's next

**Operator-gated queue (your call):**
- Verify `bigboss` (full-auto dispatcher) end-to-end
- Wire `internlm3-8B-Nex-N1` into the provider map as a local-first option (Q4 GGUF, ~5.5 GB, fits your 6 GB VRAM)
- Build a Nex coding-eval runner that dispatches 42 tasks through the agent tower
- Add the 24 `actionRequired: true` features from the OMNI registry to the active work queue

**Running tally this session:** 8+ commits of verified fixes, all 6 OMNI-SURGEON phases live, 6 OMNI tools via MCP, 4 self-loops proven, OMNICODE adapter integrated, patch governor with blast-radius, 73 agents with full toolbox.
