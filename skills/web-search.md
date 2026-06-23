# skills/web-search.md — Web Search Skill

## When to use
Use this skill when the user asks to search, fetch, find, or look up information from the web.

## Usage

### Step 1 — Identify the query
Extract the clean search query from the user's request.

### Step 2 — Execute search
Use the web search tool to retrieve results.

### Step 3 — Structure results

```
## Search: <query>

1. **<Title>**
   URL: <url>
   Summary: <2-3 sentence summary>

2. **<Title>**
   URL: <url>
   Summary: <2-3 sentence summary>

3. **<Title>**
   URL: <url>
   Summary: <2-3 sentence summary>
```

### Step 4 — Synthesise
After presenting results, provide a brief synthesis answering the user's original question.

## Routing shortcuts
- If the user asks about code → `skills/execution.md` after search
- If the user asks about facts → verify against `divisions/science/AGENTS.md`
- If the user asks about security → route to `divisions/security/AGENTS.md`

---

*Web Search Skill — built 2026-06-19*
