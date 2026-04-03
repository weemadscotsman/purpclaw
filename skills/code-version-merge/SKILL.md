---
name: code-version-merge
description: Merge multiple divergent versions of the same codebase into one canonical project. Map all versions, identify overlap, port missing features to the best base, wire config, bin the dead, document. Use when the user has N>1 versions of a project (named V1/V2/V3, GENESIS/OPERATIONAL/TERMINAL, etc.) and wants one clean target.
version: 1.0.0
category: software-development
tags: [refactor, merge, code-archaeology, version-consolidation, code-cleanup]
---

# Code Version Merge

When a user shows up with multiple "versions" of the same project — V1, V2, V3, GENESIS, OPERATIONAL, TERMINAL, etc. — and asks you to merge them into the best one, the technique is: map → identify gaps → port → wire → bin → document. Skip the temptation to do a 3-way merge tool. The codebases diverge too much in implementation (TypeScript vs JavaScript, broken vs working) for git to do anything useful.

## The 7-step pattern

### 1. Map every version

For each version dir, capture:
- The `package.json` (or equivalent) — what does it think it is
- Top-level README / QUICKSTART / EXECUTIVE_SUMMARY — what does it claim to do
- Subdirectory tree (services/, src/, core/, ops/) — what does it actually have
- File listing of every service module

Build a table: version → status (working/broken/abandoned) → main purpose → service count.

### 2. Read every service file

For each service across all versions, read the full source. Note:
- What NATS subjects it publishes to / subscribes from
- What external libraries it pulls
- Whether the same NATS subject name has the same shape across versions (it usually doesn't)
- What's broken per `ACTUALLY_TESTED_REPORT.md` or similar audit docs

Output: a feature matrix. "V2 has feature X with impl style Y, V3 has feature X with impl style Z."

### 3. Pick the base

The base is the version that:
- Works (no broken imports, runs, has tests, has docs)
- Is in the language you want to ship in (don't pick TS if you can't compile it)
- Is closest to the user's stated use case
- Has Docker, paper-mode, or similar production-affordances

The other versions become **port sources** (lift missing features) or **bins** (delete).

### 4. Port the gap features

For each "feature present in V2 but missing in V3":
- Translate from V2's source language to the base's source language if they differ (most common: TypeScript → JavaScript, no build step)
- Add to the base under the same NATS subject so existing services can use it
- Test by reading the new file end-to-end for runtime issues (V2's broken code often has subtle bugs)

Pattern for the ported file:
1. `import` only what the base project already has
2. Keep the same NATS subject names as V2 (so behavior is consistent across versions)
3. Match the base project's style: function-as-class vs class, async/await, log prefixes

### 5. Wire config

Update the base project to know about the new services:
- Add to `package.json` scripts (`start:dre`, `start:telegraph`)
- Add new `dev:full` script that includes everything
- Add to `docker-compose.yml` (each service gets a build entry, depends_on chain, network)
- Add Dockerfiles per service if the base has them per-service
- Update `package.json` dependencies for any new libraries (e.g. `node-telegram-bot-api`)

### 6. Bin the dead

For each version that isn't the base:
- Delete the version dir (it's not the source of truth anymore)
- Delete redundant `.zip` exports of old code
- Delete `ACTUALLY_TESTED_REPORT.md` and similar audit docs (the bugs they document are fixed in the merge — keep a `MERGE_NOTES.md` instead)
- Move off-topic files (NDAs, unrelated PDFs, the user's personal stuff that landed in the project dir) to a `_archive/` subdir, not deletion. Off-topic ≠ dead code.

Critical: confirm the off-topic files are NOT SAAP-related before moving. Look at file content. If unsure, leave it.

### 7. Document the merge

Write `MERGE_NOTES.md` in the new project root:
- Date and target dir
- What was lifted from where (table)
- What was binned and why
- Bloat recovered (~MB)
- v(N+1) ideas (optional)

Update the README with a v-bump entry: features added, what's new, what was removed.

## Pitfalls

### Don't trust the version with the longest name

`V2-GENESIS-PACK`, `V2-OPERATIONAL-PACKAGE`, `V3-TERMINAL` — the most "official" sounding one is often the empty packaging stub. Always read the file listings, not the names.

### Sub-dirs with the same name but different content

The `services/` subdir in V2 might be entirely different services from the `services/` subdir in V3. Don't merge them at the directory level — port individual services file by file.

### Don't `git merge` divergent versions

The codebases diverge in syntax, build system, package manager, and feature set. A 3-way git merge produces conflicts on every file. Use file-by-file porting. The "merge" is a fresh repo of the new combined state, with a single `MERGE_NOTES.md` describing what happened. No git history to preserve.

### Different NATS subject names

V2 uses `pvx.oracle.tick`, V3 uses `oracle.tick`. Pick the base's convention and use it everywhere. Update ported services to match. Don't try to support both — you'll have bugs.

### Don't blindly trust "operating mode" indicators

V2 had `dre` (Danger Response Engine) labeled as "kill switch on VOLATILE". V3 doesn't label it that way but the same behavior is implicit in the governor's `HIGH_VOLATILITY` veto. Don't assume V2 has a unique feature just because it has a unique name — re-read V3 to confirm.

### Off-topic files in the project dir

The user's project dirs often contain NDAs, proofs of work, demos, or other projects' files. Move these to `_archive/` rather than delete. If you're not sure whether a file is part of the project, leave it (use `head` to peek if needed).

### Don't keep the abandoned version around "for reference"

The user said "merge" and "bin the extra". Leaving V2 around defeats the purpose — future sessions will be confused about which is canonical. Delete (or move to `_archive/` if there's a real reason). The merge notes document what was lost.

### Web page update

If the merged project has a web page (e.g. `docs/index.html` for gh-pages), update it to reflect the new merged feature set. Don't ship a v4 codebase with a v3 web page — it confuses visitors.

## Verification after merge

```bash
# 1. All service entry points parse
for f in services/*/index.js; do node --check "$f"; done

# 2. npm install in the new project (or skip if node_modules is copied)
npm install

# 3. Dry-run the main entry to catch import errors
node start.js --help 2>&1 | head -20
# (or whatever the base project's no-network mode is)

# 4. Spot-check the NATS subject names across the codebase
grep -rn "publish\|subscribe" services/ | grep -oE "['\"]\w+\.\w+['\"]" | sort -u
# All subjects should follow the same naming convention
```

## When NOT to use this skill

- **Two parallel branches with a clean common ancestor** — that's `git merge`, do that instead
- **Backporting a few features from main to a release branch** — that's cherry-pick, much simpler
- **Refactoring a single messy module** — that's standard refactor, no version-merge needed
- **User wants you to keep all versions around** — don't merge, just unify the docs

## Files in this skill

- `references/mapping-template.md` — blank feature matrix you can fill in during step 1-2
