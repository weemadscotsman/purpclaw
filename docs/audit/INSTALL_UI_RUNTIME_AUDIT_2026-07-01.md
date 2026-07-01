# Install, Runtime, And UI Audit - 2026-07-01

## Scope

Audited the live PURPCLAW folder at `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`.

The user explicitly rejected stale docs as source of truth, so this audit used live code first:

- `package.json`
- `.env.example`
- `bin/purpclaw.js`
- `lib/commands/setup.js`
- `lib/commands/safe-start.js`
- `lib/commands/open.js`
- `service_registry.js`
- `ecosystem.config.js`
- `lib/runtime/ports.js`
- `app/layout.tsx`
- `app/mission/page.tsx`
- `app/components/CockpitShell.tsx`
- `app/components/MissionControl.tsx`
- `app/hooks/useMissionData.ts`
- `app/api/services/route.ts`
- `app/api/mission-data/route.ts`

## Findings

- Canonical web UI port is `3030`, not `3000`.
- Mission Control is the active App Router UI at `/mission`.
- `app/public/ui` is legacy/static UI support, not the canonical active cockpit.
- `app/layout.tsx` wraps pages in `CockpitShell`.
- `MissionControl.tsx` was also drawing local identity chrome and extra card wrappers inside CockpitShell, causing nested UI framing.
- `purpclaw start` uses `service_registry.js` launch profiles and defaults to `harness`.
- `purpclaw safe-start` is a separate sequential launcher with `--core`, `--dark`, `--all`, and named-service modes.
- `purpclaw setup` supports hosted providers and local providers; Ollama and LM Studio are local/free provider paths.
- `.env.example` exposes `PURPCLAW_RESEARCH_COST_CAP_USD=5.0`.

## Repairs Made

- Added `docs/INSTALL.md` from live runtime truth.
- Linked `docs/INSTALL.md` from `README.md`, `QUICKSTART.md`, and `docs/INDEX.md`.
- Corrected user-facing Mission Control references from `3000` to `3030` in active CLI/runtime support files.
- Updated `bin/purpclaw.js` help/open text and the port table to advertise `3030`.
- Updated Docker deploy helper text/mapping to expose `3030`.
- Updated `lib/capability-registry.js`, `lib/deep-audit.js`, `lib/self-context.js`, and the legacy inline page's service config where they pointed at `3000`.
- Reduced the nested Mission Control header from a duplicate branded shell to a smaller local workspace bar.
- Changed the Mission Control root from viewport-height ownership to parent-shell height ownership.
- Changed the visualizer backdrop from fixed viewport positioning to absolute local positioning.
- Removed extra wrapper card borders/backgrounds around tab panel content in `PanelContent`.

## Validation

Passed:

```txt
node --check bin\purpclaw.js
node --check lib\commands\deploy.js
node --check lib\capability-registry.js
node --check lib\self-context.js
node --check lib\deep-audit.js
npm run docs:check
node bin\purpclaw.js feature --verify --json
```

Timed out:

```txt
npm run build
npx tsc --noEmit --pretty false
```

Both timed out in the live working tree. Leftover validation Node processes from those commands were identified by command line and stopped. No unrelated PM2, MCP, or other project Node processes were stopped.

## Remaining Disconnects

- Historical docs under `docs/audit`, `docs/legacy`, localized example docs, and old shipped notes still mention `3000`. They are not the active runtime source of truth.
- The root git worktree contains unrelated dirty changes and generated/runtime folders outside the active repair scope. Publish should continue to use the sanitized snapshot path rather than raw staging from the dirty root.
