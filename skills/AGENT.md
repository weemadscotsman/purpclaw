# `skills/` — AGENT.md

395+ skill packages, each one a folder with at minimum a `SKILL.md` and (often) a `references/` subfolder for source material/builders/citations. This is the "tool-belt" — procedure packs that any agent session can pull in to extend its surface.

If your task is "I need to do X", probably look here first. If `X` isn't here but `X` resembles a card in `agents/`, that card might express it.

---

## Shape (verified by Read)

```
skills/
└── <skill-name>/
    ├── SKILL.md           ← required: the procedure / instructions / spec
    └── references/        ← optional: source material, builders, citations
```

Not used by PURPCLAW:
- PURPCLAW does NOT use the 6-file `AGENT.md`/`GOALS.md`/`PROTOCOLS.md`/`SKILL.md`/`SOUL.md`/`agent.js` per-skill shape. Only `SKILL.md` + optional `references/`.
- Persona cards (with YAML front-matter for division/tier/etc.) live in `agents/`, NOT here.

---

## Categories (observed)

| Bucket | Examples |
|---|---|
| Domain procedures | `3-statement-model`, `architecture-decision-records`, `article-writing`, `ascii-art`, `ascii-video`, `arxiv`, `audiocraft`, `airtable`, `apple-notes`, `apple-notes.bak`, `apple-reminders`, `architecture-diagram` |
| AI-engineering | `ai-composer-pattern`, `ai-first-engineering`, `ai-regression-testing`, `ai-runtime-governance`, `android-clean-architecture` |
| Agent-systems | `agent-eval`, `agent-harness-construction`, `agent-loop-pattern`, `agent-payment-x402`, `agent-workspace-adaptation`, `agentic-engineering`, `adversarial-self-testing`, `adversarial-ux-test` |
| Provider bridges / exotics | `1password`, `agentmail` |
| Naming convention | many lowercase-kebab names like `accelerate` (no native skill body — placeholder for ad-hoc invocation) |

(Adversarial/regression/harness skills are the "negative-path" half of the deck.)

---

## How a skill is invoked

Two trigger styles:

1. **Auto-discovery** — the agent loop walks `skills/` and registers every `SKILL.md` as a discoverable procedure. The session summary gets a short index, and the agent can pull the body when needed.
2. **Manual binding** — the agent-card YAML in `agents/<name>.md` lists `skills: [name, name, ...]` and the booter pre-loads them. This is what creates the persona's "skill belt".

So: PERSONA = agent card. SKILL = skill folder. The card's `skills:` field binds them.

---

## When you change something here

- Adding a skill: `<skill-name>/SKILL.md`. Pick a fresh kebab-name. Don't reuse names.
- Removing a skill: search the persona cards in `agents/` and grep `agent_routing_matrix.js` for any `skills: [..., <name>, ...]` references before deletion.
- Editing a skill body: this is INSTRUCTIONS. Tone it the way Quill/Quill-like personalities in the megapanel surface it (procedural, blunt, capable-of-failing-loudly).

---

## Things to NOT do

- Do NOT put a card here. Cards are in `agents/`.
- Do NOT share names with `agents/` cards unless you're intentionally shadowing (extremely unusual).
- Do NOT create a `references/` that grows unbounded — it's source material, not a cache.

---

Last updated 2026-06-19. Owner: **infra@gateway**.
