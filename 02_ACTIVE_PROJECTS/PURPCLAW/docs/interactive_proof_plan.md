# Interactive Proof Upgrade Plan

## Goal
Add live, verifiable instrumentation to the PurpClaw UI and marketing site so visitors see real‑time system state instead of static claims.

## Workstream (4 weeks)

### Week 1 – Data sources & API
- Hook the existing health endpoints (`/health`, `/cognitive/health`, `/spine-health`) into a new **/status** JSON API that returns:
  - Total agents (online/idle/failed)
  - Tool pool counts (busy/idle/failed)
  - LLM provider health & request latency
  - Token‑savings stats from OmniCode (`token_savings_stats`)
- Add a thin Express router at `app/api/status/route.ts` that aggregates these calls (use async `Promise.all`).
- Write unit tests (`tests/api/status.test.ts`).

### Week 2 – Front‑end components
- Create React components in `app/components/LiveStatsCard.tsx` that fetch `/api/status` and render:
  - **Agents** `152 (125 online, 27 idle)`
  - **Tools** `500+ (487 idle, 13 busy)`
  - **LLM providers** health badges with latency meter.
- Add a **LiveHealthBar** that shows overall health traffic light (green/amber/red) based on aggregated status.
- Wire the components into the homepage (`app/page.tsx`) and the System Map page.
- Ensure SSR fallback so SEO still sees static placeholders.

### Week 3 – Interactive demos
- Build a small demo page `app/demo/agents.tsx` that visualises agents as nodes; clicking a node opens a pop‑over with live metrics (CPU, memory, last job).
- Integrate the existing `ServiceHealthGrid` to display live service tiles.
- Add a **“Run a live health check”** button that triggers a fetch to `/api/health` and displays the raw JSON in a modal.

### Week 4 – Deploy & polish
- Update `next.config.ts` to expose the new API route on production.
- Add caching headers (1 s) to avoid hammering the backend.
- Write a short **“How it works”** modal explaining the data sources (OmniCode, Cognitive Spine, HMAC pool).
- Update the marketing copy in `app/page.tsx` to reference the live numbers (e.g., "500+ tools (487 idle, 13 busy)") using the fetched data.
- Run end‑to‑end smoke test (`npm run test`) and verify no regressions.

## Deliverables
- New `/api/status` endpoint.
- React components `LiveStatsCard`, `LiveHealthBar`, `AgentGraph`.
- Updated homepage and System Map with live numbers.
- Documentation in `docs/interactive_proof_plan.md`.
- Test coverage ≥ 80 % for the new API.

## Success criteria
- Visitors see **real numbers** rather than static claims.
- The health dashboard updates every 5 seconds without page reload.
- SEO still indexes the page (SSR fallback values are present).
- Internal telemetry shows the new endpoint serving < 200 ms per request.

---
*This plan follows the “proof before claim” rule and provides concrete instrumentation to turn the static capability matrix into a live, trustworthy showcase.*