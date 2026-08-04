# GitHub Update Audit

Date: 2026-07-01  
Target: `weemadscotsman/purpclaw`  
Local project root: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`

## Repository Shape

The local PURPCLAW folder is nested inside a larger Git repository:

```txt
git root: E:\god folder
current folder: E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW
parent origin: https://github.com/weemadscotsman/zamp.git
publish target: https://github.com/weemadscotsman/purpclaw.git
```

Because the parent remote is `zamp`, the PURPCLAW GitHub update must publish the PURPCLAW folder as a project snapshot to the PURPCLAW remote. A blind push of the parent repo would update the wrong repository.

## Local Change Summary

Tracked changes currently visible from the parent Git index:

```txt
Deleted:
- ARCHITECTURE.md
- DOCS_INDEX.md
- STATUS.md

Modified:
- CHANGELOG.md
- agent_tower.js
- bin/purpclaw.js
- docs/SERVICE_RUNTIME_INDEX.md
- docs/spec/PURPCLAW_COUNCIL_MODE.md
- package-lock.json
- podcast_studio/README.md
- swarm_coordinator.js
```

The working folder also contains a large amount of source that is untracked by the parent repo but belongs to the standalone PURPCLAW project shape: `app`, `lib`, `docs`, `skills`, `registry`, `scripts`, `agents`, `rules`, `research`, `public`, and related runtime/source folders.

## Publishable Snapshot Scope

Audited publishable files after excluding runtime/cache/quarantine folders:

```txt
publishable files: 4081
```

Top-level file distribution:

```txt
skills: 1480
docs: 1038
lib: 313
app: 217
.purpclaw: 165
rules: 89
scripts: 82
.omnicode: 70
root: 67
agents: 45
public: 45
research: 45
```

## Excluded From Publish

The GitHub snapshot excludes:

```txt
.git
node_modules
.next
.tmp
.trash
__pycache__
agent_work
.archive
archive
.donors
vendor
_scratch
```

It also excludes secret/runtime file patterns:

```txt
.env
.env.* except .env.example
*.log
*.pid
*.db
*.sqlite
*.sqlite3
memory_archive*
keys.env
*credentials*
*.pyc
*.tsbuildinfo
```

Rationale:

- `.donors` is donor archaeology input, not runtime source.
- `agent_work` is local runtime evidence and generated state.
- `vendor`, `archive`, `.archive`, `_scratch`, `.tmp`, `.trash`, `.next`, and caches are not release source.
- `.env`, `.env.nvidia`, database files, memory archives, and logs can contain local secrets or machine-specific state.
- `keys.env` and credential dump files are excluded even when they live under old docs or reference folders.
- `.env.example` is retained because it is the public configuration template.

## Main Architectural Changes Represented

This update carries the newer PURPCLAW architecture:

- 0.3 organisation runtime documentation.
- Dynamic Council and Studio ecology docs.
- Timeline, Presence, Residue, and donor archaeology layers.
- AutoResearch and Auto-Evolve bridge documentation.
- Folder integration audit and repair plan.
- P7 integration truth repair documents and checkpoint receipts.
- UI shell consolidation evidence and service/runtime doc updates.
- MiniMax key-format fix in usage governor.
- Route index repair for the AWAKEN, evolution, benchmark ledger, companion chorus, and refusal-weight API/page routes.

## Validation Performed Before Publish

Earlier local checks in this branch/session included:

```bash
npm run docs:check
node --check bin\purpclaw.js
node --check lib\donor-archaeology.js
node --check lib\evolution\mutator.js
node --check lib\commands\autoresearch.js
node bin\purpclaw.js feature --verify --json
```

At publish time, this audit was refreshed against the current folder state and sensitive-path candidates were excluded from the GitHub snapshot.

## Open Caution

This is a project-root snapshot publish to `weemadscotsman/purpclaw`, not a push of the parent `E:\god folder` repository. The parent repo still has unrelated local state and a different `origin`.
