# `app/api/` Agent Notes

This folder contains Next.js same-origin API routes for the web cockpit. It is the browser-safe adapter layer; browser code should not call random backend ports directly.

## Canonical Route Groups

| Group | Purpose |
|---|---|
| `/api/chat` | Browser chat stream into provider/router/agent loop |
| `/api/services` | Canonical service health view |
| `/api/mission-data` | Mission cockpit aggregate snapshot |
| `/api/service-proxy` | Allowlisted backend proxy |
| `/api/sessions*` | Durable chat session CRUD |
| `/api/trace/*` | Copyable trace stream/recent log aggregation |
| `/api/evolution/status` | Self-evolution status and gated controls |
| `/api/harness/*` | Mission harness jobs and streams |
| `/api/omni/*` | OMNI truth, registry, patch, provider integrity |
| `/api/tower/stream` | Tower event streaming adapter |
| `/api/logs/stream`, `/api/eventbus/stream` | Log/event streams for UI traceability |

## Rules

- Route handlers must return truthful status. If a backend source is missing, return an explicit degraded/untraced state rather than fake success.
- Mutating actions need operator gate awareness and trace logging when they affect jobs, services, memory, sessions, or evolution.
- Same-origin UI routes should use these adapters; do not make components fetch PM2 service ports directly.
- Keep docs updated in `docs/ROUTE_INDEX.md` when routes are added or removed.

## Validation

```powershell
npm run docs:check
Invoke-WebRequest -UseBasicParsing http://localhost:3030/api/services
Invoke-WebRequest -UseBasicParsing http://localhost:3030/api/trace/recent
Invoke-WebRequest -UseBasicParsing http://localhost:3030/api/sessions
```
