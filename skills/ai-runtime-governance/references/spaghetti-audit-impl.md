# Spaghetti Audit — Scoring Algorithm

## Scoring Formula

Each file gets a weighted score (0-100+) across these signals:

| Signal | Weight | What it measures |
|--------|--------|-----------------|
| Large file | high | Lines beyond 500 — anything >500LOC needs decomposition |
| High branches | high | if/else/switch/catch/for/while/&&/\|\| density |
| High functions | high | Function count relative to file size |
| Deep nesting | high | Indentation beyond 4 levels |
| Circular deps | critical | Import cycles indicate design problems |
| Hidden globals | high | Mutation of objects not declared in scope |
| Many exports | medium | Surface area — more exports = more coupling risk |
| Limited tests | medium | No test file for this module |

## Verdict Thresholds

| Score | Verdict | Rationale |
|-------|---------|-----------|
| ≥85 | ANNONA | Dangerously complex — archive and do not touch |
| ≥70 | BIN/REWRITE | High risk to touch incrementally — full rewrite safer |
| ≥45 | QUARANTINE | Complex but potentially salvageable — isolate, don't edit |
| ≥25 | REFACTOR | Moderate complexity — schedule cleanup |
| <25 | TRACEABLE | Acceptable complexity |

## PURPCLAW Audit Results (2026-05-23)

| File | Score | Verdict | Notes |
|------|-------|---------|-------|
| unified_api.js | 88 | ANNONA | facade decompose before surgery |
| bin/purpclaw.js | 75 | BIN/REWRITE | 92KB god-file, CLI rewrite first |
| orchestrator.js | 67 | QUARANTINE | extract preflight/dispatch/approval gate |
| agent_tower.js | 62 | QUARANTINE | role/lifecycle separation after orchestrator |
| install-lifecycle.js | 54 | QUARANTINE | — |
| GroqClient.ts | 48 | QUARANTINE | — |
| spinUpAgent.js | 41 | REFACTOR | — |
| memory_matrix_v2.py | 40 | REFACTOR | — |
| lib/utils.js | 37 | REFACTOR | — |
| gatekeeper.js | 34 | REFACTOR | — |
| vision_monitor.js | 29 | REFACTOR | — |

## Anti-Patterns That Score High

Score increases when:
- File has >1 responsibility (routing + validation + execution + reporting)
- Globals mutated by multiple functions without explicit declaration
- Import chain creates circular dependency
- No corresponding test file
- Export surface grows without architectural planning
- Comments indicate "I don't know why this works"

## Refactoring Wins (measurable)

After a rewrite:
- Score should drop by ≥20 points for the file to be considered improved
- Export count should decrease (single responsibility)
- Function count should stay similar but functions should be shallower
- Test file should appear alongside the module

`purpclaw spaghetti diff <before_score> <after_score>` would be the quality gate — reject any refactor that doesn't measurably reduce score.