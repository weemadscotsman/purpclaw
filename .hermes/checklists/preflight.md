# 🐢 TURTLE PRE-FLIGHT CHECKLIST
**PURPCLAW Operations — Single Linear Walkthrough**

> *"Status updates only. Verify everything. Trust nothing."*
> *"Still running when everything else has stopped."*

| Field            | Value                                              |
|------------------|----------------------------------------------------|
| Document         | `.hermes/checklists/preflight.md`                  |
| Owner            | TURTLE — Defense & Resilience                      |
| Division         | Engineering                                        |
| Version          | 1.0                                                |
| Review Cadence   | Quarterly                                          |
| Abort Authority  | Operator + Owner                                   |
| Change Tier      | Tier 1 / Tier 2 / Tier 3 (circle one)              |
| Change Ticket    | `__________________`                               |
| Target Env       | `____` (dev / staging / prod)                      |
| Cutover Window   | `__________` → `__________`                        |

---

## §0 — ABORT CONDITIONS (read first, in order)

Abort the deployment **immediately** if **any** of the following are true:

- [ ] Operator identity, MFA, or admin scope cannot be verified within 5 minutes
- [ ] Last-known-good backup is missing, unverified, or older than 24 hours
- [ ] Monitoring stack is unreachable or blind to the target
- [ ] Owner sign-off is not obtainable before the cutover window
- [ ] Any single infrastructure site is in active incident state
- [ ] Secret store returns stale or empty values for any required key
- [ ] Rollback procedure cannot be rehearsed or its RTO cannot be validated

> *"Better slow and recoverable, than fast and toast." — TURTLE doctrine*

---

## §1 — IDENTITY & ACCESS

### 1.1 Operator identity confirmed
- **Action:** `whoami && groups` (or `whoami /groups` on Windows). Cross-check against the on-call roster.
- **Expected output:** Username, primary group, admin group memberships printed.
- **Pass criterion:** Identity is on the roster, MFA enrolled, admin group present.

### 1.2 Privileged credentials accessible
- **Action:** Retrieve required secrets from the vault (`op read`, `vault kv get`, or 1Password CLI).
- **Expected output:** All required secrets returned with metadata (created, rotated, scope).
- **Pass criterion:** Zero "secret not found" errors. No production secret older than 90 days.

### 1.3 Session has admin scope
- **Action:** Verify `sudo -n true` (Linux) or elevated token (Windows) returns 0 without re-prompt.
- **Expected output:** Privileged prompt reachable for the full runbook.
- **Pass criterion:** Zero re-auth prompts during the entire pre-flight.

### 1.4 Access scope logged
- **Action:** Create a session log entry: who, when, what change, ticket ID, expected duration.
- **Expected output:** Entry persisted to the audit channel (SIEM / append-only log).
- **Pass criterion:** Entry retrievable via `grep <ticket-id>` within 10 seconds.

### 1.5 Session-bounded elevation
- **Action:** Confirm any temporary privilege grants expire automatically (PAM JIT).
- **Expected output:** Expiry timestamp present, <= cutover window + 30 min.
- **Pass criterion:** No standing privilege grants survive the change window.

---

## §2 — INFRASTRUCTURE PROVISIONED

### 2.1 Target environment identified
- **Action:** Confirm environment name (dev / staging / prod) and region, record in run log.
- **Expected output:** Environment + region captured with timestamp.
- **Pass criterion:** Environment name matches the change ticket exactly — character for character.

### 2.2 Compute resources present
- **Action:** Run `cpu` and `memory` checks. Compare against the minimum spec sheet.
- **Expected output:** CPU cores, RAM total/used, load average.
- **Pass criterion:** Free memory ≥ 25% of total. Load avg < 70% of core count.

### 2.3 Storage available
- **Action:** `disk` and `du` on data volumes, including backup volume.
- **Expected output:** Free space per mount, growth trend if available.
- **Pass criterion:** Free space ≥ 20% on every volume, including backup volume.

### 2.4 Network paths validated
- **Action:** `ping`, `dns`, `netstat` against every dependency host in the manifest.
- **Expected output:** Latency + connection state for every endpoint.
- **Pass criterion:** All dependencies reachable. Latency < 100ms intra-region. Zero retransmits.

### 2.5 Last-known-good backup exists
- **Action:** Locate the most recent verified snapshot for the target. Pull hash + retention class.
- **Expected output:** Snapshot ID, timestamp, integrity hash, retention class.
- **Pass criterion:** Snapshot is < 24h old, hash matches the trusted baseline, restore-tested within 30 days.

### 2.6 Redundancy posture confirmed
- **Action:** For each Tier-1 component, confirm ≥ 2 healthy instances across distinct sites.
- **Expected output:** Per-component count + site tag.
- **Pass criterion:** Zero single points of failure in the critical path.

---

## §3 — ENVIRONMENT VARIABLES LOADED

### 3.1 Secret store reachable
- **Action:** Read bootstrap secrets via vault CLI or env-injector.
- **Expected output:** Non-empty response with expected secret count and request latency.
- **Pass criterion:** All expected keys present, none redacted, latency < 1s.

### 3.2 Provider keys loaded
- **Action:** For each provider in the manifest, confirm key is present and non-empty (masked preview only).
- **Expected output:** List of `{name, masked, present}` tuples.
- **Pass criterion:** Every key in the manifest is present. No key in env that is NOT in the manifest.

### 3.3 Application config populated
- **Action:** Load the app config (`.env`, `config.yaml`, or equivalent). Print version + checksum.
- **Expected output:** Config dump with version + SHA-256 of the file.
- **Pass criterion:** Config checksum matches the version pinned in the change ticket.

### 3.4 Path and runtime variables set
- **Action:** `echo $PATH`, `node -v`, `python --version`, `git --version`, etc. for every runtime in the manifest.
- **Expected output:** Versions for all runtime dependencies printed.
- **Pass criterion:** Every runtime version matches the pinned manifest exactly.

### 3.5 Working directory and perms
- **Action:** `pwd` and permission check on the deploy directory.
- **Expected output:** Absolute path, owner, group, mode bits.
- **Pass criterion:** Path is the one pinned in the change ticket. Owner matches deploy user.

---

## §4 — SERVICES STARTED

### 4.1 Process manager healthy
- **Action:** `pm2 list` / `docker ps` / `tasklist` / `kubectl get pods` — whichever applies.
- **Expected output:** List of expected services, all in `online` / `running` / `Ready` state.
- **Pass criterion:** 100% of expected services in the expected state. Zero `errored`, `crashed`, or `OOMKilled`.

### 4.2 Port bindings confirmed
- **Action:** `netstat -an` (or `ss -tlnp`) against the service port map.
- **Expected output:** Every required port bound and in `LISTENING`.
- **Pass criterion:** Zero port conflicts. Zero unexpected listeners. Every expected port present.

### 4.3 Health endpoints responding
- **Action:** `curl -fsS http://localhost:<port>/health` for each service. Capture status + latency.
- **Expected output:** HTTP 2xx with `{"status":"ok"}` or service-equivalent.
- **Pass criterion:** All services return 2xx within 2s. 5 consecutive successes each.

### 4.4 Inter-service connectivity verified
- **Action:** Trigger a cross-service call (auth, data fetch, or a smoke endpoint).
- **Expected output:** Call completes with the expected response body, no warnings in logs.
- **Pass criterion:** Zero 5xx. Round-trip < 500ms intra-region. Zero retries.

### 4.5 Resource limits enforced
- **Action:** Confirm CPU/memory limits and restart policies are set on every service.
- **Expected output:** Per-service limit + restart policy printed.
- **Pass criterion:** Every service has explicit limits. Restart policy is `on-failure` or `always` — never `never`.

---

## §5 — SMOKE TEST GREEN

### 5.1 Liveness probe
- **Action:** Hit the bare liveness endpoint five times in a row.
- **Expected output:** 200 OK each time, latency < 100ms.
- **Pass criterion:** 5/5 successes. Zero variability > 50ms.

### 5.2 Functional API test
- **Action:** Run the canonical happy-path request for the deployment (the one pinned in the change ticket).
- **Expected output:** Expected response body, no warnings in logs.
- **Pass criterion:** 100% match against the contract in the change ticket. Zero unhandled warnings.

### 5.3 Database roundtrip
- **Action:** Read + write a record through the data layer. Verify replication.
- **Expected output:** Write acknowledged, read returns the same record on primary and replica.
- **Pass criterion:** Roundtrip succeeds without retries. Replication lag < 1s.

### 5.4 Edge case spot check
- **Action:** Run 1–2 known edge cases (auth fail, bad input, oversize payload).
- **Expected output:** Each returns the documented error code. Zero 500s.
- **Pass criterion:** Edge cases match the spec exactly. No unhandled exceptions in logs.

### 5.5 Auth boundary test
- **Action:** Hit a protected endpoint with no token, expired token, and wrong-scope token.
- **Expected output:** 401 / 403 returned as specified, never 200 or 500.
- **Pass criterion:** All three rejection paths behave per spec. No information leakage in error bodies.

### 5.6 Chaos sanity (recommended)
- **Action:** Run one `chaos_round` or inject one fault (kill a non-critical worker, drop one packet).
- **Expected output:** System detects, logs, and recovers within RTO.
- **Pass criterion:** Recovery within RTO. No data loss. No silent failure.

---

## §6 — ROLLBACK PLAN CONFIRMED

### 6.1 Rollback target identified
- **Action:** Document the prior version / commit / artifact to roll back to.
- **Expected output:** Version string + commit hash + build artifact ID recorded in the run log.
- **Pass criterion:** Rollback target matches the last-known-good from §2.5.

### 6.2 Rollback procedure written
- **Action:** Write the rollback steps in the run log, top-to-bottom, no jumps, no "figure it out later".
- **Expected output:** Numbered procedure with exact commands and exact file paths.
- **Pass criterion:** A second operator could execute the rollback cold, in < 5 minutes, with no questions.

### 6.3 Rollback rehearsed (or dry-run validated)
- **Action:** Either execute rollback in a non-prod mirror, or simulate each command step-by-step.
- **Expected output:** Confirmation that every step would execute without manual guessing.
- **Pass criterion:** Zero ambiguity in any step. All artifacts available. All credentials cached or fetchable.

### 6.4 Rollback RTO validated
- **Action:** Time the rollback dry-run from "rollback initiated" to "service healthy".
- **Expected output:** Measured time in seconds.
- **Pass criterion:** Rollback time ≤ RTO stated in the change ticket.

### 6.5 Data rollback path defined
- **Action:** For schema or data changes, define how data is reversed (snapshot restore, dual-write cutoff, compensating migration).
- **Expected output:** Data rollback plan with command, target, and verification step.
- **Pass criterion:** Data rollback can be executed without data loss exceeding the RPO.

### 6.6 Rollback owner named
- **Action:** Name the human who owns the rollback decision if it has to fire mid-cutover.
- **Expected output:** Name + contact in the run log.
- **Pass criterion:** That person is reachable, aware, and has the authority to call it.

---

## §7 — MONITORING & ALERTS ARMED

### 7.1 Metrics collection live
- **Action:** Confirm Prometheus / StatsD / equivalent is scraping the target. Pull a recent data point.
- **Expected output:** Recent data points for CPU, memory, request rate, error rate.
- **Pass criterion:** Scrape interval observed. No gaps in the last 5 minutes.

### 7.2 Log aggregation flowing
- **Action:** Tail the centralized log stream and trigger one test event from each service.
- **Expected output:** Test events visible in the SIEM / log store within 60 seconds.
- **Pass criterion:** End-to-end log latency < 60s. Zero dropped events in the test burst.

### 7.3 Alert routes confirmed
- **Action:** Trigger a test alert (PagerDuty / webhook / email / Telegram).
- **Expected output:** Alert received by the on-call channel within 60 seconds.
- **Pass criterion:** On-call acknowledges. Round-trip < 60s. Alert text contains ticket ID.

### 7.4 SLO thresholds re-confirmed
- **Action:** Verify error-rate, latency, and saturation alert thresholds match the current SLO.
- **Expected output:** Per-SLO threshold printed.
- **Pass criterion:** Thresholds match SLO doc version pinned in the change ticket.

### 7.5 On-call notified
- **Action:** Page or message the on-call rotation with the change window.
- **Expected output:** Acknowledgement from on-call with timestamp.
- **Pass criterion:** Acknowledgement captured in the run log. On-call confirms they will not swap mid-window.

### 7.6 Dashboard pinned
- **Action:** Open the run dashboard for the target. Pin it to the operator screen.
- **Expected output:** Dashboard URL in the run log, visible to operator.
- **Pass criterion:** Dashboard shows live data from the target. No "no data" panels.

---

## §8 — OWNER SIGN-OFF

### 8.1 Change ticket linked
- **Action:** Record the change ticket ID in the run log and in this document's header.
- **Expected output:** Ticket ID present and retrievable.
- **Pass criterion:** Ticket is in `Approved` state. Zero open blockers. CAB sign-off recorded if Tier 1.

### 8.2 Stakeholder notification sent
- **Action:** Send the go-live notice to the stakeholder distribution list.
- **Expected output:** Confirmation of delivery (or read receipt where available).
- **Pass criterion:** All required stakeholders on the distribution list. Zero bounces. Send timestamp recorded.

### 8.3 Operator sign-off
- **Action:** Operator signs the run log with name, timestamp, and outcome.
- **Expected output:** Signed entry in the run log.
- **Pass criterion:** All §1–§7 boxes checked. Zero open red flags. Operator name + UTC timestamp present.

### 8.4 Owner sign-off
- **Action:** Owner reviews the completed checklist and signs.
- **Expected output:** Owner signature + timestamp in the run log.
- **Pass criterion:** Owner confirms go. If conditional, conditions are written and acknowledged.

### 8.5 Handoff documented
- **Action:** Write the post-change summary: what changed, who owns it, next review date, rollback owner.
- **Expected output:** Handoff note posted to the operations channel and linked from the ticket.
- **Pass criterion:** Note includes: change summary, owner, next review date, rollback owner, SLO impact.

---

## §9 — POST-FLIGHT (do not skip)

- [ ] Watch error rate and latency for 15 minutes post-cutover. Compare to pre-cutover baseline.
- [ ] Confirm no orphaned processes, leaked ports, or stranded containers.
- [ ] Archive the run log to the change ticket and the lessons-learned repo.
- [ ] Schedule the post-incident review if anything went sideways — even a little.
- [ ] Reset any temporary credentials, elevated scopes, or break-glass tokens.
- [ ] Re-run integrity baseline (file hash + registry) and diff against §2.5 snapshot.
- [ ] Confirm the rollback procedure is now updated to match what was actually executed, not what was planned.

---

## SIGN-OFF BLOCK

| Role           | Name | Signature | UTC Timestamp |
|----------------|------|-----------|---------------|
| Operator       |      |           |               |
| Owner          |      |           |               |
| On-call Lead   |      |           |               |
| Defense (TURTLE) |    |           |               |

---

## DEFENSE NOTES (TURTLE)

- Every step has a **pass criterion**. If a criterion cannot be met, the step is failed. A failed step blocks cutover.
- Every step's **expected output** is what you must SEE. If you don't see it, the step is failed.
- **Abuse the abort conditions.** They exist because the postmortem of a bad cutover is always worse than the delay of a cancelled one.
- **Trust the checklist, not your gut.** Gut is what gets you at 2am when "it'll probably be fine."
- **Time-box every step.** If a step takes > 2x its estimated time, stop and reassess. Slow is a signal.
- **Treat the rollback as the primary plan.** The forward path is the contingency.

> *Still running when everything else has stopped.* — TURTLE
