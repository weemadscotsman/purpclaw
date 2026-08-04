# PurpClaw — Onboarding Flow 🟣🐾

**The whole spine: Install → Setup → Verify → Chat → Tutorial.**
If a new user can't chat within one minute, the flow has failed.

## The journey

```
Download ─▶ Run Installer ─▶ Checks ─▶ Setup Wizard ─▶ Health Check ─▶ Launch ─▶ First Chat ─▶ Tutorial
```

### 1. Download
Grab the release zip or `git clone`. One big button: **Download PurpClaw**.

### 2. Run installer
- Windows: `PURPCLAW_INSTALLER.bat`
- Linux/macOS: `bash purpclaw_install.sh`

### 3. Automatic checks (`healthcheck.js` + installer)
Node ✓ · pm2 ✓ · deps ✓ · `.env` created ✓ · ports free ✓ · build ✓. Missing → exact fix shown.

### 4. First-run wizard (`node bin/purpclaw.js init`)
Pick a mode (Demo / API / Local / Dev). Asks ONLY what it needs. **No key → Demo Mode, no crash.**

### 5. Health check screen
```
System         Status
Server         ✅ Ready
Chat Core      ✅ Ready
Provider       ⚠️ demo (or ✅ with a key)
Memory         ⚠️ Disabled (optional)
UI             ✅ Ready
```

### 6. Launch
Browser opens to **http://localhost:3030/mission** → **Start First Chat**.

### 7. Tutorial chat (preloaded)
First message: *"Explain what PurpClaw can do and show me my first command."*
Preloaded buttons: Scan this project · Explain available tools · Run health check · Create my first agent task · Show beginner tutorial.

### 8. First commands
`health` · `tools` · `scan repo` · `explain mode` · `first task` — start with **health**.

## The one-minute rule

**Must happen automatically:** dependency install · `.env` creation · default config · port selection · browser launch · demo-mode fallback.

**Must NOT happen:** manual `.env` editing before first run · forcing a key before demo · twenty questions · "read the docs first" · raw stack traces.

## Files in this package
`PURPCLAW_INSTALLER.bat` · `purpclaw_install.sh` · `purpclaw.config.example.json` · `.env.example` · `healthcheck.js` · `demo-provider.js` · `FIRST_RUN.md` · `QUICKSTART.md` · `TROUBLESHOOTING.md` · `ONBOARDING_FLOW.md`

First-run wizard lives in the CLI: `node bin/purpclaw.js init`.

## Build priority (do not add more UI pages)
1. Quickstart installer ✅
2. Demo mode ✅ (`demo-provider.js`)
3. Health check ✅ (`healthcheck.js`)
4. First-run wizard ✅ (`bin/purpclaw.js init`)
5. Auto-open browser ✅ (installer)
6. Tutorial chat ✅ (preloaded message + Mission Control)
7. Troubleshooting docs ✅
8. Marketplace packaging — next

PurpClaw needs a front door, not another haunted corridor. 🫠
