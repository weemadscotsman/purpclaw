# Monorepo Workspace Policy
**Date:** 2026-06-30
**Stack:** pnpm workspaces

---

## What this is

PURPCLAW is a **pnpm workspace monorepo**. One root manages all dependencies. Child packages are source-only — no `node_modules`, no child lockfiles.

## Structure

```
purpclaw/                    ← ROOT (one install, one lockfile)
├── package.json             ← root workspace config
├── pnpm-workspace.yaml      ← workspace manifest
├── pnpm-lock.yaml          ← ONE lockfile
├── node_modules/            ← ONE dependency layer
├── apps/                    ← runnable apps
│   └── companion-chorus/    ← 18 terminal companion weirdos
├── packages/                ← shared code (future)
├── tools/                   ← internal scripts/dev tools (future)
├── .donors/                 ← source-only prototypes
├── archive/                 ← legacy snapshots, never installed
└── vendor/                  ← external copied code, read-only
```

## Rules

### The One Rule

```txt
Never run npm/pnpm/yarn install inside child apps.
Always run pnpm install at the root.
```

### Adding an app

```bash
# Put source in apps/
mkdir -p apps/my-app
# copy source files only — no node_modules, no lockfile

# From root:
pnpm install               # links the new app into workspace
pnpm --filter my-app dev  # run it
```

### Adding a shared package

```bash
mkdir -p packages/my-package
cd packages/my-package
# write package.json with name: "@purpclaw/my-package"
cd ../..
pnpm install
```

### Deleting the original after moving

```bash
# After moving an app to apps/ or packages/:
rm -rf companion-chorus/node_modules
rm -f companion-chorus/package-lock.json
# Keep the original as a git archive/backup or delete it
```

## Policy per folder

| Folder | Installed? | node_modules OK? | Lockfile OK? |
|--------|------------|-----------------|--------------|
| root | ✅ | ✅ (managed) | ✅ (pnpm-lock.yaml) |
| apps/* | ❌ via child install | ❌ via child install | ❌ (workspace links) |
| packages/* | ❌ via child install | ❌ via child install | ❌ (workspace links) |
| tools/* | ❌ via child install | ❌ via child install | ❌ (workspace links) |
| .donors/* | ❌ | ❌ | ✅ (source-only) |
| archive/* | ❌ | ❌ | ✅ (legacy) |
| vendor/* | ❌ | ❌ | ✅ (external) |

## Donor apps (`.donors/`)

Donor apps are prototypes, reference code, or archived work — not active runtime.

**Rules:**
- Source only — no `node_modules`
- No child install
- `DO_NOT_INSTALL_HERE.md` marker in each donor folder
- Extract capabilities into `apps/*` or `packages/*` after audit

## Vendor code (`vendor/`)

External code copied into the repo.

**Rules:**
- Read-only — do not modify without approval
- No child install
- `DO_NOT_INSTALL_HERE.md` marker at `vendor/`
- If the vendor package needs its own install, it belongs in a separate repo

## Archive (`archive/`)

Legacy snapshots, old versions, historical builds.

**Rules:**
- Never installed
- `DO_NOT_INSTALL_HERE.md` marker at `archive/`

## Lockfile policy

- Root `pnpm-lock.yaml` is **the** lockfile — committed
- Child `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` are **not committed**
- If a child MUST remain isolated (truly independent app), add to `.gitignore` exception list in workspace config

## pnpm commands

```bash
pnpm install              # install everything from root
pnpm --filter my-app dev # run specific app
pnpm --filter my-app build
pnpm -r dev             # run all workspace apps in parallel
pnpm build              # build all workspaces
pnpm -r --parallel build
pnpm recursive exec -- ls node_modules  # verify no child node_modules
```

## Verifying no nested installs

```bash
# Should return only the root node_modules
find apps packages tools -name node_modules -type d

# If it finds anything:
find apps packages tools -name node_modules -type d -prune -exec rm -rf {} +
```

## Current state

| Item | Status |
|------|--------|
| Root pnpm install | ✅ working |
| Root lockfile | ✅ (pnpm-lock.yaml) |
| apps/companion-chorus | ✅ moved, workspace member |
| apps/* | 1 app |
| packages/* | 0 (future) |
| tools/* | 0 (future) |
| .donors/ | ✅ marked, source-only |
| archive/ | ✅ marked |
| vendor/ | ✅ marked |
| Child node_modules | ✅ only companion-chorus (pre-move), to be cleaned |

## Future migrations

When new standalone apps are absorbed:
1. Copy source to `apps/<name>/`
2. Strip `node_modules/`, lockfile, `.next/`, `dist/`, `build/`
3. Add `@purpclaw/<name>` to `apps/<name>/package.json`
4. `pnpm install` from root
5. Add `dev:<name>` script to root `package.json`
