# `app/` — AGENT.md

The Next.js 15 megapanel. Top-level surface for every division. Runs on port 3030 (PM2 process `purpclaw-nextjs`). All routes are App Router; UI root files are `layout.tsx`, `_document.tsx`, `route.ts`, `not-found.tsx`. `globals.css` is the single global stylesheet.

If your task is megapanel-side — UI, route handlers, surface APIs, hooks — start here.

---

## Subdirs (real, 25 surfaced)

| Path | Role | Notes |
|---|---|---|
| `_archive/` | Old routes kept for diff/reference | frozen |
| `agents/` | Agent roster UI (`page.tsx` + `playwright/` test sub-tree) | ENGINEERING/INFRA roots |
| `api/` | App Router route handlers (50 megapanel-side `/api/*`) | Cross-mapped with `unified_api.js` (7780) routes |
| `bridge/` | Bridge to the CLI/legacy tooling | `_lib/` present |
| `cockpit/` | OPERATIONS dashboard — `page.tsx` exists | "/cockpit" route |
| `command-center/` | "Command-Center" advertised tab | **DEAD: no `page.tsx` exists → 404 at runtime** (Task #43 follow-up) |
| `components/` | Shared megapanel components (40+ files) | — |
| `dash/` | INFRASTRUCTURE overview — `page.tsx` exists | "/dash" route |
| `globals.css` | Global stylesheet | — |
| `hooks/` | 40+ React hooks (e.g. `useAgentTower`, `useApi`, `useMissionData`) | — |
| `inline/` | Inline-overlay UI (modals/inline surfaces) | — |
| `layout.tsx` | Root App Router layout | — |
| `mission/` | INTELLIGENCE surface — `page.tsx` + `harness/` | "/mission" route |
| `mochi/` | Mascot persona surface | — |
| `omni/` | SECURITY surface — `page.tsx` exists | "/omni" route |
| `particle-viz/` | SCIENCE particle visualizer (subdir but **no `page.tsx`** — 404) | best-effort disabled |
| `pipeline/` | Pipeline visualizer | — |
| `preprompt/` | Prompt-layer curation UI | — |
| `providers/` | Wrapping providers (e.g. context providers for agents) — `page.tsx` present | — |
| `public/` | Megapanel static assets | — |
| `route.ts` | Root path route handler | — |
| `settings/` | "Settings" route — `page.tsx` + `SettingsSpine.tsx` | "/settings" route (right-rail fake telemetry is open work) |
| `skyscraper/` | CREATIVE project surface — `page.tsx` exists | "/skyscraper" route |
| `swarm/` | Swarm coordination UI — `page.tsx` exists | "/swarm" route |
| `ui/` | Generic UI primitives (cross-route) | — |
| `voice/` | MEDIA_OPS voice stack — `page.tsx` exists | "/voice" route |
| `not-found.tsx` | App Router 404 page | — |
| `_document.tsx` | App Router document | — |

Truth-of-state as of 2026-06-23: full-page routes verified in this lane are `/mission`, `/system-map`, `/evolution`, `/agents`, `/mission/harness`, `/pipeline`, `/swarm`, `/providers`, `/memory`, `/settings`, `/bridge`, `/mochi`, `/skyscraper`, `/abliterator`, `/preprompt`, and `/omni`. `/voice`, `command-center`, and `particle-viz` have no active `page.tsx`. Voice is exposed through `/api/voice/*` and service status, not a full page.

---

## The megapanel ↔ unified_api route gap

The megapanel fires these `/api/*` paths against `127.0.0.1:7780` (the unified_api tool plane):

| Megapanel route | Backend in `unified_api.js` |
|---|---|
| `/api/chat`, `/api/bridge/...`, `/api/agent-scores/*`, `/api/api-mega-list/*`, `/api/benchmark/*`, `/api/delegation/*`, `/api/sessions*`, `/api/version`, `/api/mochi`, `/api/status` | YES |
| `/api/kernel/jobs`, `/api/llm/status`, `/api/research/status`, `/api/delegation/status`, `/api/omnicode/status`, `/api/evolution/status`, `/api/benchmark/odysseus` | Next-side adapters exist for current cockpit use; verify backend truth per route before claiming live behavior |

Recent additions to preserve:

- `/api/sessions` and `/api/sessions/[id]` are durable chat-session adapters over `lib/session-store.js`.
- `/api/trace/recent` and `/api/trace/stream` normalize trace events for the mini trace terminal.
- `/api/evolution/status` exposes status plus gated run/pause/resume actions.
- `/system-map` and `/evolution` are full pages, not left-panel tabs.

(Mount pattern in `unified_api.js` is hand-rolled, not Express. If you add a route, the pattern is `if (pathname === '/api/...' && method === 'POST') { ... }` near the bottom of the file, with `sendJson(res, …)` + `parseBody(req)`.)

---

## The service-proxy trick

`app/api/service-proxy/route.ts` is the megapanel's port-allowlist proxy — it downgrades 502/503 to 200 with `soft=1`. If you see 400/502 from it, the bug is usually the **caller** (megapanel probing itself: `port=3030`, or `port=-1` sentinel).

The BIOS doctrine (in `docs/spec/PURPCLAW_BIOS_DOCTRINE.md`) reuses this for runtime probe — see `/api/boot/*`.

---

## Layout, route, agents mgmt

- `/` redirects to dashboard via `route.ts` (some surfaces enforce onboarding gate via `app/_archive/_layout.tsx`).
- `/agents`, `/agents/<id>` for the agent roster.
- `/omni` is the SECURITY sub-route (under the `OMNI` division).
- `/settings` carries the open issue: `SettingsSpine.tsx` right-rail must be checked against real settings/runtime metrics before any telemetry claim is made. Tracked as a separate task.

---

## When you change something here

- App Router rebuild — Next.js dev server with HMR. PM2 `purpclaw-nextjs` restart only required on production builds.
- Hook additions go in `app/hooks/` and must be exported with a stable name (`use…`).
- Component additions land in `app/components/`. Keep ≤ 600 lines per file.
- Adding a route handler: place at `app/api/<name>/route.ts`. Match Next.js `export async function GET(req: NextRequest)` etc.

---

## Things to NOT do

- Do NOT assume `command-center` "works because it's listed in the tile grid". It doesn't.
- Do NOT assume 502 from `service-proxy` means the target service is down. Check `port` query first.
- Do NOT edit `route.ts` blindly — it's the shell.
- Do NOT skip `not-found.tsx` when adding a new tab; users WILL hit 404.

---

Last updated 2026-06-19. Owner: **infra@gateway**.
