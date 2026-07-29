# PURPCLAW Parity Documentation — Index

> All parity work has exactly **one authority**: [`CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md).
> Every other document in this directory is retained for historical reference only.

## Files

| File | Status |
|------|--------|
| [`CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md) | **AUTHORITY** (sole) |
| [`HARNESS_RESEARCH_DIRECTOR.md`](HARNESS_RESEARCH_DIRECTOR.md) | SUPERSEDED |
| [`PARITY_PROFILE_CLAUDE_CODE.md`](PARITY_PROFILE_CLAUDE_CODE.md) | SUPERSEDED |
| [`PARITY_PROFILE_CODEX.md`](PARITY_PROFILE_CODEX.md) | SUPERSEDED |
| [`PARITY_PROFILE_HERMES.md`](PARITY_PROFILE_HERMES.md) | SUPERSEDED |
| [`PARITY_PROFILE_KIMI.md`](PARITY_PROFILE_KIMI.md) | SUPERSEDED |
| [`STEERING_VNEXT_SPEC.md`](STEERING_VNEXT_SPEC.md) | SUPERSEDED |

## Subdirectories

| Path | Contents | Count |
|------|---------|-------|
| `research/codex/` | Codex CLI research notes | 3 |
| `specifications/` | SPEC-001 through SPEC-015 feature specs | 15 |

## Legacy parity documents

Every file below is **SUPERSEDED**. They are kept for evidence, decisions and
forgotten requirements only. None of them define current scope, completion,
priorities or parity status — [`CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md) does.

Enforced by `npm run parity:check` (also run inside `npm run docs:gate`).

### `docs/`

| File | What it actually contains | Status |
|------|---------------------------|--------|
| `docs/CANONICAL_PARITY_PRIORITY.md` | Eight-line compatibility stub that redirects to the real canonical list. | SUPERSEDED |
| `docs/PARITY_PRIORITY.md` | Identical compatibility stub under an older filename. | SUPERSEDED |
| `docs/CODEX_PARITY_AUDIT.md` | 2026-07-28/29 command-by-command table of Codex `main.rs` subcommands vs the PURPCLAW CLI, pulled from raw.githubusercontent. | SUPERSEDED |
| `docs/CODEX_PARITY_FINAL_AUDIT.md` | Session-2 re-audit against a fresh depth-1 Codex clone, with a 12/12 smoke-test claim. | SUPERSEDED |
| `docs/CODEX_PARITY_GAP_DECISION.md` | Decision record for which Codex CLI gaps were accepted, deferred or declared done. | SUPERSEDED |
| `docs/CODEX_PARITY_MATRIX.md` | Round-4 behaviour matrix comparing observable Codex `codex-rs` behaviour to PURPCLAW source. | SUPERSEDED |
| `docs/CODEX_PARITY_REAL_GAP.md` | Enumeration of Codex's full 26-command surface against `bin/purpclaw.js`. | SUPERSEDED |
| `docs/CODEX_PARITY_STATUS.md` | Old "canonical status" scorecard claiming 20/20 CLI parity. Its canonical claim is void. | SUPERSEDED |
| `docs/CODEX_PARITY_TEAM.md` | Task-by-task completion log (T-1 exec-policy and friends) from the Codex parity push. | SUPERSEDED |
| `docs/CODEX_PARITY_TODO.md` | The working TODO for that push, with per-task fix notes and file/line references. | SUPERSEDED |
| `docs/HERMES_PARITY_ARCHITECTURE.md` | Architecture notes distilled from the NousResearch `hermes-agent` reference clone: one agent loop, one shared protocol across surfaces. | SUPERSEDED |
| `docs/MULTI_SYSTEM_PARITY_AUDIT.md` | Four-way audit (Codex CLI, Claude Code, Hermes Agent, PURPCLAW) dated 2026-07-28. | SUPERSEDED |
| `docs/PARITY_AND_BEYOND.md` | Capability audit of PurpClaw against the ChatGPT app *and* Codex CLI, sourced from official docs plus truth-manifest. | SUPERSEDED |
| `docs/PARITY_AUDIT.md` | Auto-generated CLI-to-API route coverage report from `scripts/audit-parity.mjs`. | SUPERSEDED |
| `docs/PARITY_AUDIT.json` | Machine-readable competitor audit (schema `purpclaw.parity-audit.v1`) read by `scripts/verify-parity-audit.js`. | SUPERSEDED |
| `docs/PARITY_GAP_ANALYSIS.md` | 2026-07-16 critique arguing the 88/88 audit measured Python frameworks, not Claude Code. | SUPERSEDED |
| `docs/SURFACE_PARITY_SPEC.md` | Build spec for the surface-parity core (CLI/TUI/web sharing one session), 2026-07-01. | SUPERSEDED |
| `docs/SURFACE_PARITY_STEP2.md` | Follow-on build spec: TUI cockpit plus web session wiring. | SUPERSEDED |
| `docs/codex-parity-gap-report.md` | 2026-07-27 narrative gap report describing Codex's architecture as the matching target. | SUPERSEDED |
| `docs/audit/PURPCLAW_PARITY_ROUND2_2026-07-18.md` | Round-2 ground-truth comparison vs Codex / Claude Code / Hermes, authored by "Quill". | SUPERSEDED |
| `docs/generated/CLI_TUI_WEB_PARITY.md` | Surface map of which capability is reachable from CLI, TUI and web, from the 2026-06-19 routing pass. | SUPERSEDED |
| `docs/shipped/PARITY_TARGET.md` | Product-positioning target statement: resident governed operations kernel, not an IDE-tethered helper. | SUPERSEDED |

### `docs/parity/`

| File | What it actually contains | Status |
|------|---------------------------|--------|
| `PARITY_PROFILE_CODEX.md` | Research profile of the OpenAI Codex CLI (Rust terminal agent), 2026-07-18. | SUPERSEDED |
| `PARITY_PROFILE_CLAUDE_CODE.md` | Research profile of Anthropic Claude Code, 2026-07-18. | SUPERSEDED |
| `PARITY_PROFILE_HERMES.md` | Research profile of the Nous Research Hermes Agent harness, 2026-07-18. | SUPERSEDED |
| `PARITY_PROFILE_KIMI.md` | Research profile of Moonshot's Python `kimi-cli`, 2026-07-18. | SUPERSEDED |

### `research/` and `references/`

| File | What it actually contains | Status |
|------|---------------------------|--------|
| `research/PARITY_GAPS.md` | Checkbox gap tracker (done / in progress / open), last touched 2026-07-29. | SUPERSEDED |
| `research/ai_frameworks_2026/PURPCLAW_VS_TIER_S_PARITY_MATRIX.md` | Maps Tier-S framework capabilities (LangGraph, Mem0, AgentOps) onto PURPCLAW `lib/` modules, marking each GAP. | SUPERSEDED |
| `references/chatgpt-codex-parity.md` | Ability map of PurpClaw vs the ChatGPT app plus Codex CLI, with module/tool/skill counts. | SUPERSEDED |
