# `lib/commands/` Agent Notes

This folder owns modular CLI commands called by `bin/purpclaw.js`.

## Command Families

| Family | Files |
|---|---|
| Audit/health | `bughunt.js`, `smoke.js`, `services.js`, `doctor` logic via CLI helpers |
| Orchestration | `bigboss.js`, `harness.js`, `workers.js`, `plan.js`, `teleport.js` |
| Runtime lifecycle | `safe-start.js`, `safe-stop.js`, `heal.js`, `open.js`, `deploy.js` |
| Intelligence/memory | `ask.js`, `cognition.js`, `intelligence.js`, `code.js`, `training.js`, `grow.js`, `evolve.js` |
| Settings/persona | `identity.js`, `setup.js`, `pocket.js`, `thringlets.js`, `tour.js` |

## Rules

- Commands should return real state from canonical services or registries. Stale adapter output is a bug.
- `bigboss` adapters must use canonical endpoints: `/api/services`, tower status/agents, memory/cognitive routes, kernel jobs.
- Read-only status/list/help commands are safe for smoke tests. Spawn, run, heal, retry, and evolve actions can spend tokens or mutate state.
- Keep route names aligned with `docs/ROUTE_INDEX.md` and generated parity reports.

## Validation

Use direct command probes for touched modules:

```powershell
node -e "require('./lib/commands/bigboss').help()"
node bin/purpclaw.js bughunt
node bin/purpclaw.js services
```
