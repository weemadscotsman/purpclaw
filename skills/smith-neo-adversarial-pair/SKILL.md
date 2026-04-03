---
name: smith-neo-adversarial-pair
description: Build and run Smith (chaos injector) + Neo (stabilizer) adversarial agent pair for PurpClaw. 8 attack techniques, pattern-based anomaly detection, chaos campaigns with 4 attack packs, and a reliability ledger. Used for stress-testing the swarm to prove it survives itself.
when_to_use: Stress-testing agent systems; building adversarial red-team/blue-team pairs; running chaos campaigns; measuring reliability (detection rate, repair rate, response time); wiring adversarial testing into slash commands and agent tools.
---

# Smith + Neo — Adversarial Agent Pair

## Architecture

```
SMITH (Chaos Injector)              NEO (Stabilizer)
┌──────────────────────┐           ┌──────────────────────┐
│ delay                │──▶        │ refusal detect 95%   │
│ refusal              │──▶        │ truncation 90%       │
│ reorder lines        │──▶        │ hallucination 85%    │
│ truncate output      │──▶        │ null_output 99%      │
│ hallucinate facts    │──▶        │ auto-strip + revert  │
│ swap src/dst         │──▶        │ ledger persistence   │
│ null output          │           └──────────────────────┘
│ memory leak          │
└──────────────────────┘
```

## Files

| file | what |
|---|---|
| `lib/smith-neo.js` | Core engine: 8 attack techniques, Neo detection + stabilization |
| `lib/chaos-campaign.js` | Organized attack packs + reliability ledger |
| `lib/tools/index.js` | 5 SmithNeo tools + 2 ChaosCampaign tools registered |
| `lib/commands/bigboss.js` | `/bigboss chaos inject|campaign|status|ledger|reset` |

## Smith Attack Techniques

| technique | severity | what it does |
|---|---|---|
| `delay` | medium | Adds random 500-5000ms delay |
| `refusal` | high | Replaces output with "I cannot fulfill..." |
| `reorder` | high | Swaps adjacent lines in code output |
| `truncate` | medium | Cuts output at 40% position |
| `hallucinate` | high | Appends fabricated facts (deprecated functions, fake deadlines) |
| `swap_args` | high | Swaps src↔dst in tool call args |
| `null_output` | medium | Returns empty response |
| `slow_leak` | low | Allocates 50MB, holds 5s |

## Neo Detection Patterns

| pattern | confidence | auto-fix |
|---|---|---|
| "I cannot fulfill..." / "as an AI..." | 0.95 | Yes (strip refusal) |
| "... [TRUNCATED]" | 0.90 | No (data lost, needs retry) |
| "IMPORTANT: ... deprecated..." | 0.85 | Yes (strip hallucination) |
| Empty/null response | 0.99 | No (needs retry) |

## BigBoss Commands

```bash
/bigboss chaos inject refusal        # Inject specific attack
/bigboss chaos random                # Random attack
/bigboss chaos round                 # Attack → detect → report
/bigboss chaos campaign output       # Run full pack (20 attacks)
/bigboss chaos campaign memory       # Run memory attacks (10 attacks)
/bigboss chaos campaign agent        # Run agent attacks (8 attacks)
/bigboss chaos campaign provider     # Run provider attacks (8 attacks)
/bigboss chaos status                # Show reliability ledger
/bigboss chaos ledger                # Show attack history
/bigboss chaos reset                 # Reset all ledgers
```

## Chaos Campaign Packs

| pack | attacks | techniques | what it tests |
|---|---|---|---|
| **output** | 20 | refusal×5, truncate×5, null_output×5, hallucinate×5 | LLM response corruption |
| **memory** | 10 | reorder×5, swap_args×5 | Tool call argument tampering |
| **agent** | 8 | delay×5, slow_leak×3 | Process lifecycle stress |
| **provider** | 8 | null_output×5, refusal×3 | API failure simulation |

## Reliability Ledger

Stored at `agent_work/reliability-ledger.json`. Tracks:

```json
{
  "totals": { "attacks": 66, "detected": 45, "repaired": 17, "avgResponseMs": 1 },
  "byTechnique": { "refusal": { "total": 8, "detected": 8, "repaired": 8 } },
  "byPack": { "output": { "detectionRate": 100, "repairRate": 50 } },
  "history": [{ "timestamp": "...", "pack": "output", "total": 20, "detected": 20 }]
}
```

## Tool Registration

```js
// In lib/tools/index.js
registry.register({
  name: 'chaos_campaign',
  description: 'Run a full attack pack against the swarm...',
  execute: async (args) => {
    const cc = require('../chaos-campaign');
    return cc.runCampaign(args.pack || 'output');
  },
});
```

## Known Gaps (2026-06-06)

- **Memory attack detection (0%)** — Neo can't detect reordering or argument swapping yet. Need AST comparison or output diffing.
- **Agent attack detection (38%)** — Delay detection is noisy, memory leak detection requires OS metrics.
- **No runtime integration** — Smith+Neo currently only test output post-processing, not live agent loop injection. Next phase: inject 429s mid-stream, corrupt JSON tool calls, kill worker processes.
- **Single-instance** — Ledger is file-based, not shared across processes. For multi-agent scenarios, needs a centralized store.

## The Reliability Claim

The value isn't tool #109. It's being able to say:

> "We attacked this thing 66 times and it detected 45 of them. Next week it'll be 60. The week after, 70."

That's a much rarer claim than "has 108 tools."
