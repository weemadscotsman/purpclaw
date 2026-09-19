## 2024-05-18 - Unauthenticated Headless Browser Proxy
**Vulnerability:** The `/api/playwright` POST endpoint lacked authentication, allowing any unauthenticated user to remotely execute arbitrary code, navigate to arbitrary URLs (SSRF), and extract DOM data via the headless Chromium browser.
**Learning:** Next.js API route proxies that execute system-level or high-privilege operations (like browser remote control) must explicitly include authentication checks (`checkOperator`), as they don't inherit it automatically and can expose local network boundaries and system resources.
**Prevention:** Always verify that state-mutating or operation-triggering Next.js API endpoints (`app/api/**/route.ts`), particularly those acting as gateways or proxies to services, explicitly invoke `checkOperator(req)`.
## 2024-05-24 - Missing Authentication on File Upload Endpoint
**Vulnerability:** The `app/api/upload/route.ts` endpoint allowed unauthenticated users to upload files (up to 50MB) and list recently uploaded files, leading to potential abuse and data leakage.
**Learning:** Some API routes, particularly utility or non-core endpoints like file uploads, may have been missed during the initial implementation of the `checkOperator` authentication guard.
**Prevention:** Ensure all Next.js API endpoints handling state changes, sensitive data, or resource allocation are secured using `checkOperator(req)` by default, unless explicitly intended for public access.
## 2024-05-25 - Unauthenticated OS Command Execution
**Vulnerability:** The `app/api/awaken/start/route.ts` POST endpoint spawned a Node.js process using `child_process.spawn` without authentication, allowing any unauthenticated user to execute arbitrary OS commands and trigger background processes.
**Learning:** Next.js API route that trigger OS-level process execution must include authentication checks (`checkOperator`) to prevent unauthorized access and potential Remote Code Execution (RCE).
**Prevention:** Always verify that API endpoints capable of executing OS commands or spawning processes, particularly in the Next.js framework, explicitly invoke `checkOperator(req)`.
