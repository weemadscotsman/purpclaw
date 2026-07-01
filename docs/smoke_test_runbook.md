# TURTLE — Post-Deployment Smoke Test Runbook

**Owner:** TURTLE (Defense Division, Tier-2)
**Audience:** New operators executing the test immediately after a PURPCLAW deployment.
**Scope:** First-line verification that a freshly-deployed PURPCLAW stack is alive, reachable, authenticated, persisting, publishing, responding end-to-end, and logging.

---

## 0. Purpose

Within **60 seconds** of a fresh deployment, an operator with no prior context must be able to:

1. Run `./smoke_test.sh`
2. Read the per-check output
3. Decide **PASS / FAIL / ESCALATE** without consulting engineering

If the script returns exit code `0`, the deployment is verified. Otherwise, this runbook tells you what each failure means and how to recover.

> TURTLE principle: **never trust a process that hasn't answered.**

---

## 1. Prerequisites

### 1.1 Tools (required)

| Tool | Purpose | Install |
|------|---------|---------|
| `bash` | Script runtime | WSL / Git Bash / native Linux |
| `curl` | HTTP probes | `apt install curl`, `choco install curl`, preinstalled on macOS |
| `awk` | Response parsing | preinstalled |
| `date` | Timestamps | preinstalled |

### 1.2 Tools (recommended)

| Tool | Purpose | Notes |
|------|---------|-------|
| `pm2` | Process introspection | Falls back to `pgrep` if absent |
| `grpcurl` | Real gRPC health probe | Only used when `SECONDARY_PROTOCOL=grpc` |
| `jq` | JSON report inspection | Optional — script writes valid JSON regardless |
| `nc` | TCP fallback probes | Optional — bash `/dev/tcp` is used if missing |

### 1.3 Working directory

Run from the **PURPCLAW project root** (where `package.json`, `ecosystem.config.js`, and `unified_api.js` live) so the default `./purpclaw_output.log` resolves correctly.

```bash
cd /path/to/PURPCLAW
chmod +x smoke_test.sh     # Linux / WSL / Git Bash — only needed once
```

### 1.4 Credentials

The script reads the API key from the environment, not from disk:

```bash
export PURPCLAW_API_KEY="…your key…"
# or equivalently:
export AUTH_HEADER_VALUE="…your key…"
```

If `PURPCLAW_API_KEY` is unset **and** the deployment has auth disabled (`PURPCLAW_NO_AUTH=1`), the auth check downgrades to a SKIP rather than a hard fail.

---

## 2. How to Run

### 2.1 Standard run

```bash
./smoke_test.sh
```

Expect a coloured banner, eight sections, then a summary. Exit code `0` = pass.

### 2.2 Common flags

```bash
./smoke_test.sh --verbose           # print response bodies, header values, debug detail
./smoke_test.sh --json              # also write smoke_test_report.json for CI / dashboards
./smoke_test.sh --only 4            # re-run only check 4 (auth) during diagnosis
./smoke_test.sh --dry-run           # print what would run; make no network calls
./smoke_test.sh --no-color          # disable ANSI colours (also: NO_COLOR=1)
./smoke_test.sh -h                  # full CLI help
```

### 2.3 Common env overrides

```bash
API_BASE=http://10.0.0.5:7780 \
LOG_FILE=/var/log/purpclaw.log \
LOG_FRESH_SECONDS=120 \
./smoke_test.sh
```

See section 8 for the full override matrix.

---

## 3. Per-Check Reference

Every check has the same shape:

1. **What it tests** — the property under verification.
2. **Expected output** — example lines you should see on PASS.
3. **Pass criteria** — exact conditions for PASS.
4. **Fail criteria / common causes / remediation** — what to do when it fails.

If a check says SKIP, treat it as advisory: the check was bypassed intentionally (e.g. endpoint doesn't apply to this deployment). Configure the relevant env var to convert a SKIP into a real PASS.

---

### Check 1 — Process alive

**What it tests:** A running process exists for `${SERVICE_NAME}` (default `purpclaw-api`), confirmed via four independent layers in priority order.

**Expected output (PASS examples):**
```
═══ Check 1/8 — Process alive: purpclaw-api ====
  ✓ PASS — PID 12345 alive (from /run/purpclaw-api.pid)  (source=pid_file)
  ✓ PASS — pm2 reports purpclaw-api online  (pid=12345)
  ✓ PASS — process matched by name  (pid=12345 source=pgrep)
```

**Pass criteria:** Any one of:
- PID file exists, contains a PID, `kill -0` succeeds.
- `pm2 jlist` reports the app as `"online"`.
- `pgrep -f SERVICE_NAME` returns at least one live PID.
- (Last resort) the HTTP port accepts a TCP connection even though no process matched.

**Fail criteria & remediation:**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `no running process` and port not listening | service never started, or crashed on boot | `pm2 logs purpclaw-api --lines 200`; `pm2 restart purpclaw-api` |
| PID file present but `kill -0` fails | stale PID file, zombie | `pm2 delete purpclaw-api && pm2 start ecosystem.config.js` |
| pm2 says `errored` / `stopped` | service crash-looping | check `pm2 logs`, then `pm2 restart` once root cause known |
| pm2 says `NOT_FOUND` | wrong `PM2_APP` env var | `pm2 list` to find the correct app name, set `PM2_APP=…` |
| `pgrep` returns nothing | process renamed or sandboxed | set `SERVICE_NAME=` to the actual binary name fragment |

---

### Check 2 — HTTP endpoint responds

**What it tests:** `${API_BASE}` returns a 2xx (or 401/403) on `/api/health`, falling back to `/` if no health route exists.

**Expected output (PASS):**
```
═══ Check 2/8 — HTTP endpoint: http://127.0.0.1:7780 ====
  ✓ PASS — HTTP 200 from http://127.0.0.1:7780  (1283 bytes)
```

**Pass criteria:** `curl` returns a 2xx status **OR** a 401/403 (auth-gated is still considered reachable).

**Fail criteria & remediation:**

| HTTP code returned | Likely cause | Fix |
|--------------------|--------------|-----|
| `000` (no response) | port closed, firewall, wrong host | confirm `pm2 status purpclaw-api` is online; check `API_BASE`; check `ss -ltnp \| grep 7780` |
| `404` on both `/api/health` and `/` | service up but no routes registered yet — still booting | wait 5–10s and re-run with `--only 2` |
| `502` / `503` | upstream dependency (LLM provider, memory spine) failing | check the API stderr in `purpclaw_output.log` |
| `500` | unhandled exception in handler | inspect logs around the timestamp; report to engineering |

---

### Check 3 — Secondary endpoint (HTTP / TCP / gRPC)

**What it tests:** A second service in the stack — default `http://127.0.0.1:7784` (orchestrator) — confirms inter-service connectivity, not just the entry point.

**Expected output (PASS, default):**
```
═══ Check 3/8 — Secondary endpoint (http): http://127.0.0.1:7784 ====
  ✓ PASS — HTTP 200 from http://127.0.0.1:7784  (endpoint responsive)
```

**Pass criteria by protocol:**

| `SECONDARY_PROTOCOL` | Pass = |
|----------------------|--------|
| `http` | any 2xx–4xx response |
| `tcp`  | TCP connect succeeds within 3 s |
| `grpc` | TCP open **AND** (if `grpcurl` + `GRPC_SERVICE` set) health probe returns OK |
| `skip` | always SKIP |

**Fail criteria & remediation:**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| HTTP 000 | orchestrator not running | `pm2 restart purpclaw-orchestrator` |
| TCP refused on grpc port | wrong port, gRPC service not deployed | set `SECONDARY_PROTOCOL=skip` if your stack has no gRPC; PURPCLAW defaults to `http` for a reason |
| gRPC TCP open, grpcurl fails | service registered but handler crashed | check `pm2 logs` for the gRPC service; restart |

---

### Check 4 — Auth handshake

**What it tests:** The credential is **required** for protected routes **and** the supplied key is **accepted**.

**Expected output (PASS, enforced):**
```
═══ Check 4/8 — Auth handshake: http://127.0.0.1:7780/api/services ====
  ✓ PASS — auth enforced and key accepted  (no=401 yes=200)
```

**Pass criteria — three acceptable patterns:**

| Pattern | Status | Meaning |
|---------|--------|---------|
| A | no header → 401/403, with header → 2xx | Auth correctly enforced and credential works. **Best outcome.** |
| B | no header → 2xx, with header → 2xx | Endpoint is public; SKIP with a hint to point `AUTH_PROBE_URL` at a protected route. |
| C | no header → 2xx, with header → 2xx, value empty | `AUTH_HEADER_VALUE` not set; SKIP rather than fail. |

**Fail criteria & remediation:**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `key rejected` (with header → 401) | wrong API key, wrong header name, key rotated | re-export `PURPCLAW_API_KEY`; check `.env`; check the deployment didn't drift |
| `unexpected auth behaviour` (e.g. no=200 yes=500) | key partially applied, server-side bug | check `purpclaw_output.log` for stack traces; escalate |
| `AUTH_HEADER_VALUE not set` | operator forgot to export | `export PURPCLAW_API_KEY=…` and re-run with `--only 4` |

---

### Check 5 — Datastore read/write

**What it tests:** A round-trip PUT → GET → DELETE on the primary datastore (`/api/memory` by default) succeeds, including auth header propagation.

**Expected output (PASS, strict round-trip):**
```
═══ Check 5/8 — Datastore RW: http://127.0.0.1:7780/api/memory ====
  ✓ PASS — datastore write OK (HTTP 200)  (key=smoke:4242:1718900000)
  ✓ PASS — datastore read OK — value round-tripped  (HTTP 200, key=smoke:4242:1718900000)
```

**Pass criteria:**
- **Strict:** PUT returns 2xx AND GET returns 2xx with the written value present in the body.
- **Soft (SKIP):** PUT returns 2xx AND GET returns 2xx but body doesn't echo value (e.g. list endpoint). Treated as SKIP, not FAIL — operator should configure `DATASTORE_URL` to a true key/value route for strict verification.

**Fail criteria & remediation:**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| PUT 401/403 | auth header not applied on writes | confirm `AUTH_HEADER_VALUE` matches the live `PURPCLAW_API_KEY`; check the route requires `X-API-Key` on PUT |
| PUT 404 | route doesn't exist | `DATASTORE_URL` default targets `/api/memory`; if your deployment uses a different path, override it |
| PUT 200, GET 404 | write succeeds but read path differs | check route — many APIs use `/api/memory/{key}` for both, some use `/api/memory?key=…`; set `DATASTORE_URL` accordingly |
| PUT 500 | underlying store (file, redis, postgres) failing | check `purpclaw_output.log` and `samantha_memory.json` permissions |

**Note on cleanup:** The check best-effort DELETEs the sentinel key after read. A failed DELETE is non-fatal (logged in verbose mode only).

---

### Check 6 — Message broker publish

**What it tests:** A POST to the eventbus/broker endpoint (default `/api/eventbus/publish`) returns 2xx.

**Expected output (PASS):**
```
═══ Check 6/8 — Message broker: http://127.0.0.1:7780/api/eventbus/publish ====
  ✓ PASS — broker publish OK (HTTP 200)  (topic=smoke.turtle.1718900000.4242)
```

**Pass criteria:** POST returns 2xx with any body.

**Fail criteria & remediation:**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 404 | endpoint path wrong | PURPCLAW exposes the eventbus at `/api/eventbus/publish`; if your build uses `/api/events` or `/bus/publish`, override `BROKER_URL` |
| 503 | broker service down | `pm2 restart purpclaw-eventbus`; check port 7782 with `ss -ltnp \| grep 7782` |
| 401/403 | broker requires separate auth | export `AUTH_HEADER_VALUE` and confirm the route reads it; some PURPCLAW builds require an internal token (set `INTERNAL_API_KEY`) |
| Timeout | broker overloaded or loopback misconfigured | check `pm2 monit`; verify nothing else is bound to 7782 |

---

### Check 7 — End-to-end request

**What it tests:** The full request pipeline (HTTP → API → orchestrator → LLM/agent → response) returns a non-empty 2xx body. Default: `POST /api/chat` with `{"message":"smoke-test-ping","source":"turtle"}`.

**Expected output (PASS):**
```
═══ Check 7/8 — End-to-end request: http://127.0.0.1:7780/api/chat ====
  ✓ PASS — E2E OK (HTTP 200, 412 bytes)  (response non-empty)
```

**Pass criteria:** HTTP 2xx **and** response body length > 5 bytes.

**Fail criteria & remediation:**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 200 + empty body | LLM provider hung or returned nothing | check `purpclaw_output.log` around the timestamp; verify `LLM_API_KEY` and `LLM_PROVIDER` in `.env` |
| 401/403 | `/api/chat` requires auth | re-export `PURPCLAW_API_KEY` |
| 429 | rate-limit hit | wait `PURPCLAW_RATE_LIMIT_WINDOW_MS` and retry; raise the rate limit if expected |
| 500 | LLM provider 4xx/5xx bubbled up | check `purpclaw_output.log` for the upstream error; verify the provider key |
| Timeout (default 30 s) | slow LLM, swarm saturated, model cold-start | raise `E2E_TIMEOUT=60` for a one-off retest; if persistent, check tower load with `pm2 monit` |
| 404 | route doesn't exist | override `E2E_URL` to the actual chat endpoint for your build |

**To use a different E2E payload** (e.g. exercise a different route):
```bash
E2E_URL=http://127.0.0.1:7780/api/swarm \
E2E_PAYLOAD='{"mission":"smoke-test","agents":["turtle"]}' \
./smoke_test.sh --only 7
```

---

### Check 8 — Logs flowing

**What it tests:** The log file exists and has been modified within `${LOG_FRESH_SECONDS}` (default 300 s). A `__SMOKE_TEST_TURTLE__` marker line is also appended so you can grep for it later to prove the service is actively writing.

**Expected output (PASS):**
```
═══ Check 8/8 — Logs flowing: ./purpclaw_output.log ====
  ✓ PASS — log fresh  (age=42s lines=14823 threshold=300s)
```

**Pass criteria:** `now - mtime ≤ LOG_FRESH_SECONDS`.

**Fail criteria & remediation:**

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `log file not found` | wrong path | `LOG_FILE` default is `./purpclaw_output.log`; set the absolute path if logs live elsewhere (`/var/log/purpclaw.log`) |
| `log stale` | service running but not logging, or hung in a tight loop | `pm2 logs purpclaw-api --lines 50`; `pm2 restart purpclaw-api` if silent for >5 min |
| Disk full | log rotation not configured | `df -h`; configure `pm2-logrotate`; free space |
| Permission denied | log file owned by another user | `ls -la purpclaw_output.log`; fix with `chown` or run as the right user |

**Verify the marker was written:**
```bash
grep '__SMOKE_TEST_TURTLE__' purpclaw_output.log | tail -5
```
If you see your timestamp, the service is actively accepting writes. If not, the file isn't being flushed (possible app-level buffering — escalate).

---

## 4. Overall Pass / Fail Interpretation

| Exit | Summary state | Meaning | Action |
|------|---------------|---------|--------|
| **0** | all checks PASS | deployment verified | proceed to operational use |
| **0** | PASS + SKIPs | core is verified, SKIPs are advisory | review SKIPs and configure env vars if needed |
| **1** | one or more FAIL | a real component is broken or misconfigured | consult per-check remediation; do **not** mark deployment live |
| **2** | preflight FAIL | missing required tool (`curl`, `bash`, `awk`) | install the tool, re-run |
| **3** | bad CLI flag | typo or unknown flag | re-run with `--help` |

**Hard rule:** Do not promote a deployment to live traffic while exit code is non-zero. TURTLE does not negotiate on this.

---

## 5. Quick Recovery Runbook (most common failures)

1. **Check 1 fails (process not alive):**
   ```bash
   pm2 status
   pm2 logs purpclaw-api --lines 200 --nostream
   pm2 restart purpclaw-api
   ```

2. **Check 2 fails (HTTP 000):**
   ```bash
   ss -ltnp | grep 7780
   curl -v http://127.0.0.1:7780/api/health
   ```

3. **Check 4 fails (key rejected):**
   ```bash
   grep PURPCLAW_API_KEY .env | sed 's/=.*/=<redacted>/'
   pm2 restart purpclaw-api   # force .env re-read
   ```

4. **Check 7 fails (E2E timeout/500):**
   ```bash
   pm2 logs purpclaw-api --lines 100 --nostream | grep -i 'error\|llm\|provider'
   curl -v -X POST http://127.0.0.1:7780/api/chat \
        -H 'Content-Type: application/json' \
        -H "X-API-Key: $PURPCLAW_API_KEY" \
        -d '{"message":"ping"}'
   ```

5. **Multiple checks fail at once:** usually means **the daemon was started with a poisoned environment** (the exact scenario the `dotenv override:true` flag in `unified_api.js` was added to fix). Force a clean restart:
   ```bash
   pm2 delete all
   pm2 kill
   pm2 start ecosystem.config.js
   ./smoke_test.sh
   ```

> ⚠ On Windows: **never** `pm2 start ecosystem.config.js` directly. Always use `purpclaw safe-start` to avoid the cmd-window cascade documented in `ecosystem.config.js`.

---

## 6. JSON Report for Downstream Tooling

When run with `--json`, the script writes `smoke_test_report.json` next to itself. Shape:

```json
{
  "tool": "turtle-smoke",
  "timestamp": "2026-06-22T14:33:21Z",
  "service": "purpclaw-api",
  "api_base": "http://127.0.0.1:7780",
  "overall": "pass",
  "passed": 8,
  "failed": 0,
  "skipped": 0,
  "total": 8,
  "results": [
    { "status": "PASS", "check": "…", "detail": "…" }
  ]
}
```

Wire this into Prometheus blackbox, GitHub Actions, or any cron-driven monitor:
```bash
./smoke_test.sh --json && jq .overall smoke_test_report.json
```

---

## 7. Escalation

| Severity | Trigger | Escalate to |
|----------|---------|-------------|
| Single check FAIL, fixable via documented remediation | check 1–8 with known cause | on-call operator |
| Multiple checks FAIL simultaneously | systemic — daemon env, missing services, network | Defense Director (Wall) + Engineering Lead |
| E2E check FAIL after LLM provider rollback | provider key expired or rate-limited | LLM lane owner + Defense Director |
| Auth check FAIL and `.env` corrupted | config drift / disk failure | restore `.env` from last-known-good backup (Tier-2 storage) |
| Logs check FAIL and disk is full | backup/retention policy failure | Storage Steward (Cactus) |

TURTLE never pages itself. The script exits, you read the runbook, you decide.

---

## 8. Full Environment Override Matrix

| Variable | Default | Purpose |
|----------|---------|---------|
| `SERVICE_NAME` | `purpclaw-api` | process name fragment for `pgrep` |
| `PID_FILE` | _(unset)_ | explicit PID file path; checked first |
| `PM2_APP` | `purpclaw-api` | name to look up in `pm2 jlist` |
| `API_BASE` | `http://127.0.0.1:7780` | primary HTTP target |
| `SECONDARY_URL` | `http://127.0.0.1:7784` | secondary endpoint for check 3 |
| `SECONDARY_PROTOCOL` | `http` | `http` \| `tcp` \| `grpc` \| `skip` |
| `GRPC_TARGET` | `127.0.0.1:50051` | gRPC host:port (only when `grpc`) |
| `GRPC_SERVICE` | _(unset)_ | full gRPC service symbol for `grpcurl` |
| `AUTH_PROBE_URL` | `${API_BASE}/api/services` | endpoint that should require auth |
| `AUTH_HEADER_NAME` | `X-API-Key` | header carrying the credential |
| `AUTH_HEADER_VALUE` | `${PURPCLAW_API_KEY}` | credential value |
| `DATASTORE_URL` | `${API_BASE}/api/memory` | key/value endpoint base |
| `BROKER_URL` | `${API_BASE}/api/eventbus/publish` | message broker publish endpoint |
| `E2E_URL` | `${API_BASE}/api/chat` | end-to-end request URL |
| `E2E_PAYLOAD` | `{"message":"smoke-test-ping","source":"turtle"}` | JSON body |
| `LOG_FILE` | `./purpclaw_output.log` | log file path |
| `LOG_FRESH_SECONDS` | `300` | max acceptable log staleness |
| `CURL_TIMEOUT` | `10` | per-call timeout (seconds) |
| `E2E_TIMEOUT` | `30` | check 7 timeout (seconds) |
| `REPORT_FILE` | `./smoke_test_report.json` | JSON report output |
| `NO_COLOR` | _(unset)_ | set to anything to disable colour |
| `VERBOSE` | `0` | set to `1` for verbose (or use `--verbose`) |
| `DRY_RUN` | `0` | set to `1` to dry-run (or use `--dry-run`) |
| `JSON_MODE` | `0` | set to `1` to write JSON report (or use `--json`) |
| `ONLY_CHECK` | _(unset)_ | restrict to one check (1–8) |

---

## 9. Exit Checklist for the Operator

Before you sign off a deployment, all of these must be true:

- [ ] `./smoke_test.sh` returned exit code `0`
- [ ] Each PASS line showed a non-empty detail
- [ ] No SKIPs remain that should be PASS for your deployment shape
- [ ] `smoke_test_report.json` (if `--json`) shows `"overall": "pass"`
- [ ] `grep '__SMOKE_TEST_TURTLE__' purpclaw_output.log` returns at least one line
- [ ] No FAIL line in the summary block

If any box is unchecked, do not promote. Escalate per section 7.

— TURTLE 🐢
*"Still running when everything else has stopped."*
