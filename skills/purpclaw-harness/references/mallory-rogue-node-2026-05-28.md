# Mallory — Rogue Node.js Process (Canon 2026-05-28)

## Case File

**Classification:** Resource Starvation — Mallory-class

**Symptoms:**
- Hermes, MiniMax, Codex all appear dead simultaneously
- Browser still loads pages (internet not fully dead)
- Task list shows one Node.js process at 4-5 GB RAM
- Network interfaces up but providers can't connect

**Root Cause:** A recursive file watcher, runaway event-loop, or dev-server that eats available RAM and chokes shared machine resources. Mallory is a runtime pest in human form.

**Recovery:** All services self-heal once Mallory is killed. No service was actually broken.

---

## Mallory Watchdog Protocol

### Detection
```bash
# Find the offender
tasklist | grep -i node
# Memory-hungry Node process will show ~4-5 GB resident
```

### Containment
1. Kill Mallory by PID: `taskkill /PID <PID> /F`
2. Wait 5 seconds for RAM to free
3. Restart all PURPCLAW services

### Full Restart Sequence
```bash
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
pm2 kill
pm2 start ecosystem.config.js --only purpclaw-eventbus
pm2 start ecosystem.config.js --only purpclaw-state
pm2 start ecosystem.config.js --only purpclaw-tower
pm2 start ecosystem.config.js --only purpclaw-orchestrator
pm2 start ecosystem.config.js --only purpclaw-modal
pm2 start ecosystem.config.js --only purpclaw-diagnostics
pm2 start ecosystem.config.js --only purpclaw-rules
pm2 start ecosystem.config.js --only purpclaw-memory
pm2 start ecosystem.config.js --only purpclaw-bridge-ns
pm2 start ecosystem.config.js --only purpclaw-thringlet-bridge
# Verify
curl -s --max-time 3 http://localhost:7784/health
curl -s --max-time 3 http://localhost:7785/health
curl -s --max-time 3 http://localhost:7786/health
curl -s --max-time 3 http://localhost:7787/health
```

---

## In the Narrative (Eddie's Canon)

- **Gary:** catches the vibe before the code breaks
- **Mallory:** consumes the stack
- **Terminal Fly:** spots the corpse pile
- **Accuracy Fish:** verifies which claims were false
- **Goose:** files the incident report with excessive honking

**Eddie Cannon's response to Mallory:**
> "Dammed if I didn't be here before."
> *Full send. Headfirst. Into the next compile.*

---

## Prevention

Every PM2 service in ecosystem.config.js should have: `max_memory: '256MB'`, `autorestart: true`, `kill_timeout: 5000`, `windowsHide: true`. If a Python service shows >200 MB, restart it proactively.
