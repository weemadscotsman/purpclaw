## 2026-06-29 - React useMemo Overhead
**Learning:** Wrapping trivial operations like `.filter().length` or `.slice()` on typical arrays in `useMemo` is often an anti-pattern. The overhead of memory allocation and dependency tracking in React is often higher than simply re-running the array operation on each render.
**Action:** Only use `useMemo` for genuinely expensive operations, such as iterating over massive datasets, complex derivations, or passing referentially stable arrays to expensive child components.
