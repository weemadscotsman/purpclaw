## 2025-05-24 - Cache Disjoint Component Computations using WeakMap
**Learning:** In highly componentized React architectures without a unified global context for derived data, identical O(N) deduplication computations on a shared array reference (e.g., `data.agents`) can occur repeatedly across separate subtree renders.
**Action:** Always consider using a module-level `WeakMap` keyed by the raw object reference to cache identical calculations instead of falling back to repeated `Array.filter` or `Array.map` across disparate components.
