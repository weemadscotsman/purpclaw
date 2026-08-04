# Where Things Go

Last verified: 2026-07-20

This is the placement guide. Use it before adding a file.

## Placement Table

| If you are adding | Put it here | Do not put it here |
|---|---|---|
| A web page | `app/<route>/page.tsx` | root, `components/`, `lib/` |
| A browser-facing API route | `app/api/<name>/route.ts` | `unified_api.js` unless it is a long-running service API |
| A small UI component used by the Next app | `app/components/` | root |
| A cross-page or dashboard hook | `app/hooks/` | root `hooks/` unless intentionally legacy/shared |
| A long-running service | root entrypoint plus `ecosystem.config.js`, `service_registry.js`, and `lib/runtime/ports.js` | `app/api/` |
| A shared runtime module | `lib/` | `app/api/` |
| A CLI command implementation | `lib/commands/<command>.js` and dispatch from `bin/purpclaw.js` | a random root script |
| A one-off operator script | `scripts/` | `lib/` |
| A provider adapter | `lib/providers/` or provider routing modules | Next page/component files |
| A tool adapter | `lib/tools/` or tool registry modules | service entrypoints |
| An agent persona | `agents/`, `divisions/`, `agent_profiles.json`, or routing matrix files | PM2 services |
| A skill | `skills/<skill>/SKILL.md` plus required references/assets | PM2 services |
| A memory/cognitive client | `lib/memory-client.js`, `lib/cognitive-client.js`, or a related `lib/` module | direct browser component fetches to memory internals |
| Governance logic | `lib/governance.js`, route guards in `app/api/_lib/` | page components |
| Eval tasks and benchmark reports | `eval/`, `agent_work/coding-eval/`, `reports/` | production route folders |
| Audit notes and proof logs | `STRESS/`, `agent_work/PROOFS/` | canonical docs unless curated |
| Canonical docs | `docs/` | scattered root markdown |
| Historical/experimental ideas | `docs/experimental/`, `docs/audit/`, `STRESS/` | current specs |

## Directory Map

| Path | Meaning |
|---|---|
| `app/` | Next.js cockpit, UI pages, and browser-facing API routes |
| `app/api/` | Next route handlers. These are the browser-facing API boundary. |
| `app/api/_lib/` | Shared helpers for Next API routes, including operator auth and rate limit helpers |
| `app/components/` | Mission/cockpit UI components |
| `app/hooks/` | Mission/cockpit client hooks |
| `components/` | Older/shared React components outside the app tree |
| `hooks/` | Older/shared hooks outside the app tree |
| `lib/` | Shared runtime code, providers, tools, orchestration helpers, clients, governance |
| `lib/commands/` | CLI command implementations loaded by `bin/purpclaw.js` |
| `lib/runtime/` | Runtime constants and service/port helpers |
| `bin/` | CLI entrypoints |
| `scripts/` | Operator scripts, build helpers, verification scripts |
| `agents/` | Agent persona markdown/config |
| `divisions/` | Division-level agent grouping docs/config |
| `skills/` | Local skill library |
| `config/`, `schemas/`, `registry/` | Structured config and schemas |
| `docs/` | Canonical docs and curated reference docs |
| `STRESS/` | Working audits, proof logs, deep notes |
| `agent_work/` | Runtime/generated work products and proof artifacts |
| `logs/`, `reports/` | Generated diagnostics and reports |
| `.next/`, `node_modules/`, `__pycache__/` | Generated dependencies/build artifacts. Do not document from here. |

## Service Rules

A thing deserves a PM2 service only if at least one is true:

- it runs forever,
- it has its own port or long-lived queue,
- it needs independent restart/logging,
- it isolates a risky runtime such as Python, browser, voice, or model work,
- other services call it over HTTP/events/queue,
- it has meaningful state or telemetry boundaries.

Otherwise it should probably be a module, command, route handler, config file, or script.

## Route Rules

Use this decision tree:

| Need | Route type |
|---|---|
| Browser/UI needs data from local modules | Next API route in `app/api` |
| Browser/UI needs health from a service port | Next route or `/api/service-proxy` with `soft=1` |
| Service-to-service runtime call | Direct service URL from `lib/runtime/ports.js` |
| Long-running job creation from UI | Next API route that calls a kernel/orchestrator module |
| External/provider call | Provider module or service-owned route, never raw UI fetch with secrets |

## Mutation Rules

Any route that changes runtime state, starts work, controls browser/computer, writes files, changes provider settings, or changes governance must:

```ts
const auth = checkOperator(req);
if (!auth.ok) return auth.response;
const limited = checkRateLimit(req, '<scope>', <limit>);
if (limited) return limited;
```

Read-only status routes may remain ungated when they expose no secrets.

## Documentation Rules

- Canonical operational docs go in `docs/`.
- If a doc is evidence from a run, put it in `STRESS/` or `agent_work/`.
- If a doc contains future ideas, put it in `docs/experimental/`.
- If a doc contains build/runtime truth, link it from `docs/INDEX.md`.
- If a doc contradicts the current code, fix the doc or mark it historical.
