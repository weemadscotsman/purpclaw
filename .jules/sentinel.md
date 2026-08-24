## 2026-08-24 - [Missing auth on API Mega List endpoint]
**Vulnerability:** The POST endpoint `app/api/api-mega-list/route.ts` was missing authentication, allowing unauthenticated users to trigger arbitrary internal APIs.
**Learning:** Next.js route handlers (`route.ts`) sometimes implement GET operations without authentication by design, but matching POST operations in the same file need careful auditing to ensure they use `checkOperator(req)` when mutating state or triggering internal actions.
**Prevention:** Check all `export async function POST` exports in `app/api/**/route.ts` to ensure they start with `checkOperator` unless explicitly intended to be public.
