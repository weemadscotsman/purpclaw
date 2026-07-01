# 🛡️ GUARDIAN — PURPCLAW Failure Modes Catalog

**Division:** Security
**Agent:** GUARDIAN (Real-time Monitor)
**Scope:** Known common failure modes observed in PURPCLAW deployments
**Purpose:** On-call reference for operators. Each entry is structured as:
  **Symptom** → **Root Cause** → **Diagnostic** → **Remediation**

> "Assume every system is one bad deploy away from breaking. This doc exists so we fix it in minutes, not days." — GUARDIAN doctrine

---

## Table of Contents
1. [Env / Config Errors](#1-env--config-errors)
2. [Network / Connectivity](#2-network--connectivity)
3. [Auth / Permissions](#3-auth--permissions)
4. [Resource Exhaustion](#4-resource-exhaustion)
5. [Data Corruption](#5-data-corruption)
6. [Version Mismatch](#6-version-mismatch)

---

## 1. Env / Config Errors

### FM-01 — Missing `PURPCLAW_HOME` or `NODE_ENV`
**Symptom:** Services crash on boot with `Cannot find module 'lib/feature-parity.js'` or PM2 ecosystem file loads but every process exits with code 1 within 3 seconds.

**Root Cause:** Operator cloned the repo but did not export `PURPCLAW_HOME` pointing at the install root. Several bootstrap scripts use `path.join(process.env.PURPCLAW_HOME, 'lib', ...)` and fail with `TypeError: Cannot read property 'lib' of undefined` when the env var is unset.

**Diagnostic:**
```bash
# Windows
$env:PURPCLAW_HOME
echo %PURPCLAW_HOME%

# Bash / WSL
echo "$PURPCLAW_HOME"

# PM2 log inspection
pm2 logs --lines 50 | grep -i "PURPCLAW_HOME\|Cannot find module"
```

**Remediation:**
1. Set `PURPCLAW_HOME` to the absolute install path (e.g. `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`).
2. Persist it: `[System.Environment]::SetEnvironmentVariable('PURPCLAW_HOME',$val,'User')` (Windows) or add `export PURPCLAW_HOME=...` to `.bashrc` / `.zshrc`.
3. Restart PM2: `pm2 kill && pm2 resurrect` (or `pm2 start ecosystem.config.js`).
4. Verify: `pm2 list` should show all processes in `online` state with non-zero uptime.

---

### FM-02 — Provider API keys loaded into wrong scope
**Symptom:** Agent calls return `401 Unauthorized` or `403 Forbidden` from upstream LLM providers. Logs show `Invalid API key` for a key that visually looks correct.

**Root Cause:** Operator put keys in `.env` but the process was started before `.env` existed, or PM2 was started in a different shell context where the env was scoped. PM2's default ecosystem config does NOT auto-load `.env` unless you use `pm2 start app.js --env .env` or `dotenv` in code.

**Diagnostic:**
```bash
# See what the running process actually sees
pm2 env <id> | grep -i "API_KEY\|TOKEN\|SECRET"

# Diff expected vs actual
node -e "console.log(Object.keys(process.env).filter(k=>k.match(/KEY|TOKEN|SECRET/i)))"
```

**Remediation:**
1. Use `pm2 start ecosystem.config.js --env production` with `env_production: { ... }` block.
2. Or add `require('dotenv').config({ path: process.env.PURPCLAW_HOME + '/.env' })` as the first line of the entry script.
3. Restart: `pm2 reload all`.
4. Smoke test: hit `/api/services` and confirm 200.

---

### FM-03 — `ecosystem.config.js` points to deleted paths
**Symptom:** PM2 says `online` but `pm2 logs` is empty. Telemetry endpoint `http://localhost:7780/api/services` returns 503. Underlying script errors are silent.

**Root Cause:** Operator moved the repo or renamed a folder, but `ecosystem.config.js` still references absolute paths from the old location. PM2 doesn't validate paths on `start`; it just spawns and waits for the process to die. If the process is `node` listening on a port, it never binds and PM2 thinks it's healthy.

**Diagnostic:**
```bash
# Resolve the script PM2 thinks it's running
pm2 jlist | jq '.[] | {name, pm2_env.pm_exec_path, pm2_env.status}'

# Or on Windows
pm2 prettylist | findstr /C:"pm_exec_path"
```

**Remediation:**
1. Open `ecosystem.config.js` and update all `script`, `cwd`, and `args` fields to current absolute paths.
2. Run `pm2 delete all && pm2 start ecosystem.config.js`.
3. Verify: `curl http://localhost:7780/api/services` returns a service list with at least one `online` entry.

---

### FM-04 — `.env` committed with placeholder values
**Symptom:** App boots without errors but every external call returns hardcoded fallback strings like `MOCK_RESPONSE` or `TEST_KEY_DO_NOT_USE`. Logs show `Using fallback provider` warnings.

**Root Cause:** Developer copy-pasted `.env.example` into `.env` and forgot to replace placeholders. The code's fallback path silently kicks in when an env var is set but matches known placeholder patterns.

**Diagnostic:**
```bash
# Find placeholder strings
grep -rEn "MOCK|TEST_KEY|REPLACE_ME|CHANGEME|<.*>" .env 2>/dev/null

# Check what providers think they're using
curl -s http://localhost:7780/api/services | jq '.[] | select(.status=="online") | .config.provider'
```

**Remediation:**
1. Replace placeholders with real keys from the vault (1Password, or your secret manager).
2. Add a startup assertion: any env var matching `/MOCK|REPLACE_ME|CHANGEME/<var>.includes()` should fail fast with a clear error.
3. Rotate the placeholder keys in your secret manager (they may have been logged publicly).
4. Add `.env` to `.gitignore` and scrub git history if it was ever committed.

---

## 2. Network / Connectivity

### FM-05 — Port 7780 (Control API) or 7779 (Voice Bridge) already bound
**Symptom:** New deployment fails with `EADDRINUSE: address already in use :::7780`. Operator can `curl localhost:7780` and get a response — but it's from an old/different PURPCLAW instance, not the current code.

**Root Cause:** Stale process from a previous `pm2` session, an orphaned `node.exe` from a crashed run, or another app (Skype, IIS, custom dev server) happens to bind the same port.

**Diagnostic:**
```powershell
# Windows: who has the port?
netstat -ano | findstr ":7780\|:7779"
Get-Process -Id <pid> | Select-Object Name,Path,StartTime

# Or
Test-NetConnection -ComputerName localhost -Port 7780
```
```bash
# Linux / WSL
lsof -i :7780 -i :7779
ss -tlnp | grep -E "7780|7779"
fuser -k 7780/tcp  # kills it; be careful
```

**Remediation:**
1. Identify the offending PID: `netstat -ano | findstr :7780`.
2. If it's a stale PURPCLAW process: `taskkill /PID <pid> /F` (Windows) or `kill -9 <pid>` (Linux).
3. If it's a different app: change the port in `ecosystem.config.js` and the matching `lib/ports.js` constant. Document the new port in `.env`.
4. Restart: `pm2 reload all`.
5. Verify: `curl -i http://localhost:7780/api/services` returns your service list.

---

### FM-06 — Provider API timeouts (upstream brownout)
**Symptom:** Agents take 30–60s to respond, then fail with `ETIMEDOUT` or `504 Gateway Timeout`. UI shows spinner of death. No errors in local service health.

**Root Cause:** Upstream LLM provider (OpenAI, Anthropic, etc.) is rate-limiting, in a regional outage, or the operator's egress IP got throttled. PURPCLAW's default timeout is generous; in failure mode the user sees the full timeout window.

**Diagnostic:**
```bash
# Hit provider status pages
curl -s https://status.openai.com/api/v2/status.json | jq '.status.indicator'
curl -s https://status.anthropic.com/api/v2/status.json | jq '.status.indicator'

# Check your own rate-limit headers
curl -i https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" | grep -i "x-ratelimit"

# In PURPCLAW logs
pm2 logs --lines 200 | grep -E "ETIMEDOUT|504|rate.?limit"
```

**Remediation:**
1. Check the provider status page first. If degraded, switch to a fallback provider in `.env` (`PURPCLAW_PRIMARY_PROVIDER`, `PURPCLAW_FALLBACK_PROVIDER`).
2. If self-throttled: reduce concurrency in `lib/concurrency.js` (look for `MAX_PARALLEL` constant) or back off request rate.
3. If persistent: rotate the API key — you may be on a poisoned key due to a billing issue.
4. Communicate to users: a banner "Provider X is degraded, falling back to Y" reduces support load.

---

### FM-07 — Localhost loopback in containerized / WSL2 deploys
**Symptom:** Service reports healthy on `127.0.0.1` from inside the container, but the host browser or another container can't reach it. `curl http://localhost:7780` from host returns `Connection refused`.

**Root Cause:** Service bound to `127.0.0.1` instead of `0.0.0.0`. In WSL2, Docker Desktop, or Hyper-V environments, the loopback is per-namespace and not shared with the host.

**Diagnostic:**
```bash
# From the host, can you reach the service?
curl -v http://localhost:7780/api/services

# What address is the service actually listening on?
pm2 logs --lines 20 | grep -i "listening\|bound\|address"

# Linux / WSL
ss -tlnp | grep 7780   # Look for 127.0.0.1:7780 vs 0.0.0.0:7780
```

**Remediation:**
1. Edit the bind address: `HOST=0.0.0.0` in `.env` or `server.listen(7780, '0.0.0.0')` in code.
2. Restart the service.
3. Verify: from host, `curl http://localhost:7780/api/services` returns 200.
4. For Docker: ensure the port is published with `-p 7780:7780` and the container's `HOST=0.0.0.0`.

---

## 3. Auth / Permissions

### FM-08 — `chmod 600` skipped on `.env` (Unix) / world-readable secrets on Windows
**Symptom:** No functional breakage, but a security scan (Snyk, TruffleHog, or GUARDIAN's own `check-secrets` skill) flags secrets as exposed. On multi-user systems another account on the box can read keys.

**Root Cause:** Operator created `.env` with default umask (often `022` = world-readable). Windows equivalent: the file inherits the user's default DACL which may include `Everyone: Read`.

**Diagnostic:**
```bash
# Linux / macOS
ls -la .env
stat -c '%a %n' .env   # 600 = owner-only; anything else = leak

# Windows
icacls .env   # Look for "Everyone: (R)" or "Users: (R)"
```

**Remediation:**
1. Tighten: `chmod 600 .env` and `chown $USER .env`.
2. Windows: `icacls .env /inheritance:r /grant:r "%USERNAME%:(R,W)"`.
3. Rotate every key that was ever readable by another user — assume it's burned.
4. Move to a real secret manager (1Password CLI, Azure Key Vault, AWS Secrets Manager) and read at runtime.

---

### FM-09 — Telegram / Discord gateway token revoked
**Symptom:** Bot stops responding in chat. PM2 process is `online` but logs show `401 Unauthorized` from the platform API every few seconds. No restart loop.

**Root Cause:** Token was regenerated in the platform admin UI (common after a "compromised token" scare) or the bot was removed and re-added to the server. The old token in `.env` is now invalid but the service can't tell — it just gets 401s forever.

**Diagnostic:**
```bash
# Telegram
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
# Should return {"ok":true,...}; if not, token is dead

# Discord
curl -s -H "Authorization: Bot $DISCORD_BOT_TOKEN" https://discord.com/api/v10/users/@me

# In logs
pm2 logs | grep -E "401|Unauthorized|invalid token"
```

**Remediation:**
1. Get a fresh token from the platform's developer portal.
2. Update `.env` and reload: `pm2 reload all` (or `pm2 restart <gateway-name>`).
3. Test: send `/ping` (or platform equivalent) and confirm reply.
4. Audit who had access to the old token and consider rotating the bot entirely.

---

### FM-10 — File-permission denied writing to logs / state
**Symptom:** Process boots, serves a few requests, then crashes. `pm2 logs` shows `EACCES: permission denied, open '.../state.json'`.

**Root Cause:** State files (PM2 dumps, feature-parity cache, agent state) live in a directory the running user can't write to. Common when running as a service account (`SYSTEM`, `pm2-user`) on a path owned by the interactive user.

**Diagnostic:**
```bash
# Linux
ls -la ~/.pm2/ /var/lib/purpclaw/ 2>/dev/null
sudo -u <service-user> touch /path/to/state.json   # does it work?

# Windows
icacls "E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\state" 2>nul
whoami /priv
```

**Remediation:**
1. `chown -R <service-user>:<group> /path/to/state` (Linux) or `icacls <path> /grant <user>:(OI)(CI)F` (Windows).
2. Or change the state directory in code: `STATE_DIR=/var/lib/purpclaw` env var.
3. Restart PM2 under the correct user.

---

## 4. Resource Exhaustion

### FM-11 — Disk fills up from `pm2` log rotation never configured
**Symptom:** Disk at 100%. PM2 won't start new processes with `ENOSPC: no space left on device`. Old services still "online" because their file descriptors are open, but every disk write throws.

**Root Cause:** PM2's `pm2-logrotate` module is not installed, or installed but not configured. `~/.pm2/logs/` grows until the disk is full. Especially common on Windows where the system drive (`C:`) is small.

**Diagnostic:**
```bash
# Where's the disk full?
df -h                    # Linux
Get-PSDrive              # Windows PowerShell equivalent

# What's eating space?
du -sh ~/.pm2/logs/      # Linux
Get-ChildItem $env:USERPROFILE\.pm2\logs -Recurse | Sort-Object Length -Descending | Select-Object -First 10

# Is logrotate installed?
pm2 list | grep logrotate
pm2 conf pm2-logrotate   # max_size, retain, compress
```

**Remediation:**
1. Install: `pm2 install pm2-logrotate`.
2. Configure: `pm2 set pm2-logrotate:max_size 50M && pm2 set pm2-logrotate:retain 10 && pm2 set pm2-logrotate:compress true`.
3. Free space now: `pm2 flush` (DANGER: clears all logs).
4. Add a disk monitor alert at 80% capacity.
5. On Windows: also consider moving `USERPROFILE\.pm2` to a non-system drive via a symlink.

---

### FM-12 — Memory leak in long-running gateway process
**Symptom:** Service runs fine for days, then becomes unresponsive. `pm2 monit` shows RSS climbing from ~200MB to >4GB over weeks. Eventually OOM-killed (Linux) or `process out of memory` (Windows).

**Root Cause:** Common offenders: unbounded Map/Set growth in chat history, accumulating setInterval timers, request/response objects not released after the connection closes, circular references in the JSON state file.

**Diagnostic:**
```bash
# Memory over time
pm2 monit

# Heap snapshot (Node)
node --inspect=0.0.0.0:9229 index.js   # then attach Chrome DevTools → Memory tab → take heap snapshot

# Quick-and-dirty RSS check
pm2 jlist | jq '.[] | {name, pm2_env.status, memory}'

# In logs
pm2 logs --lines 200 | grep -i "out of memory\|heap\|allocation failure"
```

**Remediation:**
1. Set a memory limit in `ecosystem.config.js`: `max_memory_restart: '512M'` — PM2 will recycle the process before it OOMs.
2. Find the leak: take 2 heap snapshots 60s apart in DevTools and compare retained sizes.
3. Patch: add explicit cleanup in `finally` blocks, use `Map` with LRU eviction, cap chat history length.
4. As a stopgap: `pm2 reload <service>` on a cron every 6h to recycle.

---

### FM-13 — CPU pinned at 100% by runaway agent loop
**Symptom:** One agent process pegs a core. `pm2 monit` shows 99% CPU. The agent isn't responding to anything; it just spins.

**Root Cause:** Agent got into a tool-call loop (calling tool → result triggers next call → infinite). No max-iteration guard, or the guard fires after thousands of iterations, not tens.

**Diagnostic:**
```bash
# What's the agent doing?
pm2 logs <name> --lines 500 | tail -100

# Is it the same tool called repeatedly?
pm2 logs <name> --lines 1000 | grep -oE '"tool_name":"[^"]+"' | sort | uniq -c | sort -rn | head

# Stack trace (Node)
kill -USR1 <pid>   # On Linux, dumps heap + stack; on Windows use procdump
```

**Remediation:**
1. Kill it now: `pm2 restart <name>`.
2. Patch the agent's loop guard: max 5–10 iterations per user turn, then force a final response or escalate to the user.
3. Add a circuit breaker: if the same tool is called N times in M seconds, abort and surface a clear error.
4. Monitor: alert on `cpu > 90% for 60s` for any single process.

---

## 5. Data Corruption

### FM-14 — `state.json` or agent memory file is half-written
**Symptom:** On boot, the service throws `SyntaxError: Unexpected end of JSON input` or `Unexpected token } in JSON at position 4821`. Feature parity, agent memory, or chat history is unavailable.

**Root Cause:** Process was killed mid-write (OOM, `pm2 kill`, hard reboot). The state file is a single JSON blob with no atomic-write pattern. Half the file is on disk, half is gone.

**Diagnostic:**
```bash
# Where the file ends
wc -l <state_file>
tail -c 200 <state_file> | xxd | tail

# Try to parse
node -e "JSON.parse(require('fs').readFileSync('<state_file>','utf8'))"

# Look for backups
ls -la <state_file>*    # *.bak, *.1, *.old
```

**Remediation:**
1. Stop the service: `pm2 stop <name>` (writes will continue and make it worse).
2. Restore from backup if available. If not:
   - Open the file in an editor; trim to the last complete JSON object (look for matching braces/brackets).
   - Or use `jq -c .` to attempt recovery (will fail on truncated input but tells you where it broke).
3. Patch the writer: use atomic write — write to `<file>.tmp` then `fs.renameSync` to the final path. Renames are atomic on the same filesystem.
4. Add a daily backup cron: `cp state.json state.json.$(date +%Y%m%d)` (keep last 7).
5. Restart the service.

---

### FM-15 — SQLite / better-sqlite3 WAL file orphaned after crash
**Symptom:** Reads return `database disk image is malformed` or `database is locked`. Service can't load any persisted state.

**Root Cause:** Crash left a `-wal` and `-shm` file behind. On next boot, the DB engine sees a WAL header but no matching main DB state, or the WAL has uncommitted transactions from a process that no longer exists.

**Diagnostic:**
```bash
ls -la data/*.db data/*.db-wal data/*.db-shm 2>/dev/null

sqlite3 data/state.db "PRAGMA integrity_check;"
sqlite3 data/state.db "PRAGMA journal_mode;"
```

**Remediation:**
1. Stop all services touching the DB.
2. Try: `sqlite3 data/state.db ".recover" | sqlite3 data/state.recovered.db` then swap files.
3. If recovery fails: restore from the most recent backup.
4. Going forward: ensure all writes go through transactions with `BEGIN IMMEDIATE` and the process traps SIGTERM to flush+checkpoint before exit.
5. Add a `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL` for better crash semantics.

---

### FM-16 — Feature-parity cache references deleted agent
**Symptom:** `/api/services` returns a list containing an agent name that no longer exists in the codebase. The dashboard shows it as `online` but `/api/agents/<id>` 404s.

**Root Cause:** Feature-parity cache is keyed by agent name and never invalidated when the agent is removed from the agent tower. Stale entries persist across restarts.

**Diagnostic:**
```bash
# Diff cache vs filesystem
cat .purpclaw/feature-parity.json | jq '.agents | keys'
ls lib/agents/ | grep -v '^_'
```

**Remediation:**
1. Delete the stale entries: `jq 'del(.agents["stale-name"])' .purpclaw/feature-parity.json > tmp && mv tmp .purpclaw/feature-parity.json`.
2. Or just nuke and rebuild: `rm .purpclaw/feature-parity.json && pm2 reload all` (the cache will rebuild on first scan).
3. Patch the agent loader to reconcile the cache against the filesystem on every boot.
4. Add a startup warning when a cached agent ID has no matching source file.

---

## 6. Version Mismatch

### FM-17 — Node version drift (Node 18 vs 20 vs 22)
**Symptom:** `SyntaxError: Unexpected token '?'` on optional chaining, or `require()` of an `import`-style module fails. Service boots in some environments and crashes in others.

**Root Cause:** Optional chaining (`?.`), top-level await, `structuredClone`, and ESM-style `import` are all Node-version-gated. A developer's local Node 22 code lands on a production box still running Node 18.

**Diagnostic:**
```bash
node --version
cat .nvmrc 2>/dev/null
cat package.json | jq '.engines'

# Find suspect syntax
grep -rn '\?\.' lib/ --include='*.js' | head
```

**Remediation:**
1. Pin: add `.nvmrc` with the target version (e.g. `20`).
2. In `package.json`, set `"engines": { "node": ">=20.0.0" }` and add an `npm` script `"preinstall": "node -e \"if(parseInt(process.versions.node)<20)process.exit(1)\""` to refuse install on wrong Node.
3. On Windows: install Node 20 LTS via `nvm-windows` or `fnm`.
4. Document the required version in `README.md` near the top.

---

### FM-18 — `lib/feature-parity.js` version drift across services
**Symptom:** Service A registers a new feature in feature-parity; Service B doesn't see it. Health checks return mismatched schemas. UI shows inconsistent state across panels.

**Root Cause:** `feature-parity.js` was updated in one service's `node_modules` (via local install) but the shared `lib/` copy is stale. Or two services were deployed from different commits.

**Diagnostic:**
```bash
# Compare hashes
md5sum lib/feature-parity.js
md5sum services/service-a/lib/feature-parity.js
md5sum services/service-b/lib/feature-parity.js

# Or
git log --oneline -- lib/feature-parity.js | head -5
git status lib/feature-parity.js
```

**Remediation:**
1. Decide: is `lib/` truly shared (symlink from a single source) or duplicated per service? Document it.
2. If shared: `git submodule update --init` or symlink-rebuild.
3. If duplicated: make it a build artifact. `cp canonical/lib/feature-parity.js services/*/lib/` in a deploy script.
4. Add a CI check: every service's `feature-parity.js` must hash-match the canonical one.
5. Restart all services together: `pm2 reload all`.

---

### FM-19 — Agent schema version doesn't match the runtime
**Symptom:** `spawn_agent` returns `Schema version mismatch: expected 2.1, got 1.4` or a similar error. The agent is in the tower but the runtime can't interpret its definition.

**Root Cause:** Agent was authored against an older `agents/<name>/schema.json` version. The runtime bumped to a new schema version (e.g. added required fields, renamed properties) but the agent wasn't migrated.

**Diagnostic:**
```bash
# What version is each agent on?
for d in agents/*/; do
  echo "$d $(jq -r .schema_version "$d/schema.json" 2>/dev/null)"
done

# What does the runtime expect?
grep -r "SCHEMA_VERSION\|schema_version" lib/agent-runtime/ | head
```

**Remediation:**
1. Identify which agents are behind. Migrate them: most schema bumps are additive; read the migration guide in `docs/migrations/v1-to-v2.md`.
2. If the agent is third-party: pin the runtime to the older version until upstream catches up, or fork and patch.
3. Add a CI step: `node scripts/validate-agent-schemas.js` fails the build if any agent is below the minimum version.
4. Re-deploy and re-test: `pm2 reload all && curl /api/services`.

---

### FM-20 — `package-lock.json` drift on Windows (CRLF vs LF)
**Symptom:** `npm install` produces different `node_modules/` trees on Windows vs Linux. A package works locally, fails in CI. `npm ci` errors with `Invalid lock file`.

**Root Cause:** `package-lock.json` was committed with mixed line endings (CRLF on Windows, LF on Linux). Some lockfile keys contain hashes; newline differences break the parse.

**Diagnostic:**
```bash
# Check the lockfile's line endings
file package-lock.json
head -1 package-lock.json | xxd | head -1
```

**Remediation:**
1. Normalize: `git config core.autocrlf false` (or `input`).
2. Re-normalize: `dos2unix package-lock.json` (or in PowerShell, read/write the file).
3. Add to `.gitattributes`: `package-lock.json text eol=lf`.
4. Delete `node_modules/`, re-run `npm ci` everywhere.
5. Re-run the deploy.

---

---

## Appendix A — Quick Diagnostic Cheatsheet

| Symptom | First thing to try |
|---|---|
| PM2 says online but nothing responds | `pm2 logs --lines 50` + `curl localhost:7780/api/services` |
| Agent calls return 401/403 | `pm2 env <id> \| grep KEY` (compare to `.env`) |
| Port already in use | `netstat -ano \| findstr :7780` |
| Disk full | `du -sh ~/.pm2/logs/` then `pm2 flush` |
| Memory climbing | `pm2 monit`, set `max_memory_restart` |
| SyntaxError on boot | `node --version` vs `.nvmrc` |
| JSON parse error on state | `tail -c 200 <file> \| xxd`, restore from backup |
| Bot not responding | `curl /getMe` with the bot token |

---

## Appendix B — Severity Classification

- **CRITICAL** (page on-call immediately): FM-02, FM-05 (if production), FM-08, FM-09, FM-14 (in production), FM-17 (CI broken)
- **HIGH** (fix within 24h): FM-01, FM-03, FM-06, FM-11, FM-12, FM-15, FM-19
- **MEDIUM** (fix this week): FM-04, FM-07, FM-10, FM-13, FM-16, FM-18, FM-20

---

**Maintained by:** GUARDIAN (Security Division)
**Review cadence:** Quarterly, or after every incident
**Last updated:** 2026

> "If a failure mode isn't in this doc, it's because we haven't seen it yet. When you see a new one, document it. Future-you at 3am will be grateful." — GUARDIAN
