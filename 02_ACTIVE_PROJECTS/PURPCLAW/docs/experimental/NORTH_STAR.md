# PURPCLAW North Star

> The canonical target every session (human, Claude, Codex) works toward.
> Set 2026-06-05. Companion to [PARITY_TARGET.md](./PARITY_TARGET.md) and [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md).

PURPCLAW is the best-in-market agent harness. Every feature specced in research is present, cohesive, and flows.

## The five non-negotiables

1. **One glance = total awareness.** Looking at the screen, a user instantly sees: what's live vs dark, who's working where, what's delegated to whom, and how the stack is handling tasks, evolution loops, learning sets, research, and group chats — plus every capability lens (maps, calendars, music, image-gen, video-gen, browser, anything a computer can do).

2. **All live, zero fake.** No stubs, mocks, or sims anywhere. Every service, panel, and agent is really wired and communicates end to end. If a path isn't live it renders **"unavailable"** — it never pretends.

3. **Genuinely agentic.** When a user talks to an agent it uses the real tool-calling brain (`lib/agent-loop.js`: bash/read/write/patch/glob/grep + capability tools), not a chat completion. Agents know their divisions, peers, the full skill library, and how to employ them.

4. **Self-driving when idle.** After ~20 min of no active use, the stack auto-enters self-evolve / learning / research loops to harden and upgrade its own harness — which requires it to know every section and every line of its own codebase.

5. **Governed.** Every risky action (esp. idle self-evolution) passes the gatekeeper before execution. Autonomy never bypasses approval.

## Execution phases

1. **Wire the real brain** — route `/api/chat` + swarm/tower through `PurpclawAgent`. (Core files.)
2. **Idle → self-evolve** — detect >20 min no-input; kick evolve/learn/research through the real executor; give it a live codebase index.
3. **One-glance Mission Spine** — finish the at-a-glance lens: live/dark, who/where, delegation, evolution/learning/research/groupchat + capability tiles, each live-or-unavailable.
4. **Kill every stub/mock/sim** — full no-fakes sweep across services + panels (see KILL_LIST below as it's built).

## Acceptance bar
- `purpclaw parity` reports zero `missing`.
- No file returns demo/mock/sim data on a path a user can reach.
- Talking to any agent invokes real tools.
- Idle >20 min triggers a governed self-evolution cycle that cites real files.
