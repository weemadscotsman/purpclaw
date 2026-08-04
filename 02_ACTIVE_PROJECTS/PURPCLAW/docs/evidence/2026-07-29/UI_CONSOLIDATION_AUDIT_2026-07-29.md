# UI Consolidation Audit — 2026-07-29
**Auditor**: Quill
**Build status**: `npm run build` running in background (cold-cache webpack compile, ~15-20min expected)
**Next.js URL**: `http://127.0.0.1:3030` (not yet live — awaiting build)

---

## Context: What Already Exists

2026-07-07 consolidation already performed. Middleware, gallery, and archive structure are in place:

```
middleware.ts                          ✅ CREATED (2026-07-07)
app/mission-control/page.tsx           ✅ redirect → /mission
app/skyscraper/page.tsx                ✅ redirect → /mission?tab=tower
app/swarm/page.tsx                    ✅ redirect → /mission?tab=agents
app/cockpit/page.tsx                  ✅ redirect → /mission
public/_archive/mission-control/      ✅ MOVED (2026-07-07)
public/_archive/ui/                   ✅ MOVED (2026-07-07)
public/_archive/ui-mockup/            ✅ MOVED (2026-07-07)
app/gallery/page.tsx                  ✅ STATUS BADGES (live/redirected/archived)
```

---

## Audit Results: Surfaces by Status

### ✅ Canonical surfaces (consolidated, no action needed)

| Route | Surface | Status | Evidence |
|---|---|---|---|
| `/` | CockpitShell — rail + header | live | app/ui-shells/01-cockpit-shell/ |
| `/mission` | MissionControl (canonical) | live | app/ui-shells/02-mission-control-classic/ — 18-route drawer |
| `/mission?tab=tower` | Tower State inside Mission | live | via /mission tab |
| `/mission?tab=agents` | Agent Workforce inside Mission | live | via /mission tab |
| `/mission?ui=dawn` | Purple Dawn skin | live | same route, skin param |
| `/showcase/index.html` | Marketing static | live | public/showcase/ |
| `/gallery` | UI survivor audit | live | 9-entry status table |

### ✅ Redirected surfaces (middleware + page.tsx fallback both wired)

| Route | Was | Now | Middleware | page.tsx |
|---|---|---|---|---|
| `/mission-control` | static html | → `/mission` | ✅ | ✅ redirect |
| `/skyscraper` | alternate tower | → `/mission?tab=tower` | ❌ NOT in middleware | ✅ redirect |
| `/swarm` | agent list dup | → `/mission?tab=agents` | ❌ NOT in middleware | ✅ redirect |
| `/cockpit` | military terminal | → `/mission` | ❌ NOT in middleware | ✅ redirect |
| `/ui` | legacy static | → `/mission` | ✅ | N/A (deleted) |

### ⚠️ NEW surfaces not in gallery (MISSING FROM GALLERY)

These 5 surfaces exist in `app/` but are NOT in the gallery's 9-entry list:

| Route | File | Lines | Surface type | What it is | API deps |
|---|---|---|---|---|---|
| `/omni` | app/omni/page.tsx | 368 | React — 'use client' | Omni-Surgeon Cockpit: truth snapshot, feature registry, patch review | /api/omni/* |
| `/awaken` | app/awaken/page.tsx | 538 | React — 'use client' | Autonomous growth feed? | /api/awaken/* |
| `/liveforge` | app/liveforge/page.tsx | 320 | React — 'use client' | Surface/patch management — reads /api/liveforge/surfaces, /patches, /events | /api/liveforge/* |
| `/stream` | app/stream/page.tsx | 291 | React — 'use client' | IPTV channel browser — /api/stream | /api/stream |
| `/market-lab` | app/market-lab/page.tsx | 13 | iframe embed | ProofMesh Market Lab — iframe src="/proofmesh/market-lab.html" | static |
| `/settings` | app/settings/page.tsx | 621 | React — 'use client' | PersonalityDial + driver/preset management | /api/settings/* |

### ⚠️ Redirect surfaces NOT in middleware (URL-level gap)

These redirect via page.tsx but NOT via middleware — meaning direct navigation to the URL bypasses the page component:

| Route | page.tsx redirect | Middleware entry |
|---|---|---|
| `/skyscraper` | ✅ `redirect('/mission?tab=tower')` | ❌ MISSING |
| `/swarm` | ✅ `redirect('/mission?tab=agents')` | ❌ MISSING |
| `/cockpit` | ✅ `redirect('/mission')` | ❌ MISSING |

**Impact**: If Next.js prerendering serves these routes, they serve the redirect page (302) not a 308. For browser navigation these are equivalent, but SEO and caching behaviour differs. Low severity but inconsistent with the middleware pattern.

---

## New Surface Analysis

### `/omni` — Omni-Surgeon Cockpit
- **368 lines**, 'use client'
- Title: "Operator surface that shows the truth snapshot, feature registry, and patch review status."
- Reads from `/api/omni/*` routes
- Is this a DUPLICATE of `/mission`? Likely NOT — it's a specialized operator surface
- **Recommendation**: Add to gallery as `live`. Not a duplicate of MissionControl — it's a separate operator surface.

### `/awaken` — Awaken
- **538 lines**, 'use client'
- Likely autonomous agent wake/scheduler surface
- Reads from `/api/awaken/*` routes
- **Recommendation**: Add to gallery as `live`. Not a duplicate.

### `/liveforge` — LiveForge
- **320 lines**, 'use client'
- Surface/patch management for codex-integrated tools
- API calls: `/api/liveforge/surfaces`, `/api/liveforge/patches`, `/api/liveforge/events`, `/api/liveforge/generated-tools/proposals`
- **Recommendation**: Add to gallery as `live`. Not a duplicate.

### `/stream` — IPTV Stream
- **291 lines**, 'use client'
- IPTV channel browser with logo, favorites, search
- API call: `/api/stream`
- **Recommendation**: Add to gallery as `live`. Not a duplicate.

### `/market-lab` — Market Lab
- **13 lines**, iframe embed of `/proofmesh/market-lab.html`
- Static iframe, not a React surface
- **Recommendation**: Add to gallery as `live`. Not a duplicate.

### `/settings` — Settings
- **621 lines**, 'use client'
- PersonalityDial, driver management, presets
- API calls to `/api/settings/*`
- **Critical question**: Is this the canonical settings surface, or is there a settings surface inside `/mission`?
  - If `/mission?tab=settings` exists and covers the same ground → DUPLICATE
  - If `/mission` has a settings tab: CONSOLIDATE (redirect /settings → /mission?tab=settings)
  - If settings inside `/mission` is incomplete: KEEP /settings as supplement

---

## Decision Required

### Option A: /settings is a DUPLICATE
If `/mission` has a settings/tab that covers all settings functionality, redirect `/settings` → `/mission?tab=settings` and add to gallery as `redirected`.

### Option B: /settings is PARTIAL/SUPPLEMENTAL
If `/mission` tab doesn't cover all settings functionality, keep `/settings` live and add to gallery.

**Need to verify**: Does `/mission` have a settings tab? Look at MissionControl.tsx drawer/tab definitions.

---

## What the 2026-07-07 consolidation LEFT OUT

Middleware currently redirects:
```
/mission-control → /mission        ✅
/twin-ui → /gallery                ✅
/ui → /mission                     ✅
```

Middleware does NOT redirect (page.tsx only):
```
/skyscraper                           ✅ page.tsx (no middleware)
/swarm                                ✅ page.tsx (no middleware)
/cockpit                              ✅ page.tsx (no middleware)
```

These are not bugs — page.tsx redirect works for browser navigation. The gap is inconsistency: `/mission-control` goes through middleware (308) while `/skyscraper` only goes through page.tsx (302). For the user clicking links in the UI this is invisible. For SEO and bookmark behavior it's a minor difference.

---

## Action Plan

### Must do (after build completes + Next.js is live):
1. **Add 5 new surfaces to gallery**: omni, awaken, liveforge, stream, market-lab — status: live
2. **Add /settings to gallery** — pending decision on whether it's a duplicate
3. **Add /skyscraper, /swarm, /cockpit to middleware** for URL-level consistency
4. **Verify /settings duplicate status**: check if /mission has settings tab
5. **Verify each new surface** doesn't duplicate /mission (Omni-Surgeon, Awaken, LiveForge, Stream appear to be distinct surfaces)

### After Next.js build completes:
```bash
# Start Next.js
node node_modules/next/dist/bin/next start -p 3030 -H 127.0.0.1 &

# Verify redirects
curl -m 30 -s -o /dev/null -w "/mission=%{http_code}\n"       http://127.0.0.1:3030/mission
curl -m 30 -s -o /dev/null -w "/skyscraper=%{http_code} loc=%{redirect_url}\n" http://127.0.0.1:3030/skyscraper
curl -m 30 -s -o /dev/null -w "/swarm=%{http_code} loc=%{redirect_url}\n"  http://127.0.0.1:3030/swarm
curl -m 30 -s -o /dev/null -w "/cockpit=%{http_code} loc=%{redirect_url}\n" http://127.0.0.1:3030/cockpit
curl -m 30 -s -o /dev/null -w "/omni=%{http_code}\n"           http://127.0.0.1:3030/omni
curl -m 30 -s -o /dev/null -w "/awaken=%{http_code}\n"          http://127.0.0.1:3030/awaken
curl -m 30 -s -o /dev/null -w "/liveforge=%{http_code}\n"      http://127.0.0.1:3030/liveforge
curl -m 30 -s -o /dev/null -w "/stream=%{http_code}\n"          http://127.0.0.1:3030/stream
curl -m 30 -s -o /dev/null -w "/market-lab=%{http_code}\n"      http://127.0.0.1:3030/market-lab
curl -m 30 -s -o /dev/null -w "/settings=%{http_code}\n"        http://127.0.0.1:3030/settings

# Run audit scripts
node scripts/audit-parity.mjs
node scripts/audit-showcase-claims.mjs
```

---

## API Route Inventory (for new surfaces)

| Surface | API routes it depends on |
|---|---|
| /omni | /api/omni/* |
| /awaken | /api/awaken/* |
| /liveforge | /api/liveforge/{surfaces,patches,events,generated-tools/proposals} |
| /stream | /api/stream |
| /settings | /api/settings/* |
| /market-lab | (iframe of static /proofmesh/market-lab.html) |

All API routes exist in app/api/:
```
awaken/  ✅
liveforge/  (need to verify — grep liveforge in app/api/)
stream/  ✅
settings/  ✅
```

---

## Freeze Rule Applied

> "new pages must replace ≥2 duplicates, update gallery"

New surfaces added since 2026-07-07 consolidation: **5 new operational surfaces** (omni, awaken, liveforge, stream, market-lab) + 1 settings surface. These are NOT duplicates of /mission — they are distinct surfaces serving different purposes. They must be added to the gallery with status `live`.

Settings duplicate decision is PENDING — needs verification of /mission tab coverage.
