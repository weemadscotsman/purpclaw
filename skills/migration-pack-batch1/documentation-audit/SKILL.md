---
name: documentation-audit
description: Audit documentation against live system state — categorize by vintage, split into current/legacy/experimental/shipped, fix terminology drift, and make honest numbers the standard.
when_to_use: When docs feel stale, contradict the running system, or mix three eras of the project.
purpclaw_wiring: docs/ directory — read-only audit against live codebase
---

# Documentation Audit

1. Scan docs/ for vintage
2. Categorize: current / shipped / experimental / legacy
3. Cross-reference against live service registry
4. Fix terminology drift
5. Archive stale docs