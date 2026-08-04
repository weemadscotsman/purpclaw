# Wave 1 Campaign Governance

This is a Wave 1 entry point, not an independent model or reasoning policy.

- Canonical parity authority: [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](CANONICAL_PARITY_PRIORITY.md)
- Binding resource policy: [`docs/AGENT_RESOURCE_POLICY.md`](../AGENT_RESOURCE_POLICY.md)
- Append-only allocation and escalation ledger: [`.purpclaw/CAMPAIGN_STATE.md`](../../.purpclaw/CAMPAIGN_STATE.md)
- Master goal: [`docs/parity/WAVE1_MASTER_GOAL.md`](WAVE1_MASTER_GOAL.md)

Every builder and critic prompt must include the applicable `RESOURCE BUDGET`
block from the binding policy. Child agents do not inherit the parent agent's
reasoning mode. The chief rejects allocations stronger than the task requires.

Delivery sequence:

`CHIEF -> BUILDER -> BLIND CRITIC -> repeat until passing -> INTEGRATION OWNER -> FINAL CONFORMANCE CRITIC -> SHIP OR RETURN`
