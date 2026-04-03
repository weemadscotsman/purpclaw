# PurpClaw Native Skills Migration Pack — Batch 1

> Migrates 12 Hermes skills into native PurpClaw skills.
> Each has a SKILL.md manifest, tool registration, and agent routing.
> Zero Hermes dependency.

---

## Migration manifest

| # | Skill | Type | PurpClaw target |
|---|---|---|---|
| 1 | cognitive-spine-deployment | Python/HTTP | `skills/cognitive-spine/` + PM2 entry |
| 2 | sticky-finger-testing | Prompt/QA | `skills/sticky-finger-testing/` |
| 3 | smith-neo-adversarial-pair | Code/chaos | `skills/smith-neo/` (already exists as lib) |
| 4 | documentation-audit | Prompt/docs | `skills/documentation-audit/` |
| 5 | purpclaw-feature-parity-build | Code/build | `skills/feature-parity-build/` |
| 6 | purpclaw-codebase-audit | Code/audit | `skills/codebase-audit/` |
| 7 | multi-service-runtime-boot-hardening | Code/boot | `skills/runtime-boot-hardening/` |
| 8 | cost-aware-llm-pipeline | Config/routing | `skills/cost-aware-llm/` |
| 9 | agent-eval | Code/eval | `skills/agent-eval/` |
| 10 | eval-harness | Code/eval | `skills/eval-harness/` |
| 11 | deep-research | Code/research | `skills/deep-research/` |
| 12 | kernel-job-training-buffer | Code/training | `skills/training-buffer/` |

---

## Install

```bash
purpclaw skill install <name>
```

Or for batch:

```bash
purpclaw skill install cognitive-spine sticky-finger smith-neo doc-audit feature-parity codebase-audit boot-harden cost-llm agent-eval eval-harness deep-research training-buffer
```

---

## Verification

```bash
purpclaw skill list           # 12 new skills visible
purpclaw show                 # skill count: +12
```

---

*Generated: 2026-06-06. Batch 1 of N.*
