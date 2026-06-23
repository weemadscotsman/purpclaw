# `scripts/` Agent Notes

`scripts/` contains operational helpers, doc validators, TUI launch targets, and migration/inspection scripts.

## Important Scripts

| Script | Role |
|---|---|
| `validate-docs.js` | `npm run docs:check`; validates API/page docs against the tree |
| `tui.js` | Full-screen terminal cockpit launched by `purpclaw tui` |
| `tui-ask.js` | Full-screen terminal chat launched by `purpclaw tui ask` |
| Startup/smoke helpers | Local service checks and diagnostics |

## Rules

- Keep script output copyable and timestamped when it is used for audit evidence.
- Do not make scripts mutate services by default unless the command name clearly indicates a mutation.
- If a script backs a CLI command, update both this file and `bin/AGENT.md` when behavior changes.

## Validation

```powershell
npm run docs:check
node scripts/validate-docs.js
```
