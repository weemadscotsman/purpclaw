# Chaos Campaign System — Smith + Neo Adversarial Pair

## Architecture
Two adversarial agents that stress-test the PurpClaw swarm:
- **SMITH**: Chaos injector — attacks the system with 8 techniques across 4 packs
- **NEO**: Stabilizer — detects anomalies with confidence scores and auto-repairs

## Files
- `lib/smith-neo.js` — core engine (attack techniques, detection, stabilization, ledger)
- `lib/chaos-campaign.js` — systematic campaigns with attack packs and reliability tracking
- `agent_work/smith-neo-ledger.json` — attack/defense history
- `agent_work/reliability-ledger.json` — campaign results with detection/repair rates

## Attack Packs

### Output (20 attacks, 100% detection, 50% repair)
- refusal: injects "I cannot fulfill this request..." messages (95% confidence detection)
- truncate: cuts output at 40% with [TRUNCATED] marker (90% confidence)
- null_output: returns empty string (99% confidence)
- hallucinate: appends fabricated facts about deprecation/expiry/rate-limits (85% confidence)

### Memory (10 attacks)
- reorder: swaps adjacent lines in code output (70% confidence — detects variable/function used before declaration)
- swap_args: inverts src/dst in tool args (65% confidence — detects semantic mismatch)

### Agent (8 attacks)
- delay: injects 500-5500ms latency (95% confidence — detects _injected_delay_ms flag)
- slow_leak: allocates 50MB buffer, releases after 5s (80% confidence — detects _memory_pressure flag)

### Provider (8 attacks)
- null_output + refusal patterns on provider-like outputs

## Neo's Detection Engine (v2, 2026-06-06)
Updated to cover all 8 attack types:
- Output: refusal (95%), truncation (90%), hallucination (85%), null_output (99%)
- Memory: reorder (70%), swap_args (65%)
- Agent: delay (95%), slow_leak (80%)

Detection is pattern-based with confidence scores. Auto-stabilization strips refusals and hallucinations, flags truncation/nulls for retry.

## Reliability Ledger
Tracks per campaign: total attacks, detected, repaired, detection rate%, repair rate%, avg response time (ms). Also per-technique breakdown. History preserved across campaigns.

```json
{
  "campaigns": [...],
  "totals": { "attacks": 66, "detected": 45, "repaired": 17, "avgResponseMs": 1 },
  "byTechnique": { "refusal": { "total": 13, "detected": 13, "repaired": 13 }, ... },
  "byPack": { "output": { "runs": 1, "lastDetectionRate": 100, "lastRepairRate": 50 }, ... }
}
```

## BigBoss integration
```
/bigboss chaos inject <technique>     # single attack
/bigboss chaos random                 # random attack
/bigboss chaos round                  # attack + detect + stabilize
/bigboss chaos campaign [pack]        # full pack (output|memory|agent|provider)
/bigboss chaos status                 # reliability stats
/bigboss chaos ledger                 # attack/defense history
/bigboss chaos reset                  # fresh slate
```

## Tools
- `smith_inject`: inject specific chaos technique
- `smith_random`: random attack
- `neo_stabilize`: detect + stabilize output
- `neo_ledger`: view attack history
- `chaos_round`: full attack→detect→stabilize cycle
- `chaos_campaign`: run full attack pack
- `chaos_status`: reliability stats

## The thesis
"Most systems test correctness. Smith tests failure modes. Neo proves reality survived. The reliability ledger builds the claim: 'We attacked PurpClaw 66 times and it caught 45. Next week it'll be 60.'"

## VERIFIED: 2026-06-06
- 66 attacks across 4 packs
- 45 detected, 17 repaired
- Output attacks: 100% detection, 50% repair (truncation can't auto-repair)
- Provider attacks: 100% detection, 38% repair
- All 8 attack types now covered by detection engine
