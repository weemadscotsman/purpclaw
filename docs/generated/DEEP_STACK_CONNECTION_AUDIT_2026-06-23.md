# Deep Stack Connection Audit — 2026-06-23

Scope: service registry, PM2 ecosystem, live service health, route index, System Map inputs, OMNI links, runtime port constants, and build/doc validation.

## Executive Result

PURPCLAW's core stack is running, but several truth/reporting layers were out of sync. The audit fixed confirmed low-risk mismatches instead of adding new UI surfaces.

After fixes:

- `service_registry.js` and `ecosystem.config.js` both define 26 PM2 services.
- `/api/services` reports the rebuilt 26-service registry.
- Core service health is green; remaining down/untraced services are optional lanes.
- GOOP is running under PM2 and responds on `:7895/health`.
- `npm run docs:check`, `npx tsc --noEmit --incremental false`, and `npm run build` pass.

## Findings And Fixes

### 1. PM2 Apps Missing From Service Registry

Problem: PM2 knew about these services, but `service_registry.js` did not:

- `purpclaw-workers`
- `purpclaw-stt`
- `purpclaw-telegram`

Impact: `/api/services`, System Map, launch profiles, and generated service truth could under-report real capability lanes.

Fix:

- Added `workers` as a core service on `7897 /health`.
- Added `stt` as an optional voice service on `7896 /health`.
- Added `telegram` as an optional companion service on `7795 /health`.
- Added `purpclaw-stt` and `purpclaw-voice-ingress` to the `voice` launch profile.

### 2. Frontend Service Mirror Drift

Problem: `app/hooks/useMissionData.ts` said it mirrored the registry, but it missed workers/STT/Telegram and keyed Context Bus as `context` instead of `context-bus`.

Fix:

- Added Worker Service to the client service list.
- Renamed the Context Bus key to `context-bus`.
- Split Speech-To-Text from Voice Ingress so `7896` is no longer mislabeled as the daemon.
- Added Telegram Gateway to the UI service list.

### 3. Runtime Port Map Bug

Problem: `lib/runtime/ports.js` referenced `PORTS.METRICS`, but `DEFAULTS.METRICS` did not exist.

Impact: anything using the runtime port map could see an undefined Metrics port.

Fix:

- Added `METRICS: 7890`.
- Added explicit `STT: 7896` and `TELEGRAM: 7795`.
- Classified `workers` as core to match the registry.

### 4. OMNI Bad Raw JSON Link

Problem: `app/omni/page.tsx` linked to `/omni/status`, but the real route is `/api/omni/status`.

Fix:

- Updated the link and label to `/api/omni/status`.

### 5. GOOP Not Running Under PM2

Problem: GOOP was configured but not running when checked.

Fix:

- Started `purpclaw-goop` with PM2.
- Verified `http://127.0.0.1:7895/health` returns 200.

## Live Health Snapshot

After rebuilding and restarting only `purpclaw-nextjs`:

- `/api/services`: `15/26` responding
- Core group: healthy
- Optional not responding/untraced:
  - voice coordinator
  - voice bridge
  - STT
  - voice ingress, no direct HTTP health endpoint
  - companion chorus, no direct HTTP health endpoint
  - Telegram gateway
  - vision monitor
  - YOLO
  - avatar
  - reasoning loop
  - thringlet

These are not delete candidates. They are parked/optional lanes unless the operator chooses to start the matching profile.

## Validation Commands

Passed:

```powershell
node -c service_registry.js
node -c lib\runtime\ports.js
node -c ecosystem.config.js
npm run docs:check
npx tsc --noEmit --pretty false --incremental false
npm run build
```

Runtime probes:

```text
http://127.0.0.1:7895/health -> 200
http://127.0.0.1:7897/health -> 200
http://127.0.0.1:3030/api/services -> 200, total 26
http://127.0.0.1:3030/system-map -> 200
http://127.0.0.1:3030/api/omni/status -> 200
```

Build warnings still present:

- `lib/system-manifest.js`: dynamic require warning through `app/api/registry/route.ts`.
- `lib/whoami.js`: missing `./agent_tower` import warning through `app/api/chat/route.ts`.

The warnings do not currently block production build.

## Files Changed

- `service_registry.js`
- `lib/runtime/ports.js`
- `app/hooks/useMissionData.ts`
- `app/omni/page.tsx`
- `docs/SERVICE_RUNTIME_INDEX.md`
- `docs/generated/DEEP_STACK_CONNECTION_AUDIT_2026-06-23.md`

## Remaining Work

1. Decide whether optional lanes should be started by profile or stay parked.
2. Add a PM2/event-based status mode for no-health daemons like `voice-ingress` and `chorus`.
3. Fix the build warnings so the production output is clean, not merely passing.
4. Add System Map labels for `no-health-endpoint` so daemons show as `untraced` instead of looking like ordinary offline HTTP services.
