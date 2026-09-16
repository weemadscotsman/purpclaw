## 2026-06-25 - Shell Command Injection in raw exec
**Vulnerability:** Raw `exec('taskkill /F /PID ' + pid)` in `lib/mallory/index.js` allowed potential command injection, bypassing governance guardrails.
**Learning:** This repository has a dedicated standard for process execution (`lib/child-registry.js`) that safely handles timeouts, tracks processes, avoids leaking cmd windows, and mitigates shell injection. Raw `exec` usage violates this pattern.
**Prevention:** Always use `execSafe` or `trackedSpawn` from `lib/child-registry.js` instead of raw `child_process.exec`.
