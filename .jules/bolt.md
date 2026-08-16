# Bolt's Journal - Critical Learnings Only

## 2026-08-16 - Pre-screening regexes in stream-redaction pipelines
**Learning:** Sequential regular expression matching over multiple patterns (e.g. key-value, Bearer, JWT, sk- tokens) introduces substantial overhead when applied to high-throughput log streams or output wrapping. Pre-screening strings with a single cheap heuristic regex (`FAST_SECRET_PRECHECK`) bypasses array iteration and regex matching for >95% of standard non-secret log lines without impacting redaction accuracy.
**Action:** When working on logging, streaming, or redactor utilities that process every console output write, always use a fast pre-check guard before running multi-regex or heavy transformation pipelines.
