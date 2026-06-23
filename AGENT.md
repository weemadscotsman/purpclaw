# PURPCLAW Agent Operating Map

This repository is a local-first AI workstation stack. Treat it as a running system, not a loose script pile.

## First Rules

- Preserve existing UI and operator workflows unless the task explicitly says to remove them.
- Do not edit `node_modules/`, `.next/`, `build/`, `dist/`, `out/`, generated caches, archived work logs, or vendor snapshots.
- Do not use foreign-harness names in active runtime code, service names, user-facing UI, or current docs. Historical references belong only in legacy/vendor/security material and must be labelled as such.
- Prefer canonical registries over guessed paths:
  - Services: `service_registry.js`, `ecosystem.config.js`, `lib/runtime/ports.js`, `/api/services`.
  - Routes: `app/**/page.tsx`, `app/api/**/route.ts`, `docs/ROUTE_INDEX.md`.
  - CLI: `bin/purpclaw.js`, `lib/commands/*.js`.
  - Tools: `lib/tools/index.js`, Hermes skill registration, MCP adapters.
  - Agents: `agent_tower.js`, `agents/`, `agent_profiles.json`, `divisions/`.
  - Memory: `memory_matrix_v2.py`, `lib/memory-client.js`, `lib/cognitive-client.js`.

## Primary Surfaces

| Surface | Owner Files | Purpose |
|---|---|---|
| CLI | `bin/purpclaw.js`, `lib/commands/` | Operator commands, doctor, bughunt, safe-start, harness, bigboss, TUI launch |
| TUI | `scripts/tui.js`, `scripts/tui-ask.js`, `purpclaw tui`, `purpclaw tui ask` | Terminal cockpit and full-screen chat |
| Web | `app/`, `app/components/`, `app/api/` | Next cockpit, mission UI, stack pages, API proxy/aggregators |
| Services | `ecosystem.config.js`, root service files, `service_registry.js` | PM2 supervised microservice core |
| Agent Tower | `agent_tower.js`, `lib/agent-loop.js`, `agents/`, `divisions/` | Spawnable agents and tool-calling loop |
| Memory | `memory_matrix_v2.py`, `lib/memory-client.js`, `lib/session-store.js` | Cognitive memory, saved sessions, persistence |
| Docs | `docs/`, `STRESS/`, generated reports | Current truth maps, audit evidence, operator docs |

## Validation Contract

For routing/build/doc changes, run as much of this set as applies and report failures plainly:

```powershell
node bin/purpclaw.js doctor
node bin/purpclaw.js bughunt
npm run docs:check
npm run build
```

If `.next` causes the known stale Next cache crash, remove only the resolved `.next` path under this repo and rebuild.

## Documentation Outputs

Architecture hardening passes must update `docs/generated/` with:

- `FOLDER_INVENTORY.md`
- `OPENCLAW_PURGE_REPORT.md`
- `CLI_TUI_WEB_PARITY.md`
- `VALIDATION_REPORT.md`
- `CHANGELOG.md`

## No-Go Zones

- Do not bulk-rewrite translated docs, `skills/_legacy/`, `vendor/`, or donor/reference packs unless the task specifically targets migration cleanup.
- Do not claim a service/page/route is live from file presence alone. Use HTTP, PM2, doctor, bughunt, or build output.
- Do not add decorative `AGENT.md` files. Each one must name the local surface, entry points, validation, and unsafe assumptions.
