# PURPCLAW Ship Plan — From Personal Stack to Shippable Toolbag

**Date:** 2026-05-23
**Target:** A stranger on Windows or macOS can install PURPCLAW with one command, hatch their first companion, and run an agent job within 5 minutes.
**One-line truth:** The architecture is ahead. The packaging isn't. Close that gap.

---

## The five milestones

Each is independently shippable. Stop work between milestones, ship what you have, then keep going.

### Milestone 1 — The Toolbag is Portable  (this turn)
Goal: someone can install PURPCLAW from a single command and answer 3 questions.

| File | What |
|---|---|
| `install.ps1` (new) | Windows bootstrap — Node check, PM2 install, deps, run init wizard |
| `install.sh` (new) | macOS/Linux bootstrap — same shape |
| `bin/purpclaw.js` `cmdInit` (enhance) | Add interactive wizard mode when no `.env` exists |
| `README.md` (rewrite top) | 5-minute quickstart at the top, archaeology moved below |
| `docs/QUICKSTART.md` (new) | Standalone first-run guide |

**Exit criteria:** From a fresh Windows machine with no PURPCLAW, the user runs one line, answers 3 prompts, sees Marbles blink at them.

---

### Milestone 2 — The Skill Registry  (next)
Goal: skills/agents/companions become installable+publishable units.

| File | What |
|---|---|
| `lib/registry.js` (new) | Git-backed registry client (manifest fetch, install, verify) |
| `lib/skill-package.js` (new) | Skill packaging format (SKILL.md + manifest.json + optional assets) |
| `bin/purpclaw.js` cmdInstall (new) | `purpclaw install <skill>`, `<agent>`, `<companion>` |
| `bin/purpclaw.js` cmdPublish (new) | `purpclaw publish <local-skill>` — opens a PR to registry |
| `bin/purpclaw.js` cmdSearch (new) | `purpclaw search "<intent>"` cross-registry |
| `registry/manifest.json` (new repo) | The remote registry index |

**Exit criteria:** User runs `purpclaw install code-reviewer` and the next agent run knows that skill.

---

### Milestone 3 — Project Scaffolds  (after registry exists)
Goal: users start projects from templates, not from blank dirs.

| File | What |
|---|---|
| `lib/project.js` (new) | Per-project workspace (`agent_work/projects/<id>/`) |
| `bin/purpclaw.js` cmdCreate (new) | `purpclaw create <template>` |
| `templates/` (new dir) | Starter scaffolds: `next-saas`, `slack-bot`, `cli-tool`, `chrome-extension` |
| `purpclaw.project.json` schema | Per-project config: agents to load, gates to apply, success criteria |
| `bin/purpclaw.js` cmdResume (new) | `purpclaw resume <project>` reloads context from pool |

**Exit criteria:** `purpclaw create next-saas my-app` produces a working Next.js project that the swarm is already running on.

---

### Milestone 4 — Delivery Pipeline  (`purpclaw ship`)
Goal: PURPCLAW doesn't stop at "code written"; it gets to "deployed somewhere a human can click".

| Target | What |
|---|---|
| Vercel  | First. `purpclaw ship --target vercel` — needs project link + token |
| Netlify | Second |
| GitHub Release | For CLI/binary projects |
| Expo / TestFlight | Mobile (later) |
| `lib/ship.js` (new) | Provider-agnostic ship contract |
| `lib/governance.js` (extend) | Ship is a governance-gated action by default |

**Exit criteria:** A built project goes live and Mission Control shows the URL.

---

### Milestone 5 — Mission Control "While You Were Away"
Goal: the UI shows what the autonomous loop did since the user last looked.

| File | What |
|---|---|
| `app/page.tsx` (rewrite) | Operator landing: pending approvals, what shipped, what learned |
| `app/dashboard/route.ts` | Stream from pool + orchestrator |
| `lib/reasoning-loop.js` (new) | Layer-3 reasoning loop (proactive scanner) |

**Exit criteria:** User opens browser, sees "while you were sleeping I deployed v0.2 of your bot, here's the diff, here's the URL, here's what broke".

---

## Layered ordering — why this order

1. **Installer first** because nothing else matters if a 2nd human can't boot it.
2. **Registry second** because the 222 skills are PURPCLAW's moat — they need to be installable/shareable to compound.
3. **Scaffolds third** because that's the user's "what do I do next" answer.
4. **Ship fourth** because once you have scaffolds, you need a way to publish what they build.
5. **Mission Control polish last** because the CLI works first; the dashboard makes it lovable.

Skipping ahead = wasted work.

---

## Anti-goals (do not do)

- Don't build a custom package format. Use git + JSON. Skills are directories with a SKILL.md and an optional manifest.json.
- Don't build a hosted SaaS. PURPCLAW is local-first. Registry is the only network dependency, and even that's optional.
- Don't ship a UI before the install works. Demos die when the install dies.
- Don't ship a second LLM provider before the first is rock-solid. MiniMax-M2.7 is the brain. Prove it, then add fallbacks.
- Don't write tests for the orchestrator until the spaghetti-audit verdicts are addressed (`unified_api.js` is ANNONA-tier).

---

## Honest scope

If Eddie + Claude build this together, focused, **2-3 weeks** to milestones 1+2 in shippable state. Milestones 3+4 are another 2 weeks. Milestone 5 is "polish forever".

The cute apocalypse becomes a product when **a 2nd person installs it and tells a 3rd person**. That's the only real test.

---

## Right now: Milestone 1, executing

This turn:
- [x] Plan doc (this file)
- [ ] `install.ps1`
- [ ] `install.sh`
- [ ] Enhance `purpclaw init` with `--wizard` interactive mode
- [ ] `README.md` quickstart rewrite
- [ ] `docs/QUICKSTART.md`

Pick up from this checklist after the session ends.
