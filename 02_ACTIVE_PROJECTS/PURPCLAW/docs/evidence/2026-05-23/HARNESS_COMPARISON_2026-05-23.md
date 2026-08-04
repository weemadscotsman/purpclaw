# Harness Comparison — Claude Code vs Codex/Hermes vs PURPCLAW

**Date:** 2026-05-23
**Purpose:** Map how each agent runtime actually routes, persists, and stays proactive, then identify which patterns PURPCLAW should steal.

---

## 1. CLAUDE CODE (Anthropic — this CLI)

### Storage layout (`~/.claude/`)

| Path | Purpose |
|---|---|
| `plugins/marketplaces/` | Pluggable skill source registry |
| `plugins/installed_plugins.json` | Installed-skill ledger w/ project scope |
| `plugins/cache/` | Downloaded plugin bundles |
| `agent-memory/` | Cross-session persistent memory |
| `agents/` | Subagent specialist definitions |
| `sessions/` + `history.jsonl` | Full transcript replay |
| `file-history/` | Per-file edit log |
| `tasks/` | Long-running background work |
| `plans/` | Multi-step plan persistence |
| `paste-cache/` | Large input archive (so context doesn't bloat) |
| `settings.json` (global) + `settings.local.json` (per-machine, per-project) | Permissions allowlist + hooks + MCP servers |

### Routing model

- **Slash commands** `/skill-name` — load `SKILL.md` from plugin, inject into prompt as need-to-know guidance
- **Agent tool** with `subagent_type` — delegate to specialist (`general-purpose`, `Plan`, `Explore`, `claude-code-guide`, etc.)
- **MCP servers** — external tools wired in via JSON-RPC (`jcodemunch` here for code search)
- **Hooks** in `settings.json` — auto-fire on `PreToolUse`, `PostToolUse`, `Stop`, etc. Not Claude — the *harness* runs these

### Persistence model

- **Project memory:** `CLAUDE.md` lives *inside the repo*, user-owned, version-controlled
- **User memory:** `~/.claude/CLAUDE.md` global preferences
- **Session JSONL:** every turn appended; full replay possible
- **file-history:** independent edit ledger (recover overwrites)

### Proactivity model

- Hooks fire on harness events (not on Claude's reasoning)
- Background agents via `run_in_background` — fire-and-notify
- `CronCreate` — actual cron-style scheduled re-invocations
- `/loop` — auto-pacing recurring task with self-chosen interval

### Strength
Permissions/hooks are the killer feature. Auto-allowlist common commands ("npm test *", "git status"). The harness handles persistence, scheduling, and tool plumbing **so the model doesn't have to**.

### Weakness
No actual running services. Stateless between turns except for files on disk. The skills directory has to be loaded fresh every time.

---

## 2. CODEX / HERMES (OpenAI)

### Storage layout (`~/.codex/`)

| Path | Purpose |
|---|---|
| `skills/` | **203 standalone skill dirs**, each with `SKILL.md` + supporting files |
| `agents/` | Domain-specialist `.md` files (architect, code-reviewer, chief-of-staff, harness-optimizer, ...) |
| `prompts/` | Reusable prompt templates (`opsx-explore`, `opsx-propose`, `opsx-apply`, `opsx-archive`) |
| `rules/default.rules` | `prefix_rule` allowlist — pre-approve common command patterns |
| `memories/MEMORY.md` | **Structured** task-group memory (scope / keywords / preferences / reusable-knowledge / failures) |
| `sessions/` + `rollout_summaries/` | Per-session JSONL + condensed summaries |
| `config.toml` | Model selection, project trust levels, plugin enables, personality |
| `goals_1.sqlite`, `logs_2.sqlite` | SQLite for structured event/goal state |

### Routing model

- **Slash commands** `/opsx:explore` etc. → load prompt template + change stance
- **`subagent_type`** with per-agent `.md` frontmatter:
  ```yaml
  ---
  name: architect
  description: Software architecture specialist...
  tools: ["Read", "Grep", "Glob"]
  model: opus
  ---
  ```
- **Skill auto-injection** by relevance match
- **Marketplaces** (openai-bundled, openai-primary-runtime)

### Persistence model — *this is the golden pattern*

`MEMORY.md` is **structured by task-group**, not chronological:

```markdown
# Task Group: <scope>
scope: <what this lane is>
applies_to: cwd=<path>; reuse_rule=<when to reuse>

## Task 1: <name>, <status>
### rollout_summary_files
- <session-link>
### keywords
- <searchable terms>

## User preferences
- when the user said `"X"` -> do Y [Task 1][Task 3]

## Reusable knowledge
- <durable fact>

## Failures and how to do differently
- Symptom: X. Cause: Y. Fix: Z [Task 1]
```

Why this works: every entry has **keywords for retrieval**, **per-task linkage**, and **explicit "do this differently next time"** patterns. It's literally a self-improving runbook.

### Proactivity model

- Personality setting tunes reasoning style globally
- Rules engine pre-approves common commands → fewer interruption prompts
- Rollout summaries auto-condense long sessions into searchable index

### Strength
The MEMORY.md format. The skills count (203). The rules engine pre-approves so the model isn't constantly asking permission.

### Weakness
No long-running services either. Skills are static markdown.

---

## 3. PURPCLAW (your harness)

### What's already on disk (better than I expected)

| Path | Purpose | Status |
|---|---|---|
| `bin/purpclaw.js` | CLI front door | **WIRED** (just rewritten with animated boot) |
| `service_registry.js` | PM2 service map | WIRED |
| `ecosystem.config.js` | PM2 boot config | WIRED |
| `orchestrator.js` | Workflow engine | WIRED |
| `agent_tower.js` | Agent spawn registry | WIRED |
| `unified_api.js` | HTTP gateway :7780 | WIRED |
| `memory_matrix_v2.py` | Persistent memory service :7880 | WIRED |
| `lib/governance.js` | Approval gates | WIRED |
| `lib/job-contract.js` | Typed jobs + verification gates | WIRED |
| `lib/spaghetti-audit.js` | Code health scoring | WIRED |
| `lib/proactive-maintenance.js` | Maintenance proposals | **DEAD** (no scheduler firing it) |
| `lib/screen-look.js` + workspace-awareness | Multi-monitor vision | WIRED |
| `agent_routing_matrix.js` | give/needs/avoid per animal mascot | WIRED into decomposer |
| `task_decomposer.js` | domain → agent mapping | WIRED |
| **`skills/`** (200+ dirs with SKILL.md) | Codex-style skill library | **DEAD** (no loader) |
| **`agents/`** (architect.md, code-reviewer.md, etc.) | Codex-style specialist defs | **DEAD** (not wired through tower) |
| **`prompts/`** | Prompt templates | **DEAD** (no CLI verb to invoke) |
| **`rules/`** | Rules dir exists | **DEAD** (no allowlist plumbing) |
| autonomous_diagnostics.py, neuro_symbolic_bridge.py, modal_logic_engine.py | Cognitive services | OPTIONAL/wired-by-profile |

### Routing model (currently)

- `purpclaw run "<task>"` → orchestrator → task_decomposer → agent_routing_matrix → agent_tower spawn → child process runs OpenClaude CLI
- governance.checkWorkflow runs BEFORE execution → holds for approval if risky

### Persistence model (currently)

- `agent_work/.screen_context.json` (workspace state)
- `agent_work/.workspace_awareness.json` (monitor roles)
- `agent_work/.proactive_maintenance.json` (maintenance state)
- `agent_score.json` (per-agent success rate)
- `memory_matrix_v2.py` (Python service — barely wired in to flow)

### Proactivity model (currently)

- proactive-maintenance.js EXISTS but **nothing schedules it**
- No event hooks
- No autonomous loop

---

## 4. THE GAPS (what to steal, in priority order)

### P0 — Skills are dead weight on disk (BIGGEST WIN)
**Problem:** 200+ SKILL.md files in `skills/` get loaded by neither orchestrator nor agent_tower. Every agent spawn re-reads the world from scratch.
**Steal from:** Claude Code's skill-injection by relevance.
**Implementation:** `lib/skill-loader.js` — on boot, index all SKILL.md frontmatter (name, description). When orchestrator builds an agent context packet, keyword-match the task against skill descriptions, inject the top N (capped). CLI: `purpclaw skills list | show <name> | which <task>`.

### P1 — No structured MEMORY.md
**Problem:** Memory matrix is a separate Python service, not a self-improving runbook.
**Steal from:** Codex's `MEMORY.md` task-group format.
**Implementation:** `lib/memory-md.js` — append/read/search structured entries at `agent_work/MEMORY.md`. After every workflow: auto-append `## Task: <name>` with keywords, preferences captured, reusable knowledge, failures with do-differently. On `purpclaw run`: load relevant memory entries by keyword match into context. CLI: `purpclaw memory recall <query>`, `purpclaw memory consolidate` (dedupe pass).

### P2 — No hooks system
**Problem:** Nothing auto-fires on events. `PostJob` should append to MEMORY.md. `ServiceDown` should spawn diagnostic. `ApprovalGranted` should resume held workflow.
**Steal from:** Claude Code's hooks model.
**Implementation:** `purpclaw_hooks.json` with events `PreJob`, `PostJob`, `Stop`, `ServiceDown`, `ApprovalGranted`. Hook = bash command or internal queue event. Wire into orchestrator's existing event publisher.

### P3 — No `/explore /propose /apply /archive` lifecycle
**Problem:** `purpclaw run` always tries to *do*, never just *think*. Codex's opsx pattern separates exploration from execution.
**Steal from:** Codex's `opsx-*` prompts.
**Implementation:** `purpclaw think <topic>` (explore, no execution, read-only), `purpclaw propose <change>` (draft + governance request), `purpclaw apply <proposal-id>` (execute approved proposal), `purpclaw archive` (snapshot done work to docs/audit).

### P4 — No session JSONL audit trail
**Problem:** Workflow events publish to eventbus then vanish.
**Steal from:** Both Claude/Codex sessions dir.
**Implementation:** `agent_work/sessions/<id>.jsonl` — orchestrator appends every event. `purpclaw sessions list | resume <id>` reconstructs context.

### P5 — Proactive scheduler not actually running
**Problem:** `lib/proactive-maintenance.js` proposes jobs but nothing calls it on a timer.
**Steal from:** Codex/Claude cron/loop patterns.
**Implementation:** `lib/maintenance-scheduler.js` — interval polls every N min (default 30), reads health snapshot, calls `proposeMaintenanceJobs`, routes each through governance (approval-required by default). Toggle: `purpclaw maintenance enable | disable | status`.

### P6 — Rules engine not wired
**Problem:** `rules/` dir exists but doesn't gate anything.
**Steal from:** Codex's `prefix_rule` allowlist + Claude's permissions list.
**Implementation:** Already partly done in governance.js — extend with a per-command prefix allowlist that the orchestrator consults before requesting approval. Reduces "ask the user about npm test" friction.

---

## 5. WHAT PURPCLAW HAS THAT THE OTHERS DON'T (preserve these)

- Long-running PM2 service swarm (Claude/Codex are stateless between turns)
- Screen vision (`purpclaw look`) + workspace memory
- Voice pipeline (Xiaozhi ball, voice coordinator)
- Mission Control web UI
- Animal mascot delegation model — more legible than "specialist N"
- Governance gates that *actually hold* execution (Claude permissions are pre-approval; PURPCLAW's are runtime)
- Spaghetti audit — code health as operational signal
- Job contracts with explicit verification gates
- Companion chorus (reactive UI agents)

---

## 6. RECOMMENDED INTEGRATION ORDER

1. **Skill-loader** (1 file, ~150 LOC) — unlocks 200 dead skill files immediately
2. **MEMORY.md writer + reader** (1 file, ~200 LOC) — gives the runtime an actual brain
3. **Session JSONL** (~50 LOC into orchestrator) — turns vanished events into searchable history
4. **Hooks** (~100 LOC, json config + dispatcher) — enables every other auto-behavior
5. **Maintenance scheduler** (~80 LOC) — closes the proactive loop
6. **opsx-style verbs** (~200 LOC for `think`/`propose`/`apply`/`archive`) — separates thinking from doing
7. **Rules prefix-allowlist** (~50 LOC extension to governance) — kills approval-fatigue

Total: ~830 LOC of *new* code (vs. continuing to grow the existing 1900-line CLI). Each piece is independently shippable and verifiable.

---

## TL;DR

PURPCLAW is **closer to a real harness than either Claude Code or Codex** because it has live services, screen vision, and governance gates that actually hold execution. What it's missing is the *plumbing* that makes the existing assets fire: 200 skills on disk that nobody reads, agents/ files that nobody routes through, a memory service that nobody consults, a proactive module that nobody schedules.

The integration plan above doesn't need new infrastructure — it wires up what's already there.
