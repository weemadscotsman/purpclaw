# BLIND CRITIC REVIEW — PARITY_AND_BEYOND.md

> Scope note: this is a review of one superseded document. It does not define
> parity scope, completion or priorities — [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md) does.

**Reviewer**: Blind Critic
**Date**: 2026-07-29
**Disposition**: REVISE BEFORE BUILDER

---

## OVERCLAIMS (things the doc says that don't hold up under pressure)

### OC-1: "AGENTS.md falls back to SOUL.md"
**Problem**: SOUL.md is the personality/identity layer. AGENTS.md in Codex is a **per-repo project config** — goals, constraints, available tools, project context. These are completely different things. PurpClaw's equivalent is NOT SOUL.md.
**Fix needed**: Define what AGENTS.md maps to in PurpClaw. Options: (a) a new `purpclaw.yaml` project config file, (b) `PURPCLAW.md` in repo root, (c) extend `agent_tower.js` to accept a project context object. The doc incorrectly assumes the fallback is SOUL.md.

### OC-2: "7 memory layers ALL integrated"
**Problem**: Having 7 layers present ≠ all 7 working optimally. Memory says "self_improving: false" in truth-manifest. Counterfactual layer is questionable — how is it actually being used in the agent loop? The doc treats this as a full win without verifying each layer is actually doing meaningful work.
**Fix needed**: Audit which layers are passive (just storing) vs active (actually influencing agent decisions). Mark "active contribution" not just "present".

### OC-3: "TUI + 32-page WebUI — both surfaces"
**Problem**: Codex's terminal UI is a full-screen interactive TUI with syntax highlighting, inline diffs, and a dedicated coding loop. PurpClaw's TUI (`purpclaw tui`) is listed in the README but has not been verified as a first-class polished surface. The 32 pages in Mission Control are real but they're React pages, not a TUI cockpit.
**Fix needed**: Distinguish clearly. PurpClaw has: (a) terminal CLI, (b) web TUI at port 3030, (c) Next.js Mission Control pages. Codex has a single polished terminal TUI. These are different things.

### OC-4: "Swarm coordinator with 153 registered agents"
**Problem**: 153 registered ≠ 153 working. Truth-manifest says only 7 are "strict_live" (executor + health check + I/O contract + receipt). The other 146 are registered but not proven. This overstates the swarm's active capability.
**Fix needed**: State the honest number: 7 proven live agents, 146 registered scaffold.

### OC-5: "G0DM0D3 — a completely different capability class"
**Problem**: G0DM0D3 is a personality layer. It makes the agent talk differently. It does NOT make the agent reason better, act faster, or produce better code. Calling it a "completely different capability class" alongside 7-memory-layers and proof-ledger is a category error.
**Fix needed**: G0DM0D3 is a UXdifferentiator and a vibe. It's valuable. But it's not a technical capability that competes with memory architecture or tool count.

---

## EXECUTION BLOCKERS (things the Fix column says to do but don't say HOW)

### EB-1: `purpclaw exec --` — how does non-interactive mode actually work?
The doc says "add `purpclaw exec -- "task"` with proper exit codes". But PurpClaw routes through an agent loop that is inherently multi-turn with provider calls. For a non-interactive exec:
- Does it run ONE provider call with max_tokens and no streaming?
- Does it run the full agent loop but suppress output until done?
- Does it skip the agent loop entirely for simple command execution (like just running a shell command directly)?
Codex's exec mode is straightforward — it's a single task execution with tool access. PurpClaw's exec would need an architectural decision: lightweight mode vs full agent loop.
**Fix needed**: Define the exec mode contract before Builder starts coding.

### EB-2: `--image` flag — encoding is non-trivial
The doc says "add `--image` flag that encodes and includes in prompt". Reality:
- Image must be base64-encoded or uploaded to a URL the provider accepts
- Provider API must support vision (not all do — minimax vision is different from openai vision)
- Max image size differs by provider
- PurpClaw would need to pick which provider supports vision, handle the encoding, and route accordingly
This is a multi-step feature, not a flag addition.
**Fix needed**: Specify: (a) which providers support `--image`, (b) max dimensions/filesize, (c) fallback if primary provider doesn't support vision.

### EB-3: `--search` — this already exists in a worse form
PurpClaw already has `/api/cmd/browse` and `browser` command routes. The doc proposes `--search` as new when there's already a browse/web search mechanism buried in the command layer. Building `--search` as a new flag without checking what's already there means Builder might duplicate existing work.
**Fix needed**: Audit existing browse/web search commands first. `--search` might be a flag that wires to existing browse infrastructure rather than building fresh.

### EB-4: `purpclaw permissions` — what's the actual data model?
exec-policy.js exists. But an interactive permissions command needs to define:
- What are the permission categories? (file access, network, shell commands, agent spawning, etc.)
- Is it aAllowlist or blocklist?
- Does it persist? (.env? JSON config? Per-session?)
- How does it interact with the existing exec-policy module?
**Fix needed**: Define the permission model before Builder starts writing the interactive command.

### EB-5: `purpclaw mcp` — MCP is already connected
OmniCode MCP is already running and connected (3478 files indexed). The doc says "add `purpclaw mcp list/add/remove`" but doesn't address:
- Is this managing OmniCode MCP (project-level, always-on) or user-added MCP servers?
- The UX distinction between "MCP servers that are part of PurpClaw's core" vs "user-added MCP servers"
**Fix needed**: Clarify scope. Is `purpclaw mcp` for user-added external MCP servers only?

---

## MISSING CRITICAL GAPS

### MG-1: Code execution sandbox
**Problem**: Both Codex AND ChatGPT App can execute code in an isolated sandbox. Codex has `exec/` with linux-sandbox (bwrap/bubblewrap). ChatGPT App can write and run code with computer use. PurpClaw's `terminal` tool runs shell commands on the HOST system. There's no code execution sandbox — any code the agent writes runs with the same permissions as the user.
**Risk**: Critical for a coding agent. If PurpClaw is given a malicious or buggy script to run, it runs it on the host. Codex's sandbox limits what a runaway agent can do.
**Fix needed**: Add a `purpclaw sandbox -- "code"` mode that executes code (Python, Node, etc.) in an isolated subprocess with restricted filesystem access and no network.

### MG-2: Built-in code review that actually works
Codex's `/review` inspects a git diff and returns prioritized findings. PurpClaw's `bughunt` command exists but:
- Is it actually a code review tool or a bug-hunting tool?
- Does it handle PR diffs, staged changes, and committed changes?
- Does it output structured findings with severity?
The doc says "verify it's a real first-class command" — this is hand-waving, not a finding.
**Fix needed**: Read the actual bughunt command source and determine if it covers the Codex `/review` feature surface.

### MG-3: Plugin/extension ecosystem
ChatGPT App has a Plugin Directory with dozens of community plugins. Codex has a skill system. PurpClaw's 598-skill registry is massive but:
- Are skills installable by users? (Most are authored by Eddie, not user-installable)
- Is there a skill directory or marketplace?
- Can users write and install a new skill without touching core code?
This is a product gap, not just a feature gap.
**Fix needed**: Define what "user-installable skill" looks like in PurpClaw's architecture.

### MG-4: Model capability comparison UI
ChatGPT App shows GPT-5.6 Sol vs Terra vs Luna with capability descriptions. PurpClaw routes to 22 providers but:
- Does the user know which model is best for coding vs analysis vs creative?
- Is there a `purpclaw models` command that shows all available models with their capability labels?
- Can the user compare cost + capability before picking?
**Fix needed**: `purpclaw models --compare` that shows a table of models, providers, context windows, strengths, and approximate cost.

### MG-5: Real-time voice in CLI
Codex has no voice. ChatGPT App has full voice conversation. PurpClaw has TTS (Kokoro) and STT (faster-whisper) wired but:
- Is there a `purpclaw voice` mode that enables real-time voice conversation in the terminal?
- Or does voice only work through the Mission Control web UI?
**Fix needed**: If not in CLI, this is a parity gap vs ChatGPT App's voice capability.

---

## WRONG PRIORITIES

### WP-1: "Phase 3 moat moves" includes things already done
The cognitive spine leak auto-remediation is already working (fixed 2026-07-08, PID monitoring + _prune_old). Listing it as a Phase 3 moat move implies it needs to be built. It doesn't — it needs to be surfaced and hardened as a feature, not built from scratch.
**Fix**: Move cognitive spine auto-remediation to Phase 1 (hardening/surfacing), not Phase 3 (moat moves).

### WP-2: "Pets" gap is framed as a PurpClaw weakness
The doc says PurpClaw has no pet system. But G0DM0D3's personality layer with 95 souls and council modes IS the pet system — it's just not a animated character on screen. This isn't a gap. It's a different implementation of the same concept done far more deeply.
**Fix**: Remove "Pets" from the gap list. Map it to G0DM0D3 council mode as the answer.

### WP-3: Multi-provider fan-out (Phase 2 item 8) should be Phase 1
The ability to run one task across 3 providers and return the best result is the single most impressive differentiator PurpClaw has over Codex and ChatGPT App. It should be the FIRST thing built and demonstrated, not item 8 of Phase 2. This is the "wow moment" that makes a demo unforgettable.
**Fix**: Move multi-provider fan-out to the top of Phase 1.

---

## NEGOTIABLES (things the critic might be wrong about)

### N-1: bwrap sandbox — Windows doesn't support bubblewrap
bwrap/bubblewrap is a Linux-only technology. PurpClaw runs on Windows (this machine is Windows 10). The Linux sandbox gap is real but it only affects Linux deployments. For the primary Windows use case, bwrap is irrelevant.
**Verdict**: Keep bwrap in the nice-to-have list but note it's Linux-only. Windows isolation would need a different approach (Windows Sandbox, Hyper-V, or process-level restrictions).

### N-2: "Cloud handoff" — who's the cloud provider?
`codex cloud` works because OpenAI runs the cloud. PurpClaw has no hosted cloud. "Cloud handoff" would require either: (a) Eddie hosting a PurpClaw cloud instance, or (b) integrating with a third-party AI cloud. Without a clear cloud strategy, this feature is vapor.
**Verdict**: Remove `purpclaw cloud push/pull` from the roadmap until there's a cloud strategy.

---

## SUMMARY JUDGMENT

| Category | Count | Severity |
|---|---|---|
| Overclaims | 5 | Medium — misleads about current state |
| Execution blockers | 5 | High — Builder will get stuck |
| Missing critical gaps | 5 | High — real competitive weaknesses |
| Wrong priorities | 3 | Medium — wastes Phase 1 on lower-value items |
| Negotiables | 2 | Low — context-dependent |

**Overall verdict**: The doc identifies the right FEATURES to build but has shaky analysis on the CURRENT STATE and incomplete guidance on HOW to build each item. Builder will waste time on wrong assumptions.

**Recommendation**: Hand to Builder with the EB (execution blocker) items resolved first. Builder should not start coding until EB-1 through EB-5 have explicit architectural decisions written down.

---

## REVISED PRIORITY ORDER (accounting for overclaims, blockers, wrong priorities)

### Phase 1 — Parity (revised)
1. `purpclaw models --compare` — show all 22 providers with model names, context, strengths
2. Multi-provider fan-out: `purpclaw ask -- "task" --fan-out=3` — run same task across N providers
3. `purpclaw init` + per-repo project config (define the data model for AGENTS.md first)
4. `purpclaw exec --` non-interactive mode (resolve EB-1 first)
5. `purpclaw ask --image` (resolve EB-2 — pick vision provider, define encoding pipeline)
6. `purpclaw ask --search` (audit existing browse commands first — EB-3)
7. `purpclaw permissions` (resolve EB-4 — define the permission model)
8. `purpclaw mcp` for user-added servers (resolve EB-5 — scope to user-added only)

### Phase 1.5 — Hardening (moved from Phase 3)
9. Cognitive spine leak auto-remediation — surface the existing PID monitoring as a visible feature
10. `purpclaw review` — audit bughunt, extend to full git diff + PR review
11. `purpclaw watch -- "task"` — surface the file watcher as a command

### Phase 2 — Differentiate
12. Proof ledger UI in Mission Control
13. Abliterator panel (live effect size measurement)
14. `purpclaw train --from-sessions --days=N` — surface the training buffer
15. `purpclaw schedule` — native cron, Hermes-independent
16. Sandbox mode for code execution (Windows-aware: not bwrap, something else)

### Phase 3 — Moat
17. Data Harvester — E: drive ingestion pipeline
18. Skill marketplace — user-installable skills
19. Council mode CLI — `purpclaw ask --council "decision"` with multi-persona debate
20. Multi-provider cost arbitrage dashboard
