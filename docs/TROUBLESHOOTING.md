# PurpClaw — Troubleshooting 🛠️

Every fix is exact. No "something went wrong."

## First, run the doctor
```
node healthcheck.js          # the onboarding health screen
node bin/purpclaw.js doctor  # deep per-service probe
```

## Common failures → exact fix

| Symptom | Cause | Fix |
|---|---|---|
| `Node.js not found` | Node not installed | Install Node 18+ from https://nodejs.org, reopen terminal |
| `npm install failed` | corrupt deps | `rm -rf node_modules package-lock.json && npm install` (Windows: `rmdir /s /q node_modules`) |
| UI ❌ down (:3030) | cockpit not started / not built | `npm run build` then `node bin/purpclaw.js safe-start --core` |
| Server ❌ down (:7780) | api not running | `node bin/purpclaw.js safe-start --core` |
| Provider ⚠️ demo | no API key set | That's fine — demo works. To go live, add a key in `.env` (e.g. `OPENAI_API_KEY=...`) |
| `EADDRINUSE` / port held | stale process on the port | `node bin/purpclaw.js safe-stop --all` then `safe-start --core`; or find the PID: `netstat -ano \| findstr :3030` and `taskkill /F /PID <pid>` |
| `Cannot find module 'async/eachLimit'` (pm2) | pm2 daemon/version mismatch | `npx pm2 kill` then re-run the installer / `safe-start` |
| A python service eats RAM | runaway/orphan | the mem-guard self-kills >cap; or `taskkill /F /PID <pid>`. Caps are env-overridable (`COGNITIVE_MEM_LIMIT_MB`, etc.) |
| cmd windows flashing | a spawn missing `windowsHide` | report which action triggered it; core paths are already hidden |
| Chat returns nothing | provider rate-limited / down | the router auto-falls to a sibling model; check `node healthcheck.js` Provider row |

## Nuclear reset (safe)
```
npx pm2 kill
node bin/purpclaw.js safe-start --core
node healthcheck.js
```
This stops everything cleanly and brings the core back from this directory.

## Still stuck?
Open an issue: https://github.com/weemadscotsman/purpclaw/issues — include the output of `node bin/purpclaw.js doctor`.
