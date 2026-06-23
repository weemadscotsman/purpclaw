# Full Stack Reliability Testing — 3-Ledger Pattern
> Built 2026-06-06. From the discovery that PurpClaw accidentally built three independent ledgers.

## The three ledgers

1. **Memory Ledger** — `memory_matrix_v2.py:7880`, `agent_work/mochi.json`, `agent_work/memory.jsonl`. What happened. Episodic + semantic + procedural + symbolic + temporal + counterfactual + emotional memory across 7 layers.

2. **Ratchet Ledger** — `E:/training/results.tsv`, `E:/training/program.md`. What improved. Records every training iteration: hypothesis, val_loss, status (SUCCESS/REVERT/CRASHED). Currently 10 iterations logged.

3. **Reliability Ledger** — `agent_work/reliability-ledger.json`, `agent_work/smith-neo-ledger.json`. What broke and whether Neo caught it. 66 attacks run, 45 detected, 17 repaired.

## The Smith+Neo adversarial pair

### Smith (Chaos Injector) — `lib/smith-neo.js`

8 attack techniques across 4 packs:

| Pack | Techniques | Count |
|---|---|---|
| Output | refusal, truncate, null_output, hallucinate | 20 |
| Memory | reorder, swap_args | 10 |
| Agent | delay, slow_leak | 8 |
| Provider | null_output, refusal | 8 |

### Neo (Stabilizer) — `lib/smith-neo.js`

Detection engine with confidence scoring:

| Attack | Confidence | Auto-Repair |
|---|---|---|
| refusal | 95% | ✅ |
| truncation | 90% | ⚠ flag |
| null_output | 99% | ⚠ retry |
| hallucination | 85% | ✅ |
| reorder | 70% | ⚠ |
| swap_args | 65% | ⚠ |
| delay | 95% | — |
| slow_leak | 80% | — |

### Chaos Campaigns — `lib/chaos-campaign.js`

Systematic attack packs run in bulk. Tracks detection rate, repair rate, response time per technique. Results persisted to `agent_work/reliability-ledger.json`.

```bash
/bigboss chaos campaign output    → 20 attacks, 100% detection, 50% repair
/bigboss chaos status             → full reliability report
```

## The reliability thesis

From external analyst (2026-06-06):
> "Most systems do: Test → Pass → Ship. PurpClaw does: Attack → Detect → Explain → Persist. That's closer to an immune system than a test suite."

> "The thing worth money isn't adding tool 109. It's being able to say: 'We attacked this thing ten thousand times and it fixed itself.'"

## Tools built

| tool | file | function |
|---|---|---|
| smith_inject | lib/smith-neo.js | inject one attack technique |
| smith_random | lib/smith-neo.js | random attack |
| neo_stabilize | lib/smith-neo.js | detect + repair |
| neo_ledger | lib/smith-neo.js | view attack history |
| chaos_round | lib/tools/index.js | full round (inject→detect→stabilize) |
| chaos_campaign | lib/tools/index.js | run attack pack |
| chaos_status | lib/tools/index.js | reliability report |

All wired into `/bigboss chaos <subcommand>` with 6 subcommands: inject, random, round, campaign, status, reset, ledger.
