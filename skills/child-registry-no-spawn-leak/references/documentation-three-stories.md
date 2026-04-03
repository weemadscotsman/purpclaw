## The three-story trap

Docs in an evolving codebase tell stories from different eras. A single `docs/` folder can contain:

| Era | Typical dates | Tells | Example |
|---|---|---|---|
| **Dream** | earliest | Plans, wishlists, "to do" items | `NEUROSYMBOLIC_TASKS.md`, `GOOP_SIGIL_EXORCISM_PLAN.md` |
| **Build** | middle | Architecture docs from when things were being built | `PURPCLAW_COMPLETE_ARCHITECTURE.md` (18 services, 30 agents) |
| **Ship** | most recent | Current state, usage, honest numbers | `ARCHITECTURE.md` (1 spine, 152 agents, 110 tools) |

Before trusting a doc, figure out which era it's from. Check:
- The file's modification date
- The agent/service/tool counts it mentions (26 agents vs 152 agents is a dead giveaway)
- Whether it references dead dependencies (Kimi, Moonshot, old port numbers)
- Whether it describes the old architecture (separate services) or the new (cognitive spine)

## The documentation solution: four folders

After auditing 34 stale docs, the fix was:

```
docs/
├── current/       actively maintained · reflects running system
├── shipped/       completed deliverables · stable reference
├── experimental/  aspirational · not yet implemented
└── legacy/        historical · archived contents with README manifest
```

Every doc was moved into exactly one folder. `experimental/` holds the vision docs that might never ship. `current/` holds what's actually true right now. This prevents a new developer from reading an April doc and thinking the system still works that way.

## Truth standard for documentation

Every doc should distinguish three states:

| State | Meaning |
|---|---|
| **Built** | Code exists on disk |
| **Running** | Process is alive and responding |
| **Integrated** | Actively consumed by another system component |

The README should be honest about which state each capability is in. Example from the actual README: *"35 agents are deployable at runtime (152 skill directories). 9 core services are running (25 total defined). The 7-layer world model exists in code — episodic memory is online, layers 2-7 are built but awaiting integration."*
