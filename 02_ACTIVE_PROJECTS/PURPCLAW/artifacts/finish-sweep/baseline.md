# Finish-Sweep Preflight Baseline
Captured: 2026-08-18T11:37:54Z

## Note
ecosystem.config.js repairs (5 dead paths + 3 new entries) were applied minutes before this capture; git diff for that file reflects them.

## Git state (repo root: E:/god folder — SHARED INDEX)
Branch: canonical-parity-clean-v2
HEAD: 9332681f233dd8d76ccad74a791e1c39882739d6
Status lines: 3860 (full list: baseline-git-status.txt)
Under PURPCLAW: 1509
Outside PURPCLAW: 2351
Currently staged paths:

## Toolchain
Node: v24.15.0 | npm: 11.12.1 | Python: Python 3.11.9 | PM2: 7.0.1

## Package
Version: 0.1.7
Lockfiles: locked_interfaces.js package-lock.json pnpm-lock.yaml 

## CLI
bin/purpclaw.js lines: 7000
case labels: 151
lib/commands modules: 95
help exit: 0 (saved: baseline-cli-help.txt)

## PM2
ecosystem apps defined: 26
pm2 running: 0

## Certification labels (current)
CERTIFIED | gates:undefined | undefined

## Known test baseline (from 2026-08-18 audit, to be re-verified in P4)
- tests/root-misplaced/: 49 files with broken requires (audit-verified)
- No root npm test script
- CI workflow references nonexistent ci:control script

## Directory sizes (MB)
61	E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib
69	E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/services
48	E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/packages
571	E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/apps
4	E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app
693	E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/var
55	E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/docs
25	E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/agent_work
