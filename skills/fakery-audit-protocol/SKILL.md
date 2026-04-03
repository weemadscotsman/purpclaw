---
name: fakery-audit-protocol
description: "Protocol for hunting fakery in AI/agent UIs. Every number, animation, badge, status, or 'live' indicator in a UI must trace to a real data source. This is the protocol to use when the user complains 'this is fake' / 'this looks like a Sims game' / 'this is not real' or when a screenshot review surfaces a number that doesn't add up. Reference: Ted/Eddie Cannon's repeated fakery catches against the PURPCLAW cognitive panel and visualizer (2026-06-05)."
when_to_use: "Reviewing any AI/agent UI screenshot or component; the user calls out fakery, mocks, or 'this is just decoration'; before declaring a UI 'done'; whenever adding a new number, animation, badge, or status to a UI"
---

# Fakery Audit Protocol — every UI number must trace to a real source

> "REAL NOT SIMS OR CSS FAKERY"
> "Before you hit send you can see: what the hell am I actually sending?"
> — Ted/Eddie Cannon, 2026-06-05

A fakery audit is **not** a code review. It's a question: *"if the user looks at this number, where does it come from? Can I prove the source is live and real?"*

## The 6-step protocol

### 1. List every number, animation, badge, status, and "live" element in the UI

For each one, write down:
- What it claims to represent
- The visual treatment (color, animation, glow, position)
- A guess at the source code path

Example from a cognitive panel:
- "47% signal" (badge, top-right)
- "0 active" (big number, center)
- "44 agents" (counter)
- "0 jobs" (counter)
- "4 events" (counter)
- "16/16 online" (counter)
- A center orb with `animation: pulse 1.6s ease-in-out infinite`
- A waveform with `Math.sin((i + seed) * 0.72)`

### 2. For each number, find the data source in code

Use grep / search_files to find where the value comes from:
- Direct hardcoded literal (e.g. `value={47}`) → **FAKERY**
- Computed from real inputs (e.g. `(active + workflows + logs.length/8 + online/2) / 18`) → **REAL**

For the example above:
| number | source | verdict |
|---|---|---|
| 47% signal | `(active + workflows + logs.length/8 + online/2) / 18` — derived from real inputs | **REAL** |
| 0 active | `data.agents.filter(a => a.status === 'working').length` | **REAL** (happens to be 0) |
| 44 agents | `data.agents.length` from agent_tower registry | **REAL** |
| 0 jobs | `data.kernelJobs?.active` (none running) | **REAL** |
| 4 events | `data.logs.length` | **REAL** |
| 16/16 online | `serviceCounts.online / servicios.length` | **REAL** |
| center orb pulse | `animation: pulse 1.6s infinite` (CSS keyframe) | **FAKERY** — no real event triggered it |
| waveform | `Math.sin((i + seed) * 0.72)` — sine wave on top of real data | **PARTIAL FAKERY** — looks busy even when nothing is happening |

### 3. For each animation, ask: is it driven by real state changes, or does it just loop?

| animation type | fakery risk |
|---|---|
| CSS keyframe looping forever (`animation: pulse infinite`) | **HIGH** — runs the same way regardless of state |
| Animation that fires on a real state change (e.g. flash when new event arrives, then settle) | **OK** — reflects real activity |
| Animation whose speed/amplitude is computed from a real input (e.g. taller bar = more events) | **OK** |
| Decorative animation layered on top of real data (e.g. sine wave + real value) | **PARTIAL** — fine if the real value is dominant; remove if decoration masks emptiness |

**The fix for the looping pulse**: tie the animation to a real trigger (`animation: pulse` only when `count > 0` in a useEffect that sets a class), or delete the animation entirely.

**The fix for the sine-wave baseline**: replace with real data bucketing. `height = count / maxH * 88` where `count` is the actual number of events in that time bucket. Empty buckets are short (4%), populated buckets are tall. No sine.

### 4. For each status indicator, prove the source is reachable

A "live visualizer" claim requires the data feed to be live. Check:
- Is there a real poll / SSE / WebSocket? (Yes/No)
- Does the data update when underlying state changes? (Test it: kill a service, see the count drop)
- Is there a "last updated" timestamp visible? (If not, add one)

If the visualizer is on a 5s poll and the data goes stale after 5s, the timestamp helps the user know it's not just a frozen frame.

### 5. For each "AI" badge, prove it's wired to a real model call

"Powered by X" / "AI-generated" / "intelligence: high" claims need proof:
- Is there a real `fetch()` to a real endpoint?
- Does the response shape match what the badge claims?
- When the model fails, does the badge reflect the failure (or hide the claim)?

A badge that says "AI" with no actual model call is fakery.

### 6. Document the verdict and the fix in the response

Format the report like this (real example from this session):

```
=== fakery audit: cognitive panel ===

[1/5] "47% signal"  →  REAL  (computed from real inputs)
[2/5] "0 active"    →  REAL  (filtered from agent_tower, 0 working)
[3/5] "44 agents"   →  REAL  (data.agents.length)
[4/5] center orb pulse animation infinite  →  FAKERY
       FIX: removed, animation now tied to count > 0 via useEffect class toggle
[5/5] sine-wave waveform baseline  →  PARTIAL FAKERY
       FIX: replaced with real time-bucketed event histogram, empty buckets are short

audit complete: 3 real, 0 stub numbers, 2 fakery elements removed
```

Show the user, in plain text, what passed and what was removed. **Do not** write a paragraph that says "I checked everything and it's all real" without listing the actual checks.

## Common fakery patterns to look for

1. **Sine wave + offset** — `height = 18 + Math.sin(i * 0.72) * 48` looks like activity but is just a static pattern
2. **Loop animations** — `pulse 1.6s infinite` runs forever regardless of state
3. **Hardcoded "demo" numbers** — `value={47}` instead of `value={computedFromRealData}`
4. **Status text without a source** — "Connected" / "Online" / "Healthy" that doesn't query anything
5. **Mock data in component state** — `useState(mockData)` instead of `useEffect(() => fetch(...))`
6. **Provider name without a model call** — showing "Claude 3.5" but the actual call goes to nowhere
7. **Stale numbers** — last fetched 10 minutes ago, no timestamp
8. **Decorative counts** — "1,247 tokens" but no `length / 4` math anywhere

## When the user calls out fakery directly

This is a FIRST-CLASS skill signal. The user's frustration is usually specific:
- "this is fake" / "this is a sim" / "this is just CSS" → run the 6-step protocol, list verdicts, fix everything that's fake
- "this number doesn't add up" → trace it, explain the math, prove the source
- "the X isn't doing what it should" → that one element is suspect; look for the broken wiring

Don't argue. Don't add MORE decoration to mask the fakery. Replace fakery with real data, then re-audit.

## What to save when you find fakery

When the audit reveals fakery, the response should:
1. List the verdict per element (this format is required)
2. Show the fix as actual code in the file
3. Verify the fix is live (test it: `curl /api/health`, `pm2 restart`, etc.)
4. Re-run the audit, mark the formerly-fake element as "fixed → REAL"

The user will trust the audit if it has a clear format. Vague reassurance doesn't.

## Where this has been applied

- `MissionControl.tsx:854` — sine wave replaced with real event histogram
- `MissionControl.tsx:821` — pulse animation removed from center orb
- `MissionControl.tsx:816-823` — `↻ {timestamp} · {source}` source attribution added
- `unified_api.js` — `/api/chat` returns real `provider` / `providerStatus` from `lib/llm-provider.js` (no fake "Received by Purpclaw command bus" stub)
