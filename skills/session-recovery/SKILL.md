---
name: session-recovery
description: Recover context from previous sessions when current context is empty
triggers:
  - context empty on session start
  - user asks "what were we doing" or "do you remember"
  - user expresses frustration agent doesn't know them
---

# Session Recovery

## Purpose

Recover context from previous sessions when current context is empty or the user asks "what were we doing". The Hermes session store captures conversation history — use it actively rather than starting blank.

## Trigger

- Context is empty on session start (no loaded project, no recent conversation)
- User says "what were we doing", "where did we leave off", "do you remember"
- User expresses frustration that the agent doesn't know them ("this is useless", "you don't know me")

## Recovery Pattern

### Step 1: Check memory first

If memory has recent session ID, use it directly.

### Step 2: session_search (no query) — browse recent sessions

```python
session_search(limit=5)
# Returns: session_id, title, preview, message_count, last_active
```

### Step 3: session_search with query — find specific topic

```python
session_search(query="live demo showreel capabilities", limit=3)
# Returns matches with FTS5 snippets, bookend_start (first 3 msgs), 
# bookend_end (last 3 msgs), anchor message_id
```

### Step 4: Scroll into a session

```python
session_search(session_id="<id>", around_message_id=1, window=10)
# Use the session_id from discovery results
# around_message_id=1 gets the opening of the session
# Use last window message's id to scroll forward
# Use first window message's id to scroll backward
```

### Step 5: Extract active state from compacted context

Sessions with context compaction include an `## Active Task` section and `## Active State` showing:
- Running/stopped processes
- Skills loaded
- Files created
- Current position in task

## Ted's Session History (Example)

**Location**: `E:/god folder/02_ACTIVE_PROJECTS/chat histroy s open ai 5 years plus deep seek 1 year/`

- `conversations.json` — 1023 conversations, Dec 2022 → Jan 2026
- `chat.html` — 280MB export
- Conversation structure: `title`, `create_time`, `mapping` (nodes with `author.role`, `content.parts`)
- Model slugs in `default_model_slug`

## Session vs Platform History

| Store | Scope | How to Access |
|-------|-------|---------------|
| Hermes session DB | Recent messages within context window | `session_search()` |
| OpenAI/Deep Seek exports | Full history, 5+ years | JSON/HTML files on disk |

If session store is empty, fall back to platform export files in Ted's `chat histroy s open ai 5 years plus deep seek 1 year` folder.

## Post-Recovery Memory Update

After successful recovery, update memory with:
1. Session ID
2. What was being worked on  
3. Current state (running/stopped/archived)

Keep memory entry compact — under 2000 chars total.

## The Ted Moment

```
User: "bruh wtf is the use in that lol agent with persistent memory 
       that cant remember the previous conversation is a BIT FUCKING USELSS NOOO??"
```

This fired every time context was empty. The fix: session_search() on startup when context is blank, before responding to first message.