# Install + Boot Smoke - 2026-06-23

## Target

- Repository: `https://github.com/weemadscotsman/purpclaw.git`
- Final fresh clone path: `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_ONELINER_FINAL_20260623`
- Isolated PM2 home: `E:\purpclaw_pm2_final_20260623`
- Cloned branch: `main`
- Clone head: `15c5be7 Sync latest install boot and spine routes`

## Commands Tested

```powershell
$env:PM2_HOME='E:\purpclaw_pm2_final_20260623'
git clone https://github.com/weemadscotsman/purpclaw.git 'E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_ONELINER_FINAL_20260623'
cd 'E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_ONELINER_FINAL_20260623'
npm install -g pm2
npm install
npm run build
node bin\purpclaw.js safe-start --core
```

## Result

- Fresh clone succeeded.
- Clone head matched the published GitHub head: `15c5be7`.
- `npm install -g pm2` succeeded.
- `npm install` succeeded.
- `npm run build` succeeded.
- `safe-start --core` started 14/14 core services.
- PM2 ownership check confirmed every core service had `pm_cwd` set to the final fresh clone path.
- Every started service was `online`.
- Every started service had `restart_time: 0`.

## First-Install PM2 Fix

Clean first-boot testing exposed a real install issue: `safe-start --core` could fail before any PM2 daemon existed because the command tried to read PM2 state before waking the daemon.

`lib/commands/safe-start.js` now runs `pm2 ping` before retrying PM2 state reads. This makes first-install boot deterministic instead of requiring the user to manually run `pm2 ping`.

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

## Existing PM2 Caveat

If a machine already has PURPCLAW services registered in the default PM2 home, a fresh clone can appear to "skip" service starts because PM2 is still pointing at the old working directory. For a true clean install smoke test, either:

- use an isolated `PM2_HOME`, or
- stop/delete old `purpclaw-*` PM2 services before booting the new clone.

The final smoke used an isolated PM2 home to prove the GitHub checkout can install and boot on its own.

## Warnings / Follow-Ups

- Public npm registry still reports `purpclaw@0.1.4`; GitHub is the canonical v0.2.0 install source until npm is republished.
- GitHub-style global install into a temp npm prefix failed on this Windows machine with npm tar/ENOENT errors around nested `next` files.
- `npm install` reports 10 dependency vulnerabilities.
- `npm run build` passes but warns about optional MCP SDK imports in `lib/mcp.js` and dynamic require in `lib/system-manifest.js`.
- The package engine was widened to `node >=22 <25` after Node 24 installed, built, and booted successfully.

## Tested One-Liner

```powershell
$env:PM2_HOME='E:\purpclaw_pm2_final_20260623'; git clone https://github.com/weemadscotsman/purpclaw.git 'E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_ONELINER_FINAL_20260623'; cd 'E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW_ONELINER_FINAL_20260623'; npm install -g pm2; npm install; npm run build; node bin\purpclaw.js safe-start --core
```
