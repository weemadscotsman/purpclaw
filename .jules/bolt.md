## 2024-05-15 - Bolt's Journal
**Learning:** Found several React components doing array filtering/sorting in the render body.
**Action:** Always check React components for expensive array operations (filter, sort, map on large datasets) without memoization and wrap them in useMemo to prevent unnecessary recalculations on every render.
**Learning:** The Typescript codebase throws a lot of unrelated errors and the local environment is missing some modules that cause compilation errors, but I should ignore it since no type/logic regression is introduced in my scope.
