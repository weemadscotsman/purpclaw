<!--
  ═══════════════════════════════════════════════════════════════════════════
  PURPCLAW Pull Request Template
  ═══════════════════════════════════════════════════════════════════════════
  CACTUS-grade review checklist — minimal yes/no gate so reviewers don't
  have to think. Fill out EVERY section. Check boxes that apply.
  ═══════════════════════════════════════════════════════════════════════════
-->

## Summary

<!-- One or two sentences. What changed and WHY. -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds capability)
- [ ] Breaking change (existing functionality changes behavior)
- [ ] Infrastructure / build / deploy only
- [ ] Documentation only

## Scope

<!-- Which agent division owns this file? Check one. -->

- [ ] 🌵 **CACTUS** — infrastructure: `Dockerfile`, `docker-compose*`, `.github/`, `infra/`, `deploy/`, `scripts/`, `*.sh`, `.env*`, `config.*`
- [ ] 🦎 **AXOLOTL** — runtime: `api/`, `server.*`, `routes/`, `controllers/`, `services/`, `models/`, `schema`, `migrations/`, `handlers/`, `middleware/`
- [ ] 🛡  **GUARDIAN** — security domain: `auth/`, `security/`, `permissions/`, `tokens/`, `secrets/`, `credentials/`
- [ ] 🍄 **MUSHROOM** — frontend: `components/`, `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `pages/`, `views/`, `layouts/`, `ui/`, `app/`
- [ ] 🤖 **ROBOT** — hardware / physical
- [ ] 🦏 **CHONK** — perf / queue / cache
- [ ] 🦅 **HAWK** — observability / monitoring
- [ ] 🐇 **RABBIT** — tests: `*.test.*`, `*.spec.*`, `__tests__/`, `e2e/`, `tests/`, `fixtures/`
- [ ] 🔀 **Cross-division** (multiple agents — explain in summary)

## Security checklist

<!-- CACTUS requires ALL of these. If any box is unchecked, justify below. -->

- [ ] No secrets, tokens, API keys, or credentials are committed (verify with `bash scripts/security-audit.sh`)
- [ ] No new environment variables added without updating `.env.example`
- [ ] No new service ports exposed without updating `infra/hardening/network.md`
- [ ] No new shell scripts added without review for `set -e`, input quoting, and path traversal
- [ ] No `child_process.exec` / `eval` / `new Function` introduced (or scoped + reviewed)
- [ ] No new external HTTP calls without URL allowlist reasoning
- [ ] Dependencies added are from trusted registries and pinned (`package-lock.json` updated)
- [ ] `npm run lint` passes
- [ ] `bash scripts/security-audit.sh` passes locally
- [ ] `bash scripts/verify-env.sh --ci` passes

## Resource impact (CACTUS-only PRs)

<!-- Fill out if this PR adds infra, deploy, scripts, or config. -->

- Memory footprint change: **+?MB / -?MB / 0**
- CPU idle change: **+% / -% / 0**
- Disk footprint change: **+?MB / -?MB / 0**
- New dependencies introduced: **list them**
- New external network calls: **list URLs**
- Idempotent on re-run? (deploy scripts) **yes / no**

## Testing

<!-- CACTUS is not rabbit — we don't run full test suites. But verify what we DO have. -->

- [ ] `bash scripts/security-audit.sh` runs clean
- [ ] `bash scripts/verify-env.sh` runs clean
- [ ] `bash scripts/deploy-checklist.sh` runs clean (if deploy-affecting)
- [ ] Manual smoke: describe the steps you ran to verify this works
- [ ] `npm run build` succeeds (if frontend/build-affecting)

## Screenshots / logs

<!-- Optional. Especially useful for deploy or CI changes. -->

```
$ bash scripts/security-audit.sh
✓ gitleaks — no secrets
✓ npm audit — 0 high/critical
✓ port exposure — only expected ports
✓ shell scripts — all use set -e
✓ file perms — .env is 0600
PASS — 5/5 checks
```

## Migration / rollback

<!-- Required for deploy / config changes. What does the operator do? -->

- **Apply:**
- **Rollback:**
- **Downtime required:** yes / no

## Related issues

<!-- Link issues, PRs, swarm missions. Auto-close keywords OK. -->

Closes #
Refs #
