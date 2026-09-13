## 2024-05-14 - Initializations
**Learning:** Found some issues.
**Action:** Need to fix.

## 2024-05-14 - Redundant array iterations in LiveSystemMap
**Learning:** The LiveSystemMap component was recalculating `uniqueAgents(data.agents)` multiple times across different `useMemo` blocks (graph generation and counts generation). This caused unnecessary O(N) deduplication passes on every prop update.
**Action:** Memoize the result of `uniqueAgents` in a separate `useMemo` block first, and reuse that memoized value in downstream hooks, avoiding duplicate computational work.
