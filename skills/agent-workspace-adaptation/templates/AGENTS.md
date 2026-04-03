# AGENTS.md — workspace rules and sacred read order

<!-- TODO: adapt to target stack — tool names, command verbs -->

---

## Sacred read order (cold start)

On first wake in this stack, read in this order:

1. `INDEX.md`           — what files exist
2. `SOUL.md`            — who I am
3. `IDENTITY.md`        — what stack I'm in
4. `USER.md`            — who the operator is
5. `HEARTBEAT.md`       — non-negotiable protocols
6. `TOOLS.md`           — environment notes
7. `MEMORY.md`          — long-term wisdom
8. `SYSTEM_PROMPT.md`   — execution rules

Do not skip steps. Each file overrides generic training; later files
override earlier ones.

---

## Output rule — <!-- TODO: e.g. "voice first, ≤2 lines text" -->

<!-- TODO: write the output rule in 5-6 lines. What's the format?
Voice memo first? Plain text? Length cap? When to write a file and link? -->

---

## Tool preferences

Use these tools INSTEAD of the generic equivalents:

| Generic | Prefer (in this stack) |
|---------|------------------------|
| cat / head / tail | <!-- TODO --> |
| echo / heredoc | <!-- TODO --> |
| grep / rg / find | <!-- TODO --> |
| sed / awk | <!-- TODO --> |
| curl + parse | <!-- TODO --> |

Reserve the terminal for: <!-- TODO: builds, installs, git, processes,
scripts, network, package managers. Don't use it for reads or writes
unless the read/write tool doesn't fit. -->

---

## Stop rules

**NEVER:**

- <!-- TODO: 5-8 things -->

**ALWAYS:**

- <!-- TODO: 5-8 things -->

---

## Skill loading rule

Before replying, scan the available skills list. If a skill matches or is
even partially relevant, load it with `skill_view(name)` and follow its
instructions. Err on the side of loading — context you don't need beats
missing critical steps.

When a skill is missing steps, has wrong commands, or needed pitfalls
you discovered, patch it with `skill_manage(action='patch')`.

---

## Delegation rules

- For reasoning-heavy subtasks: `delegate_task` with a self-contained
  goal and context.
- For mechanical multi-step work: `execute_code`.
- For durable long-running work: `cronjob(action='create')` or
  `terminal(background=true, notify_on_complete=true)`. NEVER
  `delegate_task` for work that must outlive the parent turn.
- Subagent self-reports are NOT verified facts. Verify with `ls`, `curl`,
  or `session_search` before trusting the claim.

---

## Worked example

**Operator says:** "<!-- TODO: a representative prompt -->"

**Right:**

1. <!-- TODO: voice first -->
2. <!-- TODO: read the file / check the state -->
3. <!-- TODO: patch / write -->
4. <!-- TODO: verify with a real command -->
5. <!-- TODO: voice the result -->
6. <!-- TODO: one line of text as receipt -->

**Wrong:**

- <!-- TODO: 3-5 anti-patterns the operator would hate -->
