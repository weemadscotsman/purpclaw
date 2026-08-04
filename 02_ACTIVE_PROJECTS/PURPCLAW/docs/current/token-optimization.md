# Context and Cost Optimization

Last updated: 2026-07-20.

- Keep default prompt tools narrow and discover specialized tools on demand.
- Search/index before reading large files in full.
- Preserve decisions, constraints, evidence, and open work during compaction.
- Use isolated child sessions for bounded research, with concurrency capped.
- Configure provider and usage budgets explicitly; adapter presence is not free quota.
- Prefer local providers only when their measured quality/latency fits the task.
- Record token, latency, and result quality in parity benchmarks.

PurpClaw compacts context automatically, but semantic preservation still requires
behavioral verification. Do not tune by copying Claude Code environment variables;
use PurpClaw's own provider, usage-governor, and session configuration.
