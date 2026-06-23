# skills/routing.md — Routing Skill

## When to use
Use this skill when you need to determine the correct division, agent, or skill for a task.

## How to route

### Step 1 — Extract intent
Parse the user's request for keywords. Strip filler words.

```
"can you search the web for recent news about AI agents"
  → intent: search web
  → keywords: search, web, news
```

### Step 2 — Match to division
Check `Router.md` for the keyword match. Primary keyword wins.

### Step 3 — Pick agent
Read the division's `AGENTS.md`. Match task type to agent role.

### Step 4 — Execute
Use the agent's skill file. Default to `skills/execution.md`.

### Step 5 — Handoff
Write `divisions/<div>/memory/handoff-<div>.md`.

## Routing shortcuts

| Shortcut | Expands to |
|---|---|
| `//div <div> <task>` | Switch to division, execute task |
| `//pickup` | Read pickup file for current division |
| `//handoff` | Write handoff file for current division |
| `//route <intent>` | Run routing algorithm on intent |

## Fallback
If no match: default to **INTELLIGENCE** and report uncertainty.

---

*Routing Skill — built 2026-06-19*
