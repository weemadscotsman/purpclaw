## 2024-10-24 - Missing Authentication on File Uploads
**Vulnerability:** The `/api/upload` endpoint allowed unauthenticated, arbitrary file uploads to the server because it missed the `checkOperator(req)` guard.
**Learning:** Even though Next.js API endpoints are inside the `app/api` directory, they must manually enforce the authentication strategy (`checkOperator`) for sensitive actions like file operations to prevent abuse.
**Prevention:** Verify `checkOperator` is used on endpoints that write to the filesystem. When fixing security issues, scope changes to the most critical endpoint instead of applying global patches that might inadvertently break endpoints like `/api/whoami` (which needs to be public to set the authentication cookie).
