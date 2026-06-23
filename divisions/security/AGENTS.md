# divisions/security/AGENTS.md

## Security Division

Monitors threats, enforces permissions, and ensures PURPCLAW's operational integrity.

### Keywords
`threat`, `scan`, `watch`, `permissions`, `gates`, `auth`, `secret`, `redact`, `sanitise`, `audit`, `sandbox`, `firewall`

### Agents

| Agent | Role | Skill |
|---|---|---|
| shark | Threat detection and adversarial scan | skills/debugging.md |
| spider | Audit trail and log analysis | skills/debugging.md |
| hawk | Real-time monitoring and alerting | skills/routing.md |
| security-reviewer | Code and dependency security audit | skills/debugging.md |

### Routing
- "threat" / "adversarial" / "attack" → shark
- "audit" / "logs" / "trail" → spider
- "monitor" / "watch" / "alert" → hawk
- "secret" / "key" / "token" / "credential" → security-reviewer

### Tools
- `lib/smith-neo.js` — chaos injector (Smith) + stabilizer (Neo)
- `lib/secret-redactor.js` — credential redaction
- `lib/spaghetti-audit.js` — dependency audit

### Services Used
- Gatekeeper (port 7791) — permission enforcement
- Metrics Aggregator (port 7890) — monitoring
- EventBus (port 7782) — alert publishing

### Pickup
When user says "pickup" → read `memory/pickup-security.md`

### Handoff
When user says "handoff" → write `memory/handoff-security.md`

---

*Security Division — built 2026-06-19*
