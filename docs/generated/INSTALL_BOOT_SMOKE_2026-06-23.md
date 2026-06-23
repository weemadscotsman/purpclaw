# Install + Boot Smoke - 2026-06-23

## Target

- Repository: `https://github.com/weemadscotsman/purpclaw.git`
- Fresh clone path: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_INSTALL_TEST_20260623`
- Cloned branch: `master`
- Clone head: `45841c0 Sync latest E-drive PURPCLAW source`

## Commands Tested

```powershell
git clone https://github.com/weemadscotsman/purpclaw.git E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_INSTALL_TEST_20260623
cd E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_INSTALL_TEST_20260623
npm install
npm run build
node bin\purpclaw.js help
node bin\purpclaw.js doctor
node bin\purpclaw.js safe-start --core --force --stabilise=5000
```

## Result

- Fresh clone succeeded.
- `npm install` succeeded.
- `npm run build` succeeded.
- `node bin\purpclaw.js help` succeeded.
- `node bin\purpclaw.js doctor` ran.
- `safe-start --core --force` started 14/14 core services.
- PM2 ownership check confirmed every core service had `pm_cwd` set to the fresh clone path.

## Core Services Started From Fresh Clone

- `purpclaw-eventbus`
- `purpclaw-state`
- `purpclaw-api`
- `purpclaw-orchestrator`
- `purpclaw-tower`
- `purpclaw-pool`
- `purpclaw-context`
- `purpclaw-workers`
- `purpclaw-gatekeeper`
- `purpclaw-metrics`
- `purpclaw-cognitive`
- `purpclaw-nextjs`
- `purpclaw-coordinator`
- `purpclaw-harness`

## Warnings / Follow-Ups

- Public npm registry still reports `purpclaw@0.1.4`; GitHub is the canonical v0.2.0 install source until npm is republished.
- GitHub-style global install into a temp npm prefix failed on this Windows machine with npm tar/ENOENT errors around nested `next` files.
- `npm install` reports 10 dependency vulnerabilities.
- `npm run build` passes but warns about optional MCP SDK imports in `lib/mcp.js` and dynamic require in `lib/system-manifest.js`.
- The package engine was widened to `node >=22 <25` after Node 24 installed, built, and booted successfully.

## Tested One-Liner

```powershell
git clone https://github.com/weemadscotsman/purpclaw.git; cd purpclaw; npm install -g pm2; npm install; npm run build; node bin\purpclaw.js safe-start --core
```
