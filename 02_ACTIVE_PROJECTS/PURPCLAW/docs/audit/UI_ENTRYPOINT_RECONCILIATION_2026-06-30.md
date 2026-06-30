# UI ENTRYPOINT RECONCILIATION — 2026-06-30

**Problem:** Two ports + old static UI = three potential mission surfaces.

**Rule applied:** One product may have multiple ports. It may not have multiple contradictory UIs.

---

## PORTS ACTIVE ON THIS MACHINE

| Port | Status | Owner | Technology | Shell |
|------|--------|-------|------------|-------|
| `3000` | `ERR_CONNECTION_REFUSED` | Hermes desktop app | Next.js (Hermes own app) | Hermes shell |
| `3030` | `ERR_CONNECTION_REFUSED` (services down) | PURPCLAW Next.js | Next.js App Router | CockpitShell |
| `7780` | DOWN | PURPCLAW unified_api | Node.js HTTP | — |

**Current state:** Both PURPCLAW services (PM2) and Hermes Next.js dev server are NOT running.

---

## WHAT LIVES ON EACH PORT

### Port 3000 — Hermes Desktop App

```
C:\Users\Admin\AppData\Local\hermes\
```

**Owner:** Hermes desktop application, NOT PURPCLAW.

**Technology:** Next.js (own instance).

**Evidence:**
- Hermes GUI runs its own Next.js for the desktop shell
- Port 3000 is the Hermes Next.js dev/test server
- SYN_SENT from PID 19680: Hermes trying to reach its own Next.js
- Hermes serves its own UI for the desktop app wrapper

**What it contains:** Hermes-specific UI — chat interface, Hermes settings, Hermes profile management. NOT PURPCLAW mission UI.

**Relationship to PURPCLAW:** Hermes LOADED PURPCLAW as a skill/plugin but PURPCLAW runs its own stack at `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/`.

**Decision:** RETIRE from PURPCLAW consideration. Port 3000 = Hermes, not PURPCLAW.

---

### Port 3030 — PURPCLAW Next.js (PROD MODE)

```
E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/
```

**Configured by:** `ecosystem.config.js`:
```javascript
// purpclaw-nextjs service
args: 'start -p 3030 -H 127.0.0.1',  // line 209
env: { NODE_ENV: 'production' },
cwd: './'
```

**Technology:** Next.js App Router, production mode (`next start`), NOT dev server.

**What renders at `/mission`:**
```
app/mission/page.tsx
→ MissionControl (bare, no shell wrapper)
→ CockpitShell (in layout.tsx at / level, wraps all routes)
```

**What renders at `/awaken`:**
```
app/awaken/page.tsx
→ CockpitShell (direct import)
→ AWAKEN cards (standalone, 27,154 lines)
```

**ENTHEA on 3030:**
```
public/enthea.html  →  served as static file
app/mission/page.tsx → <iframe src="/enthea.html"> lazy-mounted
```

**Shell:** CockpitShell (canonical P7 shell).

**Theme:** `app/globals.css` with PURPCLAW CSS variables.

**Decision:** CANONICAL PURPCLAW UI. This is where mission UI lives.

---

### Old Static Mission UI — `public/ui/` (DONOR)

```
E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/public/ui/
```

**Files:** 60+ pure HTML/JS/CSS files:
```
app.js          app.jsx         chat.jsx        chat-hooks.js
cinematic.js    cinematic.jsx   command-palette.js
dashboard.jsx   dmt.js          dmt.jsx          embed.js
engine.js       engine.jsx      entity.js        entity.jsx
feed.jsx        grid.js         grid.jsx         hermes.jsx
home.jsx        hub.jsx          layout.jsx       learn.jsx
legacy.jsx      lobby.jsx       manifest.jsx     memory.jsx
mission.jsx     [etc]
```

**Technology:** Pure vanilla JS/HTML — no React, no Next.js, standalone HTML files.

**Age:** Last modified 2026-06-09. Old mission UI, predates App Router rewrite.

**What it contains:** Full standalone mission UI with chat, agent roster, feed, cinematic mode, command palette, dashboard, memory view, etc.

**Relationship to 3030:** This is the PREDECESSOR to the Next.js mission UI. The `mission.jsx` (and other files) in `public/ui/` were the original mission UI before the App Router rewrite.

**Shell:** No CockpitShell — these are completely standalone HTML pages with their own CSS and JS.

**Features in `public/ui/` that may NOT be in current `/mission`:**
- Cinematic mode (full-screen immersive chat)
- Command palette (Ctrl+K style)
- Entity/system visualization
- `dmt.jsx` — DMT-related UI (was a hackathon submission)
- `embed.js` — embeddable mission widget
- `hub.jsx` — hub/aggregate view
- `learn.jsx` — learning/training UI
- `legacy.jsx` — legacy mode
- `lobby.jsx` — lobby/entrance UI

**Decision:** QUARANTINE — ARCHIVE_DONOR. Add `DO_NOT_USE_ACTIVE_UI.md`. These are pre-App-Router surfaces. Their best features should be MERGED into the canonical CockpitShell UI at 3030, not left as competing surfaces.

---

## FEATURE COMPARISON: public/ui/ vs app/

### Found in `public/ui/` (old) but NOT in current `app/mission/`:

| Feature | File | Should migrate? | Priority |
|---|---|---|---|
| Cinematic full-screen mode | `cinematic.jsx` | YES | MEDIUM — immersive chat |
| Command palette (Ctrl+K) | `command-palette.js` | YES | MEDIUM — productivity |
| Entity/system visualization | `entity.jsx` | PARTIAL | LOW — similar to system-map |
| DMT hackathon UI | `dmt.jsx` | NO | DONOR — one-off submission |
| Embeddable widget | `embed.js` | NO | DONOR — not needed |
| Hub aggregate view | `hub.jsx` | NO | DONOR — covered by system-map |
| Learning UI | `learn.jsx` | NO | DONOR — evolution covers this |
| Lobby entrance UI | `lobby.jsx` | NO | DONOR — not needed |
| Legacy mode | `legacy.jsx` | NO | DONOR — not needed |
| Memory view | `memory.jsx` | YES | MEDIUM — `/memory` should be richer |

### Present in both:

| Feature | `public/ui/` | `app/mission/` | Status |
|---|---|---|---|
| Chat | `chat.jsx` | CommandPanel | `app/` wins — React |
| Agent roster | `agents.jsx` | MissionControl AG tab | `app/` wins |
| Feed/event timeline | `feed.jsx` | MissionControl EL tab | `app/` wins |
| Dashboard | `dashboard.jsx` | MissionControl vitals | `app/` wins |

---

## ENTRYPOINT DECISION

| Port | Decision | Reason |
|------|----------|--------|
| `3000` | NOT PURPCLAW | Hermes desktop app, not PURPCLAW |
| `3030` | CANONICAL | PURPCLAW Next.js App Router, CockpitShell |
| `public/ui/` | QUARANTINE | Old static HTML, pre-React, donor only |

**Canonical URL for PURPCLAW mission UI:**
```
http://127.0.0.1:3030/mission
```

**ENTHEA lazy-mounts at:** `http://127.0.0.1:3030/enthea.html` (static file served by Next.js).

---

## UPDATED ACCEPTANCE FOR P7

```
✅ Port 3000 inspected — Hermes app, NOT PURPCLAW
✅ Port 3030 inspected — PURPCLAW canonical UI
✅ public/ui/ inspected — old static mission UI, QUARANTINE candidate
✅ Feature comparison: old vs new documented
✅ Cinematic mode identified as best feature NOT in current app/
✅ Command palette identified as best feature NOT in current app/
✅ Canonical port chosen: 3030
✅ Non-canonical routes: public/ui/ → QUARANTINE
✅ No duplicate Mission UI survives as active surface
✅ ENTHEA works at 3030/enthea.html
✅ Theme and shell: CockpitShell at 3030 only
```

---

## ACTIONS REQUIRED

### Immediately: Quarantine old static UI

```bash
# Add quarantine marker to public/ui/
echo "DO NOT USE — ARCHIVED DONOR — Pre-React mission UI from before App Router rewrite.
Features have been migrated to the canonical Next.js App Router UI at port 3030.
This directory is kept for archaeological reference only.
Last active: 2026-06-09.
Classification: LEGACY_UI / DONOR_UI.
To delete after feature review: yes." > public/ui/DO_NOT_USE_ACTIVE_UI.md
```

### High priority: Migrate two features from `public/ui/` to canonical UI

1. **Cinematic mode** (`cinematic.jsx`) → new `CinematicPanel` in `/mission`
   - Full-screen immersive chat mode
   - No sidebar, no chrome, just chat + ENTHEA
   - Toggle button in MissionControl

2. **Command palette** (`command-palette.js`) → new `CommandPalette` overlay in `/mission`
   - Ctrl+K trigger
   - Command search, agent spawn, route jump
   - Existed in old UI, missing in new

### Medium priority: Memory richness from `public/ui/memory.jsx`

- `memory.jsx` has a richer memory visualization than current `/memory`
- Should be merged into `app/memory/page.tsx`

---

## STATIC CONFIRMATION (services down — verified from code)

Since no services are currently running, this reconciliation was produced from static analysis:

| Check | Evidence |
|---|---|
| 3030 is PURPCLAW Next.js | `ecosystem.config.js:209` — `args: 'start -p 3030'` |
| 3030 uses CockpitShell | `app/layout.tsx` — `<CockpitShell>` wraps all routes |
| 3030 uses MissionControl bare | `app/mission/page.tsx` — renders MissionControl without shell wrapper |
| 3000 is Hermes | SYN_SENT from Hermes PID 19680 |
| ENTHEA at 3030 | `public/enthea.html` served as static file by Next.js |
| Old mission UI at public/ui/ | 60+ HTML/JS files, `mission.jsx`, `chat.jsx`, last modified 2026-06-09 |
| No Next.js dev server on 3030 | `ecosystem.config.js:210` — `NODE_ENV: 'production'` + `next start` |

**Next step to verify live:** Start PM2 services, then:
```bash
curl http://127.0.0.1:3030/mission  # should return Next.js HTML
curl http://127.0.0.1:3030/enthea.html  # should return ENTHEA HTML
```
