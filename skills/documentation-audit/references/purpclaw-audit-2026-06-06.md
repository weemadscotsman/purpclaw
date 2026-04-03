# PURPCLAW Documentation Audit — 2026-06-06

Worked example of a full documentation audit. Before: 34 stale docs from April/May. After: 4-folder structure, honest numbers.

## Before State

Root-level docs told three contradictory stories:
- **April PurpClaw**: 26 agents, separate cognitive services, neuro-symbolic "planned"
- **May PurpClaw**: memory v2 implemented, diagnostics built, cognitive stack exists
- **June PurpClaw**: Smith+Neo, reliability ledger, npm package, cognitive spine consolidation

## Inventory Command

```bash
find . -maxdepth 2 -name "*.md" -not -path "*/node_modules/*" | sort | \
  while read f; do echo "$(stat -c '%Y' "$f" | xargs -I{} date -d @{} '+%Y-%m-%d') | $f"; done
```

Result: 14 root-level .md files from April (7), May (5), June (2). 16 docs/*.md from April.

## Ground Truth Verification

```bash
# Real service count
grep "name:" ecosystem.config.js | grep "purpclaw-" | wc -l
# → 25

# Real running state
npx pm2 status
# → 0 apps running (empty!)

# Cognitive ports (all DOWN)
for port in 7880 7884 7785 7787 7786; do
  curl -s -o /dev/null -w "port $port: %{http_code}\n" "http://localhost:$port/health"
done
# → all 000 / DOWN
```

Key finding: PM2 was running but empty. 0 apps. The docs said "8 core services running" — none were running under PM2. Cognitive cluster had 6 ports defined in ecosystem.config.js but zero were reachable.

## Categorization Decisions

### → docs/current/ (6 files)
- RECOVERY.md — active runbook
- SYSTEM_OVERVIEW.md — architecture narrative
- CANONICAL_OVERVIEW.md — canonical reference
- INTELLIGENCE_SPINE.md — cognitive spine design
- TROUBLESHOOTING.md — common fixes
- token-optimization.md — token strategies

### → docs/shipped/ (6 files)
- FEATURE_ROADMAP.md — complete plan
- AGENT_ROUTING_MATRIX.md — stable reference
- PURPCLAW_AGENT_DELEGATION_BOARD.md — delegation docs
- PURPCLAW_OMNICODE_CONTRACT.md — integration contract
- PARITY_TARGET.md — parity targets
- ODYSSEUS_BEAT_PLAN.md — completed beat plan

### → docs/experimental/ (2 files)
- NORTH_STAR.md — aspirational vision
- KILL_LIST.md — technical debt to-do list

### → docs/legacy/ (34 files)
Everything pre-June 2026. Moved, not deleted. Left README.md manifest.

## Files Moved

```bash
# Root → legacy (14 files)
mv AGENTS.md AGENT_DIRECTORY.md agent-frameworks-INTEGRATION.md \
   BUGS.md CAPTAINS_LOG.md eddie_cannon_bio.md glitch_manifest.md \
   GOOP_SIGIL_EXORCISM_PLAN.md keyboard_commands_reference.md \
   NEUROSYMBOLIC_TASKS.md pc_control_abilities.md \
   persistent_vision_framework.md project_architecture.md \
   PURPCLAW_COMPLETE_ARCHITECTURE.md PURPCLAW_Runbook.md \
   PURPCLAW_Tool_Schema.md TEAM_HANDOVER.md \
   docs/legacy/

# docs/ → docs/legacy/ (16 April files)
mv docs/ANTIGRAVITY-GUIDE.md docs/ARCHITECTURE-IMPROVEMENTS.md \
   docs/BACKEND-FLOW-AND-SAFE-BOOT.md docs/COMMAND-AGENT-MAP.md \
   docs/continuous-learning-v2-spec.md docs/ECC-2.0-REFERENCE-ARCHITECTURE.md \
   docs/ECC-2.0-SESSION-ADAPTER-DISCOVERY.md docs/MEGA-PLAN-REPO-PROMPTS-2026-03-12.md \
   docs/PHASE1-ISSUE-BUNDLE-2026-03-12.md docs/PR-399-REVIEW-2026-03-12.md \
   docs/PR-QUEUE-TRIAGE-2026-03-13.md docs/SELECTIVE-INSTALL-ARCHITECTURE.md \
   docs/SELECTIVE-INSTALL-DESIGN.md docs/SESSION-ADAPTER-CONTRACT.md \
   docs/SKILL-DEVELOPMENT-GUIDE.md docs/SKILL-PLACEMENT-POLICY.md \
   docs/legacy/
```

## Deleted

- `PURPCLAW_Runbook.md` — replaced by docs/current/RECOVERY.md (already existed)
- `docs/QUICKSTART.md` — stale duplicate of root QUICKSTART.md

## Terminology Fixes Applied

1. "7 Memory Layers" → "7-Layer World Model" (README, ARCHITECTURE, CLAUDE)
2. "152 agents" → honest breakdown table with 6 categories (ARCHITECTURE)
3. "Persistent cognitive memory" → "7-layer world model: episodic, semantic, procedural, symbolic, temporal, counterfactual, emotional" (README comparison table)
4. CLAUDE.md spawn section: removed `detached: true` recommendation, replaced with `trackedSpawn` patterns + banned list

## After State

```
docs/
├── INDEX.md              navigation hub with quick-answer table
├── current/              actively maintained (6 files + README)
├── shipped/              completed deliverables (6 files + README)
├── experimental/         aspirational (2 files + README)
└── legacy/               archived (34 files + README manifest)

Root .md: 9 files, all June 2026, all accurate to v0.1.0
```

## Key Insight

The biggest risk wasn't missing implementation — it was documentation entropy. A new developer couldn't tell what was legacy, current, running, experimental, or retired without doing archaeology. The four-folder structure solves this: open any folder, read its README, know immediately what you're looking at.
