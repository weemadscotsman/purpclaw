## 2024-05-18 - [LiveSystemMap Unique Agents Optimization]
**Learning:** React components often perform duplicate expensive calculations (like O(N) deduplication) within multiple `useMemo` blocks if they share a common source but compute different final states.
**Action:** When extracting data from a large collection (like `data.agents`), memoize the intermediate deduplicated list first, then consume that memoized list in downstream `useMemo` blocks to avoid redundant O(N) operations.
