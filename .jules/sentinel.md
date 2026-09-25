## 2024-05-18 - Unauthenticated Headless Browser Proxy
**Vulnerability:** The `/api/playwright` POST endpoint lacked authentication, allowing any unauthenticated user to remotely execute arbitrary code, navigate to arbitrary URLs (SSRF), and extract DOM data via the headless Chromium browser.
**Learning:** Next.js API route proxies that execute system-level or high-privilege operations (like browser remote control) must explicitly include authentication checks (`checkOperator`), as they don't inherit it automatically and can expose local network boundaries and system resources.
**Prevention:** Always verify that state-mutating or operation-triggering Next.js API endpoints (`app/api/**/route.ts`), particularly those acting as gateways or proxies to services, explicitly invoke `checkOperator(req)`.
## 2024-05-24 - Missing Authentication on File Upload Endpoint
**Vulnerability:** The `app/api/upload/route.ts` endpoint allowed unauthenticated users to upload files (up to 50MB) and list recently uploaded files, leading to potential abuse and data leakage.
**Learning:** Some API routes, particularly utility or non-core endpoints like file uploads, may have been missed during the initial implementation of the `checkOperator` authentication guard.
**Prevention:** Ensure all Next.js API endpoints handling state changes, sensitive data, or resource allocation are secured using `checkOperator(req)` by default, unless explicitly intended for public access.

## 2024-05-28 - SSRF Vulnerability in Service Proxy
**Vulnerability:** The `/api/service-proxy` endpoint allowed unauthenticated requests to proxy traffic to internal ports defined in an `ALLOWED_PORTS` list. Without operator authentication, this creates an SSRF (Server-Side Request Forgery) vulnerability, permitting external bypass of network isolation to access internal APIs or loopback interfaces.
**Learning:** Even when proxies restrict target ports/hosts (e.g., localhost and specific ports), they must explicitly enforce standard authentication (`checkOperator(req)`) for state-changing or internally-routed requests. Port-whitelisting is insufficient protection against SSRF and bypass attacks.
**Prevention:** Always implement explicit authentication on proxy/gateway endpoints that route traffic to internal networks, regardless of domain or port restrictions.
