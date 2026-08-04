# PurpClaw Canonical Map

Last updated: 2026-07-20.

## Authority

1. Running behavior and direct probes.
2. Registries and executable configuration.
3. Routes, tests, schemas, and proof receipts.
4. Generated truth/index documents.
5. Current canonical prose.
6. Designs, audits, historical reports, and imported references.

## Runtime Sources

| Concern | Source of truth |
|---|---|
| Package/version | `package.json` |
| CLI | `bin/purpclaw.js`, `lib/commands/` |
| Services | `service_registry.js`, `ecosystem.config.js` |
| Ports | service registry first; `lib/runtime/ports.js` for shared/compat constants |
| Pages and APIs | `app/**/page.tsx`, `app/api/**/route.ts` |
| Agents | `lib/agent-registry.js`, `agent_tower.js`, `agents/`, divisions |
| Tools | `lib/tools/index.js` and adapters |
| Providers | `lib/runtime/provider-config.js`, `lib/llm-provider.js` |
| Sessions | session repository/store modules |
| Memory | `lib/memory-client.js`, cognitive runtime, workspace memory |
| Generated audit | `public/showcase/truth-manifest.json` |

## Repository Placement

- `app/`: Next.js pages, routes, and UI components.
- `bin/`: executable entrypoints.
- `lib/`: reusable runtime logic.
- `scripts/`: verification, generation, migration, and operational scripts.
- `agents/`, `skills/`, `divisions/`: executable profiles and instructions.
- `registry/`: structured organisational state and catalogs.
- `workspace/`: identity, operator context, boot law, and durable memory.
- `docs/`: current docs plus explicitly classified design/history/evidence.

Do not promote file presence to “live.” Do not merge counts across native tools,
external MCP servers, process definitions, and current health.
