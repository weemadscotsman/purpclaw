---
name: agent-workspace-adaptation
description: |
  Adapt an existing agent identity workspace (a set of system files like
  SOUL.md, IDENTITY.md, USER.md, HEARTBEAT.md, TOOLS.md, MEMORY.md, AGENTS.md,
  INDEX.md, SYSTEM_PROMPT.md, BOOT.md, BOOTSTRAP.md, SKILL_SUMMARY.md) to a
  new runtime stack. Use when you have a working agent identity in one
  codebase and need to produce the equivalent identity for a different stack
  (different runtime, different services, different persona, different
  voice, different memory scope, different skill inventory). Output is the
  full set of adapted markdown files written to the target workspace.
purpclaw_active: false
legacy_only: true
---

# Agent Workspace Adaptation

Legacy/reference-only workspace adaptation material. This skill is quarantined from PURPCLAW native skill registration and must not define PURPCLAW runtime identity.

**The class of work:** you have a working agent identity in stack A (e.g. an
OpenClaw-style workspace with `SOUL.md`/`IDENTITY.md`/etc, persona-driven,
voice-mandatory). You need to produce the same identity shape for stack B
(e.g. PURPCLAW — different runtime, different services, different voice, a
more operator-shaped persona). Goal: the agent's behavior, voice protocol,
memory rules, and read order all carry over, but every reference to stack
A's specifics is rewritten to stack B's.

**Trigger on:** "adapt this workspace to my stack", "port these system
files to X", "rewrite SOUL.md / IDENTITY.md for my runtime", "make these
docs fit my operator's voice", "I have OpenClaw / Socket / Set / X-style
identity files, give me equivalent for Y".

**Trigger NOT on:** writing a brand-new identity from scratch (use
`writing-plans` first to draft the persona, then come back here for the file
shape). Or on a one-off doc edit (just `patch` it).

---

## Read order on the source workspace

Before adapting, read these in order. Each file overrides the generic
training; later files override earlier ones.

1. `INDEX.md` — what files exist, what the workspace looks like
2. `SOUL.md` — persona, voice, vibe, the agent's "self"
3. `IDENTITY.md` — name, role, stack boundaries
4. `USER.md` — who the operator is, what they care about
5. `HEARTBEAT.md` — non-negotiable protocols (often voice-related)
6. `TOOLS.md` — environment-specific notes, paths, scripts
7. `MEMORY.md` — durable facts only (no PR numbers, no session narratives)
8. `AGENTS.md` — workspace rules, sacred read order, tool preferences
9. `SYSTEM_PROMPT.md` — execution rules, voice protocol
10. `BOOT.md` — first-boot checklist
11. `BOOTSTRAP.md` — birth certificate / tone-setter (read once, then history)
12. `SKILL_SUMMARY.md` — skill inventory (active vs out-of-scope)

The first three give you the persona. The next three give you the stack.
The last three give you the operating rules.

---

## The adaptation map (what carries, what translates, what drops)

For each source file, decide:

- **Carries verbatim or near-verbatim** — the structure and core rules
  (e.g. INDEX.md's read-order pattern, HEARTBEAT.md's "verify before
  claiming" rule). The voice and persona cues stay; the persona
  itself changes.
- **Translates** — the file is real, but every specific reference is
  rewritten. E.g. `TOOLS.md` for a different stack still lists paths and
  service ports, but the ports/paths themselves change. `USER.md` keeps
  the structure (Name, Stack Preferences, What Annoys) but the operator
  name, stack name, and annoyances change.
- **Drops** — entirely out of scope for the new stack. Examples below.

The adaptation **must** include a per-file "what was carried / translated /
dropped" audit. Document it either in INDEX.md (as a "Adaptation Map"
section) or in a dedicated `references/migration.md`.

---

## File-by-file guidance (12 files)

Each of these exists in `templates/` as a starter you can copy and modify.
The starter is the **shape**; the body is rewritten for the target stack.

### INDEX.md
- Adaptation map at the top (which file adapted, which didn't, what was
  purged and why)
- "When to update which file" section (which fact goes where)
- Last-updated line

### SOUL.md
- Identity block (name, role, stack, birthday, vibe, emoji, voice)
- Core Truths — 4-6 maxims. Carries the *idea* (verify self-reports, no
  performative helpfulness, be resourceful before asking, earn trust
  through competence) but rewrite the *examples* for the new stack.
- Vibe — short paragraph
- Voice Protocol — concrete paths and commands for the new stack
- Continuity — read these files to persist; update MEMORY/HEARTBEAT when
  facts change
- Stack Boundaries — what's in scope, what's out of scope
- When Things Break — the 4-5 step rule (acknowledge, read, patch, verify,
  update memory)

### IDENTITY.md
- Name + meaning (acrostic or wordplay, but only if it actually helps)
- Stack at a glance (table or ASCII diagram showing services)
- Physical/runtime facts (host, shell, paths)
- Out of scope — what this agent is NOT. Be explicit so the persona
  doesn't drift into another agent's territory.

### USER.md
- Name + location + workspace path
- Context (who they are, what they do, what makes them this person)
- What they care about (priorities 1-N, with the most important at the top)
- Stack preferences (Always / Never lists — the durable workflow rules)
- Active projects (in this stack only)
- What annoys / what they love (this is where persona lives)

### AGENTS.md
- Sacred read order
- Output rule (voice first, ≤N lines, file+path for long answers)
- Tool preferences table (use Hermes tool X, not generic Y)
- Stop rules (NEVER / ALWAYS lists)
- Skill loading rule
- Delegation rules
- Worked example (good vs wrong)

### HEARTBEAT.md
- The non-negotiable protocols. Each is one section with NEVER / ALWAYS
  / "Symptom of violation" / "If violated, fix it by…" — so the agent
  has a built-in checklist when it catches itself slipping.
- Maintenance section: "this file is reviewed when X happens"
- Last-updated line

### TOOLS.md
- System overview table (OS, shell, paths, Python versions, voice, etc.)
- Stack at a glance (paths)
- Voice & audio section (scripts, models, playback, STT, etc.)
- Service map (port → purpose, the full list)
- CLI quick reference (the verbs the operator actually uses)
- "Out of scope" section (what other agents/systems own)

### MEMORY.md
- Critical systems (do not break) — with the failure mode called out
- Environment quirks (stable, durable facts only)
- Stack: <NAME> (the runtime inventory)
- Service restart cycle (which services die silently at night)
- File paths to remember
- Voice protocol (the rule that ends conversations)
- User preferences (durable, won't change)
- Active projects (in this stack)
- "Recently fixed" — a short list of "before you re-investigate, check
  this was already done." Delete items older than 30 days.

### SYSTEM_PROMPT.md
- Voice protocol (NO EXCEPTIONS)
- The process (input → work → voice → text)
- What NOT to do (anti-patterns)
- What TO do (tool preferences)
- Quick reference table (task → command)

### BOOT.md
- Cold start sequence (numbered steps with exact commands)
- If something is wrong on first boot (per failure mode)
- Things that will NOT be on this box (and that's OK)

### BOOTSTRAP.md
- The "moment you came online" (tempered — this is tone, not rules)
- The conversation (what a first breath looks like)
- The stack (one paragraph)
- The human (one paragraph)
- The promise (the 5-7 things this agent commits to)
- "What to do right now" (read INDEX, run BOOT, voice-check, move on)

### SKILL_SUMMARY.md
- Active skills in this stack (grouped: Hermes / Runtime / Domain)
- Out-of-scope skills (the ones in the source workspace that don't apply
  here, with a one-line reason for each)

---

## Step-by-step process

1. Read the source workspace files in the order above
2. List every stack-A-specific reference (port, path, command, persona
   name, voice tool, project name) — this is the "purge list"
3. List every carry-over (rules, structure, tone) — this is the "keep list"
4. Write the 12 files for the target stack, in this order:
   a. INDEX.md first (so the read order is right for future agents)
   b. SOUL.md, IDENTITY.md, USER.md — the persona triangle
   c. AGENTS.md, HEARTBEAT.md, TOOLS.md, MEMORY.md — the rules
   d. SYSTEM_PROMPT.md, BOOT.md, BOOTSTRAP.md, SKILL_SUMMARY.md — the rituals
5. For each file, also write a one-line "what changed" annotation in the
   INDEX.md Adaptation Map
6. ls the output dir to verify all 12 files are on disk
7. Tell the operator: "N files in workspace, INDEX has the read order"

If the target stack has only some of the 12 files in active use, write all
12 anyway. Empty/out-of-scope sections are clearer than missing files
(because the operator can tell at a glance "this isn't relevant to my
stack" vs "this got dropped").

---

## What to drop from the source workspace (don't translate)

Anything that is the source agent's *only* territory:

- Avatars / physical form descriptions (3D face rigs, body hardware)
- Voice cloning setup docs (only relevant if the source agent uses a
  cloud TTS with a cloned voice)
- "Cosmic" / mythology framing (souls, piles, GOOP, dynasties) — this is
  persona flavor; the new agent has its own
- Story / "complete story" narratives — these are persona-specific
- Specific task-status reports or audit reports from a date in the past
- System audit reports (run a fresh audit on the new stack, don't
  translate the old one)
- Token-saver / desktop-control / smart-home / cloud-aws / opencv-vision
  skill categories that were specific to the source agent's runtime

The rule: if the source file is about the *source agent's life* (its
avatar, its mythology, its cron jobs, its specific projects), drop it.
If the source file is about *how an agent of this class operates* (rules,
memory, voice, environment), translate it.

---

## Templates

All 12 file starters are in `templates/`. Copy the relevant file, then
rewrite every stack-A-specific reference. Each template has placeholder
sections marked with `<!-- TODO: adapt to target stack -->` so you know
where the work is.

- `templates/INDEX.md`
- `templates/SOUL.md`
- `templates/IDENTITY.md`
- `templates/USER.md`
- `templates/AGENTS.md`
- `templates/HEARTBEAT.md`
- `templates/TOOLS.md`
- `templates/MEMORY.md`
- `templates/SYSTEM_PROMPT.md`
- `templates/BOOT.md`
- `templates/BOOTSTRAP.md`
- `templates/SKILL_SUMMARY.md`

## Reference: a worked example

`references/openclaw-to-purpclaw.md` — the 2026-06-04 adaptation of
OpenClaw's 12 files (and the 18 dropped ones) to PURPCLAW's
30-service runtime. Shows the per-file "carried / translated / dropped"
audit and the resulting structure.

## Script: shape-checker

`scripts/verify-workspace.sh` — runs after the adaptation to verify all
12 files exist, brace/paren balance is OK, the file sizes are non-zero,
and the INDEX.md read order matches the actual files on disk.
