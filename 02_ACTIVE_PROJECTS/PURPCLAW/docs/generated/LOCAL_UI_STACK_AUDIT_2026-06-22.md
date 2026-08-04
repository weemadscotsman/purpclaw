# PURPCLAW Local UI / Stack Audit

Generated: 2026-06-22

Scope: local filesystem and local process/port checks only. Git state was intentionally ignored.

No source code was edited during this audit.

## Executive Finding

The local tree has changed a lot since the previous UI audit.

The big architectural change is that `/mission` no longer renders the old `MissionControl` shell. It now renders:

```tsx
<CockpitShell title="Mission Control · Command Room">
  <CommandPanel data={data} />
</CockpitShell>
```

That is the correct direction: one canonical shell.

The current problem is different now:

1. PM2 has no registered apps.
2. `localhost:3030` is not reachable.
3. Only port `7880` is listening.
4. Build fails inside Next with `Cannot read properties of undefined (reading 'length')`.
5. Docs are stale.
6. TypeScript scope is polluted by archive/vendor/project folders.
7. The UI still risks overlap because shell-level and page-level components both mount global controls.

## Live Runtime State

### PM2

`pm2 jlist` returned:

```json
[]
```

So PM2 currently has zero registered/running PURPCLAW apps.

### Listening Ports

Only this expected PURPCLAW port was listening:

| Port | State | Meaning |
| ---: | --- | --- |
| `7880` | Listen | Cognitive/memory Python service appears alive. |

Not listening during this audit:

`3030`, `7778`, `7780`, `7782`, `7783`, `7784`, `7786`, `7790`, `7792`, `7794`, `7796`, `7797`, `7798`.

### Route Probes

Every `http://localhost:3030/...` page and API probe failed with:

```text
Unable to connect to the remote server
```

This means live route liveness could not be verified. No screenshot could honestly prove the UI because the web server was offline.

## Current Route Inventory

Active page files now present:

| Route | File | Current status |
| --- | --- | --- |
| `/` | `app/page.tsx` | Redirects to `/mission`. New since old audit. |
| `/abliterator` | `app/abliterator/page.tsx` | New canonical page. Uses `CockpitShell`. |
| `/agents` | `app/agents/page.tsx` | Uses `CockpitShell`. |
| `/bridge` | `app/bridge/page.tsx` | Uses `CockpitShell`. |
| `/cockpit` | `app/cockpit/page.tsx` | Redirect page. |
| `/dash` | `app/dash/page.tsx` | Redirect page. |
| `/evolution` | `app/evolution/page.tsx` | Uses `CockpitShell`; also mounts `TraceTerminal`. |
| `/inline` | `app/inline/page.tsx` | Redirects to memory/canonical path according to comments. |
| `/memory` | `app/memory/page.tsx` | New canonical memory page. Uses `CockpitShell`. |
| `/mission` | `app/mission/page.tsx` | Now uses `CockpitShell` + `CommandPanel`. |
| `/mission/harness` | `app/mission/harness/page.tsx` | Uses `CockpitShell`. |
| `/mochi` | `app/mochi/page.tsx` | Live page file exists. |
| `/omni` | `app/omni/page.tsx` | Uses `CockpitShell`. |
| `/pipeline` | `app/pipeline/page.tsx` | Uses `CockpitShell`. |
| `/preprompt` | `app/preprompt/page.tsx` | Uses `CockpitShell`. |
| `/providers` | `app/providers/page.tsx` | Uses `CockpitShell`. |
| `/settings` | `app/settings/page.tsx` | Uses `CockpitShell`. |
| `/skyscraper` | `app/skyscraper/page.tsx` | Uses `CockpitShell`. |
| `/swarm` | `app/swarm/page.tsx` | Uses `CockpitShell`. |
| `/system-map` | `app/system-map/page.tsx` | Uses `CockpitShell`; also mounts `TraceTerminal`. |
| `/ui` | `app/ui/route.ts` | Route handler redirect/adapter, not a React page. |

Removed or not present compared to earlier expectations:

| Expected route | Finding |
| --- | --- |
| `/voice` | No `app/voice/page.tsx` found in current inventory. |
| `/command-center` | No active page found. |
| `/particle-viz` | No active page found. |

## Shell Ownership Map

| Surface | File | Current role | Audit verdict |
| --- | --- | --- | --- |
| Root layout | `app/layout.tsx` | Loads fonts, wraps `{children}`, appends `AgentStatusBar` | Still simple. Good. |
| Canonical app shell | `app/components/CockpitShell.tsx` | Sidebar, header, footer, `SessionSidebar`, `AgentWorkDock` | Now owns most page chrome. This is the right main shell. |
| Mission page | `app/mission/page.tsx` | `CockpitShell` + `CommandPanel` | Old dual-shell problem mostly removed. |
| Chat/work panel | `app/components/CommandPanel.tsx` | Chat, sessions, trace terminal, command modes | Still owns too much global layout. |
| Session/sidebar | `app/components/SessionSidebar.tsx` | Chats/sessions + stack page links | Mounted by `CockpitShell`, and also imported/mounted by `CommandPanel`. Risk of duplicate panels. |
| Trace terminal | `app/components/TraceTerminal.tsx` | Floating/collapsible trace terminal | Still uses fixed positioning and can overlay content. This violates the previous “docked, not floating” rule. |
| Work monitor | `app/components/AgentWorkDock.tsx` | Floating draggable job/agent monitor | New global overlay from `CockpitShell`. Useful, but another overlap source. |
| Old MissionControl | `app/components/MissionControl.tsx` | Not found | Good if intentional. Stale references remain in docs/lib comments. |

## Current UI Overlap Risks

### 1. SessionSidebar is mounted twice conceptually

`CockpitShell` mounts:

```tsx
<SessionSidebar activeSessionId={null} />
```

`CommandPanel` also imports and renders `SessionSidebar`.

That means the app can drift back into two session/nav panels: one shell-level and one chat-level.

Recommended fix later: `CockpitShell` owns global sessions/nav. `CommandPanel` receives session callbacks/state or only exposes chat behavior.

### 2. TraceTerminal is still floating

`TraceTerminal.tsx` says:

```text
position:fixed → it NEVER consumes layout space
```

That contradicts the earlier acceptance rule:

```text
terminal is docked, not floating
terminal must not float over content
```

Recommended fix later: make terminal a shell slot in `CockpitShell`, not a fixed overlay inside pages.

### 3. AgentWorkDock is another fixed/draggable overlay

`CockpitShell` now globally mounts:

```tsx
<AgentWorkDock />
```

This gives the “who is alive / who is working” visibility the user wanted, but because it is draggable/floating, it can overlap the chat/composer unless layout rules constrain it.

Recommended fix later: keep the monitor, but give it a docked default mode and only allow floating as an explicit expanded/debug mode.

### 4. Page-level TraceTerminal duplicates shell concerns

`/evolution` and `/system-map` mount `TraceTerminal` directly.

Recommended fix later: one trace terminal owner. Prefer `CockpitShell`.

## Documentation Drift

`npm run docs:check` failed.

Missing from `ROUTE_INDEX.md`:

| Missing route | Type |
| --- | --- |
| `/api/host-telemetry` | API |
| `/api/yo` | API |
| `/` | Page |
| `/abliterator` | Page |
| `/memory` | Page |

`ROUTE_INDEX.md` still lists `/voice`, but no current `app/voice/page.tsx` was found during this audit.

## Build Validation

`npm run build` failed:

```text
Creating an optimized production build ...
uncaughtException [TypeError: Cannot read properties of undefined (reading 'length')]
```

`NODE_OPTIONS='--trace-uncaught --trace-warnings'` did not reveal a stack.

This is a hard build blocker.

## TypeScript Validation

`npx tsc --noEmit --pretty false` failed.

Important current-app errors:

| File | Problem |
| --- | --- |
| `.next/types/app/api/bridge/route.ts` | `app/api/bridge/route.ts` exports `runTurn`; Next route modules may only export HTTP handlers and route config. |
| `app/api/bridge/route.ts` | `any[]` assigned to `never[]`. |
| `app/components/GatekeeperPanel.tsx` | Uses `data.gatekeepers`, missing from `DiagnosticData`. |
| `app/components/SwarmPanel.tsx` | Expects fields/statuses that do not match current hook types. |
| `app/settings/SettingsSpine.tsx` | Imports missing modules and contains typos/bad JSX signatures. |

Repo-scope pollution errors:

| Path | Problem |
| --- | --- |
| `docs/archive/ui-shadow-2026-06-22/MissionControl.tsx` | Archived UI file is included by TypeScript and imports paths that no longer exist. |
| `lib/thringlets/_vendor-from-pvx/*` | Vendor code imports missing external/project aliases. |
| `no-spaghett/*` | Separate app code is included by root TypeScript. |
| `puzzle-stream/*` | Separate app/monorepo code is included by root TypeScript. |
| `vendor/windows-mcp/*` | Vendor extension code is included by root TypeScript. |

Root cause: `tsconfig.json` includes:

```json
"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
"exclude": ["node_modules"]
```

That compiles archives, vendor folders, side apps, generated docs, and unrelated projects.

Recommended fix later: narrow TypeScript scope to the actual Next app/runtime or explicitly exclude archive/vendor/side-app directories.

## Current High-Priority Fix Order

Do these only after the operator approves edits.

1. Restore service baseline with safe start, not raw PM2 start.
   - Current PM2 app list is empty.
   - Only `7880` is listening.
2. Fix build blocker.
   - Investigate the Next build `undefined.length` crash.
   - Likely suspects: route-module invalid exports, stale `.next/types`, or route/page import with undefined array during build.
3. Fix TypeScript scope pollution.
   - Exclude `docs/archive`, `vendor`, `no-spaghett`, `puzzle-stream`, and copied donor code from root TS checks.
4. Fix `ROUTE_INDEX.md`.
   - Add `/`, `/abliterator`, `/memory`, `/api/host-telemetry`, `/api/yo`.
   - Remove or mark `/voice` if no page exists.
5. Decide global UI ownership.
   - `CockpitShell` should own sidebar, sessions, trace dock, and work monitor.
   - `CommandPanel` should own chat only.
6. De-float the trace/work monitors.
   - Default should be docked shell zones.
   - Floating should be an explicit debug/expanded mode.
7. Once 3030 is live, rerun page route probes and capture screenshots at:
   - `1920x1080`
   - `1536x710`
   - drawer open
   - trace open
   - active chat/composer visible

## Commands Run

```powershell
Get-ChildItem E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW
Get-ChildItem app -Directory
Get-ChildItem app -Recurse -File -Include page.tsx,page.ts,page.jsx,page.js,layout.tsx,layout.ts,loading.tsx,error.tsx,not-found.tsx
pm2 list
pm2 jlist
Get-NetTCPConnection -LocalPort 3030,7778,7780,7782,7783,7784,7786,7790,7792,7794,7796,7797,7798,7880
Invoke-WebRequest http://localhost:3030/<route>
Invoke-WebRequest http://localhost:3030/api/<route>
rg "CockpitShell|CommandPanel|SessionSidebar|TraceTerminal|AgentWorkDock|AgentStatusBar|MissionControl" app components lib
npm run docs:check
npm run build
npx tsc --noEmit --pretty false
```

## Bottom Line

The old “many shells fighting” problem has partially improved: `/mission` now uses the canonical `CockpitShell`.

The current blockers are more basic:

1. the app stack is mostly offline,
2. the build is failing,
3. TypeScript is checking folders it should not check,
4. route docs are stale,
5. global UI controls still overlap because `CommandPanel`, `TraceTerminal`, and `AgentWorkDock` are not cleanly assigned to one shell owner.

No further UI work should happen until build and service baseline are recovered.
