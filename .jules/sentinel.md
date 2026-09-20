## 2024-05-18 - Unauthenticated Headless Browser Proxy
**Vulnerability:** The `/api/playwright` POST endpoint lacked authentication, allowing any unauthenticated user to remotely execute arbitrary code, navigate to arbitrary URLs (SSRF), and extract DOM data via the headless Chromium browser.
**Learning:** Next.js API route proxies that execute system-level or high-privilege operations (like browser remote control) must explicitly include authentication checks (`checkOperator`), as they don't inherit it automatically and can expose local network boundaries and system resources.
**Prevention:** Always verify that state-mutating or operation-triggering Next.js API endpoints (`app/api/**/route.ts`), particularly those acting as gateways or proxies to services, explicitly invoke `checkOperator(req)`.
## 2024-05-24 - Missing Authentication on File Upload Endpoint
**Vulnerability:** The `app/api/upload/route.ts` endpoint allowed unauthenticated users to upload files (up to 50MB) and list recently uploaded files, leading to potential abuse and data leakage.
**Learning:** Some API routes, particularly utility or non-core endpoints like file uploads, may have been missed during the initial implementation of the `checkOperator` authentication guard.
**Prevention:** Ensure all Next.js API endpoints handling state changes, sensitive data, or resource allocation are secured using `checkOperator(req)` by default, unless explicitly intended for public access.
## 2025-02-23 - Missing Operator Auth on Config Route
**Vulnerability:** The `/api/setup` endpoint allowed unauthenticated `POST` requests to modify the `.env` file, potentially exposing secrets or injecting arbitrary environment variables, allowing account takeover.
**Learning:** Next.js API routes (especially `route.ts`) are completely exposed by default, and developers might forget to protect ones not initially seen as dangerous, but rewriting environment variables is a major RCE risk. Even though `KEY_CATALOG` restricted it, overwriting `LLM_API_KEY` or `GITHUB_TOKEN` could be catastrophic.
**Prevention:** Always enforce a centralized auth middleware or strictly apply `checkOperator(req)` at the top of every state-modifying function (`POST`, `PATCH`, `DELETE`) in `app/api/**/route.ts` unless it is explicitly an unauthenticated flow like login.
