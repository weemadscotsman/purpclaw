# Validation Report

Generated during the 2026-06-19 routing/build documentation hardening pass.

## Commands

| Command | Result | Notes |
|---|---|---|
| `node bin/purpclaw.js doctor` | pass | Doctor found no issues; PM2 in sync with port reality |
| `node bin/purpclaw.js bughunt` | pass | `38 ok`, `11 warn`, `0 fail` |
| `npm run docs:check` | pass | `docs validation passed (68 API routes, 18 page routes, 22 registry services)` |
| `npm run build` | pass | Next build completed; static generation `24/24` |
| `node --check lib\persona-forge.js` | pass | Parse check for touched runtime file |
| `node --check lib\omni\provider-integrity.js` | pass | Parse check for touched runtime file |

## Live Route Checks

All checked routes returned HTTP 200 from `localhost:3030`:

| Pages | Status |
|---|---|
| `/mission` | 200 |
| `/system-map` | 200 |
| `/evolution` | 200 |
| `/agents` | 200 |
| `/mission/harness` | 200 |
| `/pipeline` | 200 |
| `/swarm` | 200 |
| `/providers` | 200 |
| `/voice` | 200 |
| `/settings` | 200 |
| `/omni` | 200 |

| APIs | Status |
|---|---|
| `/api/services` | 200 |
| `/api/sessions` | 200 |
| `/api/trace/recent` | 200 |
| `/api/evolution/status` | 200 |
| `/api/manifest` | 200 |

## Failures / Caveats

- `bughunt` warnings are parked/dark services defined in the ecosystem but not running, plus stale-docs warning for missing `CAPTAINS_LOG.md`; no failures.
- `npm run build` still emits the existing `lib/system-manifest.js` dynamic require warning through `lib/tools/index.js` and `/app/api/registry/route.ts`.
- Build skips type validation and linting because that is the current Next/build configuration. This pass did not run a full TypeScript project check across archived/nested projects.
- Browser-level visual smoke was not rerun in this pass; previous in-app browser attempts hit a browser transport timeout while HTTP/build checks passed.
