# PURPCLAW vs ChatGPT App + Codex CLI: Full Ability Parity Map

## Sources
- **Codex CLI**: `github.com/openai/codex` — `codex-rs/` (Rust core, AGENTS.md, memory pipeline, tools crate, skills system, protocol)
- **ChatGPT App**: ChatGPT Plus/Pro — memory, voice, vision, GPTs, Agents, Canvas, Browse, Multi-modal
- **PurpClaw**: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/` — 77 lib modules, 38 command modules, 78 tools, 399 skills, 22 services, 17 providers

---

## CODEX CLI — What It Actually Does

### Architecture
- Rust-based local CLI (`codex-rs/`)
- Session/Task/Turn protocol — one task at a time per session
- Submissions queue (SQ) / Events queue (EQ) — async message-passing
- Supports VS Code, Cursor, Windsurf IDE extensions
- Also ships as standalone CLI: `codex` or `codex app` for desktop

### Core Tools (codex-tools crate)
```
Shell (bash/cmd/powershell) — sandboxed, controlled by policy
File operations — read/write/edit within workspace roots
Apply patch — structured single-file patch tool
Web search — browse web for research
Image generation — DALL-E image generation
Code interpreter — code execution (Python)
```

### Execution Sandboxing
- **Linux**: bubblewrap (bwrap) for user namespaces + filesystem isolation
- **macOS**: sandbox-exec (Seatbelt profiles) — writes under configured writable roots, keeps .git read-only
- **Windows**: restricted-token backend, elevated sandbox for split-filesystem policies
- Policies: `read_only`, `workspace_write`, `danger_full_access`, or custom `SandboxPolicy`
- `CODEX_SANDBOX_NETWORK_DISABLED=1` for network-less execution
- WSL2 supported; WSL1 not supported for sandboxing

### Memory System (Phase 1 + Phase 2)
- **Phase 1**: Extract structured memory from eligible rollouts (session not ephemeral, not sub-agent, within age window)
  - Runs in parallel with concurrency cap
  - Produces: `raw_memory`, `rollout_summary`, `rollout_slug`
  - DB-backed, leased/claimed to prevent duplicate work
- **Phase 2**: Global consolidation — one worker at a time (global lock)
  - Syncs `raw_memories.md` + `rollout_summaries/` under `~/.codex/memories/`
  - Runs a consolidation sub-agent with no approvals, no network, local write only
  - Produces `phase2_workspace_diff.md`
  - Git-baselined memory workspace
- Triggered on root session start

### Skills System
- `.codex/skills/` — SKILL.md + agents/openai.yaml + scripts/ + references/
- Curated skills from `github.com/openai/skills/tree/main/skills/.curated`
- System skills preinstalled (`.system/`)
- Experimental skills (`.experimental/`)
- Scripts: `list-skills.py`, `install-skill-from-github.py`
- Skill format: SKILL.md (instructions) + agents/ (agent configs) + references/ + scripts/

### Config / Policy
- `~/.codex/config.toml` — JSON Schema validated
- `~/.codex/requirements.toml` — project-level dependencies, allow_managed_hooks_only flag
- Lifecycle hooks: user/project/session hooks
- `allow_managed_hooks_only = true` — admin-locked hooks
- Execution policies: `execpolicy/` — custom permission boundaries
- Environments: `.codex/environments/environment.toml`

### Agent Orchestration
- Orchestrator template: sub-agent parallelization for multi-step tasks
- Plans before acting (complex tasks only)
- Budget limit goals: `goals/budget_limit.md` — stops when cost/time limit hit
- Continuation goals: `goals/continuation.md` — resume from checkpoint
- Review rubric: `review/rubric.md` — code review quality standards
- Approval policies: `on_request`, `unless_trusted`, `never`
- Collaboration templates: `pair_programming.md`, `plan.md`, `execute.md`

### Key Differentiators (Codex)
- Apply patch tool (structured single-file patch, not raw edit)
- Phase 2 consolidation agent runs in pure isolation (no network, local writes only)
- IDE-first: VS Code + Cursor + Windsurf native extensions
- Seatbelt/bubblewrap first-class filesystem sandboxing
- Memory git-baselined with workspace diffs
- Agent coordination via orchestrator template with parallel sub-agents
- Protocol v1: SQ/EQ async message-passing architecture
- Skills: curated marketplace with install scripts
- Code review skills: breaking-changes, context, change-size, testing
- Slash commands: `/ask`, `/shell`, `/skills`, etc.

---

## CHATGPT APP — What It Actually Does

### Memory
- **Persistent memory**: learns from conversations over time, referenced in future sessions
- **Project memory**: custom instructions per project/GPT
- **Memory controls**: you can view, edit, delete memory items
- **Instructions**: system-level instructions + per-conversation

### Voice / Audio
- Advanced Voice Mode with real-time conversation
- Audio input + output
- Accent/voice customization
- Background conversation support

### Vision
- Screenshot sharing
- Image analysis
- Camera capture (mobile)
- Screen reading via camera

### GPTs / Agents
- Custom-prompt GPTs with instructions
- Published to GPT store
- Actions (API integrations)
- File upload (context window)
- Canvas: interactive coding environment for GPT-4o

### Browse / Research
- Web browse with citations
- Inline citation linking
- "Deep research" agent: autonomous multi-source research
- Reference lookup

### Multi-Modal
- Image generation (DALL-E)
- Document parsing (PDF, DOCX)
- Code execution (Python in Canvas)
- Screen capture analysis
- Voice conversation

### Multi-Agent (ChatGPT Team/Enterprise)
- Multiple agents can work in parallel
- Canvas collaboration
- Shared project context
- Agent delegation

---

## PURPCLAW — What's Already There

### Execution
| Feature | Codex CLI | ChatGPT App | PurpClaw | Status |
|---|---|---|---|---|
| Shell execution | bubblewrap/seatbelt sandbox | N/A (cloud) | `lib/tools-pc.js` (Windows shell) | ✅ Partial |
| Apply patch tool | ✅ | N/A | `lib/apply-patch.js` | ✅ Done |
| Code interpreter | ✅ Python | ✅ Canvas | ❌ | **GAP** |
| Docker sandbox | Via exec-server | N/A | ❌ | **GAP** |
| SSH remote exec | Via exec-server | N/A | `lib/workers/ssh-worker.js` | ✅ Done |
| Execution policy/approval | ✅ execpolicy | N/A | `lib/exec-policy.js` | ✅ Done |
| Sandboxed filesystem | ✅ (bwrap/seatbelt) | N/A | ❌ | **GAP** |
| Non-interactive mode | ✅ | N/A | Partial (CLI flags) | ⚠️ Partial |

### Memory
| Feature | Codex CLI | ChatGPT App | PurpClaw | Status |
|---|---|---|---|---|
| Session memory | Phase 1 rollout extraction | Persistent memory | `lib/memory-client.js`, `canonical-memory-sync.js` | ⚠️ Partial |
| Global consolidation | Phase 2 agent | Global memory | `lib/idle-engine.js` (6-phase) | ⚠️ Partial |
| Memory git-baselined | ✅ | N/A | ❌ | **GAP** |
| Memory workspace diffs | ✅ | N/A | ❌ | **GAP** |
| Per-project memory | Via session | GPT project context | `lib/context-packet.js` | ⚠️ Partial |
| Memory pruning/retention | ✅ age window + usage | ✅ | `lib/memory-retention.js` | ⚠️ Partial |
| Rollout summaries | ✅ | N/A | `lib/training-buffer.js` | ✅ Done |

### Tools
| Feature | Codex CLI | ChatGPT App | PurpClaw | Status |
|---|---|---|---|---|
| Shell | ✅ sandboxed | N/A | ✅ 78 tools | ✅ |
| File read/write/edit | ✅ | ✅ | ✅ | ✅ |
| Web search/browse | ✅ | ✅ | ✅ (browser tool) | ✅ |
| Image generation | ✅ DALL-E | ✅ DALL-E | ✅ `lib/imagegen/gateway.js` | ✅ |
| Code interpreter | ✅ Python | ✅ Canvas | ❌ | **GAP** |
| Apply patch | ✅ | N/A | ✅ `lib/apply-patch.js` | ✅ Done |
| Skill system | ✅ marketplace | ✅ GPTs | ✅ 399 skills | ✅ |
| MCP tools | ✅ | ✅ | ✅ `lib/mcp.js` + MCP client | ✅ |
| Tool alias resolution | N/A | N/A | ❌ (broken: delegate_task/spawn_agent don't resolve) | **BUG** |
| Tool schema strictness | ✅ strict schemas | ✅ | ❌ | **GAP** |

### Agent / Orchestration
| Feature | Codex CLI | ChatGPT App | PurpClaw | Status |
|---|---|---|---|---|
| Sub-agent spawn | ✅ orchestrator template | ✅ | ✅ `lib/agent-registry.js`, `agent_tower.js` (35 agents) | ✅ |
| Parallel agents | ✅ | ✅ | ✅ | ⚠️ Partial (session-store LRU 128) |
| Agent approval flow | ✅ approval policies | ✅ | ✅ `lib/approval-queue.js` | ✅ |
| Budget/goals | ✅ budget_limit | ✅ | `lib/gate-pipeline.js` | ⚠️ Partial |
| Continuation/checkpoint | ✅ continuation goal | ✅ session resume | `lib/checkpoint-manager.mjs`, `session-store.js` | ⚠️ Partial |
| Code review agent | ✅ skill | ✅ | ✅ `lib/commands/code-review.js` | ✅ |
| Multi-turn loop | ✅ Session/Task/Turn | ✅ | ✅ `lib/agent-loop.js` | ✅ |
| Background mode | N/A | ✅ | ⚠️ `cronjob` (fire-and-forget) | ⚠️ Partial |
| Webhook callbacks | ✅ | ✅ | ❌ | **GAP** |

### Config / Policy
| Feature | Codex CLI | ChatGPT App | PurpClaw | Status |
|---|---|---|---|---|
| Config file | `~/.codex/config.toml` | ChatGPT settings | `lib/config.js`, `.env` | ⚠️ Fragmented |
| Execution policy | `execpolicy/*.md` | N/A | `lib/exec-policy.js` | ✅ Done |
| Approval policies | `on_request`, `unless_trusted`, `never` | Per-GPT | `lib/approval-queue.js` | ✅ Done |
| Managed hooks only | ✅ `allow_managed_hooks_only` | N/A | ❌ | **GAP** |
| Lifecycle hooks | ✅ user/project/session | N/A | ❌ | **GAP** |
| Workspace roots | ✅ configured writable roots | N/A | `lib/workspace-awareness.js` | ⚠️ Partial |
| Requirements.toml | ✅ project deps | N/A | ❌ | **GAP** |

### Skills / Extensions
| Feature | Codex CLI | ChatGPT App | PurpClaw | Status |
|---|---|---|---|---|
| Skill format | SKILL.md + agents/ + scripts/ | GPT instructions | 399 skills `skills/*/SKILL.md` | ✅ |
| Skill marketplace | `github.com/openai/skills` | GPT Store | `skills-hub` + manual | ⚠️ Partial |
| Skill install script | ✅ list + install scripts | N/A | ❌ | **GAP** |
| Experimental skills | ✅ `.experimental/` | N/A | ❌ | **GAP** |
| Skill agent configs | `agents/openai.yaml` | N/A | `agent_tower.js` personas | ⚠️ Different shape |
| Skill references/notes | ✅ references/ | N/A | `references/` per skill | ✅ |

### Infrastructure
| Feature | Codex CLI | ChatGPT App | PurpClaw | Status |
|---|---|---|---|---|
| Multi-provider | N/A (OpenAI only) | N/A | ✅ 17 providers | ✅ |
| Spend governance | N/A | N/A | ✅ `lib/spend-gate.js` | ✅ |
| Secret vault | N/A | N/A | ✅ `lib/pocket-vault.js` | ✅ |
| Local-first | ✅ | ❌ | ✅ | ✅ |
| Self-improvement | N/A | N/A | ✅ `lib/idle-engine.js` | ✅ |
| Training buffer | N/A | N/A | ✅ `lib/training-buffer.js` | ✅ |
| Telemetry/metrics | ✅ OpenTelemetry | N/A | ✅ `metrics_aggregator.js` | ✅ |
| Event bus | N/A | N/A | ✅ `unified_eventbus.js` | ✅ |
| Standby services | N/A | N/A | ✅ `lib/capability-registry.js` | ✅ |

---

## TOP PARITY GAPS — Priority Order

### P0 — Must Fix
1. **Tool alias resolution broken**: `delegate_task`/`spawn_agent`/`agent_spawn` in `lib/tools/index.js` don't resolve to the actual `spawn` tool. Blocks sub-agent delegation.
2. **Streaming SpendGate bypass**: `streamChat()` in `lib/llm-provider.js` doesn't check budget before streaming. Financial risk.
3. **Code interpreter**: Codex has Python REPL; ChatGPT Canvas has Python. PurpClaw has no code execution backend.
4. **Memory workspace git-baseline**: Codex Phase 2 git-baselines its memory workspace. PurpClaw's idle engine doesn't produce git-digestible diffs.
5. **Tool schema strictness**: Codex enforces strict tool schemas. PurpClaw's tools use loose JSON parsing for tool calls.

### P1 — Should Have
6. **Docker sandbox execution**: Codex uses exec-server + Docker for remote/container execution. PurpClaw has SSH worker but no container isolation.
7. **Structured patch tool**: Codex `apply_patch` is purpose-built for single-file patches. PurpClaw's `apply-patch.js` exists but isn't wired as a first-class tool.
8. **Managed hooks lock**: Codex `allow_managed_hooks_only` in requirements.toml. PurpClaw has no equivalent project-level hook lock.
9. **Skill install scripts**: Codex has `list-skills.py` + `install-skill-from-github.py`. PurpClaw's skills-hub is manual.
10. **Lifecycle hooks**: User/project/session hooks in Codex config. PurpClaw has no hook system.

### P2 — Differentiate
11. **WebSocket streaming**: ChatGPT and Codex support WebSocket mode for real-time. PurpClaw's SSE is solid but no WebSocket fallback.
12. **Memory read path citation**: Codex memory system includes citation parsing + developer instruction injection. PurpClaw has retrieval but no citation tracking.
13. **Project requirements.toml**: Codex project-scoped dependency management. PurpClaw has `.env` + ecosystem config but no per-project dependency manifest.
14. **Collaboration mode**: Codex has `pair_programming.md`, `plan.md`, `execute.md` collaboration templates. PurpClaw has no collaboration surface.
15. **Auto-memory in sessions**: ChatGPT auto-updates memory from sessions. PurpClaw requires explicit feedback loop.

---

## THE LEVEL-ABOVE: Where PurpClaw Already Wins

| Advantage | PurpClaw | How to Amplify |
|---|---|---|
| **17 providers** | Codex: OpenAI only. ChatGPT: OpenAI only. | `purpclaw provider add` wizard, model router with cost/latency routing |
| **Spend governance** | No competitor has this. | `purpclaw spend` CLI + real-time HUD in /mission |
| **Secret vault** | No competitor. | Encrypt-at-rest, `purpclaw vault` CLI |
| **399 skills** | Codex: ~12 skills. ChatGPT GPTs: ~100 public. | Skill evolution engine, auto-generation from rollouts |
| **Local-first sovereignty** | ChatGPT cloud-only. Codex: cloud-optional. | Emphasize zero-cloud-dependency, air-gapped operation |
| **Idle self-improvement** | No competitor. | `purpclaw idle status` — nightly evolution cycle |
| **Training buffer** | No competitor. | `purpclaw training export --personal` for LoRA fine-tuning |
| **Multi-gateway** | Codex: CLI only. ChatGPT: App only. | Telegram, Discord, Slack, Email — all wired to same brain |
| **MCP native** | Codex MCP. ChatGPT MCP. | Both can connect TO PurpClaw as MCP server |
| **35 agent personas** | Codex: 1 agent. ChatGPT: 1 agent. | Agent council voting, persona evolution |
| **Service mesh** | No competitor. | 22 services with standby lifecycle, health checks, dependency resolution |

---

## WHAT TO BUILD FIRST

### Sprint 1: Fix the P0 blockers (~2 hours)
1. Fix tool alias resolution in `lib/tools/index.js` — add alias map so `delegate_task` → `spawn`
2. Add SpendGate pre-check to `lib/llm-provider.js streamChat()`
3. Wire `apply-patch.js` as named tool in tool registry (not just a lib)
4. Add strict schema validation for tool calls in `lib/tool-runtime.js`

### Sprint 2: Parity surface (~2 hours)
5. Build `scripts/install-skill-from-github.js` — clone any GitHub skill to `skills/`
6. Add `lib/project-requirements.js` — `requirements.toml` equivalent per project
7. Add lifecycle hook runner in `lib/hooks-runtime.js`
8. Wire `lib/code-interpreter.js` stub → real Python REPL worker

### Sprint 3: Differentiate (~2 hours)
9. `purpclaw spend --live` HUD in /mission (real-time SpendGate viz)
10. `purpclaw vault` CLI + encrypt-at-rest reveal
11. Skill evolution: `purpclaw skills evolve --auto` from training buffer
12. Memory git-baseline: wire `lib/idle-engine.js` Phase 2 → git diff output
