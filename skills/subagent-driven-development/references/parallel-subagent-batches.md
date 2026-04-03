# Parallel Subagent Batches — THE BEAST Session Learnings

## Session: May 16 2026, E:/BEAST_MARKET_UNIFIED

### What We Executed

**Batch 1 (Performance):** 3 subagents in parallel, each touching different files:
- Subagent 1: next.config.ts → added `optimizePackageImports`, `modularizeImports.lucideReact`, stripped `output: 'standalone'`
- Subagent 2: app/page.tsx → removed `motion/react`, lazy-loaded VoiceControl via `dynamic()`, replaced motion.div with CSS animations
- Subagent 3: app/campaign/[id]/page.tsx → lazy-loaded all 7 tabs via `dynamic()`

**Batch 2 (API Wiring):** 3 subagents in parallel:
- Subagent 1: StrategyTab.tsx → removed Firebase refs, wired to openrouter.ts chat()
- Subagent 2: ResearchTab.tsx → removed Firebase refs, wired to openrouter.ts chat()
- Subagent 3: ContentTab + QuickCopyTab → wired to generateImage + OpenRouter + MiniMax TTS

### The "Re-Read Before Edit" Rule (CRITICAL)

After a parallel batch completes, the parent session's file cache is STALE. Every subagent summary includes this message:

```
[NOTE: subagent modified files the parent previously read — re-read before editing: E:\BEAST_MARKET_UNIFIED\app\page.tsx]
```

**Rule:** Before making ANY additional edits to files that were touched by subagents, re-read them first. The parent session's view of those files is stale and will cause wrong patches.

### How to Track Sessions

Use `process()` tool to track each background subagent:
```typescript
// After dispatching parallel batch:
session_id_1 = delegate_task(tasks=[...])  // returns array of session_ids
// Poll each:
process(action='poll', session_id=session_id_1[0])  // check status
process(action='poll', session_id=session_id_1[1])
process(action='poll', session_id=session_id_1[2])
// When all done: re-read touched files, then proceed
```

### The Windows `--no-turbo` Flag

When a subagent starts the Next.js dev server, it MUST use `--no-turbo`:
```bash
# This hangs on this Windows host (port 3000 opens but requests never respond):
npm run dev

# This works:
node_modules/.bin/next dev --no-turbo
```

Root cause: Next.js 15 turbo mode (Rust-based file watcher + bundler) has a bug on this Windows machine. The legacy webpack dev server works perfectly.

### Subagent Context Strategy

Each subagent in a batch has ZERO awareness of the others. Provide everything in context:

```typescript
// WRONG — subagent has to discover context
goal: "Fix performance issues"

// RIGHT — subagent gets full context
goal: "Fix next.config.ts performance for E:/BEAST_MARKET_UNIFIED"
context: """
Files at E:/BEAST_MARKET_UNIFIED:
- next.config.ts (current: 98 lines, has complex webpack config)
- app/page.tsx (324 lines, imports motion/react, has VoiceControl)
- app/campaign/[id]/page.tsx (164 lines, all 7 tabs statically imported)

Goal: reduce page load from 6+ seconds to under 2 seconds.
Known issues:
- motion/react imported but may not be actively used → remove
- VoiceControl has setInterval polling that blocks hydration → lazy-load with dynamic({ ssr: false })
- All 7 tabs statically imported → use dynamic() for code splitting
- next.config.ts has output: 'standalone' and complex webpack splitChunks → remove both

Current next.config.ts path: E:/BEAST_MARKET_UNIFIED/next.config.ts
"""
```

### Verification Pattern

After each batch, verify outputs with targeted checks:
```typescript
// Check the dev server responds
curl --max-time 5 http://localhost:3000/  // should return HTML with "THE BEAST"

// Check API key route works  
curl --max-time 5 http://localhost:3000/api/key  // should return JSON with openrouter key

// Check a tab loads
curl --max-time 5 http://localhost:3000/settings  // should return HTML
```

### Cost vs Speed Tradeoff

Parallel subagent batches:
- 3 parallel subagents × 5 minutes = ~5 minutes wall time (vs ~15 minutes sequential)
- BUT: requires more careful context setting upfront
- AND: parent must verify outputs and re-read files between batches
- Net savings: ~60-70% on large multi-file tasks

Use for: large refactors, multi-file API wiring, performance fixes, anything that can be cleanly partitioned.

Don't use for: tasks that share state or files (merge conflicts will bite you).