# PURPCLAW Agent Delegation Board

Updated: 2026-06-02

Goal: make PURPCLAW beat Odysseus by becoming the API-first AI operations control plane, with OmniCode as the repo-intelligence and repair-governor engine.

## Ground Rules

- No agent edits files outside its lane without posting a handoff first.
- Every repo-aware task must start with OmniCode or PURPCLAW OmniCode bridge proof.
- No destructive repair when OmniCode reports unknown files or blocking repair gaps.
- Every completed task must include commands run, endpoints checked, files changed, and remaining risk.
- Cross-confirmation is required before calling a lane done.

## Current Shared Truth

- PURPCLAW Unified API is expected on `http://127.0.0.1:7780`.
- Mission Control is expected on `http://127.0.0.1:3000`.
- OmniCode MCP is healthy in the current Codex session and reports RBAC enforcing sandbox constraints.
- PURPCLAW bridge currently reports `mcp-build-present` for local OmniCode platform runner discovery.
- PURPCLAW `.omnicode` proof reports zero unknown files and fifty blocking repair gaps.
- Destructive repair is blocked until the blocking gaps are resolved or explicitly waived by a stronger proof gate.

## Ownership Lanes

| Lane | Owner | Write Scope | Mission | Cross-Confirm Owner |
|---|---|---|---|---|
| A. PURPCLAW API Spine | Codex | `unified_api.js`, `lib/api-harness-kernel.js`, `lib/omnicode-bridge.js`, Mission Control data/UI | Keep chat -> kernel -> OmniCode intake -> swarm delegation flowing end to end. | Claude |
| B. OmniCode Runtime | Claude | `E:\god folder\02_ACTIVE_PROJECTS\omnicode-platform` only unless handed off | Fix or explain the missing `dist/server.js` runner path so PURPCLAW can stop reporting `source-ready-build-needed`. | Codex |
| C. Proof Gates | Claude first, Codex verify | Prefer new files under `scripts/` or `tests/`; do not edit API routes without handoff | Add a repeatable verification command for `/api/omnicode/status`, `/api/omnicode/repo-intake`, `/api/kernel/jobs`, and Mission Control data. | Codex |
| D. Rival Gap Board | Codex | `docs/ODYSSEUS_BEAT_PLAN.md`, `lib/odysseus-scorecard.js`, Mission Control overview | Keep the Odysseus comparison honest and tied to executable lanes, not feature-copying. | Claude |
| E. Research Room | Unassigned until API spine is stable | `lib/deep-research-group.js`, research UI only | Turn OpenRouter group research into persisted kernel jobs with reports. | Both |
| F. Model Doctor | Unassigned until runtime gate passes | New module/doc first | Hardware scan -> fit score -> model serve job, wired through kernel. | Both |
| G. API to Local LLM Fallback | Codex | `lib/llm-provider.js`, `.env.example` | API-first calls fall back to local Ollama for chat, swarm, and completion. | Claude |

## Claude Mission Prompts

### Mission B1: OmniCode Runtime Fix

Work in `E:\god folder\02_ACTIVE_PROJECTS\omnicode-platform`.

Find why `run_omnicode.cmd` points at `dist/server.js` but that file is absent. Produce the smallest honest fix:

- either create a real build path that emits `dist/server.js`
- or update the runner to a verified runtime command that starts the MCP server
- or document why the active MCP is coming from a different install and how PURPCLAW should discover it

Do not modify PURPCLAW files in this mission.

Required proof:

- command proving the MCP server starts
- command proving `health_check` works, if callable
- exact files changed
- remaining risk

### Mission C1: PURPCLAW Proof Gate

Work in `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`.

Add a repeatable verification command that checks:

- `GET /api/omnicode/status`
- `POST /api/omnicode/repo-intake`
- `POST /api/kernel/jobs` with `repoPath`
- `GET /api/mission-data` includes `omnicodeStatus`

Prefer a new script over editing existing route code. Do not touch `unified_api.js` unless Codex hands it off.

Required proof:

- command output with pass/fail per endpoint
- no fake green if Unified API or Mission Control is offline
- exact files changed

### Mission A Review: Cross-Confirm Codex Work

Review Codex changes in PURPCLAW around:

- `lib/omnicode-bridge.js`
- `lib/api-harness-kernel.js`
- `unified_api.js`
- `app/hooks/useMissionData.ts`
- `app/components/OverviewPanel.tsx`
- `app/api/mission-data/route.ts`

Do not rewrite the implementation. Report:

- correctness bugs
- security holes
- mismatch with OmniCode MCP contract
- stale or misleading status text
- missing tests

## Codex Current Duties

- Keep Unified API live after PURPCLAW route edits.
- Verify Claude patches before integrating.
- Keep Mission Control focused on the flow: hello -> kernel -> OmniCode proof -> job -> swarm -> result.
- Maintain the Odysseus gap board without cloning Odysseus feature-for-feature.

## Done Gate

A lane is done only when both agents agree on:

- files changed
- live command output
- endpoint proof
- remaining blocked items
- no overwrite of the other agent's lane
