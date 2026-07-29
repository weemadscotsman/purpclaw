> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# PurpClaw vs ChatGPT App vs Codex CLI — Capability Audit

**Date**: 2026-07-29
**Source**: Official docs (learn.chatgpt.com, GitHub/openai/codex), truth-manifest.json, ROUTE_INDEX.md

---

## CHATGPT APP — Full Capability List

### Workflow Features
- **Projects & Chats** — organize conversations into projects with persistent context
- **Sites** — deploy static sites from chat
- **Visualizations** — generate charts and data viz from data
- **Scheduled Tasks** — cron-like scheduling of prompts
- **Long-running Work** — background tasks with notification on completion
- **Notifications** — push notifications for completed work
- **Pets** — animated Codex pet companion (Codey etc.)
- **Codex Micro** — physical desktop dial/agent-keys controller for 6 parallel chats

### Capabilities (what it CAN do)
- **Browser** — built-in isolated Chromium profile, opens URLs, interacts with sites, screenshot feedback
- **Computer Use** — operates the built-in browser: click, type, inspect DOM, take screenshots, verify results. Requires Plugins Directory + "Computer Use" plugin installed
- **Voice** — real-time voice conversation
- **Plugins** — extend via plugin directory (e.g. Computer Use, RAG integrations)
- **Web Search** — live search for current context
- **Image Generation** — DALL-E integration
- **Image Inputs** — upload screenshots, photos, diagrams for analysis
- **Appshots** — capture and annotate app screenshots
- **Chrome Extension** — work in existing Chrome tab with your real browser profile
- **Work with Files** — upload and analyze files, generate downloadable outputs

### Models
- GPT-5.6 Sol (flagship), Terra (balanced), Luna (fast/cheap)
- Model selection is user-visible with capability comparison

---

## CODEX CLI — Full Capability List

### Installation
- `curl ... | sh` (macOS/Linux), PowerShell installer (Windows)
- npm: `npm install -g @openai/codex`
- Homebrew: `brew install --cask codex`
- GitHub releases (standalone binaries)

### Core Interaction
- **Interactive terminal loop** — `codex` opens a full-screen terminal UI
- **`/init`** — creates `AGENTS.md` in current directory with project-specific agent instructions (per-repo config that overrides defaults)
- **`/status`** — show current session config (model, directory, permissions)
- **`/permissions`** — interactive permission boundaries: sandbox scope, writable roots, allowed commands without asking
- **`/model`** — choose model + reasoning effort
- **`/review`** — inspect changes, find issues, code review of pending work
- **`codex exec -- "task"`** — non-interactive mode for CI/pipelines, exits with code

### Context & Input
- **`--image screenshot.png`** — attach visual context (error screenshots, diagrams, designs)
- **Paste images** into interactive composer
- **`--search "query"`** — switch to live web search mid-task (stays in transcript)
- **File search** — inspects local repository directly

### Multi-Agent
- **Subagents** — delegate focused work to specialized agents, results merge back into main session
- `codex cloud` — push current work to Codex cloud, browse active chats, apply result back locally

### Integrations
- **`codex mcp`** — interactive MCP server discovery, auth, and tool inspection
- **`codex completion`** — generate shell completions (bash/zsh/fish)
- **Shell command execution** — runs installed tools on the machine
- **Git utils** — inspect git state, commits, branches
- **File watcher** — watch for changes and trigger agent runs
- **CI/scripting** — `codex exec` for pipelines, `codex -- "task"` non-interactive
- **Cloud handoff** — `codex cloud` pushes work to hosted cloud agent

### Security & Sandboxing
- **Sandbox isolation** — linux-sandbox (bwrap/bubblewrap), seccomp policies
- **Process hardening** — process-hardening subsystem
- **Secrets management** — keyring-store integration (OS keychain)
- **Shell escalation** — privilege escalation flow for elevated commands
- **execpolicy** — per-command permission grants

### Backend Systems (from codex-rs source tree)
- `memories/` — memory layer
- `file-search/` — semantic file search
- `git-utils/` — git operations
- `hooks/` — lifecycle hooks
- `mcp-server/` / `rmcp-client/` — MCP protocol
- `code-mode/` — code editing/protocol
- `exec/` — command execution
- `collaboration-mode-templates/` — multi-user collaboration

---

## PURPCLAW — Current Capability List (verified from truth-manifest + ROUTE_INDEX)

### Numbers (as of 2026-07-28)
- **153 agents** registered, 7 proven strict-live
- **47 native tools**, 49 pc-tools, 513 total callable tools (incl. Hermes skills + MCP)
- **22 provider adapters**: openai, kimi, glm, minimax, groq, deepseek, nvidia, openrouter, together, mistral, huggingface, cloudflare, cohere, ollama, lmstudio, anthropic, gemini, custom, github-models, codex, codex-oauth, atomic-chat
- **7/7 memory layers** integrated: episodic, semantic, scratch, temporal, vector, procedural, counterfactual
- **249 CLI cases**, 296 API routes, 98% API-side parity, 96% CLI-side parity
- **655 receipts** in proof ledger (495 verified, 0 fake-greens)
- **24/24 smoke tests passing** across 15 layers
- **32 UI pages** in Mission Control WebUI

### Systems
- **Agent loop** — 7 modes: goal, plan, validate, execute, review, repair, prove
- **Self-evolution** — auto-evolve loop with mutation approval gate
- **Auto-train** — training buffer → LoRA fine-tuning pipeline (scripts/lora-train.py)
- **Abliterator** — statistical effect size measurement (Cohen's d=9.48 self-check)
- **Steering router** — dynamic multi-route routing (chat/agent/skill/swarm/research/job)
- **Job chain** — async job queuing with durable chain traces
- **Proof ledger** — every significant action produces a receipt
- **Swarm coordinator** — multi-agent orchestration
- **OmniCode MCP** — project-indexed code analysis (3478 files, 12123 symbols)
- **G0DM0D3 integration** — jailbreak完全的personality layer

### Tool Surface
- File: read, write, edit, delete, search, glob
- Terminal: spawn, exec, PTY session
- Web: fetch, browser automation
- Git: log, diff, commit, branch
- Agent: spawn subagent, delegate task
- Skill: invoke from 598-skill registry
- MCP: connect external tools
- Memory: recall, ingest, search across all 7 layers
- Provider: route, failover, benchmark
- Cognitive: abliterator, evolve, train, insight capture

### CLI Commands (sample)
`purpclaw ask`, `purpclaw tui`, `purpclaw doctor`, `purpclaw smoke`, `purpclaw status`, `purpclaw bughunt`, `purpclaw purpflow`, `purpclaw insight`, `purpclaw train`, `purpclaw agent`, `purpclaw profile`, `purpclaw api`, `purpclaw profile`, `purpclaw stack`, `purpclaw steer`, `purpclaw receipts`, `purpclaw watch`, `purpclaw flow`

---

## PARITY GAPS — What PurpClaw Needs

### 🔴 CRITICAL (missing core UX that Codex/ChatGPT have)

| Gap | Codex | ChatGPT App | PurpClaw | Fix |
|-----|-------|-------------|----------|-----|
| **AGENTS.md per-repo config** | `/init` creates AGENTS.md that overrides agent behavior per directory | Projects with context | AGENT.md is global; no per-directory override | Create `purpclaw init` that scaffolds AGENTS.md in current dir, and make agent_tower.js check CWD for AGENTS.md before falling back to SOUL.md |
| **Non-interactive exec mode** | `codex exec -- "fix bug"` with exit codes for CI | N/A | `purpclaw ask "fix"` is interactive by default; no `--yes`, no CI exit codes | Add `purpclaw exec -- "task"` with `--json` output flag and proper exit codes (0=success, 1=fail, 2=partial) |
| **`/permissions` interactive command** | `/permissions` shows sandbox + writable roots + allowed_cmds interactively | Permissions UI in settings | exec-policy exists but no interactive `/permissions` command | Add `purpclaw permissions` command that opens interactive permission config |
| **`--image` CLI flag** | `codex --image screenshot.png "explain"` | Image upload in chat | No native image attachment in CLI | Add `--image` flag to `purpclaw ask` that encodes and includes in prompt |
| **`--search` live web search** | `codex --search "Next.js release"` | Built-in web search | No `--search` flag | Add `--search` to `purpclaw ask` that routes to web search provider |

### 🟡 IMPORTANT (degraded UX without these)

| Gap | Codex | ChatGPT App | PurpClaw | Fix |
|-----|-------|-------------|----------|-----|
| **Subagent UX** | `codex: please delegate to a specialist for the auth code` | N/A | Has subagent support via lib but not natural-language delegated | Make subagent delegation a first-class UX: show subagent output inline, allow `@subagent name` mentions |
| **`/review` command** | `/review` code review for pending changes | N/A | Has `purpclaw review` but verify it's a real first-class command | Audit `purpclaw review` coverage — should review git diff, PR, or staged changes |
| **`codex mcp` interactive** | `codex mcp` lists + adds servers | Plugin directory UI | MCP connected but no `purpclaw mcp` interactive command | Add `purpclaw mcp list/add/remove` interactive command |
| **File watcher autorun** | Monitors files, triggers agent on change | N/A | Has file watcher lib but no "run on change" agent trigger | Add `purpclaw watch -- "task"` that watches files and re-triggers agent |
| **Shell completion** | `codex completion` generates bash/zsh completions | N/A | No completion subcommand | Add `purpclaw completion --shell=bash` |
| **Cloud handoff** | `codex cloud` to push/pull from cloud | N/A | No cloud handoff | Add `purpclaw cloud push/pull` to sync with remote PurpClaw cloud instance |
| **Secrets store** | keyring-store (OS keychain) | N/A | .env only | Add `purpclaw secret set/get` backed by OS credential store |
| **Per-repo session isolation** | Codex sessions scoped to repository | Projects | Global session store | Add `purpclaw session --project=.` scoping that isolates context per repo |

### 🟠 NICE TO HAVE ( polish)

| Gap | Codex | ChatGPT App | PurpClaw | Fix |
|-----|-------|-------------|----------|-----|
| **Sandbox hardening (bwrap)** | linux-sandbox, bwrap, seccomp | N/A | exec-policy (JS) but no OS-level sandbox | Evaluate bubblewrap integration for Linux sandbox isolation |
| **Reasoning effort dial** | `/model` shows reasoning effort slider | Model picker with effort | Provider routing but no reasoning effort exposure | Expose reasoning effort via `purpclaw model --effort=low/medium/high` |
| **Pets** | Codex pets (Codey) | Animated pets | No pet system | Map G0DM0D3 personality as the pet — already done, just needs UX surface |
| **Scheduled tasks** | N/A | Scheduled prompts | Cron jobs via Hermes | Expose `purpclaw schedule "task" --every=2h` as a PurpClaw-native command |
| **Notifications** | N/A | Push notifications | No native push | Wire to Telegram/Discord gateway for notifications |
| **Model comparison table** | N/A | GPT-5.6 Sol/Terra/Luna picker with benchmarks | Multi-provider but no model comparison UI | Add `purpclaw models --compare` that shows benchmark table across all providers |

---

## WHERE PURPCLAW IS ALREADY AHEAD

### Multi-Provider Routing (massive differentiator)
- **Codex**: Single OpenAI only (GPT-5.6 family)
- **ChatGPT App**: OpenAI models only
- **PurpClaw**: 22 adapters — any model from any provider. Can benchmark live, failover, cost-route. No competitor has this.

### Memory Architecture
- **Codex**: Basic `memories/` dir
- **ChatGPT App**: Per-project context
- **PurpClaw**: 7 full memory layers (episodic, semantic, scratch, temporal, vector, procedural, counterfactual) ALL integrated into the agent loop. Nothing comparable exists in either competitor.

### Self-Evolution & Auto-Train
- **Codex**: None
- **ChatGPT App**: None
- **PurpClaw**: auto-evolve loop with mutation approval gate + training buffer → LoRA pipeline. Can grow its own weights from session experience. This is a 2-3 year roadmap item for OpenAI.

### Statistical Abliterator
- **Codex**: None
- **ChatGPT App**: None
- **PurpClaw**: Abliterator measures effect size of any change (Cohen's d). Self-check PASS with d=9.48. No competitor has anything remotely like this for measuring AI improvement.

### Proof Ledger
- **Codex**: None
- **ChatGPT App**: None
- **PurpClaw**: 655 receipts, 495 verified, 0 fake-greens. Every significant action is auditable. Competitive product security story.

### Job Chains & Async Queuing
- **Codex**: No async job queuing (interactive only)
- **ChatGPT App**: Long-running work backgrounded but no explicit chain/queue
- **PurpClaw**: Job chain with durable traces, async queuing, failure pinpoint. Eddie specifically complained about bigboss job list timeouts — this is the fix.

### TUI
- **Codex**: Terminal-only (text UI)
- **ChatGPT App**: GUI desktop app
- **PurpClaw**: Full terminal cockpit TUI (`purpclaw tui`) + 32-page WebUI Mission Control. Both surfaces, not one or the other.

### Swarm / Multi-Agent
- **Codex**: Subagents (simple delegation)
- **ChatGPT App**: No multi-agent
- **PurpClaw**: Full swarm coordinator with multi-agent orchestration, 153 registered agents, 7 proven live agents. Built for multi-agent workloads.

### G0DM0D3 / Personality Layer
- **Codex**: Codex pets (pure cosmetic)
- **ChatGPT App**: Cosmetic pets
- **PurpClaw**: Full jailbreak完全的 personality system with 95 souls, 20 council profiles, 11 studio modes. The agent can adopt any persona, tone, or operating mode. This is a completely different capability class.

### Skill Registry
- **Codex**: Core plugins + skills
- **ChatGPT App**: Plugin directory
- **PurpClaw**: 598-skill registry with 47 native tools + 49 pc-tools + 513 total callable. Every skill is a reusable, documented, versioned capability. This is a full operating system worth of tools.

### Observability
- **Codex**: Basic
- **ChatGPT App**: Basic
- **PurpClaw**: Job chain traces, smoke tests (24/24 passing), parity audits (249 CLI cases, 296 API routes), receipt verification, spend governance. Built-in operational excellence.

---

## THE LEVEL-ABOVE STRATEGY

To take PurpClaw ABOVE Codex AND ChatGPT App, the order is:

### Phase 1 — Parity (match Codex/ChatGPT feature-for-feature)
1. `purpclaw init` + AGENTS.md per-repo config
2. `purpclaw exec --` non-interactive CI mode
3. `purpclaw permissions` interactive command
4. `purpclaw ask --image` flag
5. `purpclaw ask --search` flag
6. `purpclaw mcp` command
7. `purpclaw review` first-class command

### Phase 2 — Differentiate (things only PurpClaw can do)
8. Multi-provider model fan-out: `purpclaw ask -- "fix auth" --provider=auto --benchmark` (runs same task across 3 providers, returns best result)
9. Proof ledger UI in Mission Control (show receipts as audit trail)
10. Abliterator panel (measure effect size of any change live)
11. Training buffer → LoRA pipeline surfaced in CLI: `purpclaw train --from-sessions --days=7`
12. `purpclaw schedule` as native PurpClaw cron (not Hermes-dependent)
13. Swarm visualizer in Mission Control (see all 153 agents, their status, what's running)

### Phase 3 — Asymmetric Moat (things that are years ahead)
14. **The Data Harvester** — Eddie's E: drive is a goldmine. PurpClaw should be able to ingest any file, fingerprint it, classify it, extract knowledge, and index it into the vector layer. Codex/ChatGPT have no answer for this.
15. **Personal model growth** — The training buffer + LoRA pipeline means PurpClaw can learn from Eddie's corrections and get better at his specific patterns over time. This is G0DM0D3 applied to the model itself.
16. **Council mode** — Multiple personas debate a decision, vote, Eddie picks. Not a chatbot — a council of specialized minds. No competitor has this.
17. **Cognitive spine leak auto-remediation** — The PID monitoring + _prune_old sweep is already working. Turn this into a self-healing system that logs and fixes memory leaks before Eddie notices.
18. **Multi-provider cost arbitrage** — Route to cheapest provider that meets quality threshold for each task type. Track spend per provider. This is financial infrastructure neither Codex nor ChatGPT App have.

---

## VERIFICATION CHECKLIST

Before declaring parity:
- [ ] `purpclaw init` creates AGENTS.md in CWD, agent_tower.js reads it
- [ ] `purpclaw exec -- "echo test"` exits 0, invalid task exits non-zero
- [ ] `purpclaw permissions` shows sandbox/writable roots/allowed commands
- [ ] `purpclaw ask --image ./error.png "explain"` sends image to model
- [ ] `purpclaw ask --search "Next.js release"` returns live web results
- [ ] `purpclaw mcp list` shows connected MCP servers
- [ ] `purpclaw review` reviews current git diff or staged changes
- [ ] `purpclaw completion --shell=bash` generates valid bash completions
- [ ] Multi-provider fan-out: same task → 3 providers → returns best result
- [ ] Proof ledger shows receipts in Mission Control UI
- [ ] `purpclaw schedule "remind me" --every=day` creates a recurring job
