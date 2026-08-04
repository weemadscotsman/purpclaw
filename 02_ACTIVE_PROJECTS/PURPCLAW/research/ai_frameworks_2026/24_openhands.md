# 24 — OpenHands (formerly OpenDevin)

**Tier:** 8 (Autonomous / Full-Stack)  
**Vendor:** All Hands AI  
**License:** MIT  
**Initial release:** 2024 (as OpenDevin), renamed 2025  
**Last major update:** 2025 (OpenHands 1.0, multi-agent, runtime)

---

## What it is
Autonomous coding agent platform. Spawns agents that can edit code, run commands, browse web, execute tests. Used by major AI labs as benchmark. Self-hostable runtime.

## Core capabilities
- [x] Full sandbox runtime (Docker)
- [x] Code editing (with diffs)
- [x] Shell command execution
- [x] Web browsing (in-sandbox)
- [x] File operations
- [x] Git operations
- [x] Multi-agent (planner + executor)
- [x] SWE-Bench leading scores
- [x] Human-in-the-loop (ask questions)
- [x] Cloud-hosted option (OpenHands Cloud)
- [x] OpenHands CLI

## Architecture
- Docker sandbox per session
- Agent = LLM + tool env
- Plans, edits, tests, iterates

## Strengths
- Best open coding agent
- SWE-Bench leader
- Real sandbox (secure)
- Active community

## Weaknesses
- Heavy (Docker required)
- Latency (sandbox startup)
- Cost for long sessions

## Best use case
Autonomous coding tasks, bug fixing, feature implementation, repo-scale refactors.

## PURPCLAW fit: 7/10
- Excellent for PURPCLAW's coding-agent persona
- Use for any "implement this feature" tasks
- Sandbox model aligns with PURPCLAW safety

## Integration sketch
```bash
# CLI
pip install openhands-ai
openhands --task "Add agent telemetry to PURPCLAW"
```

## Sources
- https://github.com/All-Hands-AI/OpenHands
- https://www.all-hands.dev/
- SWE-Bench leaderboard
