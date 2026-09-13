## 2024-05-18 - Unauthenticated Headless Browser Proxy
**Vulnerability:** The `/api/playwright` POST endpoint lacked authentication, allowing any unauthenticated user to remotely execute arbitrary code, navigate to arbitrary URLs (SSRF), and extract DOM data via the headless Chromium browser.
**Learning:** Next.js API route proxies that execute system-level or high-privilege operations (like browser remote control) must explicitly include authentication checks (`checkOperator`), as they don't inherit it automatically and can expose local network boundaries and system resources.
**Prevention:** Always verify that state-mutating or operation-triggering Next.js API endpoints (`app/api/**/route.ts`), particularly those acting as gateways or proxies to services, explicitly invoke `checkOperator(req)`.

## 2024-05-18 - Unauthenticated Pipeline Spine Control
**Vulnerability:** The `/api/pipeline` POST endpoint, which acts as a control passthrough to start/stop the backend pipeline, lacked authentication.
**Learning:** The pattern of unauthenticated proxy routes extends beyond remote browser execution and affects internal control planes (like the pipeline spine). All state-mutating Next.js API proxies must be gated with `checkOperator`.
**Prevention:** Ensure all `POST` routes in `app/api/**/route.ts`, especially those proxying requests to internal microservices or ports, explicitly invoke `checkOperator(req)`.
