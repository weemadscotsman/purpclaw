---
name: smith-neo-adversarial-pair
description: Build and run Smith (chaos injector) + Neo (stabilizer) adversarial agent pair for PurpClaw. 8 attack techniques, pattern-based anomaly detection, chaos campaigns with 4 attack packs, and a reliability ledger.
when_to_use: Stress-testing the swarm to prove it survives itself.
purpclaw_wiring: lib/smith-neo.js, lib/chaos-campaign.js, lib/tools/index.js (5 tools)
---

# Smith + Neo

## Run
```bash
purpclaw chaos campaign output
purpclaw chaos status
```