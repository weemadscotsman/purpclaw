1. **Create Journal Entry**
   - Create `.jules/bolt.md` (as it doesn't exist) and add an entry about using `WeakMap` to memoize expensive O(N) deduplication passes across disjoint/unrelated components to avoid prop-drilling.
2. **Optimize `MissionControl.tsx`**
   - Add a `WeakMap` cache to `getUniqueAgents` in `app/components/MissionControl.tsx` to memoize the array processing by its object reference. This prevents up to 8 redundant O(N) iterations per render cycle across different components.
3. **Optimize `LiveSystemMap.tsx`**
   - Add a `WeakMap` cache to `uniqueAgents` in `app/components/LiveSystemMap.tsx`.
   - Update the `counts` `useMemo` block to only call `uniqueAgents` once instead of twice.
4. **Run type checks and system tests**
   - Run `pnpm tsc --noEmit` to verify type safety.
   - Run `pnpm smoke` to ensure system health and no regressions.
   - Run `npx prettier --write app/components/MissionControl.tsx app/components/LiveSystemMap.tsx` to format the code.
5. **Complete pre-commit verification**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
6. **Submit PR**
   - Submit the PR with title "⚡ Bolt: [performance improvement]" and required description format.
