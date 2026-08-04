# Deep Stack Connection Audit 2 — 2026-06-23

Scope: local stack after operator updates. Checked PM2, registry, runtime ports, UI route handlers, docs truth, cognitive/Next ownership, AutoDream routing, and live smoke endpoints.

## Result

Fixed several real disconnected or stale paths:

- Cognitive spine was PM2-flapping because an orphan process owned `:7880`.
- Next.js was PM2-flapping because an orphan process owned `:3030`.
- Mochi sleep action was calling AutoDream at `:7895/dream`, but `:7895` is GOOP now.
- Runtime port truth still said vision was `7788`; registry/ecosystem use `7889`.
- Runtime port truth still treated AutoDream as a standalone `:7895` service.
- Safe-start still included a dead `autodream` PM2 target.
- CLI architecture output still advertised Mission Control on `:3000`.
- Capability registry still described AutoDream as `autoDream.py` on `:7895`.
- Generated/docs truth still claimed `/voice` was a live page.

## Operational Fixes Applied

### Cognitive Spine

Before:

- `purpclaw-cognitive` had 156 restarts.
- Logs showed `WinError 10048` on `127.0.0.1:7880`.
- `:7880` was actually owned by orphan PID `17868`.
- A second `cognitive_spine.py` was repeatedly trying and failing to bind.

Action:

- Stopped PM2 entry.
- Killed only `cognitive_spine.py --port 7880` orphan process.
- Restarted `purpclaw-cognitive` through PM2.

After:

- Single cognitive process: PID `30528`.
- `http://127.0.0.1:7880/cognitive/health` returns 200.

### Next.js

Before:

- `purpclaw-nextjs` hit `EADDRINUSE` on `127.0.0.1:3030`.
- PM2 showed `waiting restart`.
- `:3030` was held by an orphan `next start -p 3030` process.

Action:

- Stopped PM2 entry.
- Killed only `next start -p 3030`.
- Restarted `purpclaw-nextjs` through PM2.

After:

- Single Next process: PID `28752`.
- `http://127.0.0.1:3030/system-map` returns 200.

## Code/Docs Fixes Applied

- `app/api/mochi-action/route.ts`
  - AutoDream URL changed from `http://127.0.0.1:7895/dream` to `http://127.0.0.1:7880/autodream/dream`.
  - Response message now understands current cognitive AutoDream shape: `{ dedup, rules, triggered }`.

- `app/hooks/useMissionData.ts`
  - Vision Monitor changed from `7788` to `7889`.

- `lib/runtime/ports.js`
  - Added `GOOP: 7895`.
  - Changed `AUTODREAM` to cognitive spine port `7880`.
  - Final `VISION_MONITOR` value is `7889`.
  - `listServices()` now includes GOOP and "AutoDream on Cognitive Spine".

- `lib/commands/safe-start.js`
  - Removed dead `autodream` service from dark-service startup list.

- `lib/commands/architecture.js`
  - Mission Control changed from `:3000` to `:3030`.
  - AutoDream changed from `:7895` to `:7880/autodream/*`.

- `lib/capability-registry.js`
  - AutoDream now points to cognitive spine rather than standalone `autoDream.py`.

- `lib/whoami.js`
  - Removed dead `require('./agent_tower')` fallback that caused a Next build warning.

- `lib/goop-playground/package.json`
  - GOOP description now says port `7895`, not `7897`.

- `app/AGENT.md`
  - Updated route truth sentence: `/voice` is not a live page.

- `docs/generated/FOLDER_INVENTORY.md`
  - Removed `/voice` from current full-page list.

- `docs/spec/STACK_SPEC.md`
  - Vision changed to `7889`.
  - AutoDream documented as cognitive endpoint on `7880`, while `7895` is GOOP.

## Validation

Passed:

```powershell
node -c lib\runtime\ports.js
node -c lib\whoami.js
node -c lib\capability-registry.js
npm run docs:check
npx tsc --noEmit --pretty false --incremental false
npm run build
```

Build result:

- Passes.
- Remaining warning: dynamic require in `lib/system-manifest.js` via `app/api/registry/route.ts`.
- Fixed warning: missing `./agent_tower` from `lib/whoami.js` no longer appears.

Live smoke:

```text
GET  /api/services      -> 200, 17/26 responding, core 12/12 healthy
GET  /api/stack-whoami  -> 200
GET  /system-map        -> 200
POST /api/mochi-action  -> 200, sleep action reaches cognitive AutoDream
```

PM2 stabilisation:

```text
purpclaw-cognitive online, PID 30528, single cognitive_spine.py process
purpclaw-nextjs    online, PID 28752, single next start -p 3030 process
```

## Remaining Issues

- `purpclaw-api` has high restart history and should be audited next; it is currently online.
- `purpclaw-nextjs` and `purpclaw-cognitive` have high historical restart counts from the fixed orphan-port loops.
- `lib/system-manifest.js` still triggers a dynamic require build warning.
- `lib/runtime/ports.js` had an encoded stale `VISION_MONITOR: 7788` line that resisted direct patch deletion; runtime behavior is correct because the final `VISION_MONITOR` value is `7889`, but the duplicate should be cleaned with a file-normalization pass.
- Optional lanes still parked/offline unless explicitly started: bridge, chorus, telegram, vision, yolo, avatar, reasoning, thringlet.
