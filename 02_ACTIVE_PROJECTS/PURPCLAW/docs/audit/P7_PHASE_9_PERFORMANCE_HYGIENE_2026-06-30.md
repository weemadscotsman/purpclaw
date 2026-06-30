# P7 PHASE 9 — PERFORMANCE HYGIENE — 2026-06-30

Performance rules for PURPCLAW UI. These are not optional.

---

## CHAT INPUT VISIBILITY

**Rule:** Chat input must be visible within 2 seconds on local network.

**Implementation:**
- CockpitShell renders header + command panel first — no full-page spinner
- `/mission` page uses `'use client'` with initial ready state
- Chat panel visible even if backend is warming up
- ENTHEA mounts via `useEffect` after shell paint — never blocks

**Anti-patterns blocked:**
- `await` on all CockpitShell data before returning JSX
- Full-page loading screens on `/mission`
- ENTHEA iframe blocking shell render

---

## POLLING CONTROL

**Rule:** Poll only visible panels. Pause polling when tab is hidden.

**Implementation:**
```typescript
useEffect(() => {
  if (document.visibilityState === 'hidden') {
    // stop polling
    return () => { /* cleanup interval */ };
  }
  // resume polling
}, [visibilityState]);
```

**Panel-level polling:**
| Panel | Poll interval | Pauses when hidden |
|---|---|---|
| Chat/Command | SSE stream (no poll) | N/A |
| Mission vitals | 30s | YES |
| Session list | 30s | YES |
| Agent status | 10s | YES |
| Service health | 30s | YES |
| Harness missions | 10s | YES |
| Event timeline | SSE stream | N/A |
| Log stream | SSE stream | N/A |

**Anti-patterns blocked:**
- Multiple intervals for same data source
- No visibility check — polling while tab hidden
- 1s polling on any panel (too aggressive)

---

## PROMISE HANDLING

**Rule:** Use `Promise.allSettled` for parallel fetches. Never reject on partial failure.

**Correct pattern:**
```typescript
const [missionRes, hostRes, svcRes] = await Promise.allSettled([
  fetch('/api/mission-data', { cache: 'no-store' }),
  fetch('/api/host-telemetry', { cache: 'no-store' }),
  fetch('/api/services', { cache: 'no-store' }),
]);

const missionData = missionRes.status === 'fulfilled'
  ? await missionRes.value.json().catch(() => null)
  : null;
```

**Anti-patterns blocked:**
- `Promise.all` rejecting on first failure
- Sequential fetches that could be parallel
- No `.catch()` on fetches

---

## REQUEST TIMEOUTS

**Rule:** Every `fetch()` must have a signal or explicit timeout.

**Pattern:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 8000);

try {
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  // ...
} catch (e) {
  clearTimeout(timeout);
  // handle abort/timeout
}
```

**Applied to:**
- All `useEffect` fetches in CockpitShell
- All API route calls
- SSE stream connections with fallback timeout

---

## SESSION LIST PAGINATION

**Rule:** Initial load = 10 sessions. Load More button for older sessions.

**Implementation:**
```typescript
const [sessions, setSessions] = useState([]);
const [offset, setOffset] = useState(0);
const LIMIT = 10;

// Initial load
useEffect(() => {
  fetch(`/api/sessions?offset=0&limit=${LIMIT}`)
    .then(r => r.json())
    .then(data => setSessions(data.sessions));
}, []);

// Load more
const loadMore = () => {
  const next = offset + LIMIT;
  fetch(`/api/sessions?offset=${next}&limit=${LIMIT}`)
    .then(r => r.json())
    .then(data => setSessions(prev => [...prev, ...data.sessions]));
  setOffset(next);
};
```

**Applied to:** Session list in MissionControl.
**Verified:** `useMissionData` cap = 10 sessions. Load More button wired.

---

## LISTENER CLEANUP

**Rule:** Every `useEffect` with event listeners must return cleanup.

**Pattern:**
```typescript
useEffect(() => {
  const handler = (e) => { /* ... */ };
  eventSource.addEventListener('message', handler);
  return () => eventSource.removeEventListener('message', handler);
}, [dependency]);
```

**Anti-patterns blocked:**
- `addEventListener` without `removeEventListener`
- EventSource streams without explicit close
- `setInterval` without `clearInterval`

---

## LAZY PANELS

**Rule:** Side panels lazy-load. No eager import of heavy components.

**Implementation:**
- `React.lazy()` for: AutonomousHarnessPanel, AgentRosterPanel, EventTimelinePanel, LogStreamPanel
- Panels below fold do not mount until tab selected
- ENTHEA iframe deferred with `loading="lazy"` + `useEffect` mount

**Heavy components:**
| Component | Trigger | Pattern |
|---|---|---|
| MissionControl megapanel | `/mission` tab switch | `lazy()` |
| AutonomousHarnessPanel | HX tab | `lazy()` |
| TowerPanel | TW tab | `lazy()` |
| EventTimelinePanel | EL tab | `lazy()` |
| ENTHEA iframe | shell mount | `useEffect` defer |

---

## NO HEAVY POINTER HANDLERS

**Rule:** No `onPointerDown`/`onPointerMove` handlers on large elements.

**Anti-patterns blocked:**
- Canvas/visualizer with heavy `onPointerMove` re-renders
- Drag handlers on full-page elements
- Mouse position tracking on shell chrome

**Fix:** Use `passive` event listeners, throttle handlers, or move to `requestAnimationFrame`.

---

## NO DUPLICATE INTERVALS

**Rule:** Only one interval per data source per component tree.

**Checklist:**
- [ ] No two `setInterval` calling `/api/mission-data`
- [ ] No `useMissionData` + local `setInterval` for same data
- [ ] SSE stream + polling for same data = pick one
- [ ] `clearInterval` on unmount

---

## INITIAL LOAD CHECKLIST

Every new page must pass:

```
□ Shell renders in <500ms (no blocking fetches before paint)
□ Chat input visible immediately
□ Loading skeleton for deferred panels
□ No full-page spinner
□ ENTHEA lazy-mounted after shell paint
□ Polling starts only after first paint
□ Visibility check before starting background polling
```

---

## VERIFICATION COMMANDS

```bash
# Check for duplicate intervals
grep -rn "setInterval" app/

# Check for missing cleanup
grep -rn "addEventListener" app/ | grep -v "removeEventListener"

# Check for Promise.all instead of allSettled
grep -rn "Promise.all\(" app/components/

# Check for missing AbortController timeouts
grep -rn "fetch(" app/ | grep -v "signal\|timeout\|Abort"

# Check session list limit
grep -rn "limit" app/hooks/useMissionData.ts
```
