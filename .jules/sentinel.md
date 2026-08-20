## 2026-07-02 - [Playwright RCE/SSRF Prevention]
**Vulnerability:** Unauthenticated access to `app/api/playwright/route.ts` permitted arbitrary browser commands, including RCE and SSRF.
**Learning:** Next.js API routes with high-privilege operations (like headless browser control) were exposed because they lacked the standard `checkOperator` and `checkRateLimit` guardrails.
**Prevention:** Always mandate `checkOperator(req)` and `checkRateLimit(req, ...)` at the start of both `GET` and `POST` handlers for sensitive API routes.
