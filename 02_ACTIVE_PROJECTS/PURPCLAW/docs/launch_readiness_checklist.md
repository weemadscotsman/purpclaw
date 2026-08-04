# 🐢 TURTLE — Master Launch Readiness Checklist

> **Single deliverable for the new operator.**
> **Walk it top-to-bottom. Every gate. Every box. No skipping.**
>
> *"Still running when everything else has stopped."*

---

## Document Control

| Field            | Value                                                                                       |
|------------------|---------------------------------------------------------------------------------------------|
| Document         | `launch_readiness_checklist.md` (root)                                                      |
| Owner            | 🐢 TURTLE — Quality Engineer, Defense & Resilience                                          |
| Division         | ENGINEERING                                                                                 |
| Version          | 2.0 (consolidates `preflight.md`, `docs/operations/PRE_FLIGHT_CHECKLIST.md`, `FAILURE_MODES_CATALOG.md`, `rollback-and-incident-response.md`, `service_registry.js`, `lib/system-manifest.js`, `/api/services`, `/api/manifest`) |
| Review Cadence   | Quarterly — and on every Tier-1 change                                                     |
| Abort Authority  | Operator **AND** Change Owner (single veto blocks cutover)                                  |
| Mandates         | **Tier 1** = full 9 gates. **Tier 2** = full 9 gates, Gates 7/9 abbreviated at discretion. **Tier 3** = Gates 0–6 minimum. |

---

## How To Use This Checklist

1. **Fill the header table at the top of every section** before you start. No blank fields.
2. **Work top-to-bottom.** Every gate has a hard floor; you cannot enter Gate N+1 until Gate N is `[x]`.
3. **Every check has three columns that MUST be filled in by the operator:**
   - **PASS / FAIL** — the *objective* outcome. If you wrote "looks good" you wrote FAIL.
   - **⏱ ETV** — *estimated time to verify* — measured, not guessed after the fact.
   - **🔙 ROLLBACK / ABORT** — the exact trigger that fires if the box fails.
4. **If any box is unchecked, or any criterion is fuzzy — STOP.** Do not deploy. Do not improvise. Open a rollback ticket (`docs/runbooks/rollback-and-incident-response.md`).
5. **Sign-off table at the end is mandatory.** No gate cleared without its named approver's initials + timestamp.

---

## ⚑ Quick-Reference Failure-Mode → Abort Map

Every recurring production failure mode is wired to an abort trigger in this checklist. Keep this table open.

| Failure ID | Symptom (one-liner)                                  | Linked Gate  | Abort trigger                                               |
|------------|------------------------------------------------------|--------------|-------------------------------------------------------------|
| FM-01      | Missing provider API key → 401 from provider          | Gate 3       | FAIL on §3.2 — block cutover, set key, re-run §3            |
| FM-02      | Wrong model id → 404 from provider                    | Gate 3       | FAIL on §3.7 (config checksum mismatch) — block, fix tri-source drift, re-run |
| FM-03      | Vector store auth mismatch → 401/403 from qdrant      | Gate 3       | FAIL on §3.4 — block cutover, fix key↔endpoint pairing       |
| FM-04      | Agent persona collision at boot → silent skip         | Gate 4       | FAIL on §4.4 (registry size < expected) — block, resolve collisions or set `PURPCLAW_PERSONA_STRICT=1` |
| FM-05      | Queue/agent-slot backlog overflow                     | Gate 4, 7    | FAIL on §4.5 or §7.5 — drain (`pm2 set purpclaw:accepting_traffic false`), scale workers, re-run §4 |
| FM-06      | Telemetry drop (counter delta < expected)             | Gate 7       | FAIL on §7.4 — block cutover, restart shipper, validate     |
| FM-07      | Config drift (registry hash mismatch)                 | Gate 3, 6    | FAIL on §3.7 or §6.3 — abort, restore from last-known-good  |
| FM-08      | Single-site SPOF                                     | Gate 2       | FAIL on §2.6 — abort, scale second site, re-run §2          |
| FM-09      | Rollback RTO exceeds Tier budget                      | Gate 6       | FAIL on §6.4 — abort, redesign rollback until ETA ≤ budget  |

(Full text: `docs/runbooks/FAILURE_MODES_CATALOG.md`. This table is the **operator-grade cheat sheet** — print it.)

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 0 — ABORT CONDITIONS (read first, decide fast)
# ════════════════════════════════════════════════════════════════════════════

> **If ANY box below is true, do not start. Close the cutover window. Escalate.**
> **Time budget: 60 seconds. This is a binary decision, not a checklist.**

| # | Abort Condition | Tick if TRUE | 🔙 Triggered Action |
|---|------------------|--------------|---------------------|
| 0.1 | Operator identity / MFA / admin scope cannot be verified within 5 min | ☐ | Page secondary on-call; cutover **CANCELED**. |
| 0.2 | Last-known-good backup is missing, unverified, or older than 24h | ☐ | Halt. Take fresh snapshot. Re-run Gate 2. |
| 0.3 | Monitoring stack is unreachable or blind to the target | ☐ | Halt. Restore SIEM/agent shipper. Cannot deploy blind. |
| 0.4 | Change Owner sign-off is not obtainable before cutover window | ☐ | Halt. Reschedule window. |
| 0.5 | Any single infrastructure site is in active incident state | ☐ | Halt. Coordinate with incident commander. |
| 0.6 | Secret store returns stale or empty values for any required key | ☐ | Halt. Rotate store. Re-run Gate 3. |
| 0.7 | Rollback procedure cannot be rehearsed or its RTO cannot be validated | ☐ | Halt. Fix rollback first. Deploy is not safe until you can prove you can un-do it. |

| Gate 0 Summary |  |
|---|---|
| **Result**        | ☐ PASS (no boxes ticked) / ☐ FAIL (any box ticked — ABORT) |
| **⏱ ETV**         | 60 seconds |
| **Operator**      | `__________________`  signature/initials: `____`  time: `____` |
| **Owner Veto?**   | ☐ No  ☐ Yes (deploy off) |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 1 — IDENTITY & ACCESS
# ════════════════════════════════════════════════════════════════════════════

> *No identity, no deploy. The shell doesn't move for unverified hands.*

| # | Check | Action / Expected | PASS / FAIL Criterion | ⏱ ETV | 🔙 Rollback / Abort if FAIL |
|---|-------|-------------------|------------------------|--------|-----------------------------|
| 1.1 | Operator identity confirmed | `whoami && groups` (Linux) / `whoami /groups` (Win); cross-check on-call roster | Identity on roster, MFA enrolled, admin group present | 30s | Refuse to start. Page secondary on-call. |
| 1.2 | Privileged credentials accessible | Vault read (`op read`, `vault kv get`, 1Password CLI) | All required secrets returned; none older than 90 days | 1m | Halt Gate 1. Rotate stale secret, restart Gate 1. |
| 1.3 | Session has admin scope (no re-prompts) | `sudo -n true` (Linux) or elevated token (Win) returns 0 | Zero re-auth prompts for the entire run | 15s | Re-issue elevation via PAM JIT; re-run Gate 1. |
| 1.4 | Access scope logged to audit channel | Append-only SIEM entry: who / when / ticket / expected duration | Entry retrievable via `grep <ticket-id>` within 10s | 30s | Halt. Audit is non-negotiable. |
| 1.5 | Session-bounded elevation (PAM JIT) | Expiry ≤ cutover window + 30 min | No standing privilege grants survive the window | 15s | Re-issue with shorter TTL. |
| 1.6 | Privileged Access Management session opened | PAM session ID recorded; time-boxed ≤ 4h | Session ID in deploy log; expiry ≤ 4h | 30s | Halt. No standing admin. |
| 1.7 | Deployer role granted for target env | `authz-check env=<env>` returns `granted` | Output exactly `granted` (no `partial`, no warnings) | 30s | Open authz ticket. Cannot proceed without scope. |

| Gate 1 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~3 min |
| **Operator**      | `__________________`  initials: `____`  time: `____` |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 2 — INFRASTRUCTURE PROVISIONED
# ════════════════════════════════════════════════════════════════════════════

> *Compute, network, storage, redundancy. The stage must be set before the actors walk on.*

| # | Check | Action / Expected | PASS / FAIL Criterion | ⏱ ETV | 🔙 Rollback / Abort if FAIL |
|---|-------|-------------------|------------------------|--------|-----------------------------|
| 2.1 | Target environment + region identified | Confirm env (dev/staging/prod) + region; record in run log | Name matches change ticket **character-for-character** | 30s | Halt. Wrong target = wrong deploy. |
| 2.2 | Compute resources present | `cpu` + `memory` vs spec sheet | Free RAM ≥ 25%, load avg < 70% of cores | 1m | Abort (FM-08). Scale vertically. Re-run Gate 2. |
| 2.3 | Storage available on every volume | `disk` + `du` on data + backup volumes | Free ≥ 20% on **every** mount, including backup volume | 1m | Abort. Free space (rotate logs / extend volume). |
| 2.4 | Network paths validated | `ping`, `dns`, `netstat` against every dependency in manifest | All deps reachable; intra-region latency < 100ms; zero retransmits | 2m | Abort. Investigate route. Do not deploy over flapping link. |
| 2.5 | Last-known-good backup exists | Snapshot ID, timestamp, integrity hash, retention class | < 24h old, hash matches trusted baseline, restore-tested within 30 days | 1m | Halt Gate 2. Take fresh snapshot + restore-drill row. |
| 2.6 | **Redundancy posture — Tier-1 SPOF check** | Per Tier-1 component: ≥ 2 healthy instances across distinct sites | **Zero single points of failure in critical path** (FM-08) | 2m | **ABORT.** Tier 1 = tri-site active. Single instance = no deploy. |
| 2.7 | Auto-failover tested within last 30 days | Failover drill log present | Latest drill date ≤ 30 days, MTTR ≤ Tier RTO | 30s | Schedule drill. Cannot certify Tier-1 without a drill. |
| 2.8 | Cryptographic baseline captured **before** change | SHA-256 manifest of critical binaries/configs → `baselines/<ticket>-<ts>.sha256` | Manifest exists, signed with operator key, in immutable bucket | 2m | Halt. Baseline is non-negotiable for rollback verification. |
| 2.9 | TLS certificates valid on all endpoints | `openssl s_client -connect host:443` | All certs ≥ 14 days to expiry, zero chain errors | 1m | Halt. Renew certs. |
| 2.10 | Firewall / security group rules | `nc -zv` between every source/dest pair | All required flows open; no unexpected `0.0.0.0/0` | 1m | Halt. Patch rules. |

| Gate 2 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~12 min |
| **Operator**      | `__________________`  initials: `____`  time: `____` |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 3 — ENVIRONMENT MANIFEST & CONFIG LOADED
# ════════════════════════════════════════════════════════════════════════════

> *This is the env manifest gate. Every key the system needs is loaded, named, hashed, and drift-checked. Provider keys, runtime versions, config checksum — locked.*
>
> **Single source of truth:** `/api/manifest` (proxies `lib/system-manifest.js` exposed at `:7780/api/manifest` and `:7784/api/manifest`). If the manifest disagrees with your `.env`, the **manifest wins**.

| # | Check | Action / Expected | PASS / FAIL Criterion | ⏱ ETV | 🔙 Rollback / Abort if FAIL |
|---|-------|-------------------|------------------------|--------|-----------------------------|
| 3.1 | Secret store reachable | Vault CLI read of bootstrap secrets | All expected keys present, latency < 1s, none redacted | 30s | Halt Gate 3. Restore secret store. |
| 3.2 | **Provider keys loaded (FM-01)** | For each provider in `/api/manifest`, confirm key present and non-empty (masked preview only) | Every key in manifest is present; **no key in env that is NOT in manifest** | 2m | **ABORT.** FM-01. Set the matching key in `.env` (never commit). Re-run Gate 3. |
| 3.3 | NIM 5-lane pool keys (if NIM lane active) | `NVIDIA_API_KEY_PURP1..5` + `NVIDIA_API_KEY_BACKUP1..5` | All 10 keys present and non-empty | 30s | **ABORT.** FM-01. Missing any one breaks load balancing. |
| 3.4 | Vector store auth pairing (FM-03) | Match `VECTOR_STORE` to correct env var: qdrant→`QDRANT_URL`+`QDRANT_API_KEY`, chroma→`CHROMA_URL`+`CHROMA_AUTH_TOKEN`, pgvector→`PGVECTOR_DSN` | Out-of-band `curl` against endpoint returns 2xx; key is valid for that endpoint | 1m | **ABORT.** FM-03. Re-pair key↔endpoint. Re-run Gate 3. |
| 3.5 | Application config checksum | Load `.env` / `config.yaml`; print version + SHA-256 | Checksum matches version pinned in change ticket | 1m | **ABORT.** FM-07. Config drift detected. Do not proceed. |
| 3.6 | Path and runtime variables | `echo $PATH`, `node -v`, `python --version`, `git --version`, etc. for every runtime in `/api/manifest` | Every runtime version matches pinned manifest **exactly** | 1m | Halt. Pin versions; rebuild if needed. |
| 3.7 | **Model-name tri-source consistency (FM-02)** | SHA-256 compare: `model_registry.json` `routing.*.model` ↔ `purpclaw_settings.json` `aiBackends[].model` & top-level `model` ↔ `lib/llm-provider.js` `PROVIDERS.*.defaultModel` | **All three match.** Any mismatch = FM-02 pre-condition. | 2m | **ABORT.** FM-02. Update all three in lockstep. `node bin/purpclaw.js safe-stop --core && safe-start --core`. Re-run Gate 3. |
| 3.8 | Active backend is `enabled` | `purpclaw_settings.json` `activeBackend` → `aiBackends[i].enabled = true` | Active backend flag set to `true` | 15s | **ABORT.** FM-01. Flip the flag or pick a different active backend. |
| 3.9 | Working directory and perms | `pwd` + permission check on deploy dir | Path pinned in ticket, owner = deploy user | 15s | Halt. Wrong directory = wrong deploy. |
| 3.10 | No plaintext secrets baked into image | `trivy` / `grype` / `gitleaks` scan | **0 critical / high findings** | 2m | Halt. Rebuild image with secrets injected at runtime, not bake-time. |
| 3.11 | Feature flags match change ticket | `flag-list` diffed against pre-change state | Only flagged changes in diff; all documented | 1m | Halt. Reconcile flag drift. |
| 3.12 | Log level appropriate | `LOG_LEVEL` env var matches policy | INFO in prod; DEBUG only with incident ticket | 15s | Halt. Reset log level. |

| Gate 3 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~13 min |
| **Operator**      | `__________________`  initials: `____`  time: `____` |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 4 — SERVICE TOPOLOGY & STARTUP
# ════════════════════════════════════════════════════════════════════════════

> *The registry is the single source of truth. Every service in `service_registry.js` must answer on its declared health endpoint before we let traffic at it.*
>
> **Service probe source:** `/api/services` reads `service_registry.js` and returns `{ok, up, total, groups, services[]}` for every row.

| # | Check | Action / Expected | PASS / FAIL Criterion | ⏱ ETV | 🔙 Rollback / Abort if FAIL |
|---|-------|-------------------|------------------------|--------|-----------------------------|
| 4.1 | Process manager healthy | `pm2 list` / `docker ps` / `tasklist` / `kubectl get pods` per manifest | **100%** expected services in `online` / `running` / `Ready` state. Zero `errored` / `crashed` / `OOMKilled`. | 1m | Halt. Restart failed unit. Investigate OOM root cause before re-running. |
| 4.2 | `/api/services` probe — **all green** | `curl -s :7790/api/services \| jq '.up, .total, .groups'` | `up == total`. Every group shows `healthy == total`. Zero `offline`, zero `timeout`, zero 5xx. | 1m | Halt. Cross-reference probe URL with `service_registry.js`. Restart the failing row. |
| 4.3 | Port bindings match inventory | `netstat -an` / `ss -tlnp` against service port map | **Zero port conflicts.** Zero unexpected listeners. Every expected port bound. No `0.0.0.0` on sensitive ports. | 1m | Halt. Kill the rogue listener. Re-run Gate 4. |
| 4.4 | **Agent tower loaded cleanly (FM-04)** | `curl -s :7790/api/tower/registry \| jq '.stats'` | `personasSkipped == 0`. `tower_registry_size` ≥ expected. With `PURPCLAW_PERSONA_STRICT=1`: collisions exit `7` = caught. | 1m | **ABORT.** FM-04. Rename colliding keys (`rabbit` → `rabbit-defensive`) or set `PURPCLAW_PERSONA_STRICT=1`. |
| 4.5 | Queue/agent-slot backlog under control (FM-05) | `curl -s :7790/api/services \| jq '.inflight'` | `inflight < 100`. No sustained growth over 5 min window. | 1m | **ABORT.** FM-05. Drain: `pm2 set purpclaw:accepting_traffic false`. Scale workers. Re-run §4. |
| 4.6 | Health endpoints respond | `curl -fsS http://localhost:<port>/health` per service | All services 2xx within 2s; **5 consecutive successes each** | 2m | Halt. Restart failed service. |
| 4.7 | Inter-service connectivity | Cross-service call (auth → data → smoke endpoint) | Zero 5xx. Round-trip < 500ms intra-region. Zero retries. | 1m | Halt. Check service mesh / DNS / firewall. |
| 4.8 | Resource limits + restart policies | Per-service CPU/mem limits + restart policy printed | Every service has explicit limits; restart = `on-failure` or `always` — **never `never`** | 1m | Halt. Patch manifest with explicit limits. |
| 4.9 | DB migrations applied (if any) | `migrate status` | `up to date`; schema version matches expected; zero failed migrations | 1m | Halt. Run migrations. Do not deploy with drift. |
| 4.10 | Logs flowing to SIEM | SIEM search for service tag returns recent entries | Events from last 60s present; zero `log shipper` errors | 1m | Halt. Restore log shipper. Cannot deploy blind. |
| 4.11 | Telemetry counters incrementing (FM-06) | Sample provider / agent metrics — delta over 30s window | Counter delta ≥ expected. If delta = 0 for > 30s = FM-06. | 1m | **ABORT.** FM-06. Restart shipper, validate. |

| Gate 4 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~13 min |
| **Operator**      | `__________________`  initials: `____`  time: `____` |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 5 — SMOKE TEST GREEN
# ════════════════════════════════════════════════════════════════════════════

> *The system talks. End-to-end. Every critical path. Including the ones that should reject you.*

| # | Check | Action / Expected | PASS / FAIL Criterion | ⏱ ETV | 🔙 Rollback / Abort if FAIL |
|---|-------|-------------------|------------------------|--------|-----------------------------|
| 5.1 | Liveness probe (5× in a row) | Hit bare liveness endpoint 5 consecutive times | **5/5 successes.** Latency < 100ms. Variability < 50ms. | 30s | Halt. Investigate flapping liveness. |
| 5.2 | Functional API test — happy path | Run canonical happy-path request from change ticket | Response body 100% matches contract; zero unhandled warnings | 1m | Halt. Roll back to last known-good image. |
| 5.3 | Database roundtrip | Write + read record through data layer; check replica | Roundtrip succeeds without retries; replication lag < 1s; replica returns same record | 1m | Halt. Investigate replication; verify backup. |
| 5.4 | Auth boundary (3 negative cases) | No token / expired token / wrong-scope token against protected endpoint | 401 / 403 returned as spec'd — **never 200 or 500.** No information leakage in error bodies. | 1m | Halt. Auth regression = SEV-1. Roll back immediately. |
| 5.5 | Edge case spot check (1–2 cases) | Auth fail, malformed input, oversize payload | Each returns documented error code; zero 500s; zero stack-trace leaks | 1m | Halt. Patch error handler. |
| 5.6 | Dependency health | All downstream `/healthz` checks | **100% pass.** Latency p99 < 2× p50. | 1m | Halt. Coordinate with downstream owner. |
| 5.7 | Error rate on smoke endpoints | Metrics dashboard over last 5 min | **0 errors.** No 4xx except deliberate 401/400 from §5.4/§5.5. No 5xx. | 1m | Halt. Cross-check recent deploy; consider hot-fix vs rollback. |
| 5.8 | New alerts during smoke | Alertmanager / PagerDuty recent incidents | Zero new incidents for this service; quiet ≥ 5 min | 1m | Halt. If alert fired during smoke, the smoke is lying. |
| 5.9 | Chaos sanity (recommended for Tier 1) | One `chaos_round` or inject one fault (kill non-critical worker, drop one packet) | System detects, logs, recovers **within RTO**. No data loss. No silent failure. | 3m | Halt. Chaos exposed weak link — fix before promoting to prod traffic. |

| Gate 5 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~10 min |
| **Operator**      | `__________________`  initials: `____`  time: `____` |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 6 — ROLLBACK PLAN CONFIRMED
# ════════════════════════════════════════════════════════════════════════════

> *You are not allowed to roll forward unless you have proved you can roll back.*

| # | Check | Action / Expected | PASS / FAIL Criterion | ⏱ ETV | 🔙 Rollback / Abort if FAIL |
|---|-------|-------------------|------------------------|--------|-----------------------------|
| 6.1 | Rollback target identified | Version string + commit hash + build artifact ID in run log | Target matches last-known-good from §2.5 | 30s | Halt. Cannot roll back to a target you can't name. |
| 6.2 | Previous artifacts available | Registry lists `previous` and `current` tags; both pullable | `previous` = exact prior version | 1m | Halt. Restore artifact registry. |
| 6.3 | **DB / state backup taken before change** | Backup ID recorded, restore-tested (sample row) | Restore drill within last 24h; backup not corrupted | 1m | Halt. Take fresh backup + verify restore. |
| 6.4 | **Rollback command(s) rehearsed (dry-run)** | Dry-run output shows correct target state | Dry-run completes in < 60s; **reviewed by 2nd operator** | 2m | **ABORT.** FM-09. Unrehearsed rollback is gambling. |
| 6.5 | **Rollback ETA ≤ Tier RTO (FM-09)** | Documented ETA = `X minutes` | Tier 1 ≤ 30s · Tier 2 ≤ 5m · Tier 3 ≤ 24h | 30s | **ABORT.** FM-09. Redesign rollback until ETA within budget. |
| 6.6 | Rollback owner identified (separation of duties) | Name + contact in deploy log; **not the deployer** | 4-eyes principle honored | 15s | Halt. Designate a different rollback owner. |
| 6.7 | Rollback trigger criteria written (measurable) | List of conditions: `error_rate > 2% for 5m`, `p95 > 3× baseline sustained 5m`, `inflight > 500 OR growing`, `cost/hour > 2× baseline`, `SEV-1 confirmed` | **Every criterion is quantitative.** No "looks bad." | 1m | Halt. Replace subjective triggers with numbers. |
| 6.8 | Drain procedure rehearsed | `pm2 set purpclaw:accepting_traffic false` → `inflight == 0` → checkpoint → restart sequence | Sequence completes ≤ 5 min on staging or canary | 2m | Halt. CACTUS mini-runbook (`docs/runbooks/rollback-and-incident-response.md`) must be executable end-to-end. |
| 6.9 | Staging / canary rollback validated | Rollback rehearsed against non-prod target | Staging rollback completes successfully end-to-end | 3m | Halt. No rehearsal = no go-live. |
| 6.10 | Post-revert `config_sha` verification | `curl -s :PORT/api/services \| jq '.config_sha'` | Equals last-known-good SHA. If not — stop, escalate. | 30s | **ABORT.** Config SHA mismatch means rollback didn't land. |

| Gate 6 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~12 min |
| **Operator**      | `__________________`  initials: `____`  time: `____` |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 7 — MONITORING, ALERTS & FAILURE-MODE COVERAGE
# ════════════════════════════════════════════════════════════════════════════

> *You don't ship a thing you can't see fail. Every failure mode from the catalog must have an armed detection.*

| # | Check | Action / Expected | PASS / FAIL Criterion | ⏱ ETV | 🔙 Rollback / Abort if FAIL |
|---|-------|-------------------|------------------------|--------|-----------------------------|
| 7.1 | Dashboards updated for new service/version | Grafana/Datadog panel renders new release marker | Panel renders; data flowing within 5 min | 1m | Halt. Dashboard first, traffic second. |
| 7.2 | **Four golden signals reporting** | latency / error rate / saturation / traffic present | All 4 present in last 5 min; zero `no data` gaps | 1m | Halt. Cannot promote blind to one of four signals. |
| 7.3 | Alert rules updated for new thresholds | Alertmanager shows new/changed rules loaded | Test notification to PagerDuty/Slack succeeds | 1m | Halt. Alerts that don't fire are worse than no alerts. |
| 7.4 | **Telemetry counters live (FM-06)** | Sample provider / agent metrics — delta over 30s | Delta ≥ expected. Counter increments observable. | 1m | **ABORT.** FM-06. Telemetry is the immune system. Restore. |
| 7.5 | Queue depth + cost guardrails | `inflight` trend + billing API hourly | `inflight < 100`. Cost within 20% of baseline. Alert at 2× baseline. | 1m | Halt. Cost guardrail before traffic. |
| 7.6 | On-call rotation aware of change | On-call acknowledges in `#deploys` channel | Acknowledgment timestamped within 5 min of deploy start | 30s | Halt. No on-call ack = no handoff. |
| 7.7 | Synthetic monitoring / canary probes | External probe reports `passing` | Probe passing for ≥ 10 min post-deploy | 10m | Halt. If canary is red, traffic stays at canary. |
| 7.8 | **Log-based alerts for known FMs armed** | SIEM alerts for FM-01..FM-N active and routing | **≥ 3 critical FM alerts** active and tested | 2m | Halt. Catalog un-wired = un-detected. |
| 7.9 | Runbook linked in alert payloads | Clicking alert notification opens current runbook | Runbook URL resolves; reviewed within 90 days | 30s | Halt. Stale runbooks kill people at 3am. |
| 7.10 | Cost / billing guardrail threshold set | Billing alert at ≤ 80% of approved budget for this change | Alert set, tested | 30s | Halt. Cost overrun is a silent SEV-1. |

| Gate 7 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~19 min |
| **Operator**      | `__________________`  initials: `____`  time: `____` |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 8 — OWNER SIGN-OFF (the gate before traffic)
# ════════════════════════════════════════════════════════════════════════════

> **This is the gate that authorizes production traffic.** Every prior gate must be `[x]`. Every box below must have a name, initials, and timestamp. No box left blank.

| # | Check | PASS / FAIL Criterion | ⏱ ETV | 🔙 Rollback / Abort if FAIL |
|---|-------|------------------------|--------|-----------------------------|
| 8.1 | All prior gates (0–7) marked complete | Zero unchecked boxes; zero `FAIL` notes; zero open rollback tickets | 1m | Halt. Cannot sign off a non-green checklist. |
| 8.2 | Post-deploy watch period defined | Duration + quantitative escalation criteria documented | Duration ≥ 2× Tier RTO; criteria = measurable numbers | 1m | Halt. "Watch it for a while" is not a plan. |
| 8.3 | **Change Owner** signs off | Owner name, initials, timestamp, verdict `PASS` or `PROCEED WITH WATCH` | Recorded in deploy log | 1m | Halt. No owner = no deploy. |
| 8.4 | **Independent reviewer** signs off (4-eyes) | 2nd person initials + timestamp; reviewer ≠ deployer | Reviewer name differs from §8.3 | 1m | Halt. No 4-eyes = no promotion. |
| 8.5 | **On-call** acknowledges handoff into watch | On-call name + acceptance time | Acceptance > §8.3 timestamp and < §8.3 + 5 min | 1m | Halt. No on-call ack = no handoff. |
| 8.6 | Deploy log archived to immutable storage | `archives/<ticket>/<ts>/` path + sha256 | Path recorded, checksum logged | 30s | Halt. Audit chain must be unbroken. |
| 8.7 | Status broadcast to `#deploys` | Green ✅ post: ticket, owner, watch-end time | Posted within 5 min of §8.3 | 30s | Halt. Stakeholders cannot read silence. |

| Gate 8 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~7 min |
| **🚦 TRAFFIC**    | ☐ **APPROVED — route production traffic**  ☐ **DENIED — abort and re-plan** |

---

# ════════════════════════════════════════════════════════════════════════════
# GATE 9 — POST-WATCH CLOSURE (run AFTER watch period from §8.2)
# ════════════════════════════════════════════════════════════════════════════

> *You don't close the ticket until the system stayed green through the watch window and you wrote down what you learned.*

| # | Check | PASS / FAIL Criterion | ⏱ ETV | 🔙 If FAIL |
|---|-------|------------------------|--------|-----------|
| 9.1 | No new incidents attributable to change | Incident tracker search by ticket ID returns zero Sev-2+ linked | 2m | Open retro; do not close ticket. |
| 9.2 | SLOs holding within budget | Error budget burn < planned; latency within SLO | 2m | Roll back per Gate 6. Open SLO retro. |
| 9.3 | **New cryptographic baseline captured** | `baselines/<ticket>-<ts>-POST.sha256` signed and stored alongside pre-change baseline | 1m | Halt closure. Baseline is the receipt. |
| 9.4 | Lessons learned logged (even if all green) | Short retro: what worked / what was slow / what to automate | 5m | Halt closure. No retro = no learning. |
| 9.5 | Deploy log sealed + ticket closed | Ticket transitions to `Deployed — Stable`; final archive immutable | 1m | Halt closure. |

| Gate 9 Summary |  |
|---|---|
| **Result**        | ☐ PASS / ☐ FAIL |
| **⏱ ETV (total)** | ~11 min |
| **Operator**      | `__________________`  initials: `____`  time: `____` |

---

# ════════════════════════════════════════════════════════════════════════════
# SIGN-OFF MATRIX — WHO APPROVES EACH GATE
# ════════════════════════════════════════════════════════════════════════════

> **No production traffic is routed until every gate has the named approver's initials + timestamp below.** A single missing row = NO-GO.

## Approver Roles (default; override per environment in `infra/escalation.yaml`)

| Role | Default Holder | Contact channel | Escalation if unreachable |
|------|----------------|------------------|----------------------------|
| **Operator**          | On-shift deployer | PagerDuty + Telegram `#oncall-primary` | Secondary on-call within 5 min |
| **Change Owner**      | Service / change-ticket owner | PagerDuty + Slack DM | Division lead within 15 min |
| **Independent Reviewer (4-eyes)** | Any operator ≠ deployer (must be on roster) | Slack `#deploys` | Any qualified peer on roster |
| **Primary On-Call**   | Current PagerDuty primary | PagerDuty P1 + Telegram | Secondary on-call in 5 min, Division Lead in 15 min, Eddie in 30 min |
| **Secondary On-Call** | Current PagerDuty secondary | PagerDuty + SMS | Division Lead (Infrastructure = CACTUS) in 15 min |
| **Division Lead — Engineering**  | 🐉 Dragon (Chief Architect, Engineering) | Phone + Slack DM | Eddie |
| **Division Lead — Infrastructure** | 🌵 CACTUS (Efficiency Auditor, Infrastructure) | Phone + Slack DM | Eddie |
| **Division Lead — Defense & Resilience** | 🐢 TURTLE (Quality Engineer, Defense) | Phone + Slack DM | Eddie |
| **Security Reviewer**  | 🦉 OWL (Security Audit) | Slack `#security` | Division Lead — Security |
| **Final Go Authority**| Eddie | Direct message | — (terminal authority) |

## Per-Gate Sign-Off Table

| Gate | Required Approver(s) | Initials | Timestamp | Verdict (PASS / FAIL) | Notes |
|------|------------------------|----------|-----------|------------------------|-------|
| **0 — Abort Conditions**     | Operator + Change Owner | ____ / ____ | ____ / ____ | ☐ PASS / ☐ FAIL | If FAIL → cutover CANCELED |
| **1 — Identity & Access**    | Operator                 | ____       | ____        | ☐ PASS / ☐ FAIL | |
| **2 — Infrastructure**       | Operator + Div. Lead — Engineering | ____ / ____ | ____ / ____ | ☐ PASS / ☐ FAIL | |
| **3 — Env Manifest & Config**| Operator + Div. Lead — Engineering | ____ / ____ | ____ / ____ | ☐ PASS / ☐ FAIL | FM-01/02/03 must be clear |
| **4 — Service Topology**    | Operator + Div. Lead — Infrastructure | ____ / ____ | ____ / ____ | ☐ PASS / ☐ FAIL | `/api/services` up == total |
| **5 — Smoke Test**          | Operator + Independent Reviewer (4-eyes) | ____ / ____ | ____ / ____ | ☐ PASS / ☐ FAIL | |
| **6 — Rollback Plan**       | Operator + Independent Reviewer (4-eyes) + Change Owner | ____ / ____ / ____ | ____ / ____ / ____ | ☐ PASS / ☐ FAIL | RTO ≤ Tier budget (FM-09) |
| **7 — Monitoring & FMs**    | Operator + Div. Lead — Defense (TURTLE) + Security (OWL) | ____ / ____ / ____ | ____ / ____ / ____ | ☐ PASS / ☐ FAIL | ≥ 3 FM alerts armed |
| **8 — Owner Sign-Off**      | Change Owner + Independent Reviewer + Primary On-Call + Final Go Authority | ____ / ____ / ____ / ____ | ____ / ____ / ____ / ____ | ☐ PASS / ☐ FAIL | **This row gates traffic** |
| **9 — Post-Watch Closure**  | Change Owner + Operator | ____ / ____ | ____ / ____ | ☐ PASS / ☐ FAIL | Closes ticket |

## Final Go / No-Go Verdict

| Field            | Value |
|------------------|-------|
| Final verdict    | ☐ **GO — route production traffic**  ☐ **NO-GO — abort, re-plan, reschedule** |
| Final Go Authority (Eddie or delegate) | `__________________` |
| Initials         | `____` |
| Timestamp (UTC)  | `__________________` |
| Watch-window end | `__________________` |
| Post-watch closer| `__________________` |

---

# 🐢 TURTLE — Closing Note

> *If every box above is checked, every pass criterion is objectively true, every approver has signed, and the final verdict reads **GO** — you are clear to route production traffic.*
>
> *If any box is unchecked, any criterion is fuzzy, or any signature is missing — STOP. Escalate. Do not deploy.*
>
> *The shell survives because it doesn't rush. Slow is smooth. Smooth is fast.*
>
> — 🐢 Turtle, Quality Engineer, Defense & Resilience, PURPCLAW
