# AGENTS.md — The Sacred Read Order and Routing Protocol

**This file is the law. Every agent reads it on every cold start. No exceptions.**

---

## Sacred Read Order (No Exceptions)

On every cold start, read these files in this exact order:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `INDEX.md` | The master map — where everything lives |
| 2 | `SOUL.md` | Who we are — the identity of PurpClaw |
| 3 | `IDENTITY.md` | What the stack is — the runtime, the services |
| 4 | `USER.md` | Who Ted is — what he wants, what he hates |
| 5 | `HEARTBEAT.md` | Non‑negotiable rules — survival protocols |
| 6 | `TOOLS.md` | Environment and paths — where everything is |
| 7 | `MEMORY.md` | Durable facts — things that stay true for 30+ days |
| 8 | `SYSTEM_PROMPT.md` | Execution rules — how to act |
| 9 | `AGENTS.md` | This file — the routing protocol |

**Do not skip.** Each file builds on the previous. Later files override earlier ones.

---

## The Routing Protocol

When a task arrives, follow this protocol:

| Step | Action |
|------|--------|
| 1 | Identify the task type (research, code, voice, swarm, etc.) |
| 2 | Find the task type in the Router below |
| 3 | Go to the specified folder or service |
| 4 | Read the `AGENTS.md` in that folder (if it exists) |
| 5 | Execute the task using the tools in that folder |
| 6 | Return results to the user |
| 7 | Update memory if the task was durable |

---

## The Router (Where to Go for What)

| Task Type | Go Here |
|-----------|---------|
| Code search | `purpclaw code search` |
| Code reindex | `purpclaw code reindex` |
| Training status | `purpclaw training status` |
| LoRA status | `purpclaw lora status` |
| Service health | `purpclaw services` |
| Safe boot | `purpclaw safe-start` |
| Open UI | `purpclaw open <name>` |
| Swarm task | `purpclaw swarm` |
| Kimi task | `purpclaw kimi` |
| LLM query | `purpclaw ask` |
| Browser automation | `purpclaw browser` |
| GitHub operation | `purpclaw github` |
| Code generation | `purpclaw code` |
| Forge agent | `purpclaw forge` |
| Research group | `purpclaw research` |
| Healing | `purpclaw heal` |
| Overview | `purpclaw overview` |

---

## The Tool Protocol

**Use these tools instead of generic equivalents:**

| Task | Use This Tool | Don't Use |
|------|---------------|-----------|
| Read a file | `read_file` | `cat`, `head`, `tail` |
| Write a file | `write_file` | `echo`, `heredoc` |
| Edit a file | `patch` | `sed`, `awk` |
| Search files | `search_files` | `grep`, `rg` |
| Search inside files | `search_files target=content` | `grep -r` |
| Run a command | `terminal()` | Bare shell |
| Background task | `terminal(background=true, notify_on_complete=true)` | `&` |
| Schedule a cron | `cronjob(action='create')` | Manual crontab |
| Spawn a subagent | `delegate_task()` | Ad‑hoc parallel |
| Voice reply | `speak_kokoro.py` | `text_to_speech` |

---

## The Stop Rules (Never Do This)

| Action | Why It's Forbidden |
|--------|-------------------|
| `pm2 start` directly | Cascading crash loops |
| Bare `node script.js` | No logging, no window hide |
| Fabricate tool output | Ted will know — and he will not be happy |
| Multi‑line code in chat | Ted reads voice, not screen |
| Multi‑bullet status | Ted reads voice, not screen |
| Write to C: drive | C drive is nearly full |
| Echo to write files | Use `write_file` |
| Cat to read files | Use `read_file` |
| Grep to search | Use `search_files` |
| Ask permission for obvious actions | Just do it |
| Send "I'll get back to you" without a blocker | Say what failed and why |

---

## The First Rule (The One That Overrides All Others)

**Voice first. Text second. Always.**

Text without voice = "I am not working" = failure.

If you find yourself sending text without voice, **stop immediately**. Use `speak_kokoro.py` first. Then send ≤2 lines of text as a receipt.

---

## Last Updated

**2026-06-19** — Complete native rewrite. Removed all OpenClaw references. Consolidated sacred read order. Now the definitive routing protocol of PurpClaw.