---
name: documentation-audit
description: Audit documentation against live system state — categorize by vintage, split into current/legacy/experimental/shipped, fix terminology drift, and make honest numbers the standard.
when_to_use: Documentation has drifted from reality. Docs contradict each other. Agent counts, service counts, or port numbers are wrong. "Last updated" dates span months. New developers can't tell what's current vs. legacy. Or the user explicitly asks for a doc audit.
---

# Documentation Audit

Audit project documentation against live system state. The goal is not to make docs beautiful — it's to make them **not lie**.

## Signals that trigger this

- Docs reference different service/agent/tool counts
- "Last updated" dates span multiple months
- PM2 config says one thing, README says another, QUICKSTART says a third
- "152 agents" in the subtitle but 35 in the tower
- Someone says "the docs are telling three different stories"

## Methodology

### Phase 1: Inventory

```bash
# List all docs with modification dates
find . -maxdepth 2 -name "*.md" -not -path "*/node_modules/*" | sort | \
  while read f; do echo "$(stat -c '%Y' "$f" | xargs -I{} date -d @{} '+%Y-%m-%d') | $f"; done
```

Group by month. April docs, May docs, June docs — each group tells a different story.

### Phase 2: Ground truth

Verify the canonical source against reality:

```bash
# Service counts
grep "name:" ecosystem.config.js | grep "purpclaw-" | wc -l

# Actual running services
npx pm2 status 2>/dev/null

# Port reachability
for port in $(grep -oP 'port.*?(\d+)' ecosystem.config.js | grep -oP '\d+'); do
  curl -s -o /dev/null -w "port $port: %{http_code}\n" "http://localhost:$port/health" || echo "port $port: DOWN"
done
```

Never trust what docs say a service is doing. Check the port. Check PM2. Check the process list.

### Phase 3: Categorize

Sort every doc into one of four buckets:

| Folder | Criteria |
|---|---|
| `docs/current/` | Actively maintained. Reflects running v0.x. Recovery, troubleshooting, active architecture. |
| `docs/shipped/` | Completed deliverables. Stable reference. Roadmaps, contracts, routing matrices — things that are done and won't change often. |
| `docs/experimental/` | Aspirational. North stars, kill lists, vision docs — things that describe a future state, not current reality. |
| `docs/legacy/` | Everything pre-dating the current major version. April docs when it's June. |

Rule of thumb: if a doc's date is older than the current major version's ship date, it goes to legacy.

### Phase 4: Rewrite survivors

For docs that stay, fix the numbers:

**Agent counts:** Never say "152 agents" without qualifying. Use the honest breakdown:

```
| Category | Count |
|---|---|
| Skill directories | 152 |
| Documented personas | 42 |
| Executable code modules | 54 |
| Runtime deployable | 35 |
```

**Service counts:** Distinguish "defined" (in ecosystem.config.js) from "running" (PM2 status = online) from "integrated" (actually participating in decisions).

**Port tables:** Verify every port against the actual ecosystem.config.js. Docs saying `pool :7880` when it's actually `:7885` is a lie.

### Phase 5: Create index

Always leave a `docs/INDEX.md` with:
- Folder map (current/shipped/experimental/legacy)
- Quick-answer table ("Something broke?" → current/RECOVERY.md)
- No stale references to archived files

## Honest numbers pattern

Every aggregate number in docs should survive this test: "If a new developer opens the tower and counts, will they find this number?"

If the answer is no, break it down. The number "152" is accurate as a directory count. It is a lie as a "running agent" count.

Terminology matters:
- "7 Memory Layers" → "7-Layer World Model" (it stores time, rules, beliefs, counterfactuals — that's a world model, not a database)
- "25 services" → "25 defined (9 core running, 16 dark)"
- "152 agents" → always paired with "35 deployable"

## Pitfalls

- **Don't delete legacy docs.** Move them. Someone will need the April architecture doc to understand why a decision was made.
- **Don't trust docs that say "CURRENT" in their status column.** Verify against live system.
- **Stale duplicates**: a QUICKSTART.md in both root and docs/ means one is wrong. Diff them, keep the right one, delete the stale one.
- **CLAUDE.md spawn patterns**: if CLAUDE.md recommends `detached: true`, it's actively dangerous. Fix it immediately.
- **Terminology drift**: "memory matrix" vs "world model" — pick one and use it everywhere. Mixed terminology across docs is a signal that no one's been curating.

## Verification

After audit, a new developer should be able to:
1. Open `docs/INDEX.md` and find any doc in under 10 seconds
2. Open `ARCHITECTURE.md` and see numbers that match `ecosystem.config.js`
3. Open `QUICKSTART.md` and run the commands without hitting port conflicts
4. Never encounter a doc that says "152 agents" without the breakdown

## Reference example

See `references/purpclaw-audit-2026-06-06.md` for a complete worked example: 34 docs archived, 4-folder structure created, terminology fixes applied, ground truth verification commands.
