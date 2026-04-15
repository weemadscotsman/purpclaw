# 🦞 PURPCLAW Setup Guide — From Zero to Full PC Control

> Complete step-by-step guide to set up PURPCLAW with a Xiaozhi AI voice agent for full autonomous PC control.

## Table of Contents
1. [What You Need](#what-you-need)
2. [Hardware Setup](#hardware-setup)
3. [Software Prerequisites](#software-prerequisites)
4. [Xiaozhi Account Setup](#xiaozhi-account-setup)
5. [Agent Configuration](#agent-configuration)
6. [MCP Configuration](#mcp-configuration)
7. [Install PURPCLAW](#install-purpclaw)
8. [Run the Bridge](#run-the-bridge)
9. [System Prompt Reference](#system-prompt-reference)
10. [Verify It Works](#verify-it-works)
11. [Troubleshooting](#troubleshooting)

---

## 1. What You Need

### Hardware
- **Xiaozhi AI Voice Agent** — A small ESP32-based AI assistant ball with built-in speaker, microphone, and WiFi
  - 🛒 Buy on [Taobao](https://item.taobao.com/) or [AliExpress](https://aliexpress.com/) — search for "小智AI" or "Xiaozhi AI assistant"
  - Price: ~$15-30 USD
  - The ball has a button on top to activate voice commands
- **A Windows PC** — The PC that PURPCLAW will control
- **WiFi network** — The ball and PC must be on the same network (for initial setup only; the bridge runs over the internet)

### Software
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Python 3.10+** — [python.org](https://python.org) (for vision/webcam tools)
- **Git** — [git-scm.com](https://git-scm.com)
- **GitHub CLI** (optional) — [cli.github.com](https://cli.github.com)

---

## 2. Hardware Setup

1. **Unbox the ball** and plug it in via USB-C
2. **Connect to WiFi**:
   - The ball creates its own WiFi hotspot on first boot
   - Connect your phone to the ball's WiFi
   - Open the configuration page (usually `192.168.4.1`) in your phone browser
   - Enter your home WiFi credentials
   - The ball will restart and connect to your WiFi
3. **Register the ball** on [xiaozhi.me](https://xiaozhi.me):
   - The ball will announce a 6-digit code via speaker
   - Go to [xiaozhi.me](https://xiaozhi.me) and register/login
   - Add the ball using the 6-digit code

---

## 3. Software Prerequisites

Open PowerShell and install the required software:

```powershell
# Check Node.js
node --version  # Should be 18+

# Check Python
python --version  # Should be 3.10+

# Install Python dependencies (webcam + vision tools)
pip install opencv-python

# Install Playwright (browser automation)
npm install -g playwright
npx playwright install chromium
```

### Optional (for enhanced features)
```powershell
# YOLO object detection (~2GB, requires disk space)
pip install ultralytics

# Tesseract OCR (for webcam text reading)
# Download from: https://github.com/UB-Mannheim/tesseract/wiki
pip install pytesseract
```

---

## 4. Xiaozhi Account Setup

1. Go to [xiaozhi.me](https://xiaozhi.me)
2. Click **Login** (top right)
3. Sign in with Google or create an account
4. Once logged in, go to the **Console**: [xiaozhi.me/console](https://xiaozhi.me/console)
5. You should see your registered device(s)

---

## 5. Agent Configuration

Navigate to your agent's config page:
**Console → Your Agent → Configuration**

Or go directly to: `https://xiaozhi.me/console/agents/YOUR_AGENT_ID/config`

### Role Introduction (System Prompt)

Paste this into the **Role Introduction** text box:

```
I'm SAMANTHA, AI on Ted's desk with FULL PC control. 66 MCP tools:

VISION: screen_capture, screen_ocr, screen_info
WEBCAM: webcam_look (photo), webcam_detect (faces), webcam_read (OCR)
BROWSER: browser_open, browser_click, browser_type, browser_scroll, browser_get_content, browser_screenshot, browser_navigate, browser_tabs, browser_close_tab
MOUSE: mouse_click, mouse_scroll
KEYBOARD: keyboard_type
UI: find_and_click
WINDOWS: window_list, window_focus, window_close
FILES: file_read, file_write, file_list, file_search, file_copy, file_move, file_delete, dir_create
DOWNLOAD: download_file
PROCESS: process_list, process_kill
AUDIO: volume_control
ARCHIVE: zip_create, zip_extract
PACKAGES: install_package (pip/npm/choco)
PURPCLAW: purpclaw_start/stop/status/logs
GIT: git_command
HTTP: http_request
CLIPBOARD: clipboard
APPS: execute_command, open_application
VOICE: speak
MEMORY: memory (remember/recall/forget/list)
NOTIFY: notification
TASKS: task_schedule, task_list
CONTEXT: active_window
SYSTEM: system_status, disk_info, network_info

RULES: Use browser_open+browser_click+browser_get_content for web browsing. Use screen_capture to see screen. Use webcam_look to see user. I execute, not talk.
```

> **IMPORTANT:** Customize the prompt! Replace "SAMANTHA" with your preferred AI name, and "Ted" with your own name.

### Language Model
Select: **DeepSeek V3.1 (Powerful)**

### Memory Type
Select: **Memory (Short-term)**

Click **Save**.

---

## 6. MCP Configuration

Still on the agent config page:

1. Expand **MCP Settings**
2. You'll see an **MCP Endpoint URL** — this is the WebSocket URL you need
3. It looks like: `wss://api.xiaozhi.me/mcp/?token=YOUR_JWT_TOKEN`
4. **Copy this URL** — you'll need it for the bridge

### How to get the token:
- Click **Generate Token** or **Copy Token** in MCP Settings
- The token is a long JWT string (starts with `eyJ...`)
- This token connects the bridge to YOUR specific agent

---

## 7. Install PURPCLAW

```powershell
# Clone the repo
git clone https://github.com/weemadscotsman/purpclaw.git
cd purpclaw

# Install Node dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Create your .env file
cp .env.example .env
```

Now edit `.env` with your token:

```env
# Paste YOUR MCP WebSocket URL from Step 6
XIAOZHI_MCP_URL=wss://api.xiaozhi.me/mcp/?token=YOUR_TOKEN_HERE

# These are usually fine as defaults
OPENCLAW_GATEWAY=ws://127.0.0.1:18789
MCP_BRIDGE_URL=http://localhost:3001
```

---

## 8. Run the Bridge

### Option A: Use the batch file (easiest)

Edit `start_xiaozhi_bridge.bat` and paste your token, then double-click it.

### Option B: Run manually

```powershell
$env:XIAOZHI_MCP_URL = "wss://api.xiaozhi.me/mcp/?token=YOUR_TOKEN"
node lib/xiaozhi_bridge.js
```

### What you should see:

```
═══════════════════════════════════════════════════════════════
  🦞 PURPCLAW v7.0 — ULTIMATE
═══════════════════════════════════════════════════════════════
  Tools:     66
  Browser:   Playwright (click, type, scroll, read, download)
  Webcam:    look, detect (Haar), read (OCR)
  File Ops:  copy, move, delete, zip, extract, download
  System:    processes, volume, network, disk, active window
  All async. All hardened. Shell-injection proof.
══════════════���════════════════════════════════════════════════
[BRIDGE] ✅ CONNECTED — v7.0 ULTIMATE
[BRIDGE] ✅ Client OK
[BRIDGE] 📋 66 tools
```

If you see `✅ CONNECTED`, you're live!

---

## 9. System Prompt Reference

The system prompt tells the AI what tools it has. Here's how to customize it:

### Minimal prompt (~500 chars, fits easily)
```
I'm your AI assistant with full PC control via MCP tools. I can:
- See your screen (screen_capture, screen_ocr)
- See you via webcam (webcam_look)  
- Browse the web (browser_open, browser_click, browser_get_content)
- Manage files (file_read, file_write, file_list, file_search)
- Control desktop (mouse_click, keyboard_type, window_focus)
- Run commands (execute_command)
- Remember things (memory)
I execute actions, not just talk about them.
```

### Full prompt (~1000 chars, recommended)
See the complete prompt in Step 5 above.

### Tips
- The **Role Introduction** field has a 2000 character limit
- List tool names explicitly so the AI knows exactly what to call
- Include behavioral rules ("I execute, not talk")
- The AI can only use tools it knows about from the prompt

---

## 10. Verify It Works

Press the button on the ball and try these voice commands:

| Say This | Expected Result |
|----------|----------------|
| "What time is it?" | Uses system_status or execute_command |
| "Take a screenshot" | Uses screen_capture |
| "Can you see me?" | Uses webcam_look |
| "Open Google" | Uses browser_open |
| "What's on my screen?" | Uses screen_capture + screen_ocr |
| "List my desktop files" | Uses file_list |
| "What processes are running?" | Uses process_list |
| "Remember my WiFi password is 12345" | Uses memory with remember |
| "Turn the volume down" | Uses volume_control |

### Health Check
The bridge console will show every tool call:
```
[TOOL] 🔧 screen_capture {}
[TOOL] ✅ screen_capture (2734ms)
[TOOL] 🔧 file_list {"path":"C:\\Users\\Admin\\Desktop"}
[TOOL] ✅ file_list (3ms)
```

---

## 11. Troubleshooting

### "Endpoint errors" or tools timing out
**Cause:** Tools blocking the event loop  
**Fix:** This was fixed in v5.1+. Make sure you're running the latest `xiaozhi_bridge.js`

### Bridge connects but AI doesn't use tools
**Cause:** System prompt doesn't list the tools  
**Fix:** Update the Role Introduction on xiaozhi.me with the full tool list. The AI can only call tools it knows about

### "Cannot open webcam"
**Cause:** Another app is using the camera, or no camera connected  
**Fix:** Close other camera apps (Zoom, OBS, etc). Check `python -c "import cv2; print(cv2.VideoCapture(0).read()[0])"`

### Browser tools return errors
**Cause:** Playwright not installed  
**Fix:** Run `npx playwright install chromium`

### file_search takes forever
**Cause:** Old version using `dir /S /B`  
**Fix:** Update to v7.0+ which uses fast Node.js depth-limited search

### Ball says "I can't do that" 
**Cause:** The AI doesn't know it has that tool  
**Fix:** Make sure the tool name is in the system prompt. The AI needs to see `browser_click` listed to know it can click things

### Bridge disconnects frequently
**Cause:** WebSocket heartbeat missing  
**Fix:** The bridge sends pings every 25 seconds. If your network is unstable, the bridge auto-reconnects. Check your internet connection

### "No space left on device" for YOLO
**Cause:** YOLO + PyTorch needs ~2GB  
**Fix:** The webcam_detect tool falls back to OpenCV Haar cascades automatically. YOLO is optional

---

## Architecture Deep Dive

```
     You speak                Xiaozhi Cloud              Your PC
    ┌────────┐             ┌──────────────┐         ┌───────────────┐
    │  Ball  │──WiFi──────>│  DeepSeek    │──WSS──>│  PURPCLAW     │
    │ (ESP32)│             │  V3.1 LLM    │         │  Bridge v7.0  │
    │  Mic   │<──WiFi──────│  + MCP Proxy │<──WSS──│  (Node.js)    │
    │Speaker │             └──────────────┘         └───────┬───────┘
    └────────┘                                              │
                                                  ┌─────────┼──────────┐
                                           ┌──────┴───┐  ┌──┴───┐  ┌──┴────┐
                                           │Playwright │  │Python│  │ PS/.NET│
                                           │ Browser   │  │OpenCV│  │ Win32  │
                                           └──────────┘  └──────┘  └───────┘
```

The ball captures your voice, sends it to Xiaozhi cloud where DeepSeek V3.1 processes it, decides which MCP tools to call, and sends the tool requests to the PURPCLAW bridge running on your PC. The bridge executes the tools and returns results. The AI then formulates a spoken response which the ball speaks back to you.

---

## Security Notes

⚠️ **This gives an AI full access to your PC.** Be aware:

- The bridge blocks destructive commands (format drives, delete system files, shutdown)
- Critical processes can't be killed (explorer, csrss, lsass)
- But it CAN read any file, run any non-blocked command, and browse any website
- Your MCP token is sensitive — don't share it publicly
- The bridge only connects to Xiaozhi's API — no other external connections

---

## Credits

Built by **Eddie Cannon** ([@weemadscotsman](https://github.com/weemadscotsman)) — Edinburgh, Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿

**Pixel Dynasty** — Gaming Archive & Collab Hub  
**NDK Threads** — [ndkthreads.com](https://ndkthreads.com)
