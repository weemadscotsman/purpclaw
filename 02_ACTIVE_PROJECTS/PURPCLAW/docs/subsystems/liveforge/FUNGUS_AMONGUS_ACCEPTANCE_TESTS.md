# Fungus Amongus Acceptance Tests

Command:

```bash
node scripts/fungus-amongus-smoke.js
```

Checks:
1. Health creates writable `.purpclaw/mycelium` stores.
2. Valid spore writes with proof, scope, confidence, expiry, and risk.
3. Spore without proof rejects and writes a red receipt.
4. Nutrient bundle returns only in-scope, non-expired spores.
5. Private/named-recipient spore is redacted for unauthorized requester.
6. Contradicting spore creates a contradiction warning receipt.
7. Known failure warning is returned for matching query.
8. Low-risk repeated win can promote to colony pattern after replay.
9. High-risk pattern promotion without replay is blocked.
