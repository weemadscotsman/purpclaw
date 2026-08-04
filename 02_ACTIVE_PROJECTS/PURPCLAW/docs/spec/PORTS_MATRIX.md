# PORTS_MATRIX — canonical port/endpoint topology

> Source of truth for ports, paths, and expected status codes.
> Auto-derived from `lib/runtime/ports.js` and `ecosystem.config.js`.

**Version:** 2026-06-19-v1
**Status:** seed (doctrinal).

---

## 1. Endpoint catalogue

The `/api/boot/*` family is served by the BIOS engine itself (`lib/bios.js` in this re-imagination). It is NOT one of the 25 PM2 services; it's a probe surface that lives on Next.js or on the unified_api router. Path layout below matches `app/api/boot/[...path]/route.ts` for the Next.js path.

| path | serves | depends on | method | required |
|---|---|---|---|---|
| `/api/boot/manifest` | BIOS manifest | filename `bios-manifest.json` (compiled from STACK_SPEC) | GET | no (404 → spec incomplete) |
| `/api/boot/probe` | State probe loop | all pm2 / port endpoints | GET | yes |
| `/api/boot/verdict` | Reads latest verdict + drift | probe cache | GET | yes |
| `/api/boot/compare` | spec vs runtime | both | GET | yes |
| `/api/boot/cleanse` | Drift repair (sync only) | ports.js + ecosystem.config.js | POST | no |
| `/api/boot/probe/[service_id]` | one service | one endpoint | GET | no |
| `/api/boot/profile/[name]` | bios-only, core-safe, voice, vision, swarm, full-chaos | probe loop | GET, POST | yes |
| `/api/boot/run` | full boot sequence | all | POST | yes |

### Boot sequence

1. POST `/api/boot/run` returns job id.
2. Server walks the probe plan in `BIOS_PROFILES.md` step 1 (`core-safe`) first → if PASS, descend to optional-dark.
3. Each probe posts `{service_id, port, state, latency_ms}` to `/api/boot/probe/[service_id]` → in-process cache updated → UI gets SSE feed.
4. Final verdict posts to `/api/boot/verdict` → UI animates verdict bar.
5. Drift audit runs at end. Output: `/api/boot/compare` payload.

### Failure modes of THIS doc

- New `/api/boot/*` route added without update → BIOS warns `SPEC_INCOMPLETE`.
- An endpoint URL is wrong but its path is alive → BIOS returns `ROUTE_FAILED`.
