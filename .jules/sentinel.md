## 2026-07-02 - Identity Spoofing in whoami route
**Vulnerability:** The `/api/whoami` POST route accepted unauthenticated requests to set a user's name, granting 'founder' status if the name was 'ted' or 'eddie'.
**Learning:** Routes intended for operator identification or role assignment were missing `checkOperator()` checks, making them vulnerable to arbitrary identity claim attacks via CSRF or direct local network access.
**Prevention:** Always apply `checkOperator()` to mutating Next.js API routes (POST, PUT, DELETE, PATCH), especially those handling identity and session cookies, even in local-first deployments to mitigate CSRF and local network attacker risks.
