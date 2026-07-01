# PurpClaw — First Run 🟣🐾

**Zero → chatting in under a minute. No key required.**

## 1. Install (one click)

- **Windows:** double-click `PURPCLAW_INSTALLER.bat`
- **Linux/macOS:** `bash purpclaw_install.sh`

The installer auto-does everything: checks Node, installs deps, creates `.env`, builds the cockpit, starts the core, runs a health check, and opens your browser. If anything's missing it tells you the **exact** fix — no "something went wrong."

## 2. Pick a mode (the wizard asks once)

| Mode | What it does | Needs a key? |
|---|---|---|
| **Demo** | Local test, canned/local brain | ❌ no |
| **API** | OpenAI / NVIDIA / etc. | ✅ yes |
| **Local** | Ollama / LM Studio (free) | ❌ no |
| **Dev** | Full logs + diagnostics | optional |

**No key? You're not blocked.** PurpClaw drops into **Demo Mode** automatically and chat still works.

## 3. Land on Mission Control

Browser opens to **http://localhost:3030/mission**. Hit **Start First Chat**.

## 4. First commands

```
health        check system status
tools         list available skills
scan repo     inspect this project
explain mode  show what mode you're in
first task    create a starter automation
```

Start with **`health`**.

## Go live later

Add a provider key in **Settings** (or rerun the wizard) → PurpClaw switches from demo to the full agent brain. Nothing else to change.

See also: [QUICKSTART.md](QUICKSTART.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [ONBOARDING_FLOW.md](ONBOARDING_FLOW.md)
