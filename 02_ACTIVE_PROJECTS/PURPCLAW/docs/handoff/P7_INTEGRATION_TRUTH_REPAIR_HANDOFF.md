# PURPCLAW Integration Truth Repair — Handoff
**Date:** 2026-06-30
**Phase:** P7 Integration Truth Repair
**Rule:** No folders. No UIs. No Vite. No broad git-stage.

---

## The Order (never reverse these)

```
1. Command truth first
2. Project phase truth second
3. Runtime crosswalk third
4. API ownership fourth
5. Root script classification fifth
6. Folder quarantine last
```

Why: moving folders before classification is how you cut your own wires then blame the goose.

---

## Context from P7 Phase 11

### What happened
- Nested shell bug: pages rendering CockpitShell while layout.tsx already wrapped them
- 20 pages had double-wrapped CockpitShell → infinite recursion → all routes 500
- CockpitShell had `usePathname()` called AFTER a guard (Rules of Hooks violation)
- `data` state hoisted after guard reference → ReferenceError on all routes
- Mochi page: CockpitShell nested inside JSX returns (invalid React structure)

### Fixes applied
- `33881c7` — All hooks called unconditionally before guard. `data` hoisted.
- `a95deea` — Removed CockpitShell from all 20 page-level files. Layout is sole chrome owner.
- `5b837b9` — Fixed mochi: both conditional returns cleaned, subtitle restored.

### Current state
- All 8 pages HTTP 200 (`/mission`, `/settings`, `/omni`, `/evolution`, `/mochi`, `/providers`, `/memory`, `/pipeline`)
- Dev server running on `127.0.0.1:3030`
- 5 commits this session, PURPCLAW directory clean
- `pnpm install` up to date

### Vite migration — PAUSED
- Plan written: `docs/design/VITE_MIGRATION_STRATEGY.md` (if exists)
- Strategy: keep Next on 3030, build Vite app in `apps/purpclaw-webui`, port page by page
- NOT starting until integration truth is done

---

## The Six Work Items

### 1. Command Truth — 9 loose modules

```
bin/purpclaw.js  ← the main entry point (DO NOT TOUCH YET)
```

**Loose command modules to classify:**
1. `bin/business/` — routed / internal / deprecated donor / dead?
2. `bin/deploy/` — same
3. `bin/grow/` — same
4. `bin/harness/` — same
5. `bin/open/` — same
6. `bin/plan/` — same
7. `bin/ponytail/` — same
8. `bin/telemetry/` — same
9. `bin/thringlets/` — same

**Decision criteria per module:**
- `routed` — actively called by the CLI, registered in the command map
- `internal` — imported by other modules, not called directly from CLI
- `deprecated-donor` — was real, now replaced by better architecture
- `dead` — file exists, never called, no imports reference it

**Output:** One table. Module | Status | Evidence | Action.

---

### 2. Project Phase Truth — Fix "discovery" command

The `discovery` command calls itself `discovery` because it under-reads the maturity evidence in the repo. If architecture docs, runtime docs, service evidence, capability registry, API routes, and CLI verification all exist → it is NOT discovery. It is `purpclaw status` or `purpclaw doctor`.

**Decision:** Does the repo have enough evidence to promote `discovery` to a named phase command? If yes: rename and update references. If no: document what's missing and what it needs to be promoted.

---

### 3. Runtime Crosswalk

One file: `docs/runtime/CROSSWALK.md`

```markdown
| Service | Port | Capability | API Route | CLI Command |
|---------|------|------------|-----------|-------------|
| Gateway | 7780 | agent orchestration | /api/orchestrate | purpclaw agents |
| Memory  | 7885 | vector storage | /api/memory | purpclaw memory |
```

**Sources to read:**
- `ecosystem.config.js` — PM2 services and ports
- `bin/purpclaw.js` — CLI commands
- `app/api/` — Next.js API routes
- `lib/` — service modules
- `services/` — runtime services

---

### 4. API Ownership Registry

One file: `docs/runtime/API_OWNERSHIP.md`

76 routes. Every route needs:
- `owner` — which agent/module owns it
- `purpose` — what it does in one line
- `capability` — which PURPCLAW capability it serves
- `auth/safety` — does it need auth? rate limit? gate?
- `surface` — which UI surface uses it
- `status` — active / deprecated / broken / unknown

**Sources:** `app/api/` directory listing, route handler content scan.

---

### 5. Root Script Classification

Not MOVE. Just classify what's in the repo root.

Categories:
- `active-service` — actively used by runtime (bin/, lib/, services/)
- `dev-tool` — development utility (scripts/, docs generation)
- `legacy` — old version, superseded
- `generated` — auto-generated, do not edit directly
- `donor` — reference only, used as copy source
- `archive` — kept for history, not used
- `unknown` — needs investigation

**Output:** Table. Script | Category | Evidence | Risk if deleted.

---

### 6. Folder Quarantine

Only after items 1-5 are complete.

This is where P7 Phase 11 LEFT OFF. The UI shell fix is done. The architecture truth repair comes next.

---

## Staging Rule (forever)

**NEVER run `git add .` from `E:\god folder`.**

The git root is `E:\god folder` (NOT inside PURPCLAW). Staging must be:
```bash
cd /e/god\ folder/02_ACTIVE_PROJECTS/PURPCLAW
git add -- path/to/specific/file
git add -- path/to/specific/folder/
```

Or from any subdir:
```bash
cd /e/god\ folder/02_ACTIVE_PROJECTS/PURPCLAW
git add app/mochi/page.tsx  # specific file
```

The sibling projects (GOTHAM_3077, etc.) are NOT part of this repo.

---

## What NOT to do
- No folder moves
- No Vite work
- No UI changes
- No Twagger
- No Gameverse
- No trading terminal
- No broad git-stage from parent directory
- No big-bang rewrites

Small. Boring. Truth repair.
