# Companion Reactor Pattern

The Mochi face + auto-scrolling chat pattern from `app/components/CommandPanel.tsx`. Two techniques that together turn a "chat panel" into a "live command surface with a buddy character that reacts to what you're doing."

## 1. Auto-scroll the chat container reliably

`scrollIntoView` on a child element is **unreliable** inside a flex+overflow container — the child scrolls, but the parent doesn't always follow. The fix is to scroll the parent directly:

```tsx
// BAD — looks like it should work, doesn't always
<div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
  {messages.map(...)}
  <div ref={bottomRef} />
</div>
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);

// GOOD — scrolls the container, not the child
useEffect(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (distFromBottom < 120) {           // only if user is near the bottom
    el.scrollTop = el.scrollHeight;       // works in every flex/overflow case
  }
}, [messages, busy]);
```

**The threshold matters.** If you auto-scroll whenever `messages` changes, you'll yank the viewport when the user is reading history 200 lines up. The 120px threshold (any user with their viewport near the bottom) keeps the read-state intact.

**Use `'auto'` not `'smooth'`.** Smooth-scrolls queue up behind each other when messages stream in fast. By the time the user sees scroll 5, they've already missed 4, 3, 2, 1. The `'auto'` (instant) scroll is invisible because the next message is already rendered by the time the previous scroll completes.

**The "Jump to latest" pill.** When the user has scrolled up more than ~240px, show a sticky-bottom pill that snaps them back. This is what Twitter / Discord / Slack all do, and it solves the "where did the new message go?" problem:

```tsx
const [showJumpToLatest, setShowJumpToLatest] = useState(false);
useEffect(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const onScroll = () => {
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpToLatest(dist > 240);
  };
  el.addEventListener('scroll', onScroll, { passive: true });
  return () => el.removeEventListener('scroll', onScroll);
}, []);

{showJumpToLatest && (
  <button onClick={() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })}
    className="sticky bottom-3 left-1/2 -translate-x-1/2 ...">
    ↓ Jump to latest
  </button>
)}
```

The 240px threshold is bigger than the auto-scroll 120px threshold — the user has to scroll *up* a fair amount before the pill appears, and the pill stays out of the way when the user is in the natural reading position.

## 2. Companion as live reactor (Mochi)

The companion character (Mochi in PURPCLAW — could be any "buddy" character in a different stack) should react to **what the user is doing** in real time, not pull random faces on a timer.

### The face rule: no random animation

```tsx
// BAD — random face animation fights the mood-based face
useEffect(() => {
  const t = setInterval(() => {
    setBlink(b => !b);
    setFace(f => f.includes('-') ? '<✦~✦>' :
      (Math.random() > 0.85 ? '<-~->' : '<✦~✦>'));   // ← random override
  }, 1100);
}, []);

// GOOD — only the blink animates; the face is mood-driven
useEffect(() => {
  const t = setInterval(() => setBlink(b => !b), 1100);
  // Face comes from: displayFace = renderMissionMochiFace(mochi, mochiMood, frame, blink, action)
}, []);
```

A `setInterval` that swaps faces every 1.1s makes the companion look like it's glitching. The mood-based face (driven by `renderMissionMochiFace`) is the *right* face. Only animate the blink.

### The narration rule: callback ref from child to parent

The companion is usually a *child* component (sidebar, fixed corner, etc.). The parent is the one that knows when the user clicks Send, when the LLM answers, when a job fails. To make the child react, expose the child's `push` function to the parent:

```tsx
// Child: MochiNarrator in the sidebar
function MochiNarrator({ data, onNarratorReady }) {
  const push = useCallback((text, mood) => {
    setLines(prev => [newLine, ...prev].slice(0, 12));
    setMood(mood);   // ← this triggers the face re-render
  }, []);

  useEffect(() => {
    if (onNarratorReady) onNarratorReady(push);
  }, [onNarratorReady, push]);

  // ... rest of the narrator
}

// Parent: CommandPanel with the chat composer
const mochiReactRef = useRef(null);
const mochiReact = (text, mood) => {
  if (mochiReactRef.current) mochiReactRef.current(text, mood);
};

return (
  <div className="flex h-full">
    <aside>
      <MochiNarrator data={data} onNarratorReady={(fn) => { mochiReactRef.current = fn; }} />
    </aside>
    <div className="chat-composer">...</div>
  </div>
);
```

Now the parent can call `mochiReact('kernel job incoming', 'curious')` at any lifecycle point. The child's `setMood` re-renders the face immediately.

### Fire from three lifecycle points

```tsx
const send = async () => {
  // ...

  // 1. On Send — route-specific reaction
  const routeMoods: Record<Route, [string, Mood]> = {
    chat:       ['ok, going!',                                            'happy'],
    kernel:     ['kernel job incoming. swarm is on it.',                  'curious'],
    groupchat:  [`asking ${selectedModels.length} models to weigh in...`, 'curious'],
    research:   ['deep research — sources first, then models. hang tight.', 'curious'],
    swarm:      ['swarming. decomposing your goal into subtasks...',       'curious'],
    mission:    ['mission accepted. orchestrator is planning...',         'proud'],
  };
  const [reactText, reactMood] = routeMoods[route] || routeMoods.chat;
  mochiReact(reactText, reactMood);
  const t0 = Date.now();

  try {
    const res = await fetch(...);
    const json = await res.json();

    // 2. On response — status-aware
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const providerStatus = String(json.providerStatus || '').toLowerCase();
    if (providerStatus.includes('fail') || providerStatus === 'no-key') {
      mochiReact(`${r.label} didn't reach a provider (${elapsed}s) — check the LLM key.`, 'alert');
    } else if (providerStatus === 'answered') {
      const word = (content || '').trim().split(/\s+/).length;
      mochiReact(`${r.label} done in ${elapsed}s — ${word} words.`, 'proud');
    } else {
      mochiReact(`${r.label} came back in ${elapsed}s.`, 'chill');
    }
  } catch (e) {
    // 3. On exception — alert
    mochiReact(`${r.label} failed after ${elapsed}s — ${e.message?.slice(0, 60) || 'connection error'}.`, 'alert');
  }
};
```

The user hits Send, sees `(·ω·)` thinking, then `(✦‿✦)` proud 1.2s later with "chat done in 1.2s — 47 words." That reaction is **contextual** — the duration, the word count, the provider status all feed into it. It's a buddy reporting back, not a notification.

### The auto-narration stays

The MochiNarrator's existing watchers (data.logs, data.kernelJobs) still fire for **system events** that the parent doesn't know about — kernel jobs auto-completing, agent spawns, etc. The parent-direct reactions cover **user actions** (Send, response received). Both paths feed the same `push` function. Together they make the companion feel aware of everything happening on the surface.

## Pitfalls

- **Don't let the random face animation fight the mood face.** One source of truth: the mood. Only the blink animates. The companion should look like it's *reacting*, not *animating*.
- **Don't use `behavior: 'smooth'` on streaming messages.** Smooth-scrolls queue up. Use `'auto'` (instant). The user can't tell the difference because the next message is already rendered.
- **Don't auto-scroll when the user is reading history.** The 120px threshold keeps the viewport pinned only when the user is already at the bottom.
- **Don't fire the same narration twice for the same event.** The narrator's `seenEvents` ref and `seenJobStates` ref track what's been narrated. The parent-direct `mochiReact()` calls don't share that state — make sure they don't double-narrate the same lifecycle event.
- **Don't put the pill inside the scrolling container.** If the pill is a child of the scrollable div, it scrolls with the content. Use `position: sticky` on the pill so it stays anchored to the bottom of the visible viewport regardless of scroll position.

## What "alive" looks like

- User hits Send in chat → Mochi shows `(·ω·)` thinking with "ok, going!"
- LLM answers in 1.2s → Mochi shows `(✦‿✦)` proud with "chat done in 1.2s — 47 words."
- User switches to Group Chat, picks 5 models, sends → Mochi shows `('ω')` curious with "asking 5 models to weigh in..."
- 2 models answer, 3 hit 429 → Mochi shows `(°△°)` worried with "group chat — 2/5 answered, 3 rate-limited"
- A kernel job fails in the background → Mochi's `data.kernelJobs` watcher fires "job failed. check the kernel jobs panel. not pleased." with `(°△°)` worried

That's the difference between a slot machine and a buddy. The face is never random. It's always reacting to something real that just happened.
