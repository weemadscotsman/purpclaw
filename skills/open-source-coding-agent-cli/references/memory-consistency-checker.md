# Memory Consistency Checker Pattern

Built during the v0.1.0 sticky-finger audit. One tool, one job: scan memory for inconsistencies.
Does NOT auto-delete or auto-fix — only detects and reports.

## Architecture

`lib/memory-consistency.js` — standalone module, registered as `memory_check` tool.

## 5 Checks

| Check | Detection | Pattern |
|---|---|---|
| duplicate facts | same subject+predicate+object repeated | `fuzzyMatch(normalize(a), normalize(b))` |
| contradictions | same subject, opposite state (online↔offline etc.) | regex pattern pairs (online/offline, success/failure, enable/disable) |
| self-reference loops | memory references its own ID | literal ID match + circular phrase detection |
| temporal flips | state changes too fast (<5s online→offline→online) | timestamp-ordered state transition tracking |
| confidence clashes | low-confidence (0.3) overriding high-confidence (0.95) | per-subject confidence comparison |

## Neo Behavior

1. Detect — run `mc.check()` on memory
2. Quarantine if critical — `fact.quarantined = true` (never delete)
3. Write to reliability ledger — `agent_work/reliability-ledger.json`
4. Ask for verification — route to auditor
5. Only promote after confirmation

## Integration Points

- Tool: `memory_check` (registered in lib/tools/index.js)
- BigBoss: `/bigboss chaos memory` → runs mc.check(), returns findings
- Neo: stabilization pipeline now includes memory check after each chaos campaign

## Output Shape

```json
{
  "ok": false,
  "facts_scanned": 7,
  "findings": [
    {
      "severity": "critical",
      "type": "contradiction",
      "affected": [0, 2],
      "reason": "online ↔ offline: fact #0 \"online\" vs fact #2 \"offline\"",
      "suggested_action": "verify"
    }
  ],
  "summary": "3 findings · 1 critical · 1 high"
}
```

## Raccoon Test Results

Synthetic test with 7 facts: all 5 checks caught injected corruption:
- duplicates: 3 found
- contradictions: 5 found
- self-ref: 1 found
- temporal flips: 1 found
- confidence clashes: 1 found

## Pitfalls

1. **Memory file may be sparse** — the system doesn't aggressively write to memory.jsonl. Real scans may show 1-100 facts, not thousands. The checker handles empty state gracefully (`facts_scanned: 0, findings: 0`).
2. **Contradiction rules are regex-based** — only catches literal opposites (online/offline, success/failure). Subtle contradictions (e.g. "healthy but degraded" vs "healthy") won't match. Consider adding fuzzy/embedding-based comparison for complex cases.
3. **Self-reference only catches literal ID matches** — if a fact references itself by a generated UUID that differs from the stored ID field, it won't be caught. Circular chains (A→B→A) not yet detected.
