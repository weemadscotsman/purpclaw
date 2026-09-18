## 2024-05-18 - Unauthenticated Headless Browser Proxy
**Vulnerability:** The `/api/playwright` POST endpoint lacked authentication, allowing any unauthenticated user to remotely execute arbitrary code, navigate to arbitrary URLs (SSRF), and extract DOM data via the headless Chromium browser.
**Learning:** Next.js API route proxies that execute system-level or high-privilege operations (like browser remote control) must explicitly include authentication checks (`checkOperator`), as they don't inherit it automatically and can expose local network boundaries and system resources.
**Prevention:** Always verify that state-mutating or operation-triggering Next.js API endpoints (`app/api/**/route.ts`), particularly those acting as gateways or proxies to services, explicitly invoke `checkOperator(req)`.
## 2024-05-24 - Missing Authentication on File Upload Endpoint
**Vulnerability:** The `app/api/upload/route.ts` endpoint allowed unauthenticated users to upload files (up to 50MB) and list recently uploaded files, leading to potential abuse and data leakage.
**Learning:** Some API routes, particularly utility or non-core endpoints like file uploads, may have been missed during the initial implementation of the `checkOperator` authentication guard.
**Prevention:** Ensure all Next.js API endpoints handling state changes, sensitive data, or resource allocation are secured using `checkOperator(req)` by default, unless explicitly intended for public access.
## 2024-06-25 - Missing Authentication on API Mega List endpoint
**Vulnerability:** The `app/api/api-mega-list/route.ts` endpoint allowed unauthenticated users to trigger arbitrary remote operations by POSTing a payload specifying an API category and name, essentially creating a wide-open unauthenticated execution proxy to various internal operations.
**Learning:** Similar to Playwright or upload routes, proxy or "gateway" endpoints that relay requests into deeper protected internal components or other arbitrary services require explicit invocation of `checkOperator(req)` on mutating actions.
**Prevention:** In Next.js App Router, ensure all POST/PUT/DELETE handler functions in API routes have `checkOperator(req)` explicitly called to block unauthorized access, unless specifically designed to be public.
