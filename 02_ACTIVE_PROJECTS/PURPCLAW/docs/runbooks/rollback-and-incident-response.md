# 🌵 CACTUS — Rollback & Incident-Response Mini-Runbook

**Owner:** CACTUS (Efficiency Auditor, Infrastructure Division)
**Trigger:** Any agent-config rollout that smells wrong — error rate spike, latency regression, queue depth blowup, cost anomaly, user reports.
**Goal:** Stop the bleeding in < 5 min, full restore in < 15 min, calm customers, leave a paper trail.

---

## 0. Triage in 60 seconds (the cactus way)

Don't think. Do this exact sequence:

1. **Acknowledge** in `#purpclaw-incidents`: `🚨 INCIDENT — <service> — <symptom> — investigating`
2. **Classify** severity (SEV table below).
3. **Decide path** — HOT-FIX or ROLLBACK. Default to rollback if you can't name the cause in 5 min.
4. **Page on-call** (Section 3).
5. **Drain** (Section 1) — start this in parallel with diagnosis.
6. **Revert** (Section 2) — if rollback path chosen.
7. **Status page** (Section 4) — within 10 min of ack, even if it's "investigating".

### SEV Matrix

| SEV | Symptom | Action | Page |
|-----|---------|--------|------|
| SEV-1 | Service down OR data corruption OR cost runaway > 3× baseline | Rollback NOW, drain, page primary on-call | PagerDuty P1 + Telegram #oncall-primary |
| SEV-2 | Degraded — error rate > 5% OR p95 latency > 2× baseline OR agent spawn loop | Drain + diagnose 5 min, then rollback if unresolved | PagerDuty P2 + Slack #purpclaw-ops |
| SEV-3 | Minor regression — single agent, non-critical path | Hot-fix preferred, rollback if hot-fix > 30 min | Slack #purpclaw-ops only |

---

## 1. 🌵 Drain in-flight tasks

**Rule:** Stop the intake first, let the in-flight finish, then cut power. Never yank the cord mid-flight — you'll corrupt checkpoints.

### Sequence

```bash
# 1.1 Flip the kill-switch (PM2 env flag — set BEFORE any restart)
pm2 set purpclaw:accepting_traffic false   # tells gateway to 503 new requests

# 1.2 Watch the queue drain
watch -n 5 'curl -s http://localhost:PORT/api/services | jq ".inflight"'
# target: inflight = 0 before proceeding. timeout: 5 min, then force-kill.

# 1.3 Persist any pending checkpoints
curl -X POST http://localhost:PORT/api/agents/drain \
  -H "Content-Type: application/json" \
  -d '{"mode":"graceful","timeout_sec":300,"checkpoint":true}'

# 1.4 Force-kill stragglers (if 1.3 timed out)
pm2 stop all && sleep 10 && pm2 kill
```

### What "drained" means

- `inflight = 0` on `/api/services`
- No active agent workers (`tasklist` shows 0 node/python processes spawned in last 60s)
- Checkpoint files written to `~/.purpclaw/checkpoints/<timestamp>/`
- Gateway returning 503 for new requests

### If a task is genuinely stuck (> 10 min no progress)

- Capture its ID and trace ID, then `taskkill /F /PID <pid>` (Windows) or `kill -9 <pid>`.
- Note it in the incident log — Phoenix will recover from checkpoint on next wake.

---

## 2. 🌵 Revert to previous agent-config version

**Rule:** Config is versioned in git. Rollback = git revert + redeploy. Never hand-edit a prod config.

### Locate the previous version

```bash
# 2.1 Find the last known-good commit
git log --oneline -- config/agents/ | head -20
# Look for the commit tagged with ✅ in the PR title, or the last green deploy.

# 2.2 Confirm via deploy ledger
cat deploy-log.jsonl | jq -r 'select(.service=="<service>") | "\(.ts) \(.sha) \(.status)"'
```

### Revert

```bash
# 2.3 Create the revert commit (don't fast-forward — keeps audit trail)
git checkout main
git revert --no-edit <bad-sha>
git push origin main

# 2.4 Or, if emergency: pin directly to last-good SHA via PM2 env
export PURPCLAW_AGENT_CONFIG_SHA=<last-good-sha>
pm2 restart all --update-env

# 2.5 Verify config hash matches expected
curl -s http://localhost:PORT/api/services | jq '.config_sha'
# Must equal <last-good-sha>. If not, stop and escalate.
```

### Post-revert

- Watch `error_rate` for 5 min before declaring success.
- If the same SEV-1 symptom persists on the reverted config, the bug isn't in config — escalate to Phoenix for full rollback to previous release.

---

## 3. 🌵 Page the on-call

### Primary

```bash
# PagerDuty (preferred — has ack/escalation policy)
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H "Authorization: Token $PD_TOKEN" \
  -d @- <<'EOF'
{
  "routing_key": "$PD_KEY",
  "event_action": "trigger",
  "payload": {
    "summary": "[SEV-X] <service> — <one-line symptom>",
    "source": "purpclaw-<host>",
    "severity": "error",
    "custom_details": { "commit": "<sha>", "deploy_ts": "<iso>" }
  }
}
EOF
```

### Escalation tree

| Time unanswered | Who gets it | Channel |
|---|---|---|
| 0 min | Primary on-call | PagerDuty + Telegram |
| 5 min | Secondary on-call | PagerDuty + SMS |
| 15 min | Division lead (Infrastructure = CACTUS) | Phone |
| 30 min | Eddie | Direct message |

### Manual fallback (no PagerDuty)

Post in `#purpclaw-incidents` with `@oncall-primary @oncall-secondary` and phone-tree from `infra/escalation.yaml`.

---

## 4. 🌵 Customer-facing status template

**Rule:** Calm, factual, no promises you can't keep, updated every 30 min during active incident.

### Template

```
**Status:** Investigating | Identified | Monitoring | Resolved
**Service:** <name>
**Started:** <UTC timestamp>
**What we're seeing:** <one sentence, plain English, no jargon>
**What it means for you:** <does it block work? slow? partial?>
**What we're doing:** <current action — investigating / reverting / etc.>
**Next update:** <UTC timestamp, +30 min from now>

We post updates every 30 minutes until resolved.
```

### Examples

> **Status: Investigating**
> **Service:** Agent orchestration
> **Started:** 2026-01-15 14:32 UTC
> **What we're seeing:** A subset of agent tasks are failing to start.
> **What it means for you:** Some requests may return errors or take longer than usual.
> **What we're doing:** We've paused new task intake and reverted the most recent config change.
> **Next update:** 2026-01-15 15:00 UTC

> **Status: Resolved**
> **Service:** Agent orchestration
> **Resolved:** 2026-01-15 15:47 UTC (1h 15m)
> **What happened:** A config change introduced a regression in the agent spawn path.
> **What we did:** Rolled back to the previous version, drained in-flight tasks safely, and verified recovery.
> **Postmortem:** Will be published within 5 business days at <link>.

---

## 5. 🌵 Metrics to watch — first 60 minutes post-launch

**Rule:** Eyes on the golden signals for the first hour. If you can't see them, you're flying blind.

### Golden signals (every 30s)

| Metric | Source | Healthy | Trip the rollback |
|---|---|---|---|
| Error rate | `/api/metrics` `agent_error_rate` | < 1% | > 5% sustained 2 min |
| p95 latency | `/api/metrics` `agent_p95_ms` | < 2× pre-deploy | > 3× pre-deploy sustained 5 min |
| Queue depth | `/api/services` `inflight` | < 100 | > 500 OR growing |
| Cost / hour | billing API | within 20% of baseline | > 2× baseline |

### Agent-specific (Cactus cares)

| Metric | Why | Threshold |
|---|---|---|
| Token usage / request | Efficiency regression | > 1.5× pre-deploy |
| Dormancy wake time | Spawn regression | > 5 min |
| Checkpoint write rate | State corruption risk | 0 writes in 10 min = bad |
| Cache hit ratio | Storage efficiency | drop > 20% |
| Agent spawn P95 | Cold-start regression | > 10s |

### Watch window protocol

- **0–15 min:** Two people, dashboards open, no other work. One writes the status page every 30 min.
- **15–30 min:** Drop to one watcher if stable. Status page update due.
- **30–60 min:** Continue watching at 1-min intervals. If all green for 30 min straight, declare stable and schedule the postmortem.
- **60 min:** Hand off to long-term monitoring. Incident closes when postmortem is filed (within 5 business days).

### If any trip-wire fires in the first 60 min

→ Back to Section 0, Step 3. Default path is rollback. Don't try to be clever.

---

## 6. Postmortem hook (don't skip this — cactus needs to learn)

Within 5 business days, file `postmortems/YYYY-MM-DD-<slug>.md` with:

- Timeline (UTC, every action)
- Root cause (one sentence)
- Detection delay (when did symptoms start vs when we noticed)
- Time to mitigation
- What we'd do differently
- Action items (owner + due date)

Cactus reads every postmortem to update the efficiency library. No waste, no repeat mistakes.

---

*Last reviewed by CACTUS. If the runbook is wrong, fix it — don't work around it. — 🌵*
