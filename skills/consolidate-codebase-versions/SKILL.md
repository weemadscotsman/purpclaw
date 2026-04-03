---
name: consolidate-codebase-versions
description: When a project exists in N versions across N subdirs (or N git branches, N language rewrites, N abandoned half-finished copies), consolidate into one canonical version. Pick the best of each, port between languages, bin the dead, ship one. Class-level pattern, not project-specific.
version: 0.1.0
category: coding
tags: [refactor, consolidation, multi-version, code-archaeology, porting]
---

# Consolidate Codebase Versions

## When to use this skill

Trigger when any of these patterns appear:

- A project has multiple subdirs that look like versions of the same thing (`V2/`, `V3/`, `V4/`, `-LEGACY/`, `-OPERATIONAL-PACK/`)
- A parent dir contains overlapping `.zip` exports of the same project
- A user says "I have N versions of X" or "merge them for best parts" or "I forgot what I built"
- A README mentions `v1`, `v2`, `v3` and the codebases diverged
- A `.omnicode/` or `package.json` says "v0.1.0" but the README talks about a v4 system
- A user has a directory that looks like a junk-drawer of related code

The signal: a single conceptual project scattered across multiple physical locations, with overlapping features, divergent implementations, and no canonical version.

## The 7-step pattern

### 1. Map before you touch anything

Read the top-level manifest of every candidate dir. For each one capture:
- `package.json` name + version
- README/QUICKSTART first 30 lines (what does it claim to do?)
- Source-tree shape (where's the code? `src/`, `services/`, `lib/`?)
- Service directory listing (cross-version comparison)
- Any `ACTUALLY_TESTED_REPORT.md`, `AUDIT_REPORT.md`, `BROKEN.md`-style files — they tell you what NOT to keep

Output: a short comparison table. Ted's SAAP case was:

| Version | Status | Path | Purpose |
|---|---|---|---|
| V3 Terminal | Working | `SAAP-V3-TERMINAL/` | Live product, JS, Docker, paper trading |
| V2 Genesis | Broken | `saap-v2/` | Protocol spec, TS, ES module config bugs |
| V2 Operational | Empty | `SAAP-V2-OPERATIONAL-PACKAGE/` | Stub docs, no real content |

This 5-minute read saves hours of confused refactoring later.

### 2. Pick the base

Always keep the **working** version as the base. Not the newest, not the most-complete-on-paper, the one whose `start` command actually starts. Verify with `node start.js` or `npm start` and HTTP-check a known endpoint. If a candidate crashes on start, it's not the base — it's a source of features you port.

In Ted's case V3 was the base. The fact that V3 had `services/oracle/index.js` that worked AND V2 had a better `dsfe-oracle` (TS) showed the right move: keep V3's file, port the V2 patterns INTO it as improvements, don't wholesale-replace.

### 3. Diff the features, not the files

Don't try to "merge" two directories at the file level — files in different versions have different names, different splits, different conventions. Instead, build a feature matrix:

| Feature | V2 Genesis | V3 Terminal | V2 Operational |
|---|---|---|---|
| Synthetic BTC feed with regime detection | yes (TS) | yes (JS, has CRASH) | — |
| Risk governor with mean-deviation | yes | yes (better: + daily loss) | — |
| Real exchange integrations (Kraken, MEXC) | — | yes | — |
| Web dashboard | — | yes | — |
| Paper trading | — | yes | — |
| Kill switch on VOLATILE/CRASH | yes (DRE, TS) | — | — |
| Telegram god mode | yes (Telegraph, TS) | — | — |
| Doc stubs | — | — | yes (empty) |

This tells you exactly what to port. In V3 there were already governors and oracles; the "new" features worth porting were DRE and Telegraph. Everything else was either duplicated, inferior, or empty.

### 4. Port TS to JS at the service boundary (when base is JS)

Ted's V3 base was JavaScript (no build step, runs anywhere). V2 services were TypeScript (`ts-node`, broken ES module config). The right move: port the LOGIC, not the types. Re-implement in the base's style. Skip `.ts` → `.js` mechanical translation; that's a maintenance trap (you inherit the broken config too).

Pattern: copy the V2 file, rewrite it in the base's language/conventions, wire it into the base's package.json + docker-compose, drop a one-liner Dockerfile.

In SAAP: the V2 DRE was 27 lines of TS logic. The port to `services/dre/index.js` was 80 lines of JS with proper error handling, recovery (auto-resume on regime normalized), and a graceful no-NATS fallback. The port was MORE than the original because the JS version added the resume path the V2 version didn't have.

### 5. Update the package + container layer

After porting, the new services need:
- `services/<name>/index.js` — the code
- `services/<name>/package.json` — its own deps (so Docker builds stay minimal)
- `services/<name>/Dockerfile` — for compose
- Entry in root `package.json` scripts (`start:<name>`)
- Entry in `docker-compose.yml` with right `depends_on`
- Env vars documented in README

For SAAP this was: `services/dre/{index.js, package.json, Dockerfile}` and same for `telegraph/`. Plus the v0.4 version bump in root `package.json` and the new service entries in compose.

### 6. Bin aggressively, but preserve off-topic

Bin (delete):
- The losing versions' source trees entirely
- All `.zip` exports of the losing versions (they're redundant archives of dead code)
- Any `.zip` that was an old export of what you just consolidated
- "REPORT" files that documented the bugs you just fixed (they're historical noise now)
- Test-only dirs like `test_extract/`, `test_telegraph/` that were extraction experiments

Preserve (move to `_archive/`):
- Off-topic files that happened to live in the same parent dir (NDAs, personal docs, unrelated PDFs)
- Stuff the user clearly intended to keep but doesn't fit the consolidated project
- Files you can't confidently classify

For SAAP: deleted `saap-v2/` (broken TS, 30MB), `SAAP-V3-TERMINAL/` (now duplicated by SAAP/), 10+ `.zip` exports, the V2 audit reports. Moved NDAs, MINTEDJUNKIES, PVX, MCS-DOE bridge zips to `_archive/`. Total reclaimed: ~130MB. Off-topic files preserved with a clear marker dir.

### 7. Document the merge

The output dir needs:
- New README with v0.X of the consolidated project (don't carry over the "V3 README" or "V2 README" — write fresh)
- `MERGE_NOTES.md` (or `CONSOLIDATION_NOTES.md`) explaining what came from where, what was binned and why, and what the next version's priorities are
- CHANGELOG entry with the version bump and "added/removed/why" lines
- One-liner pointer in the README that this dir is the canonical home

For SAAP: `README.md` was rewritten to describe the 6-service v4.0 architecture. `MERGE_NOTES.md` documented the feature matrix, what was binned, and the 4 next-step ideas. Both saved the user from re-discovering the history later.

## Pitfalls

### Don't port ALL features, only the best

"V2 has feature X, V3 has feature Y, why not include both?" Because that's how you end up with a dead codebase full of "either-or" configs. Pick the version that does X best, use that. The "best" version might not be the newest; it's the one whose implementation you'd actually defend in a code review.

### Don't `git pull --force`

When the GitHub repo exists with a 2-file stub commit (LICENSE + placeholder README) and your local has the real work, the natural urge is `git push --force`. Don't. Pull with `--allow-unrelated-histories`, resolve the README conflict by keeping your (richer) version, then push. You keep the LICENSE the upstream placeholder added, your README wins, the git history is honest.

```bash
git pull --no-rebase --allow-unrelated-histories origin main
# CONFLICT (add/add) in README.md
git checkout --ours README.md
git add README.md LICENSE
git commit -F /tmp/merge-msg.txt
git push -u origin main
```

### A "minimal" V2 service might be the killer feature

V2's `dre` was 27 lines. V2's `telegraph` was 88 lines. Both were easy to dismiss as "small, replaceable." They were actually the most distinctive value-add over V3. Always read the short ones — they're often the high-leverage ones.

### Don't blindly trust the "newest" version

V2 Operational was the newest name (V2-OPERATIONAL-PACKAGE sounds like a finalized release) but had empty stub docs. V3 Terminal was older-named but was the only working code. Date in the name ≠ maturity. Run the candidate before picking a base.

### The parent dir might not be a git repo

The dir you're consolidating might be a subdirectory of a bigger monorepo (`.git/` two levels up). In that case, `git init` inside the consolidated dir to give it its own history, then add a `.gitignore` that excludes `node_modules/`, `dist/`, `.omnicode/`, `*.db`, `audit.fallback.log`, model files. Add the remote the user gave you (often the URL doesn't match the dir name — Ted said `omnicode` not `omnicode-mcp`).

### Off-topic files exist in "junk drawer" project dirs

Project dirs with multiple version subdirs often ALSO contain personal/archived files: NDAs, MINTEDJUNKIES.txt, unrelated PDFs, half-finished side projects. These are not part of the consolidation. Move them to `_archive/` rather than delete — they're the user's archive, not yours to bin. Ted's SAAP-V2-GENESIS-PACK had 5 NDA formats, 2 unrelated zips, a 2022-2025 PDF — all moved to `_archive/`, not deleted.

## Verification after consolidation

1. `node --check` on every new/ported service file — catches syntax errors
2. `npm run build` (or `npx tsc`) for the root — catches type/import errors  
3. Try to start the system: `node start.js` or `npm start`
4. If it crashes, read the stack trace, fix, restart
5. If a config handler dies on the first socket message (like the SAAP `msg.data` bug), patch all handlers that share the pattern, not just the one that crashed
6. Open the UI, click through the features, confirm the live behavior matches the README claims
7. `git log --oneline | head` to confirm the commit landed

## Quick reference: what the consolidated SAAP v4.0 ended up with

For reference, the worked example from this skill's origin session:

```
SAAP/                                     (canonical home, formerly V3 Terminal + V2 ports)
├── README.md                             (rewritten, v4.0 highlights)
├── MERGE_NOTES.md                         (what came from where, what was binned)
├── docs-SAAP-VERSIONS-HISTORY.md         (the mapping analysis I wrote first)
├── package.json                           (v4.0.0, all 6 services in scripts)
├── docker-compose.yml                     (all 6 services + nats)
├── services/
│   ├── oracle/      (V3 — regime detection, overrides)
│   ├── governor/    (V3 — daily loss + position cap + 5% deviation)
│   ├── trader/      (V3 — Kraken + MEXC spot/futures, paper mode, strategies)
│   ├── ui/          (V3 — Express + Socket.IO dashboard on :3000)
│   ├── dre/         (V2 port — kill switch on CRASH/VOLATILE)
│   └── telegraph/   (V2 port — Telegram god mode + alerts)
└── (rest is V3 unchanged: src/, public/, data/, mock-nats.js, start.js, etc.)
```

About 130MB of broken/abandoned V2 code binned, off-topic files (NDAs, MINTEDJUNKIES, PVX) preserved in `_archive/`. Single-process start still works (`node start.js` for the demo); full deployment is `npm run dev:full` (all 6 services + NATS).

## Related skills

- `coding-standards` — for the language/style conventions you should be matching when porting between languages
- `subagent-driven-development` — useful when the consolidation has parallel-independent workstreams (e.g. port N services at once)
- `systematic-debugging` — for the inevitable "the merged code crashes" moment
- `writing-plans` — for the planning skill that should happen BEFORE the consolidation starts
