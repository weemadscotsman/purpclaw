## 2025-05-18 - Missing Authentication on Mutating API Endpoints
**Vulnerability:** Numerous mutating API endpoints (POST/PUT/DELETE/PATCH) in `app/api/**/route.ts` were missing authentication checks, allowing unauthenticated access to modify data.
**Learning:** Next.js route handlers need explicit authentication logic implemented in each function if a global middleware isn't enforcing it. Relying on developers to manually add `checkOperator(req)` is error-prone and easy to forget.
**Prevention:** Consider implementing Next.js Middleware (`middleware.ts`) to globally enforce authentication on state-changing API routes, falling back to an explicit bypass list rather than an explicit opt-in model.
