# docs/ audit — 2026-08-04

Evidence: `node tools/diagnostics/audit-docs.js --full`
Machine-readable findings: `var/reports/docs-audit.json`

## Headline

`docs/` is **1,238 files / 20.91 MB**, of which **1,094 are markdown**. Only
**282 of those markdown files mention PurpClaw at all**.

| bucket | files | share |
|---|---|---|
| Another project's documentation (`affaan-m/everything-claude-code`) | 712 | **65%** |
| Mentions PurpClaw | 282 | 26% |
| English, mentions neither | 100 | 9% |

The single biggest problem is not staleness. It is that two thirds of `docs/`
documents **a different repository**.

## Finding 1 — 712 files belong to another project

`docs/zh-CN`, `zh-TW`, `ja-JP`, `ko-KR`, `pt-BR` and `tr` are localised
documentation for **`affaan-m/everything-claude-code`** (ECC), an unrelated
MIT-licensed GitHub project. Evidence:

- every locale `README.md` opens with `# Everything Claude Code` and ECC's
  GitHub/npm badges (`ecc-universal`, `ecc-agentshield`)
- the trees mirror `agents/ commands/ contexts/ examples/ hooks/ plugins/
  rules/ skills/` — **none of which exist under `docs/`**
- they contain `CODE_OF_CONDUCT.md`, `SPONSORING.md`, `CLAUDE.md`, which
  PurpClaw does not have
- `grep -rli purpclaw` across all 712 files returns **0**

The audit's "692 translations whose English source is gone" is this same fact
seen from another angle: the sources were never here.

Six English docs are also ECC's: `legacy/SELECTIVE-INSTALL-ARCHITECTURE.md`,
`legacy/SKILL-DEVELOPMENT-GUIDE.md`, `legacy/MEGA-PLAN-REPO-PROMPTS-2026-03-12.md`,
`legacy/PR-QUEUE-TRIAGE-2026-03-13.md`, `business/metrics-and-sponsorship.md`,
`business/social-launch-copy.md`.

**Disposition:** move to `research/references/everything-claude-code/`, keeping
LICENSE and attribution intact. It is legitimate reference material; it is not
PurpClaw's documentation and must not be indexed, searched or maintained as if
it were. Do not delete third-party licensed content.

## Finding 2 — 10.73 MB of `docs/` is not documentation

134 non-document files, largest first:

| bytes | file | what it is |
|---|---|---|
| 7,656,455 | `docs/docs.zip` | **a zip of `docs/` inside `docs/`** |
| 668,599 | `legacy/root-cleanup-2026-06-06/no-spaghett.zip` | archived zip |
| 420,582 | `legacy/root-cleanup-2026-06-06/agent_score.json` | build data |
| 322,053 | `audit/FULL_REPO_FILE_INVENTORY_2026-06-30.csv` | generated inventory |
| 222,770 | `archive/ui-shadow-2026-06-22/enthea.html` | source, not docs |
| 186,177 | `legacy/root-cleanup-2026-06-06/tsconfig.tsbuildinfo` | build artifact |
| 172,640 | `archive/ui-shadow-2026-06-22/skyscraper/panels.jsx` | source, not docs |
| 66,245 | `legacy/ghostbusters-2026-06-06/__pycache__/*.pyc` | **compiled Python** |

`docs.zip` alone is 37% of the whole folder and is a stale copy of its own
parent.

**Disposition:** delete `docs.zip`, `__pycache__/`, `*.pyc`, `*.tsbuildinfo`.
Move generated inventories (`.csv`, `.json`) to `var/reports/`. Move `.tsx`,
`.jsx`, `.html` source snapshots to `research/experiments/`.

## Finding 3 — 250 docs cite files that no longer exist

Two categories, and the distinction decides the fix:

**Historical records — correct as they stand.** A dated audit describing a tree
that has since changed is doing its job. `PURPCLAW_FULL_AUDIT_2026-06-29.md`
(19 dead refs), `audit/FULL_REPO_FOLDER_INVENTORY_2026-06-30.md` (17),
`legacy/CAPTAINS_LOG.md` (12). Leave the content; move them under
`docs/archive/` so nobody reads them as current.

**Living maps — actively wrong.** These present themselves as the current state
and are not:

| doc | size | dead refs | note |
|---|---|---|---|
| `ARCHITECTURE_MAP.md` | 108 KB | 159 | generated; claims "Live source files: 578" |
| `STACK_MAP.md` | 39 KB | 44 | generated; role counts from a tree that no longer exists |
| `runtime/RUNTIME_AUDIT.md` | — | 16 | cites `lib/kernel.js`, `lib/session-persistence.js` |
| `shipped/FEATURE_ROADMAP.md` | — | 15 | cites `lib/intelligence-spine.js`, `lib/gateways/*` |

`ARCHITECTURE_MAP.md` and `STACK_MAP.md` are **generated artifacts**, not
authored prose. Regenerable output does not belong in `docs/` — it belongs in
`var/reports/`, produced by a script, so it cannot silently rot into a
confident lie about the codebase.

## Finding 4 — six competing indexes

`DOC_CATALOG.md` (157 KB), `ROUTE_INDEX.md` (23 KB), `AGENT_ROOT_INDEX.md`,
`DOCS_INDEX.md`, `INDEX.md`, `CANONICAL_MAP.md`.

**1,006 of 1,094 markdown files are linked from no other document.** Six
indexes and 92% orphan rate is the same failure the parity docs had: when no
index is authoritative, every agent picks a different one.

**Disposition:** one index (`docs/INDEX.md`), generated from the tree, with the
other five reduced to pointers — exactly the pattern
`CANONICAL_PARITY_PRIORITY.md` already uses successfully.

## Finding 5 — parity and audit sprawl (partly already solved)

29 parity docs and 38 audit docs at the English level.

Parity is **already handled correctly** and should be left alone: the root
`CANONICAL_PARITY_PRIORITY.md` is a 262-byte compatibility pointer to
`docs/parity/CANONICAL_PARITY_PRIORITY.md`, and `scripts/parity-authority-check.js`
enforces it. That is the model for Finding 4.

The 38 audit docs need dating and archiving, not merging — each is a snapshot of
a different moment and merging them would destroy the record.

## Finding 6 — near-zero exact duplication

Only one duplicate pair repo-wide: `HEARTBEAT.md` and `openclaw-heartbeat.md`
(261 bytes, byte-identical). The bloat is foreign content and generated
artifacts, not copy-paste.

25 docs have broken internal markdown links; most are inside the ECC trees and
resolve once those move.

## Proposed disposition

Ordered by bytes recovered per unit of risk. Nothing here deletes PurpClaw
content.

| # | action | files | reclaims | risk |
|---|---|---|---|---|
| 1 | delete `docs.zip`, `*.pyc`, `__pycache__/`, `*.tsbuildinfo` | ~12 | 7.9 MB | none — regenerable or self-copy |
| 2 | move 6 locale trees + 6 English ECC docs to `research/references/everything-claude-code/` | 718 | ~7 MB | none — additive move, licence preserved |
| 3 | move generated maps to `var/reports/`, add a regenerate script | 4 | 150 KB | low — stops them rotting into lies |
| 4 | move generated inventories/source snapshots out of `docs/` | ~120 | 1.5 MB | low |
| 5 | consolidate 6 indexes to 1 generated `INDEX.md` + pointers | 6 | — | low — proven pattern |
| 6 | move dated audits/legacy under `docs/archive/` | ~150 | — | low — content preserved |

After 1–4, `docs/` is roughly **370 files / ~4 MB**, all of it about PurpClaw.

## What this audit did not do

No file was moved or deleted. `tools/diagnostics/audit-docs.js` is read-only.
Re-run it after any cleanup to confirm the numbers moved the way they should.
