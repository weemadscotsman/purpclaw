# TOOLS.md — The PurpClaw Runtime Environment

This file is the definitive reference for the PurpClaw stack. Every agent reads it to know where everything lives, how to reach it, and what quirks to expect.

---

## System Overview

| Item | Value |
|------|-------|
| OS | Windows 10 |
| Hostname | (use `C:\Users\Admin\`) |
| Shell | git-bash / MSYS (POSIX syntax) |
| User home | `C:\Users\Admin` |
| Python (default) | `C:\Users\Admin\AppData\Local\Programs\Python\Python311\python.exe` |
| Python (windowless) | `C:\Users\Admin\AppData\Local\Programs\Python\Python311\pythonw.exe` |
| Python (uv 3.14) | `C:\Users\Admin\AppData\Local\python\pythoncore-3.14-64\` |
| Python (Hermes venv) | `C:\Users\Admin\AppData\Local\hermes\hermes-agent\venv\` |
| Node | Installed and used by Next.js |
| uv | Installed, manages venvs + 3.14 build |
| PM2 | Installed, daemon up |

---

## The PurpClaw Stack (This Project)

| Location | Purpose |
|----------|---------|
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/` | Root of the entire stack |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/` | Next.js frontend (mission, control room) |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/*.js` | Node.js backend services |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/*.py` | Python backend services |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/` | Helper modules (rate‑limiter, governance, etc.) |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/bin/purpclaw.js` | CLI entry point |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/ecosystem.config.js` | PM2 service definitions (source of truth) |
| `~/.pm2/logs/` | PM2 logs (use `pm2 logs <service>`) |
| `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/workspace/` | This workspace (all `.md` law files) |

---

## Core AI Infrastructure (The Brains)

| Model/Service | Purpose | Access |
|---------------|---------|--------|
| **NVIDIA NIM API** | Unified access to multiple models (DeepSeek, GLM-5.2, etc.) | Configured via environment variables |
| **DeepSeek v4 Pro** | Primary reasoning, orchestration, and coding | Accessed through NVIDIA NIM |
| **DeepSeek v4 Flash** | Fast, lightweight reasoning and quick responses | Accessed through NVIDIA NIM |
| **GLM-5.2** | Long‑context (1M tokens), open‑source, Opus‑level coding | Accessed through NVIDIA NIM or local deployment |
| **Kimi K2.6** | Swarm execution (100 agents per swarm) | Accessed via dedicated API endpoint |
| **Minimax M3** | Main user chat and delegation | Accessed via API key (or local) |
| **Gemma 4B** | Lightweight reasoning and routing | Local via Ollama or NVIDIA NIM |

All API keys and endpoints are stored in `.env` at the project root. Never hard‑code credentials.

---

## Voice & Audio

| Item | Path / Value |
|------|--------------|
| **Speak script** | `C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py` |
| **TTS model** | `hexgrad/Kokoro-82M` (local, no API key) |
| **Voice** | `af_heart` (cheerful anime‑style female) |
| **Playback** | PowerShell `System.Media.SoundPlayer.PlaySync()` (foreground) |
| **STT** | Faster‑Whisper (local, tiny) on `purpclaw-stt :7896` |
| **Voice bridge** | `purpclaw-bridge :7792` (to Telegram, etc.) |
| **Voice coordinator** | `purpclaw-voice :7781` |

**STALE‑CLEAN RULE:** `speak_kokoro.py` wipes old WAVs at startup (`speak_kokoro_*.wav` + `tmp*.wav`) and deletes its own WAV after play. Do not try to read those files after the script returns.

---

## Service Map (Port → Purpose)

| Port | Service | Purpose |
|------|---------|---------|
| 3000 | `purpclaw-nextjs` | Next.js mission UI |
| 5000 | PVX (thringlets) | Colony substrate (external) |
| 7779 | `purpclaw-yolo` | YOLO object detection (Python) |
| 7780 | `purpclaw-api` | Unified API gateway |
| 7781 | `purpclaw-voice` | Voice coordinator |
| 7782 | `purpclaw-eventbus` | Publish/subscribe event bus |
| 7783 | `purpclaw-state` | State store |
| 7784 | `purpclaw-orchestrator` | Workflow orchestrator |
| 7785 | `purpclaw-modal` | Modal logic (Python) |
| 7786 | `purpclaw-diagnostics` | Autonomous diagnostics (Python) |
| 7787 | `purpclaw-rules` | Symbolic rules engine (Python) |
| 7790 | `purpclaw-tower` | Agent tower (spawn/run agents) |
| 7791 | `purpclaw-gatekeeper` | Safety gatekeeper |
| 7792 | `purpclaw-bridge` | Voice bridge (Telegram/etc) |
| 7797 | `purpclaw-no-spaghett` | Codebase architecture analyzer |
| 7798 | `purpclaw-harness` | Autonomous multi‑step harness |
| 7799 | `purpclaw-thringlet-bridge` | Thringlet colony bridge |
| 7880 | `purpclaw-memory` | Memory matrix v2 (Python) |
| 7881 | `purpclaw-context` | Context bus |
| 7884 | `purpclaw-bridge-ns` | Neuro‑symbolic bridge (Python) |
| 7885 | `purpclaw-pool` | Knowledge pool |
| 7890 | `purpclaw-metrics` | Metrics aggregator |
| 7895 | `purpclaw-dream` | AutoDream memory consolidator (Python) |
| 7897 | `purpclaw-workers` | Worker pool |
| 7898 | `purpclaw-coordinator` | Swarm coordinator |

---

## CLI Quick Reference

| Command | Purpose |
|---------|---------|
| `purpclaw safe-start` | Boot the stack (silent, no UIs) |
| `purpclaw safe-start --with-ui` | Boot stack + UIs |
| `purpclaw open <name>` | Launch a UI (e.g., `mission`, `control`) |
| `purpclaw open` | List available UIs |
| `purpclaw smoke --quick` | Smoke test (expect 12/13) |
| `purpclaw heal --execute` | Diagnose and repair |
| `purpclaw status` | Show service status |
| `purpclaw logs <service>` | Show PM2 logs for a service |
| `purpclaw grow` | Grow the swarm |
| `purpclaw forge <name>` | Create a new agent |
| `purpclaw ask "question"` | Query the LLM |
| `purpclaw run "task"` | Run a one‑off agent task |
| `purpclaw harness run "goal"` | Execute a multi‑step harness goal |

---

## Environment Quirks (Learned, Durable)

| Issue | Solution |
|-------|----------|
| **PM2 + Python** | Always use `pythonw.exe` (no console flash) |
| **PM2 + Next.js dev** | Always set `BROWSER=none` (no auto‑tab) |
| **PM2 + service‑proxy** | 15s timeout — design for it |
| **winsound.PlaySound** | Silent on Ted's box — **never use it** |
| **OmniCode MCP tests** | Write 110+ dirs to `%LOCALAPPDATA%\Temp\omni*` (200‑800MB) |
| **uv‑managed Python 3.14** | Safe to wipe `~1.8GB` from `%LOCALAPPDATA%\uv\cache\` |
| **Kokoro model cache** | `C:/Users/Admin/AppData/Local/huggingface` |
| **C: drive** | 99% full (≈3.6GB free) — never write work artifacts there. Use `E:` drive. |
| **E: drive** | 64.5GB free — preferred for all work and scratch. |

---

## Key Paths Summary (Quick Lookup)

| What | Where |
|------|-------|
| PurpClaw root | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/` |
| Workspace (this file) | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/workspace/` |
| Next.js app | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/` |
| PM2 ecosystem | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/ecosystem.config.js` |
| CLI entry | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/bin/purpclaw.js` |
| Voice script | `C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py` |
| Hermes skills | `C:/Users/Admin/AppData/Local/hermes/skills/` |
| PM2 logs | `~/.pm2/logs/` |

---

## Last Updated

**2026-06-19** — Complete native rewrite. Removed all OpenClaw references. Added NVIDIA NIM, DeepSeek, GLM-5.2, and Kimi K2.6 as core AI infrastructure. Now the definitive PurPClaw environment map.