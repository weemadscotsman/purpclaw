---
name: documentation-cleanup
description: Audit, categorize, archive, and rewrite project documentation when it drifts from reality. Four-folder structure (current/shipped/experimental/legacy). Honest numbers. Terminology audit.
when_to_use: Documentation drift — stale service counts, outdated architecture, multiple eras of docs fighting each other, new users can't tell what's current vs. legacy
---

# Documentation Cleanup

When documentation entropy exceeds implementation reality, the docs become the biggest bug.

## When to use this

- Multiple generations of docs coexist (April/May/June versions all saying different things)
- Service counts, agent counts, or port numbers are wrong in docs
- Architecture docs describe a system that no longer exists
- New users ask "which startup path is real?" or "how many agents are there really?"
- Docs recommend dangerous patterns that the codebase has since fixed (e.g. `detached: true` spawns)
- The README claims things that are "built in code but never booted"

## The methodology

### Phase 1: Audit

```bash
# List all docs with modification dates
find . -maxdepth 2 -name "*.md" -not -path "*/node_modules/*" | while read f; do
  echo "$(stat -c '%Y' "$f" | xargs -I{} date -d @{} '+%Y-%m-%d') | $f"
done | sort
```

Categorize every doc by date cluster:
- **Current era** (this month): actively maintained
- **Previous era** (last month): partially stale
- **Ancient** (2+ months ago): likely archival

### Phase 2: Categorize by state, not by date

| Folder | What goes there | Rule |
|---|---|---|
| `docs/current/` | Actively maintained, reflects running system | "If it breaks, this doc tells you how to fix it" |
| `docs/shipped/` | Completed deliverables, stable reference | "This was a plan, now it's done, doesn't change" |
| `docs/experimental/` | Aspirational, not yet implemented | "This is the vision, not the reality" |
| `docs/legacy/` | Pre-current-era, historical only | "This was accurate for its time but that time passed" |
| `docs/artifacts/` | Non-doc historical artifacts (complaints, manifests, gacha results) | "This is a fossil, not a document" |

### Phase 3: Archive with manifest

Create `docs/legacy/README.md` listing every archived file with:
- Original date
- Why it was archived (what changed)
- Where to find the current equivalent

Never delete — move. The fossil record has value.

### Phase 4: Rewrite the key docs

Priority order:
1. **README.md** — first thing anyone sees. Must have honest numbers.
2. **QUICKSTART.md** — second thing. Must work copy-paste.
3. **ARCHITECTURE.md** — the canonical reference. Create if missing.
4. **CLAUDE.md** — what AI agents read on entry. Must not recommend dangerous patterns.
5. **CHANGELOG.md** — append the ship entry, don't rewrite history.

### Phase 5: Create navigation

`docs/INDEX.md` with:
- Folder map showing the structure
- Quick-answer table ("Something broke?" → `current/RECOVERY.md`)
- Clear indication of what's current vs. legacy

## Terminology audit (critical)

As part of the rewrite, audit every number and term:

| Check | Example |
|---|---|
| Service count | "8 services" → actually 25 defined, 9 core running |
| Agent count | "152 agents" → 152 directories, 35 deployable. Be honest. |
| Port numbers | "pool on :7880" → actually :7885 now (cognitive spine is :7880) |
| Layer names | "7 Memory Layers" → "7-Layer World Model" (it's more than memory) |
| Startup paths | Multiple launchers → one true path documented |

### Honest breakdowns

Never say "152 agents" without the breakdown:
```
| Category | Count |
|---|---|
| Skill directories | 152 |
| Documented personas | 42 |
| Executable code modules | 54 |
| Runtime deployable | 35 |
```

Same for services — distinguish "defined in PM2 config" from "actually running right now."

## Pitfalls

- **Don't delete, archive.** Future you will want the fossil record.
- **Don't trust doc dates alone.** A file from last week might describe architecture from two months ago.
- **Check that CLAUDE.md doesn't recommend dangerous patterns.** In the PURPCLAW cleanup, CLAUDE.md was recommending `spawn(cmd, args, { detached: true })` as the correct pattern — the exact thing that caused the spawn cascade.
- **Honest numbers prevent GitHub issues.** "152 agents" becomes Issue #7: "agent count fake?" unless you break it down.
- **Stale duplicate docs.** Check for identical files in both root and docs/ — remove the stale copy.
- **Terminology drift is evil.** If you rename a concept, update every doc that uses the old name.
- **⚠️ VERIFY BEFORE ARCHIVING FOLDERS.** When moving disconnected folders to legacy, grep the core files (unified_api.js, boot.js, agent_tower.js, bin/purpclaw.js, ecosystem.config.js) for references to the folder name. A folder with 0 grep hits is truly dead. A folder with references (like `accuracy_fish/` which was required by `lib/harness/engine.js`) is NOT dead — it's just in the wrong location. Ask the user before archiving anything you're unsure about. One "but I need that" from the user is a permanent scar on trust.

## Verification

```bash
# After cleanup, a new user should be able to:
# 1. Find the README in < 5 seconds
# 2. Install and boot in < 2 minutes
# 3. Know exactly how many services are running vs. defined
# 4. Never see conflicting architecture claims
# 5. Open docs/INDEX.md and navigate to any topic

# Quick audit:
echo "Root .md files:" && ls *.md | wc -l
echo "docs/current/:" && ls docs/current/ | wc -l
echo "docs/legacy/:" && ls docs/legacy/ | wc -l
echo "docs/shipped/:" && ls docs/shipped/ | wc -l
echo "docs/experimental/:" && ls docs/experimental/ | wc -l
```
