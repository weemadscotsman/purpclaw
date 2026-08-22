## 2024-05-24 - Missing Operator Auth on Mutating Next.js API Routes
**Vulnerability:** Many Next.js API `POST`/`PUT`/`PATCH`/`DELETE` endpoints (like `/api/upload/route.ts`) are missing operator authentication, allowing unauthenticated file uploads and state modification.
**Learning:** Next.js endpoints in `app/api/**/route.ts` must manually apply `checkOperator(req)` to protect mutating actions. Next.js doesn't inherently apply global auth guards for these specific routes in this architecture.
**Prevention:** Every mutating endpoint must import and invoke `const auth = checkOperator(req); if (!auth.ok && 'response' in auth) return auth.response;` from `app/api/_lib/operator-auth` before proceeding with its logic.
