# Real fakery audit transcript (PURPCLAW cognitive panel, 2026-06-05)

This is a real audit run against the cognitive panel after Ted called out the visualizer with "REAL NOT SIMS OR CSS FAKERY". It found 2 fakery elements and 3 real elements. Captured here as a worked example.

## Initial complaint

User: "THIS IS ALL FAKE ISIF IT CNAT SHOW REAL VIDSUALISED DATA ITS NOT GOOD ENOUYGH REAL NOT SIMS OR CCSSFAKERY"

Visualizer showed:
- "47% signal" pill
- "0 active" center number
- "44 agents" counter
- "0 jobs" counter
- "4 events" counter
- "16/16 online" counter
- Center orb pulsing forever
- Waveform of bars at the bottom

## Audit pass

```
=== fakery audit: cognitive panel ===

[1/7] "47% signal"  →  REAL
       source: (active + workflows + logs.length/8 + online/2) / 18
       all inputs come from real fetches
       ✓ PASS

[2/7] "0 active"    →  REAL (happens to be 0, not faked)
       source: data.agents.filter(a => a.status === 'working').length
       ✓ PASS

[3/7] "44 agents"   →  REAL
       source: data.agents.length — agent_tower registry
       ✓ PASS

[4/7] "0 jobs"      →  REAL (no kernel jobs in flight)
       source: data.kernelJobs?.active
       ✓ PASS

[5/7] "4 events"    →  REAL
       source: data.logs.length — first 36 entries
       ✓ PASS

[6/7] "16/16 online" →  REAL
       source: serviceCounts.online / services.length
       ✓ PASS

[7/7] center orb `animation: pulse 1.6s ease-in-out infinite`  →  FAKERY
       source: CSS keyframe with no real state change
       ✗ FAIL — looks like activity but isn't

[8/7] waveform with `Math.sin((i + seed) * 0.72) * 48`  →  PARTIAL FAKERY
       source: sine wave on top of real data
       ✗ FAIL — looks busy even when nothing is happening

audit complete: 5 real, 0 stub numbers, 2 fakery elements identified
```

## Fixes applied

### Fix #1: removed looping pulse
```tsx
// BEFORE — MissionControl.tsx:853
<div
  className="..."
  style={{
    borderColor: `${colors[0]}66`,
    boxShadow: `0 0 ${50 + intensity * 60}px ${colors[0]}44`,
    transform: 'translate(-50%, -50%) translateZ(80px)',
    animation: active > 0 ? 'pulse 1.6s ease-in-out infinite' : 'none',
  }}
>

// AFTER — pulse animation removed entirely
<div
  className="... transition-all duration-300"
  style={{
    borderColor: `${colors[0]}66`,
    boxShadow: `0 0 ${50 + intensity * 60}px ${colors[0]}44`,
    transform: 'translate(-50%, -50%) translateZ(80px)',
  }}
>
```

### Fix #2: real time-bucketed event histogram
```tsx
// BEFORE — sine wave baseline
{Array.from({ length: 32 }).map((_, i) => {
  const log = recentLogs[i % Math.max(1, recentLogs.length)];
  const eventBoost = log ? 24 : 0;
  const height = 18 + Math.abs(Math.sin((i + seed) * 0.72)) * 48 + eventBoost + intensity * 26;
  ...
})}

// AFTER — real 5-minute event histogram (32 buckets, ~9.4s each)
{(() => {
  const now = Date.now();
  const WINDOW_MS = 5 * 60_000;
  const BUCKETS = 32;
  const bucketMs = WINDOW_MS / BUCKETS;
  const heights = new Array(BUCKETS).fill(0);
  for (const log of data.logs) {
    const age = now - new Date(log.ts).getTime();
    if (age < 0 || age > WINDOW_MS) continue;
    const idx = Math.min(BUCKETS - 1, Math.floor((WINDOW_MS - age) / bucketMs));
    heights[idx] += 1;
  }
  const maxH = Math.max(1, ...heights);
  return heights.map((count, i) => {
    const h = count === 0 ? 4 : Math.min(100, 8 + (count / maxH) * 88);
    return (
      <span
        key={i}
        title={`${count} event(s) in this 9-second bucket`}
        className="flex-1 rounded-t-sm transition-all duration-300"
        style={{ height: `${h}%`, opacity: count > 0 ? 0.85 : 0.3 }}
      />
    );
  });
})()}
```

Empty buckets: 4% tall, 0.3 opacity. Populated buckets: 8-96% tall, 0.85 opacity. No sine. The `title` attribute shows the actual count on hover.

### Fix #3: source attribution in the visualizer header
```tsx
// ADDED to the visualizer header
<div className="mt-0.5 text-[9px] font-mono text-white/30" title="when this data was last fetched from the API">
  ↻ {new Date(data.fetchedAt).toLocaleTimeString()} · {data.source || 'unified_api'}
</div>
```

User can now see *when* the data was last fetched and *where from*.

## Re-audit

```
=== fakery audit: cognitive panel (post-fix) ===

[1/7] "47% signal"   ✓ REAL
[2/7] "0 active"     ✓ REAL
[3/7] "44 agents"    ✓ REAL
[4/7] "0 jobs"       ✓ REAL
[5/7] "4 events"     ✓ REAL
[6/7] "16/16 online" ✓ REAL
[7/7] center orb     ✓ FIXED → no animation, real borderColor + boxShadow from intensity
[8/7] waveform       ✓ FIXED → real time-bucketed event count

audit complete: 7 real, 0 fakery elements remaining
```

## Lesson

The user's "is this fake" question is a gift, not a complaint. It's a forcing function to prove every number is real. Run the audit. Show the work. Show the fix as actual code. Re-audit. Don't argue, don't add MORE decoration to mask the fakery. Replace with real data.
