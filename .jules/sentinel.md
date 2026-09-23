## 2024-05-18 - Unauthenticated Headless Browser Proxy
**Vulnerability:** The `/api/playwright` POST endpoint lacked authentication, allowing any unauthenticated user to remotely execute arbitrary code, navigate to arbitrary URLs (SSRF), and extract DOM data via the headless Chromium browser.
**Learning:** Next.js API route proxies that execute system-level or high-privilege operations (like browser remote control) must explicitly include authentication checks (`checkOperator`), as they don't inherit it automatically and can expose local network boundaries and system resources.
**Prevention:** Always verify that state-mutating or operation-triggering Next.js API endpoints (`app/api/**/route.ts`), particularly those acting as gateways or proxies to services, explicitly invoke `checkOperator(req)`.
## 2024-05-24 - Missing Authentication on File Upload Endpoint
**Vulnerability:** The `app/api/upload/route.ts` endpoint allowed unauthenticated users to upload files (up to 50MB) and list recently uploaded files, leading to potential abuse and data leakage.
**Learning:** Some API routes, particularly utility or non-core endpoints like file uploads, may have been missed during the initial implementation of the `checkOperator` authentication guard.
**Prevention:** Ensure all Next.js API endpoints handling state changes, sensitive data, or resource allocation are secured using `checkOperator(req)` by default, unless explicitly intended for public access.
## 2026-09-23 - Unauthenticated Internal Proxy (SSRF)
**Vulnerability:** The `app/api/service-proxy/route.ts` endpoint acts as a gateway to internal services on specific ports but lacked any authentication check, allowing external actors to bypass perimeter security and issue arbitrary requests to internal backend services.
**Learning:** Even if an endpoint only forwards to an "allowed ports" list or the local loopback (127.0.0.1), if it is accessible externally, it exposes the internal network surface area. Next.js API routes that proxy requests must still implement boundary authentication like `checkOperator`.
**Prevention:** Apply `checkOperator(req)` globally to all custom proxy routes in Next.js, and ideally, move internal orchestration routing strictly to server-side code rather than exposing proxy utilities to the client.
