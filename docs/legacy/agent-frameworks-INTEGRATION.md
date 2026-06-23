# PURPCLAW x agent-frameworks Integration
**Date:** 2026-04-20
**Goal:** Wire extracted agent-framework parts (prompts, skills, rules, contexts, hooks, schemas) into PURPCLAW's Agent Tower, Divisions, and Companion system.

---

## Implementation Status

| Layer | Status | Notes |
|---|---|---|
| Layer 1 (Agent Tower Registry + KIRO_AGENT_ROLES) | ✅ DONE | agent_tower.js lines 23-55 |
| Layer 2 (Prompt Pipeline — kiro role files + contexts) | ✅ DONE | agent_tower.js buildAgentPrompt() |
| Layer 3 (Skills — agent-frameworks skills + 5 new ECC skills) | ✅ DONE | skills_registry.json updated |
| Layer 3b (WebDev Tool Access via --add-dir) | ✅ DONE | spinUpAgent.js |
| Layer 4 (Context Modes — dev/review/research) | ✅ DONE | agent_tower.js detectContextMode() |
| Layer 5 (Companion Chorus — OpenClaude detection) | ✅ DONE | bridge.js |
| Layer 6 (Production Loop routing) | ✅ DONE | orchestrator.js AGENT_BY_INTENT |
| Steering Files (auto-include) | ✅ DONE | agent_tower.js loadAutoSteering() |
| ECC Harvest (scripts, nanoclaw, enterprise ops) | ✅ DONE | skills_registry.json + scripts/ |

---

## Source Material

| Extracted Location | Contents |
|---|---|
| `C:\Users\Admin\Desktop\agent-frameworks\agents\` | 38 role definitions (architect.md, code-reviewer.md, security-reviewer.md, etc.) |
| `C:\Users\Admin\Desktop\agent-frameworks\prompts\` | 16 runtime prompt files (tool-system, context, MCP, etc.) |
| `C:\Users\Admin\Desktop\agent-frameworks\skills\` | 150+ skill modules (agent-harness-construction, autonomous-loops, etc.) |
| `C:\Users\Admin\Desktop\agent-frameworks\contexts\` | 3 context modes: dev, research, review |
| `C:\Users\Admin\Desktop\agent-frameworks\rules\` | Language-specific rules (common/ + 8 language dirs) |
| `C:\Users\Admin\Desktop\agent-frameworks\hooks\` | Hook scripts (ChatRenderer, CompanionSpawner, etc.) |
| `C:\Users\Admin\Desktop\agent-frameworks\schemas\` | 10 JSON schemas for plugins, state, install, etc.) |
| `C:\Users\Admin\Desktop\agent-frameworks\docs\` | Architecture, troubleshooting, skill guides |
| `PURPCLAW\steering\steering\` | 16 steering files (dev-mode, review-mode, security, testing, etc.) |
| `PURPCLAW\scripts\` | nanoclaw.js (NanoClaw REPL), ecc.js (selective-install CLI) |
| `PURPCLAW\openclaw-persona-forge-references\` | 6 persona forge refs (identity-tension, boundary-rules, etc.) |
| `PURPCLAW\buddy_TAMAGOTCHI\` | 18-species gacha companion system (Claude Code UI only) |

---

## Execution Layer

- **Primary:** OpenClaude CLI via `spinUpAgent.js` — detached agents, JSON output, `--add-dir` for filesystem access
- **Session-aware REPL:** `scripts/nanoclaw.js` — synchronous `claude -p` with markdown-backed sessions, `/model`, `/load`, `/branch`, `/search`, `/compact`
- **Fallback chain:** OpenClaude → Kimi CLI → cloud API → Node.js stub

## Steering File Integration

Auto-injected into every agent prompt (from `PURPCLAW/steering/steering/`):
- `inclusion: auto` → always injected (patterns.md, security.md, testing.md, performance.md, etc.)
- `inclusion: manual` → invoked via `#dev-mode`, `#review-mode`, `#research-mode`

## Skills Registry (ECC Harvest 2026-04-20)

5 new skills added to `skills_registry.json`:
- `autonomous-agent-harness` — persistent crons, MCP memory, dispatch agents, computer use
- `agentic-engineering` — agentic AI patterns, tool use, self-reflection
- `continuous-agent-loop` — loop patterns, autonomous iteration
- `enterprise-agent-ops` — enterprise ops workflows
- `nanoclaw-repl` — NanoClaw v2 REPL operation and extension

---

## Integration Map

### Layer 1 — Agent Tower Registry

Each PURPCLAW agent gets **enhanced with a kiro role definition**:

| PURPCLAW Agent | Division | Kiro Role(s) to Inject |
|---|---|---|
| dragon | ENGINEERING | `architect.md` + `planner.md` |
| robot | ENGINEERING | `code-reviewer.md` + `refactor-cleaner.md` |
| octopus | SECURITY | `security-reviewer.md` + `cpp-reviewer.md` |
| mushroom | ENGINEERING | `refactor-cleaner.md` + `tdd-guide.md` |
| ghost | INTELLIGENCE | `security-reviewer.md` + `code-reviewer.md` |
| owl | SECURITY | `security-reviewer.md` |
| chonk | ENGINEERING | `performance-optimizer.md` + `tdd-guide.md` |
| turtle | ENGINEERING | `code-reviewer.md` + `database-reviewer.md` |
| spider | INTELLIGENCE | `docs-lookup.md` + `gan-planner.md` |
| duck | MEDIA_OPS | `docs-lookup.md` + `e2e-runner.md` |
| penguin | MANAGEMENT | `chief-of-staff.md` + `planner.md` |
| shark | OPERATIONS | `performance-optimizer.md` + `e2e-runner.md` |
| gorilla | OPERATIONS | `performance-optimizer.md` + `harness-optimizer.md` |
| mantis | OPERATIONS | `performance-optimizer.md` + `refactor-cleaner.md` |
| phoenix | CREATIVE | `gan-generator.md` + `gan-evaluator.md` |
| wolf | ENGINEERING | `chief-of-staff.md` + `planner.md` |
| *unassigned* | SCIENCE | `gan-planner.md` + `gan-evaluator.md` + `pytorch-build-resolver.md` |

### Layer 2 — Prompt Pipeline

On agent spawn (`spawnAgent()` in `agent_tower.js`), the prompt builder reads from both sources:

```
AGENT PERSONA (from tower registry)
  + kiro ROLE DEFINITION (from agents/*.md)
  + RUNTIME PROMPT SHIM (from prompts/07-tool-system.md, 10-context-and-prompts.md)
  + TASK DESCRIPTION
  = FULL SYSTEM PROMPT
```

The `buildAgentPrompt()` in `agent_tower.js` is extended to:
1. Read `agents/<role>.md` for role-specific instructions
2. Merge with tower's division-based base persona
3. Inject runtime shims from `prompts/` based on agent skills

### Layer 3 — Skills as Tools

Each PURPCLAW agent skill maps to a kiro skill module:

| PURPCLAW Skill | Kiro Skill |
|---|---|
| research | `deep-research`, `exa-search` |
| security | `security-review`, `security-scan` |
| architecture | `architecture-decision-records` |
| coding | `coding-standards`, `agentic-engineering` |
| planning | `strategic-compact`, `project-flow-ops` |
| testing | `e2e-testing`, `tdd-workflow`, `ai-regression-testing` |
| performance | `benchmark`, `performance-optimizer` |
| creative | `prompt-optimizer`, `continuous-learning-v2` |
| webdev | `browser-qa`, `api-design`, `frontend-patterns` |

Skills are injected into the agent's toolset on spawn.

### Layer 3b — WebDev Tool Access

OpenClaude CLI provides full webdev tools natively:

| Tool | What It Enables |
|---|---|
| `Bash` | Shell access, npm, git, dev servers |
| `Edit` / `Write` | File editing, code changes |
| `Read` | Read any file in accessible dirs |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |
| `WebFetch` | HTTP requests, API testing |
| `TodoWrite` / `TaskCreate` | Task tracking |
| `Agent` | Spawn sub-agents |

Accessible directories configured via `--add-dir`:
- `E:\god folder` — God Folder (Memory Citadel, shared knowledge)
- `E:\god folder\02_ACTIVE_PROJECTS\GOTHAM_3077` — Active projects
- `E:\god folder\worldview` — WORLDVIEW integration source
- `C:\Users\Admin\Desktop\agent-frameworks` — Role definitions, skills, rules
- Agent work directory

### Layer 4 — Context Modes

Agents switch context modes based on task type:

| Context Mode | When | Sources |
|---|---|---|
| `dev` | Coding, building, fixing | `contexts/dev.md` + `rules/common/*` |
| `review` | Code review, audit | `contexts/review.md` + `rules/common/*` |
| `research` | Investigation, planning | `contexts/research.md` + `rules/common/*` |

### Layer 5 — Companion Chorus Enhancement

Companions react to agent events. The kiro companions from `agent-frameworks/companions/` are separate from PURPCLAW's own companion system, but they can coexist:

- PURPCLAW companions (`duck`, `dragon`, `goose`, etc.) are **voice/personality layer**
- Kiro companions are **sprite/visual layer** via `companion-chorus/src/sprites.js`

The `bridge.js` EventBus listener dispatches to both.

### Layer 6 — Production Loop (Tech Debt, Collections, Audits)

For production loops, the Orchestrator uses the mapped agents:

```
"fix tech debt"     -> dragon + mushroom (architect + refactor)
"code review"       -> robot + ghost (code-reviewer + security-reviewer)
"security audit"    -> octopus + owl (security-reviewer, security-scan)
"performance audit" -> chonk + shark (performance-optimizer + tdd-workflow)
"collect metrics"   -> mantis + gorilla (precision + heavy-lifter)
"test suite"        -> turtle + bunny (e2e-runner + ai-regression-testing)
```

---

## Key Files to Modify

1. **`agent_tower.js`** — `buildAgentPrompt()` reads from `agents/<role>.md` + `prompts/`
2. **`orchestrator.js`** — `AGENT_BY_INTENT` routes map to kiro role files
3. **`spinUpAgent.js`** — Already written; injects agent persona + God Folder access
4. **`companion-chorus/bridge.js`** — Extend to load kiro companions from `agents/companions/`
5. **`ecosystem.config.js`** — Add `spinUpAgent.js` as a standalone service if needed

---

## Execution Order

1. **Map roles** → Extend tower registry with kiro role file references
2. **Wire prompts** → `buildAgentPrompt()` reads agents/*.md + prompts/*.md
3. **Add skills** → Skills from `skills/` injected as agent tool options
4. **Context switching** → Context modes drive prompt selection
5. **Companion enhancement** → Companion chorus reacts to tower events
6. **Production loop** → Orchestrator routes tasks to right agent combo

---

## Automaton Overlay (Future)

Once Automaton is integrated:
- Each PURPCLAW agent becomes a sovereign Automaton with its own wallet
- Kiro role definitions become Automaton genesis prompts
- Survival pressure replaces lazy-agent problem
- H.E.R. evolution layer rewrites agent prompts based on task success
