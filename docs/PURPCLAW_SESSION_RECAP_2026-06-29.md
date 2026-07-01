# PURPCLAW Session Recap — The Constitution

> **2026-06-29. Truth-normalised.**
> **No victory speech until runtime, docs, and status agree.**

---

## Truth State (Verified 2026-06-29)

```
Runtime verified:
- CLI command surface is real and rich (60+ commands, all return real output)
- Registry JSON files parse cleanly (16 files, 0 failures)
- Skills registry contains 379 real entries (was 28 stale, regenerated)
- Soul registry contains 95 soul entries
- Studio modes registry contains 11 modes
- Council, voting, timeline, donor archaeology, and Auto-Evolve bridge are live
- Hivemind CI gate passes 11/11 (cognitive loop proven end-to-end)
- Full audit and docs-vs-reality audit are on disk

Known distinctions:
- Souls (95), runtime agents (85 in AGENT_REGISTRY.json), and division agents
  (94 across 9 AGENTS.md files) are separate concepts. Don't mix them.
- The `total: 85` field in souls.json is stale — should be 95 to match the array.
- CLI is currently the strongest proof surface.
- Web is partial (Next.js exists, some routes work, evolution page exists).
- TUI is partial / unclear.
- Mobile Web UI is needed, not built.
- Ambient Life is live/early.
- Residue as a formal room/object/state layer requires Shared Spaces.
- Auto-Evolve is a governed proposal/approval loop, not uncontrolled self-modification.
- Donor Archaeology feeds proposals into it. Nothing applies without explicit approval.

Launch blocker:
- NONE. Both lies killed:
  1. Service probes now real (item zero — `r(null)` bug fixed)
  2. cmdStatus hardcoded totals replaced with live disk counts (P0 patch)
- `purpclaw status` and `purpclaw doctor` now agree: both show real state.
```

---

## Five Core Doctrines (Load-Bearing Walls)

1. **Runtime Truth** — "No doc survives unless runtime proves it."
2. **Emergence** — "Never code the joke. Code the reason the joke could exist."
3. **Donor** — "Never import a feature until the underlying behavioural law is identified."
4. **Surface Parity** — "If CLI can do it, every surface must at least see it. If Web can click it, CLI must prove it."
5. **Growth** — "Do not add organs before wiring the organs already on the table."

---

## What NOT To Do

- Do not create second soul registry
- Do not create second evolution engine
- Do not import whole projects randomly
- Do not copy code under "yoink"
- Do not hardcode emergent behaviours
- Do not trust docs without runtime proof
- Do not let status dashboards report fake green
- Do not fork mobile UI as separate app
- Do not build four separate UI implementations
- Do not mix souls, agents, and runtime roster counts

---

## Current End-State (Honest)

```
Souls:                 95 in array (total field says 85 — fix pending)
Interviews:            95
Studio modes:          11
Flight pairs:          6
Skills:                379
Registry JSON:         16 parsed clean
CLI commands:          60+ real
Timeline:              live
Meeting memory:        live
Ambient life:          live / early
Council:               live
Voting:                live
Donor archaeology:     live
Heist wrapper:         live
Auto-Evolve bridge:    live (governed, not autonomous)
Auto Research:         present, needs parity
Status honesty:        FIXED (both lies dead, 8/8 validation pass)
Hivemind CI gate:      11/11 PASS, EXIT 0
Docs-vs-reality:       done
Launch blocker:        NONE
```

---

## Layer Map (Honest)

```
Execution
├─ CLI (60+ commands, all real — strongest surface)
├─ TUI (partial / unclear)
├─ Web UI (Next.js :3030, partial — some routes work)
└─ Mobile Web UI (NOT BUILT — ClawShell design locked, implementation TODO)

Intelligence
├─ Oracle (problem → expertise summon)
├─ Council (dynamic, weighted voting)
├─ Auto Research (E:/training orchestrator — needs parity)
├─ Auto Evolve (mutator + skill-forge — governed, not autonomous)
└─ Donor Archaeology (behavioural law extraction)

Culture
├─ Souls (95, asymmetric relationships, private thoughts)
├─ Timeline (org history, pattern detection, traditions)
├─ Meeting Memory (cultural summaries)
├─ Ambient Life (live / early — agents existing between meetings)
└─ Studio (11 behavioural environments)

Governance
├─ Evidence (Spring Doctrine, trust scores)
├─ Votes (weighted, dissent captured)
├─ Reputation (influence leaderboard)
├─ Registry (16 JSON, all parse clean)
└─ Audit (docs-vs-reality + full audit on disk)

Residue
└─ Concept locked, implementation pending Shared Spaces
```

---

## Remaining Todo (Ranked)

### P0 — Truth / Launch Trust
1. ~~Replace hardcoded status totals~~ DONE
2. ~~Fix service probe lie~~ DONE
3. Fix `souls.json` total field (85 → 95 to match array)
4. Re-run docs-vs-reality audit after souls fix
5. Verify `purpclaw status` and `purpclaw doctor` agree

### P1 — Surface Parity
6. ~~Build shared action adapters~~ DONE (`lib/actions/`)
7. ~~Add parity report command~~ DONE (`purpclaw parity`)
8. Wire `purpclaw parity` into `bin/purpclaw.js` CLI dispatch
9. Wire Auto Research to CLI/TUI/Web/Mobile
10. Wire Auto Evolve to CLI/TUI/Web/Mobile
11. Close red boxes in parity report (11 currently)

### P2 — Studio Consolidation
12. Write canonical Studio split decision doc
13. Bridge `lib/studio.js` with legacy `podcast_studio` media delivery
14. Ensure TTS/Telegram/dashboard use same studio session model

### P3 — Ecology
15. Build Shared Spaces (`registry/spaces.json` + `lib/spaces.js`)
16. Add Presence/Residue state (requires Shared Spaces)
17. Expand Ambient Life using spaces
18. Add automatic world events

### P4 — Memory / Mutation
19. Timeline backfill from council votes + studio sessions
20. `--write-memory` for council
21. Relationship mutation rules (trust/respect/friendship/rivalry/annoyance)
22. Reputation mutation audit trail
23. Meeting memory search

### P5 — Runtime Context
24. Wire steering/context/rules loader into trace flow
25. Connect into trace/session flow
26. Make docs say exactly what is loaded vs stored-only

### P6 — Mobile
27. Build ClawShell Mobile (CRT command deck, not SaaS corpse)
28. Same actions, mobile layout only
29. Slide-in panels, bottom dock, swipe terminal
30. Validate 390px / 430px / 768px

---

## Validation Commands

```bash
node bin/purpclaw.js status              # honest probes, live counts
node bin/purpclaw.js doctor              # same probe logic
node lib/commands/parity.js              # surface capability audit
node bin/purpclaw.js hivemind status     # cognitive loop state
node bin/purpclaw.js evolve status       # mutation queue
node bin/purpclaw.js autoresearch status # research loop
node bin/purpclaw.js donor               # donor artifacts
node bin/purpclaw.js timeline recent 20  # org history
node bin/purpclaw.js studio status       # studio state
node bin/purpclaw.js council leaderboard 10  # influence ranking
npm run verify:hivemind:rank1           # 11/11 CI gate
node scripts/verify-status.js           # 8/8 status validation
node bin/purpclaw.js registries audit   # registry drift audit
```

If any of these lie, drift, or disagree, fix that before adding more circus animals.

---

## Canonical Sources

| Concern | Source |
|---|---|
| Souls | `registry/souls.json` (95 entries) |
| Runtime agents | `agents/AGENT_REGISTRY.json` (85 distinct) |
| Division agents | `divisions/*/AGENTS.md` (94 total across 9 divisions) |
| Skills/tools | `skills/skills_registry.json` (379 entries) |
| Services | `service_registry.js` (27) + `ecosystem.config.js` (27) |
| Version | `package.json` (v0.3.0) |
| Studio modes | `registry/studio-modes.json` (11) |
| Timeline | `registry/timeline.json` |
| Council votes | `registry/council-votes.json` |
| Surface capabilities | `registry/surface-capabilities.json` |
| Donor artifacts | `registry/donor-artifacts.json` |
| Promotion rules | `.purpclaw/hivemind/promotion-rules.json` |

**Do not mix soul count, agent count, and division count. They are different concepts.**

---

## Final Launch Line

```
The monster ships when runtime truth, docs truth, and status truth agree.
The audit proves the monster is real.
The launch gate is passed: every remaining hardcoded lie is dead.
```

🦆🏛️☕💀