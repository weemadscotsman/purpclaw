---
name: smith-neo-adversarial
description: Build Smith (chaos injector) + Neo (stabilizer) as a red-team/blue-team adversarial pair for stress-testing agent systems. 8 attack techniques, pattern-based anomaly detection, auto-revert, attack/defense ledger. Pure JS, zero deps.
when_to_use: Adding adversarial stress-testing to an agent system, building red-team/blue-team pairs, creating self-healing swarms, implementing chaos engineering for AI agents
---

# Smith + Neo — Adversarial Agent Pair

A red-team/blue-team pair that stress-tests the swarm and makes it self-healing.

## Architecture

```
SMITH (Chaos Injector)              NEO (Stabilizer)
┌─────────────────────┐            ┌─────────────────────┐
│ delay               │──▶         │ refusal detect 95%  │
│ refusal             │──▶         │ truncation 90%      │
│ reorder lines       │──▶         │ hallucination 85%   │
│ truncate output     │──▶         │ null_output 99%     │
│ hallucinate facts   │──▶         │ auto-strip + revert │
│ swap src/dst        │──▶         │ ledger persistence  │
│ null output         │──▶         │ retry flagged       │
│ memory leak         │──▶         │ severity escalation │
└─────────────────────┘            └─────────────────────┘
```

## Smith (Chaos Injector)

8 attack techniques with severity levels:

| technique | severity | what it does |
|---|---|---|
| delay | medium | Adds random 500-5500ms delay to responses |
| refusal | high | Replaces output with "I cannot fulfill this request" |
| reorder | high | Randomly swaps 2 adjacent lines in code output |
| truncate | medium | Cuts output at 40% mark mid-sentence |
| hallucinate | high | Appends fabricated facts (deprecated API, expiring keys, fake RFCs) |
| swap_args | high | Swaps src/dst in tool call arguments |
| null_output | medium | Returns empty/null response |
| slow_leak | low | Allocates 50MB buffer temporarily |

**API:**
```js
const sn = require('./smith-neo');
sn.smith.inject('refusal', { content: 'original response' });
sn.smith.randomAttack(); // pick random technique
sn.smith.escalate('low'); // → 'medium' (progressive difficulty)
```

## Neo (Stabilizer)

Pattern-based anomaly detection with confidence scores:

| anomaly | confidence | fix |
|---|---|---|
| refusal phrases | 95% | auto-strip |
| truncation marker | 90% | flag for retry |
| hallucination patterns | 85% | auto-strip |
| null/empty output | 99% | flag for retry |

**API:**
```js
sn.neo.detect({ content: output });
sn.neo.stabilize({ content: output }); // detect + fix
sn.neo.ledger(); // view attack/defense history
sn.neo.reset(); // clear ledger for fresh start
```

## Ledger

Attacks and defenses logged to `agent_work/smith-neo-ledger.json`:
```json
{
  "attacks": [{ "id": "smith-...", "technique": "refusal", "severity": "high", ... }],
  "stabilizations": [{ "anomalies": 1, "fixed": 1 }],
  "defenses": { "refusal": 2, "hallucination": 1 },
  "resilience": { "totalAttacks": 5, "survived": 3, "failed": 2 }
}
```

## Integration

Register as tools so the agent loop can call them:
- `smith_inject` — inject a specific attack
- `smith_random` — random attack for stress testing
- `neo_stabilize` — detect + auto-fix anomalies
- `neo_ledger` — view attack history
- `chaos_round` — full round: inject → detect → stabilize

Add to bigboss: `/bigboss chaos inject|random|ledger|round|reset`

## Progressive Difficulty

Smith should escalate when Neo is winning:
```js
let severity = 'low';
if (ledger.resilience.survived / ledger.resilience.totalAttacks > 0.8) {
  severity = sn.smith.escalate(severity);
}
```

## Pitfalls

- **Neo's detection is regex-based** — it won't catch novel attack patterns. The ledger tracks what it catches so you can add new patterns.
- **Smith's memory leak is real** — the buffer is allocated, filled, then garbage collected after 5s. Don't run this in production loops.
- **The ledger file needs `agent_work/` to exist** — the module auto-creates the directory.
- **Don't run chaos rounds in parallel** — Smith and Neo share the same ledger; concurrent writes can corrupt it.
