# 🐢 TURTLE — PURPCLAW Pre-Flight Checklist

> **Author:** Turtle (Quality Engineer, Defense & Resilience Division)
> **Purpose:** Single linear operator checklist executed top-to-bottom before any production deployment, cutover, or high-risk change to a PURPCLAW node.
> **Rule of engagement:** Every box must be checked, every pass criterion must be **objectively true**. If a step fails or is uncertain, **STOP** — do not proceed. Open a rollback ticket. No exceptions.
> **Tier:** This checklist is mandatory for **Tier 1** and **Tier 2** operations. Tier 3 may abbreviate Phases 4-7 at operator discretion.

---

## 0 · Pre-Flight Identity (run BEFORE you start Phase 1)

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 0.1 | Read this checklist top-to-bottom once | Mental model of all 8 phases | Operator can verbally summarize all 8 phases in <60s |
| 0.2 | Identify the **change ticket / RFC** ID | Ticket ID written at top of the deployment log | Ticket exists in tracker, is in `Approved` status, not `Draft` |
| 0.3 | Identify the **Change Owner** and **On-Call** | Two names + contacts in the log | Both are reachable (pinged within last 5 min) |
| 0.4 | Confirm **change window** | Window start/end time recorded | Window is within approved window, no conflicting freeze/blackout |
| 0.5 | Confirm **blast radius** | List of systems/services affected | All affected services have an owner on the bridge or reachable |

---

## 1 · Identity & Access Verification

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 1.1 | Operator identity verified (MFA + SSO) | SSO session shows full name + role | `whoami` / SSO token claims `role=deployer` and `mfa=true` |
| 1.2 | Deployer role granted for target environment | `authz-check env=<env>` returns `granted` | Output is exactly `granted` — no `partial`, no warnings |
| 1.3 | Secrets manager access verified (1Password / Vault) | Secret read for `service/<name>/<env>` returns non-empty | Secret value parses as expected; TTL not within 24h of expiry |
| 1.4 | No shared / break-glass credentials in use | `env` and config files contain no plaintext keys | `grep` of repo + env for high-entropy strings returns no hits outside `.gitignore`d paths |
| 1.5 | SSH / RDP to all target hosts succeeds | Login banner + last login timestamp displayed | Last login is **not** from an unknown IP (compare to known list) |
| 1.6 | Privileged Access Management (PAM) session opened | PAM session ID recorded in log | Session is time-boxed; expiry ≤ 4h from now |

---

## 2 · Infrastructure Provisioned

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 2.1 | Target hosts exist and are reachable | `ping` / TCP probe returns 200/OK on all expected ports | All hosts in inventory respond within RTT budget (LAN <5ms, WAN <150ms) |
| 2.2 | Compute / VM / container resources allocated | `nproc`, `free -h`, `nvidia-smi` (if GPU) match spec sheet | All values ≥ spec; no degraded mode flags |
| 2.3 | Storage volumes mounted and writable | `df -h` shows expected mounts with expected sizes | Free space ≥ 25% of volume capacity on every volume |
| 2.4 | Network paths validated (DNS, NTP, egress) | `nslookup`, `ntpq -p`, `curl -I https://api.example.com` all succeed | DNS resolves in <50ms, NTP offset <250ms, egress returns 2xx/3xx |
| 2.5 | TLS certificates valid on all endpoints | `openssl s_client -connect host:443` shows cert with future expiry | All certs valid for ≥ 14 days; no chain errors |
| 2.6 | Firewall / security group rules permit required flows | `nc -zv` between every source/dest pair succeeds | All required flows open; no unexpected 0.0.0.0/0 rules added |
| 2.7 | Redundancy verified for Tier 1 — at least 2 healthy replicas/sites | Health check on 2+ independent sites returns `healthy` | Both sites pass; auto-failover has been tested within last 30 days |
| 2.8 | Cryptographic baseline captured **before** change | SHA-256 manifest of critical binaries/configs saved to `baselines/<ticket>-<ts>.sha256` | Manifest exists, signed with operator key, stored in immutable bucket |

---

## 3 · Environment Variables & Configuration Loaded

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 3.1 | `.env` / config file sourced or rendered | `printenv | grep <APP_PREFIX>` shows all required keys | All required keys present, no `undefined` or `null` values |
| 3.2 | Secrets injected from manager, not baked into image | Image scan reports 0 hardcoded secrets | `trivy`/`grype`/`gitleaks` returns 0 critical/high findings |
| 3.3 | Feature flags / toggles set to expected state | `flag-list` output matches change ticket | Every flag diffed against pre-change state; changes documented |
| 3.4 | Config drift check vs last known-good | Diff report shows only intended changes | Diff contains **only** lines associated with this ticket |
| 3.5 | Log level set appropriately (INFO in prod, DEBUG only if investigating) | `LOG_LEVEL` env var matches policy | Value is in approved set; DEBUG requires incident ticket attached |
| 3.6 | Timezone, locale, region settings match region policy | `date`, `locale` outputs match spec | TZ matches target region; no `UTC` mismatch warnings |
| 3.7 | Config checksum pinned in deploy manifest | `sha256sum config.*` matches pin in manifest | Hashes identical — pin is authoritative |

---

## 4 · Services Started

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 4.1 | Service definitions present (systemd / PM2 / k8s manifests) | `pm2 ls` / `kubectl get deploy` shows expected units | All units present in expected state (`online` / `Running`) |
| 4.2 | Services started in correct dependency order | Startup log shows ordered init with no retries | Zero `retry`, `backoff`, or `dependency not ready` entries in last start |
| 4.3 | Service health endpoints respond | `curl /healthz` returns `200 {"status":"ok"}` | All services return 200 within 10s of start |
| 4.4 | Process count and resource usage within bounds | `ps`, `top`, `systemctl status` show expected | No OOM kills, no `restart=high` in last 5 min, CPU <80% sustained |
| 4.5 | Port bindings match inventory | `ss -tlnp` shows expected ports only | No unexpected ports open; no `0.0.0.0` bindings on sensitive ports |
| 4.6 | Background workers / queues connected | Worker pool reports `connected` to broker | Connection count matches expected workers; no `reconnecting` state |
| 4.7 | Database migrations applied (if any) | `migrate status` returns `up to date` | DB schema version matches expected; no failed migrations |
| 4.8 | Service logs flowing to central SIEM | SIEM search for service tag returns recent entries | Events from last 60s present; no `log shipper` errors |

---

## 5 · Smoke Test — GREEN

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 5.1 | Synthetic happy-path transaction succeeds end-to-end | Smoke test script returns exit code 0 | Latency p95 ≤ SLO budget; no 5xx; response body matches schema |
| 5.2 | Auth flow works (login → token → protected call) | Valid token grants access; bad token gets 401 | All 3 cases (valid, expired, invalid) return expected codes |
| 5.3 | One **negative test** executed (expected failure path) | e.g. malformed input returns 400, not 500 | Service handles invalid input gracefully; no stack traces leaked |
| 5.4 | Dependency health — downstream services reachable | All downstream `/healthz` checks return 200 | 100% of declared dependencies pass; latency p99 < 2× p50 |
| 5.5 | Data round-trip — write then read returns same value | Cached/fetched record equals written record | Hash or value comparison passes byte-for-byte |
| 5.6 | Error rate on smoke endpoints is 0% | Metrics dashboard shows 0 errors in last 5 min | No 4xx (except deliberate 401/400 from 5.3), no 5xx |
| 5.7 | No new alerts fired during smoke | Alertmanager / PagerDuty shows no new incidents for this service | Quiet window of at least 5 min post-start |

---

## 6 · Rollback Plan Confirmed

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 6.1 | Previous version artifacts / container images still available | Registry/artifact store lists `previous` and `current` tags | Both tags present and pullable; `previous` is the exact prior version |
| 6.2 | Database / state backup taken **before** change | Backup ID recorded, restore-tested (sample row) | Restore drill completed within last 24h for this DB; backup not corrupted |
| 6.3 | Rollback command(s) rehearsed (dry-run) | Dry-run output shows correct target state | Dry-run completes in <60s; output reviewed by 2nd operator |
| 6.4 | Rollback time estimate known and within RTO | Documented ETA = `X minutes` | ETA ≤ Tier RTO budget (Tier 1: 30s, Tier 2: 5m, Tier 3: 24h) |
| 6.5 | Rollback owner identified | Name + contact in deployment log | Owner is **not** the same person as the deployer (separation of duties) |
| 6.6 | Rollback trigger criteria explicitly written | List of conditions (e.g. `error_rate > 2% for 5m`) | All criteria are **measurable**; not subjective |
| 6.7 | Negative test of rollback path (where safe) | Rollback rehearsed against staging or canary | Staging rollback completes successfully end-to-end |

---

## 7 · Monitoring & Alerts Armed

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 7.1 | Dashboards updated to include new service/version | Grafana/Datadog panel shows new release marker | Panel renders; data flowing from new instance within 5 min |
| 7.2 | SLO/SLI metrics active (latency, error rate, saturation, traffic) | All 4 golden signals reporting | All 4 present in last 5 min; no `no data` gaps |
| 7.3 | Alert rules updated for new thresholds | Alertmanager shows new/changed rules | Rules loaded; test notification to PagerDuty/Slack succeeds |
| 7.4 | On-call rotation aware of change | On-call acknowledges in #deploys channel | Acknowledgment timestamped within 5 min of deploy start |
| 7.5 | Synthetic monitoring / canary probes running | External probe reports `passing` | Probe passing for at least 10 min post-deploy |
| 7.6 | Log-based alerts for known failure modes armed | Search alerts in SIEM return active results | At least 3 critical alerts active and routing correctly |
| 7.7 | Cost/billing guardrails in place (no runaway spend) | Billing alert threshold set with margin | Alert set at ≤ 80% of approved budget for this change |
| 7.8 | Runbook linked in alert payloads | Clicking alert notification opens runbook | Runbook URL resolves; steps are current (reviewed within 90 days) |

---

## 8 · Owner Sign-Off

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 8.1 | All prior phases (1–7) marked complete with no unresolved blockers | Phases 1–7 every box is `[x]` | Zero unchecked boxes; zero `FAIL` notes |
| 8.2 | Post-deploy watch period defined | Watch duration + escalation criteria documented | Duration ≥ 2× RTO budget; criteria are quantitative |
| 8.3 | **Change Owner** signs off | Owner name, signature/initial, timestamp | Sign-off recorded in deploy log with `PASS` or `PROCEED WITH WATCH` |
| 8.4 | **Independent reviewer** signs off (4-eyes principle) | 2nd person initials + timestamp | Reviewer is not the deployer; reviewer's name differs from 8.3 |
| 8.5 | On-call acknowledges handoff into watch period | On-calls name + time of acceptance | Acceptance timestamp > sign-off time; < sign-off time + 5 min |
| 8.6 | Deploy log archived to immutable storage | Archive path + checksum recorded | Path under `archives/<ticket>/<ts>/`; sha256 logged |
| 8.7 | Status broadcast to stakeholders | `#deploys` post: green ✅, ticket ID, owner, watch end time | Post made within 5 min of sign-off; thread remains open until watch ends |

---

## 9 · Post-Watch Closure (run AFTER the watch period in 8.2)

| # | Check | Expected Output | Pass Criterion |
|---|-------|-----------------|----------------|
| 9.1 | No new incidents attributable to the change | Incident tracker shows 0 linked incidents | Search by ticket ID returns no Sev-2+ incidents |
| 9.2 | SLOs holding within budget | SLO dashboard green for the watch window | Error budget burn < planned; latency within SLO |
| 9.3 | New cryptographic baseline captured | `baselines/<ticket>-<ts>-POST.sha256` stored | Baseline exists, signed, stored alongside the pre-change baseline |
| 9.4 | Lessons learned logged (even if all green) | Short retro note in ticket | Note includes: what worked, what was slow, what to automate next time |
| 9.5 | Deploy log sealed and ticket closed | Ticket transitions to `Deployed — Stable` | Status change logged; final archive immutable |

---

## 🐢 TURTLE Sign-Off

> **If every box above is checked and every pass criterion is objectively true, you are clear to proceed.**
> **If any box is unchecked, or any criterion is fuzzy — stop, escalate, do not deploy.**
> **Slow is smooth. Smooth is fast. The shell survives because it doesn't rush.**
>
> — *Turtle, Quality Engineer, Defense & Resilience*
