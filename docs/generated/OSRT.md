## 2026-07-04 — Doc Truth Repair

### What
PURPCLAW docs had widespread stale/inflated numbers from pre-v0.3.0 era.
Fresh count done against live source. 9 docs patched. Full report generated.

### Why
Docs claimed numbers that no longer matched the codebase after tools-pc.js deletion
and skill consolidation. Misleading for any agent or human reading them.

### Changes (9 docs patched)

#### `PRODUCT.md` (83 lines)
- Runtime line: 461 tools/85 agents → 31 native tools/42 personas
- Numbers section: 30+49+1=80 → 30+1=31; 42 OmniCode MCP → separate repo note
- Total tools: 122 → 76 (31 native + 45 OmniCode separate)
- Agents: 85 → 42; Skills: 399 → 383
- Architecture diagram: tools-pc.js reference removed

#### `LAUNCH.md` (68 lines)
- Header: stamped 'v0.2.0 STALE — UPDATE NEEDED'
- X Post / LinkedIn / HN: 54 tools/152 agents → 31/42/383
- Launch copy now has correct numbers ready for v0.3.0 publish

#### `CURRENT_STATE.md` (66 lines)
- tools-pc.js: '49 tools' → 'DELETED — file no longer exists'
- Native tools: 80 → 31; OmniCode: '42 MCP' → separate repo
- Skills: 399 → 383

#### `CLAUDE.md` (224 lines)
- What Is This: 25-service/152-agent/500-tools → 26/42/31+45=76
- v0.1.0 history: '110 tools confirmed' annotated stale
- ARCHITECTURE.md doc entry: stale flag added

#### `CHANGELOG.md` (339 lines)
- v0.1.0: '110 tools confirmed' → annotated tools-pc.js later deleted
- Earlier history: '26 → 152' → '26 → 152 → 42' annotated

#### `NEXT_FEATURES.md` (47 lines)
- 399 skills → 383 (2 occurrences)

#### `docs/SYSTEM_TRUTH.md` (176 lines)
- Header: ⚠️ HISTORICAL (2026-06-09) banner added
- Real counts section: 35 agents → 42; 176 tools → 31; 390 skills → 383
- Tower tool loop queue item: numbers updated

#### `docs/runtime/RUNTIME_CROSSWALK.md` (186 lines)
- Agent Tower row: '85 agents' → '42 named personas'

#### `divisions/engineering/memory/handoff-engineering.md` (451 lines)
- Agent roster: 85 → 42 personas
- Swarm/persona breakdown: simplified to single 42 count

### New file
- `docs/generated/DOC_VS_STACK_COMPARISON.md` (154 lines) — full doc-vs-stack audit
  - Critical finding: GitHub vs local E: drive divergence
  - GitHub has v0.2.0 README (491 tools, 35 agents) — stale export
  - Local E: is v0.3.0 (110-line README, correct numbers)
  - git remote is `zamp.git` not `purpclaw.git` — not synced

### Correct numbers (verified 2026-07-03)
```
Native tools:     31  (30 lib/tools/index.js + 1 skills-registry.js)
OmniCode MCP:    45  (separate repo at omnicode-platform/)
Accessible:       76  (31 + 45)
Agent personas:   42
Skills:          383
PM2 services:    26
LLM providers:   17
API routes:       85
Next.js pages:    25
```