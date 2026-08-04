# Recovery Runbook

Last updated: 2026-07-20.

```powershell
node bin/purpclaw.js status
node bin/purpclaw.js doctor
node bin/purpclaw.js bughunt
node bin/purpclaw.js safe-start --core
node bin/purpclaw.js smoke --json
```

On Windows, prefer bounded `safe-start` profiles over broad direct PM2 startup.
Inspect the generated service index to distinguish required and optional lanes.
Do not delete data stores or caches broadly; resolve the exact path and preserve
user state. Checkpoint rollback can restore direct governed file mutations but
cannot guarantee recovery from arbitrary shell commands or external processes.
