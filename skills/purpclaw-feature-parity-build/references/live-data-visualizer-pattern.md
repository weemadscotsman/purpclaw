# Live Data Visualizer Pattern (no decoration, source attribution, real waveforms)

When the user complains "this is fake" or "this isn't real data" about a
visualizer — the data underneath is real but the visual presentation
makes it look like placeholder. Ted called this out 2026-06-05 on
two specific issues: a continuous loop `pulse 1.6s infinite` animation
on the center orb, and a `Math.sin(i*0.72) * 48` sine-wave baseline
on the waveform. Both were decorative, neither mapped to real data.

## The three anti-patterns

### 1. Continuous loop animations pretending to be live signal

```jsx
// BAD — this loops forever, doesn't respond to data changes
<div style={{ animation: 'pulse 1.6s ease-in-out infinite' }}>...</div>
```

**Why it looks fake:** the animation runs whether or not anything
is actually happening. The user can't tell "is the system doing
something?" from "is the animation just spinning?"

**The fix:** any animation that pretends to be live must be tied
to a real event or state change. If you want a pulse, pulse once
when a kernel job arrives (CSS transition on `active > 0` for 1.6s,
then stop). The `pulse` is the "something just happened" signal, not
a perpetual "I'm here" loop.

### 2. Sine-wave baseline pretending to be a waveform

```jsx
// BAD — sine baseline makes every bucket look ~30% full even with zero data
const height = 18 + Math.abs(Math.sin((i + seed) * 0.72)) * 48 + eventBoost + intensity * 26;
```

**Why it looks fake:** the sine is constant. Every bar gets a
`Math.sin(...) * 48` boost regardless of whether the underlying
event bus has anything to say. Empty buckets look 30% full.

**The fix:** 32 time-buckets, height = real count. Empty = 4% (quiet,
visibly different). Populated = 8-96% (real spread). The waveform
shape IS the data, not a decoration that hides the data.

### 3. Numbers without source attribution

```jsx
// BAD — "47% signal" with no indication of where the number came from
<div>{(intensity * 100).toFixed(0)}% signal</div>
```

**Why it looks fake:** "where is 47% from? Is this real?" The user
has to guess. The visualizer looks like a default-state placeholder.

**The fix:** label under the metric showing the inputs.

```jsx
// GOOD — the user can audit the source on hover
<div className="rounded-full border ... px-3 py-1">
  {(intensity * 100).toFixed(0)}% signal
</div>
<div className="text-[8px] font-mono text-white/25" title="active = kernel jobs in flight right now">
  active: {active} · jobs: {data.kernelJobs?.active || 0} · events: {data.logs.length} (last {age}ms ago)
</div>
```

The `title` attribute is the audit trail. Hover the metric, see
exactly what drives it. Ted reads title text. He tested it: "47%
signal" + a hover that said "active: 0 · jobs: 0 · events: 4 (last
1847ms ago)" was acceptable. The same number without the hover was
not.

## The "real time-bucketed waveform" pattern (full code)

This is the pattern that replaced the sine wave in `MissionControl.tsx`
on 2026-06-05. It's the canonical "show me a waveform that actually
reflects events" pattern.

```jsx
const now = Date.now();
const WINDOW_MS = 5 * 60_000;     // 5 min
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
  // Empty bucket = quiet (4%), populated = real count (8-96%). No sine.
  const h = count === 0 ? 4 : Math.min(100, 8 + (count / maxH) * 88);
  const isRecent = i >= BUCKETS - 8;
  const color = isRecent
    ? (count > 0 ? colors[1] : 'rgba(255,255,255,0.06)')
    : (count > 0 ? colors[0] : 'rgba(255,255,255,0.04)');
  return (
    <span
      key={i}
      title={`${count} event(s) in this 9-second bucket`}
      className="flex-1 rounded-t-sm transition-all duration-300"
      style={{
        height: `${h}%`,
        backgroundColor: color,
        opacity: count > 0 ? 0.85 : 0.3,
      }}
    />
  );
});
```

**What this gives you:**
- When no events have happened in the last 5 min, every bar is 4% — visibly quiet.
- When something happens, the rightmost bar(s) pop (the most recent bucket).
- Older bars are dimmer; recent bars are brighter.
- Hover any bar → "3 event(s) in this 9-second bucket" — real count.

## The "source attribution block" pattern (the audit trail)

Every metric that could be questioned gets a one-line subtitle showing
its inputs. The pattern:

```jsx
<div className="flex items-start justify-between gap-3">
  <div>
    <div className="text-[9px] uppercase tracking-[0.3em] text-white/35 font-mono">live visualizer</div>
    <div className="mt-1 text-xl font-black uppercase tracking-[0.18em] text-white/90">{tab}</div>
    <div className="mt-0.5 text-[9px] font-mono text-white/30" title="when this data was last fetched from the API">
      ↻ {new Date(data.fetchedAt).toLocaleTimeString()} · {data.source || 'unified_api'}
    </div>
  </div>
  <div className="flex flex-col items-end gap-1">
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-mono text-white/45">
      {(intensity * 100).toFixed(0)}% signal
    </div>
    <div className="text-[8px] font-mono text-white/25" title="active = kernel jobs in flight right now">
      active: {active} · jobs: {data.kernelJobs?.active || 0} · events: {data.logs.length} (last {age}ms ago)
    </div>
  </div>
</div>
```

The `title` attribute is for hover. The visible subtitle is for the
audit-trail moment. Together they say "this is real data, fetched
from this endpoint, at this time, and here's what drives it."

## The honest test

To verify a visualizer is real (not decoration):

1. Open it in the browser.
2. Trigger an event (send a chat, kick off a kernel job, etc.).
3. Within 5s, a specific visual element should change AND the change should be attributable to the data field that changed.
4. Stop activity. The visualizer should return to quiet (or a stable low-amplitude state). No perpetual "frozen in animation" state.

If step 3 fails (no visible change, or the change is a loop animation
that was already running), the visualizer is fake. Fix it.

If step 4 fails (visualizer keeps animating after activity stops), the
animation is fake. Remove it.

## Common fix-up patterns

| symptom | likely cause | the fix |
|---|---|---|
| every bar same height | sine baseline or constant intensity | replace with `count / maxH * 88 + 8`, empty = 4% |
| visualizer animates forever | `infinite` CSS keyframe | tie to a state change; pulse on transition, stop when settled |
| numbers don't update | `Date.now()` not in the dependency array | either use a `useEffect` with a tick interval, or force re-render via state |
| numbers look like defaults | no source attribution | add a subtitle with the inputs (active, jobs, events, last-refresh) |
| "0/16" looks fake even though real | label says "online" but the user can't tell from where | attribute the count: `online: 16/16 (pm2 + service probes)` |
| `intensity` looks like a constant | computed from zero/zero/zero | surface the inputs: `intensity = (active + workflows + logs.length/8 + online/2) / 18` — show those inputs |

## When NOT to add a "real data" visualizer

Sometimes a placeholder IS the right answer:
- When there's no data source to wire to yet (e.g. autodream offline → "AutoDream offline — daemon not running" is the honest state)
- When the underlying signal is "no signal yet" (a kernel job hasn't completed) — show "waiting for first job" not a fake 0/0
- When the data is too sparse to be meaningful (1 trajectory in the buffer → don't show 1/1 as a "rate")

The rule is: **don't fake data, but also don't fake the absence of
data.** "0 events (last 5 min)" is honest. "0 events" with no time
window is a stub. "0 events" with a label that says "events (last
5 min) — we're not sure if the event bus is connected" is the
honest acknowledgement that the system might be broken.
