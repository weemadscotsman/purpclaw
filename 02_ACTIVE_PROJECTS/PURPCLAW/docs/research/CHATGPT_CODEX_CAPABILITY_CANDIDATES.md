# ChatGPT App / Codex CLI — Capability Candidates (Research Input Only)

> **NOT a parity roadmap.** This is evidence from external research. Do not treat
> as implementation authority. Compare against `docs/parity/CANONICAL_PARITY_PRIORITY.md`
> for canonical scope. Findings not in the canonical roadmap belong in
> `CANDIDATE_BACKLOG_NOT_YET_APPROVED` unless the chief explicitly approves them.

**Date**: 2026-07-29
**Source**: Official docs (learn.chatgpt.com, GitHub/openai/codex), truth-manifest.json,
  ROUTE_INDEX.md, source-code inspection
**Disposition**: UNVERIFIED — external product claims require independent verification
**Self-review note**: The prior "Blind Critic" was performed in the same session as the
  research (same context, same model, no fresh CLI). That review is therefore NOT an
  independent blind review and should be treated as self-review wearing a novelty moustache.

---

## ChatGPT App — Capability List

### Workflow Features
- **Projects & Chats** — organise conversations into projects with persistent context
- **Sites** — deploy static sites from chat
- **Visualizations** — generate charts and data viz from data
- **Scheduled Tasks** — cron-like scheduling of prompts
- **Long-running Work** — background tasks with notification on completion
- **Notifications** — push notifications for completed work
- **Pets** — animated Codex pet companion (Codey etc.)
- **Codex Micro** — physical desktop dial/agent-keys controller for 6 parallel chats

### Capabilities
- **Browser** — built-in isolated Chromium profile, opens URLs, interacts with sites,
  screenshot feedback
- **Computer Use** — operates the built-in browser: click, type, inspect DOM,
  take screenshots, verify results. Requires Plugins Directory + "Computer Use" plugin
  installed — UNVERIFIED: source claim, not independently confirmed
- **Voice** — real-time voice conversation
- **Plugins** — extend via plugin directory (e.g. Computer Use, RAG integrations)
- **Web Search** — live search for current context
- **Image Generation** — DALL-E integration
- **Image Inputs** — upload screenshots, photos, diagrams for analysis
- **Chrome Extension** — work in existing Chrome tab with your real browser profile
- **Work with Files** — upload and analyse files, generate downloadable outputs

### Models
- GPT-5.6 Sol (flagship), Terra (balanced), Luna (fast/cheap) — UNVERIFIED: source
  not confirmed at retrieval time; claims may reflect pre-launch nomenclature
- Model selection is user-visible with capability comparison

---

## Codex CLI — Capability List

### Installation
- `curl ... | sh` (macOS/Linux), PowerShell installer (Windows)
- npm: `npm install -g @openai/codex`
- Homebrew: `brew install --cask codex`
- GitHub releases (standalone binaries)

### Core Interaction
- **`/init`** — creates `AGENTS.md` in current directory with project-specific agent
  instructions (per-repo config that overrides defaults)
- **`/status`** — show current session config (model, directory, permissions)
- **`/permissions`** — interactive permission boundaries: sandbox scope, writable roots,
  allowed commands without asking
- **`/model`** — choose model + reasoning effort
- **`/review`** — inspect changes, find issues, code review of pending work
- **`codex exec -- "task"`** — non-interactive mode for CI/pipelines, exits with code

### Context & Input
- **`--image screenshot.png`** — attach visual context (error screenshots, diagrams,
  designs)
- **Paste images** into interactive composer
- **`--search "query"`** — switch to live web search mid-task (stays in transcript)
- **File search** — inspects local repository directly

### Multi-Agent
- **Subagents** — delegate focused work to specialised agents, results merge back into
  main session
- `codex cloud` — push current work to Codex cloud, browse active chats, apply result
  back locally

### Security & Sandboxing
- **Sandbox isolation** — linux-sandbox (bwrap/bubblewrap), seccomp policies
  NOTE: bwrap is Linux-only; irrelevant for Windows deployments
- **Process hardening** — process-hardening subsystem
- **Secrets management** — keyring-store integration (OS keychain)
- **Shell escalation** — privilege escalation flow for elevated commands
- **execpolicy** — per-command permission grants

---

## Overclaims Identified by Internal Review

The self-review (non-independent) flagged these as not holding up under pressure:

| ID | Claim in research | Problem | Verification |
|----|-------------------|---------|--------------|
| OC-1 | "AGENTS.md falls back to SOUL.md" | SOUL.md is personality layer; AGENTS.md in Codex is per-repo project config. These are different things. PurpClaw's equivalent is NOT SOUL.md. | UNVERIFIED — needs architectural decision |
| OC-2 | "7 memory layers ALL integrated" | Having 7 layers present ≠ all working optimally. Memory truth-manifest says `self_improving: false`. Counterfactual layer usage unclear. | CONTRADICTED — layered integration overstated |
| OC-3 | "TUI + 32-page WebUI — both surfaces" | PurpClaw's `purpclaw tui` is not verified as a first-class polished terminal TUI. 32 Mission Control pages are React pages, not a TUI cockpit. Codex has ONE polished terminal TUI. | UNVERIFIED — TUI surface needs live verification |
| OC-4 | "153 agents" | 153 registered ≠ 153 working. Truth-manifest says only 7 are "strict_live". The other 146 are scaffold, not proven. | CONTRADICTED — 7 strict_live, 146 registered scaffold |
| OC-5 | "G0DM0D3 — a completely different capability class" | G0DM0D3 is a personality layer. It changes how the agent talks, not how it reasons. Category error: UX differentiator ≠ technical capability. | CONTRADICTED — personality layer counted as technical feature |

---

## Execution Blockers (findings that need architectural decisions before build)

| ID | Item | Blocker | Canonical roadmap reference |
|----|------|---------|---------------------------|
| EB-1 | `purpclaw exec --` | No architecture defined: agent loop vs single call? Must decide before Builder starts. | Priority 0 item 1 (runtime), Priority 1 item 8 (workflow engine) |
| EB-2 | `--image` flag | Encoding pipeline undefined; vision providers differ in API; max size differs. | Priority 0 item 4 (tool spine), Priority 2 item 15 (repo intelligence) |
| EB-3 | `--search` flag | May already exist as browse commands in PurpClaw. Audit existing infrastructure first. | Priority 0 item 4 (tool spine — web search) |
| EB-4 | `purpclaw permissions` | No data model defined for interactive permission command. exec-policy.js exists but no UX. | Priority 0 item 3 (permission engine) |
| EB-5 | `purpclaw mcp` | OmniCode MCP is already connected. Need to clarify: manage OmniCode (core) vs user-added MCP servers? | Priority 1 item 6 (skills/commands/hooks/plugins) |

---

## Missing Critical Gaps (from self-review)

| ID | Gap | Evidence | Canonical roadmap reference |
|----|-----|---------|---------------------------|
| MG-1 | No code execution sandbox | PurpClaw's `terminal` tool runs on host. Codex uses bubblewrap. bwrap is Linux-only; Windows isolation needs different approach. | Priority 0 item 3 (permission and sandbox engine) |
| MG-2 | `purpclaw review` not verified | bughunt command exists but coverage of git diffs, staged changes, PRs unconfirmed. | Priority 1 item 9 (verification and evidence system) |
| MG-3 | No user-installable skill marketplace | 598 skills are Eddie-authored; user installability unconfirmed. | Priority 3 item 19 (marketplace and ecosystem) |
| MG-4 | No model capability comparison UI | 22 providers routed but no comparison table for users. | Priority 0 item 5 (provider and routing layer) |
| MG-5 | Real-time voice in CLI only via web UI | Kokoro TTS + faster-whisper STT wired; CLI voice mode unconfirmed. | Not in canonical roadmap — CANDIDATE |

---

## Competitive Differentiators (already in PurpClaw, not gaps)

These were listed as gaps in the research but are actually already present or differently implemented:

| Claimed Gap | Reality | Evidence |
|-------------|---------|----------|
| "Pets" missing | G0DM0D3 with 95 souls and council modes IS the answer — different implementation, deeper | CANDIDATE: surface G0DM0D3 as the pet/council feature |
| Cognitive spine auto-remediation is Phase 3 | Already working (PID monitoring + _prune_old sweep, fixed 2026-07-08) | Needs surfacing/hardening, not building — belongs in Priority 1 |
| Multi-provider fan-out buried in Phase 2 | Already implemented in llm-provider.js | Priority 0 item 5 covers this; verify UX exposure |

---

## Candidate Backlog (not in canonical roadmap — requires chief approval)

These findings from external research represent genuine product opportunities not yet in
`docs/parity/CANONICAL_PARITY_PRIORITY.md`. Do NOT implement without chief sign-off.

| Item | Source | Evidence quality | Priority if approved |
|------|--------|-----------------|---------------------|
| `purpclaw models --compare` — model comparison table across all 22 providers | MG-4 | Self-review finding, not external verified | Would be Priority 0 or 1 |
| Real-time voice in CLI (`purpclaw voice`) | MG-5 | TTS/STT wired but CLI UX unconfirmed | Priority 2 if approved |
| Surface cognitive spine auto-remediation as a visible feature | WP-1 correction | Already working, needs hardening | Priority 1.5 (hardening) |
| `purpclaw init` + AGENTS.md per-repo config | OC-1 | Needs architectural decision on data model | Covered by Priority 1 item 6 + item 7 |
| bwrap sandbox (Linux only) | N-1 | Linux-only; Windows needs different approach | Nice-to-have, Linux targets |
| `purpclaw cloud push/pull` | N-2 | No hosted PurpClaw cloud exists; vapor without cloud strategy | Removed until cloud strategy defined |

---

## Items Already Covered by Canonical Roadmap

These research findings map to existing canonical items — no new backlog entries needed:

| Research finding | Canonical item |
|-----------------|----------------|
| AGENTS.md per-repo config | Priority 1 items 6–7 (skills, commands, hooks, plugins + multi-agent) |
| Non-interactive exec mode | Priority 1 item 8 (deterministic workflow engine) |
| Interactive permissions command | Priority 0 item 3 (permission and sandbox engine) |
| `--image` flag | Priority 0 item 4 (tool spine — image inspection) |
| `--search` flag | Priority 0 item 4 (tool spine — web search) |
| MCP interactive management | Priority 1 item 6 (skills/commands/hooks/plugins) |
| `purpclaw review` | Priority 1 item 9 (verification and evidence system) |
| Code execution sandbox | Priority 0 item 3 (permission and sandbox engine) |
| Skill marketplace | Priority 3 item 19 (marketplace and ecosystem) |
| Multi-provider fan-out | Priority 0 item 5 (provider, model and routing layer) |
| Proof ledger UI | Covered by Priority 1 item 9 |
| Abliterator panel | Covered by existing abliterator in lib/eval-manager.js |
| Training buffer CLI | Covered by existing training buffer CLI |
| Schedule command | Covered by Priority 2 item 12 (automations and background queue) |
| Data Harvester | Priority 3 item 19 (marketplace and ecosystem) |
| Council mode | Covered by G0DM0D3 existing implementation |
| Cost arbitrage dashboard | Priority 0 item 5 (provider, model and routing layer) |

---

## Verification Status Key

- **VERIFIED_OFFICIAL**: confirmed from official documentation at retrieval time
- **VERIFIED_SOURCE**: confirmed from source code inspection
- **UNVERIFIED**: claim from document without independent confirmation
- **CONTRADICTED**: claim directly contradicted by available evidence
