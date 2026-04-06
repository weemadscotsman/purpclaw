# 🦞 PURPCLAW v7.0 — ULTIMATE

> **The AI Voice Agent MCP Bridge** — Gives your Xiaozhi AI hardware full autonomous PC control via 66 MCP tools. Built by [WEEMADSCOTSMAN](https://github.com/weemadscotsman) at Pixel Dynasty.

### 🚀 New Here? **[Read the Full Setup Guide →](SETUP_GUIDE.md)**

The setup guide covers everything from buying the hardware to your first voice command. Anyone with a Xiaozhi ball can use this.

## What Is This?

PURPCLAW is an MCP (Model Context Protocol) bridge that connects a **Xiaozhi AI voice agent** to your Windows PC. It turns a voice-enabled AI ball into a fully autonomous engineering assistant that can:

- 🖥️ **See your screen** — Screenshots + OCR text recognition
- 📸 **See YOU** — Webcam capture, face/object detection
- 🌐 **Browse the web** — Playwright-powered: click links, fill forms, read pages
- 📁 **Manage files** — Read, write, copy, move, delete, search, zip/extract
- 🖱️ **Control your desktop** — Mouse clicks, keyboard typing, window management
- ⬇️ **Download files** — Direct URL downloads
- 📦 **Install packages** — pip, npm, or choco
- 🔊 **Control audio** — Volume up/down/mute/set
- 🔧 **Run commands** — Shell execution with injection protection
- 🧠 **Remember things** — Persistent memory across sessions
- 🦞 **Run AI pipelines** — Start/stop/monitor PURPCLAW build pipelines

## Architecture

```
┌──────────────────┐     WebSocket      ┌──────────────────┐
│   Xiaozhi Ball   │ ◄──────────────── │  xiaozhi_bridge   │
│  (DeepSeek V3.1) │   MCP Protocol    │     v7.0.0        │
└──────────────────┘                   └────────┬─────────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              │                 │                 │
                        ┌─────┴─────┐   ┌──────┴──────┐   ┌─────┴─────┐
                        │ Playwright │   │ PowerShell  │   │  Python   │
                        │  Browser   │   │  .NET APIs  │   │  OpenCV   │
                        └───────────┘   └─────────────┘   └───────────┘
```

## 66 MCP Tools

### Vision (5)
| Tool | Description |
|------|------------|
| `screen_capture` | Screenshot the screen |
| `screen_ocr` | Read text from screen via OCR |
| `screen_find_object` | Detect objects with YOLO |
| `screen_find_template` | Find image on screen (template match) |
| `screen_info` | Get monitor sizes |

### Webcam (3)
| Tool | Description |
|------|------------|
| `webcam_look` | Take a photo with PC webcam |
| `webcam_detect` | Detect people/faces/objects |
| `webcam_read` | OCR text visible to camera |

### Mouse & Keyboard (3)
| Tool | Description |
|------|------------|
| `mouse_click` | Click, double-click, right-click, drag |
| `mouse_scroll` | Scroll wheel |
| `keyboard_type` | Type text or press shortcuts |

### UI Automation (1)
| Tool | Description |
|------|------------|
| `find_and_click` | Find and click UI elements by text |

### Window Management (3)
| Tool | Description |
|------|------------|
| `window_list` | List open windows |
| `window_focus` | Focus a window by title |
| `window_close` | Close a window |

### File System (8)
| Tool | Description |
|------|------------|
| `file_read` | Read file contents |
| `file_write` | Write/append to files |
| `file_list` | List directory contents |
| `file_search` | Search by name or content (Node.js, fast) |
| `file_copy` | Copy files/directories |
| `file_move` | Move/rename files |
| `file_delete` | Delete files (system path protected) |
| `dir_create` | Create directories |

### Browser (9) — Playwright-Powered
| Tool | Description |
|------|------------|
| `browser_open` | Open URL with full interaction |
| `browser_click` | Click links/buttons by visible text |
| `browser_type` | Type into form fields |
| `browser_scroll` | Scroll pages up/down |
| `browser_get_content` | Read page text content |
| `browser_screenshot` | Screenshot the browser |
| `browser_navigate` | Navigate: goto/back/forward/reload |
| `browser_tabs` | List open tabs |
| `browser_close_tab` | Close a tab |

### Downloads (1)
| Tool | Description |
|------|------------|
| `download_file` | Download file from URL |

### Process Management (2)
| Tool | Description |
|------|------------|
| `process_list` | List running processes |
| `process_kill` | Kill process by name/PID (critical procs blocked) |

### Audio (1)
| Tool | Description |
|------|------------|
| `volume_control` | Set volume, mute/unmute, up/down |

### Archives (2)
| Tool | Description |
|------|------------|
| `zip_create` | Create zip archives |
| `zip_extract` | Extract zip archives |

### Package Management (1)
| Tool | Description |
|------|------------|
| `install_package` | Install via pip/npm/choco |

### PURPCLAW Pipeline (4)
| Tool | Description |
|------|------------|
| `purpclaw_start` | Start AI build pipeline |
| `purpclaw_stop` | Stop pipeline |
| `purpclaw_status` | Get pipeline status |
| `purpclaw_logs` | Read pipeline logs |

### Git (1)
| Tool | Description |
|------|------------|
| `git_command` | Run git commands |

### Communication (4)
| Tool | Description |
|------|------------|
| `http_request` | HTTP GET/POST/PUT/DELETE |
| `clipboard` | Read/write clipboard |
| `speak` | Text-to-speech via Kokoro TTS |
| `notification` | Desktop toast notifications |

### Context & System (5)
| Tool | Description |
|------|------------|
| `active_window` | Get focused window info |
| `system_status` | CPU, RAM, process overview |
| `disk_info` | Drive space for all disks |
| `network_info` | IP, WiFi, internet status |
| `execute_command` | Execute shell commands (injection-proof) |

### Apps & Tasks (4)
| Tool | Description |
|------|------------|
| `open_application` | Launch apps by name |
| `memory` | Persistent remember/recall/forget/list |
| `task_schedule` | Schedule delayed tasks |
| `task_list` | List scheduled tasks |

## Setup

### Prerequisites
- **Node.js** 18+
- **Python** 3.10+ with `opencv-python`
- **Playwright** (`npm i playwright`)
- **Xiaozhi.me** account + configured agent

### Install

```bash
git clone https://github.com/weemadscotsman/purpclaw.git
cd purpclaw
npm install
cp .env.example .env
# Edit .env with your Xiaozhi MCP token
```

### Run

```bash
# Windows (recommended)
start_xiaozhi_bridge.bat

# Or manually
set XIAOZHI_MCP_URL=wss://api.xiaozhi.me/mcp/?token=YOUR_TOKEN
node lib/xiaozhi_bridge.js
```

### Environment Variables

| Variable | Description |
|----------|------------|
| `XIAOZHI_MCP_URL` | WebSocket URL from Xiaozhi MCP settings |
| `OPENCLAW_GATEWAY` | OpenClaw WebSocket (default: `ws://127.0.0.1:18789`) |
| `MCP_BRIDGE_URL` | Bridge HTTP server (default: `http://localhost:3001`) |

## Security

- **Shell injection protection** — All user input is sanitized via `san()` function
- **System path protection** — Cannot delete Windows/Program Files/AppData
- **Critical process protection** — Cannot kill explorer, csrss, lsass, svchost
- **Destructive command blocking** — Blocks `format`, recursive system deletes, shutdown
- **Tool timeout** — Every tool has a timeout to prevent hanging

## Tech Stack

- **Runtime**: Node.js (single-process, async event loop)
- **Browser**: Playwright (Chromium, headless: false)
- **Vision**: Python OpenCV + Haar cascade face detection
- **Screen**: .NET System.Drawing (fast screenshot via PowerShell)
- **Shell**: PowerShell -NoProfile -NonInteractive (fast startup)
- **Protocol**: MCP over WebSocket (JSON-RPC 2.0)

## Built With

Created by **Eddie Cannon** ([@weemadscotsman](https://github.com/weemadscotsman)) — Edinburgh, Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿

- **Pixel Dynasty** — Gaming Archive & Collab Hub
- **NDK Threads** — [ndkthreads.com](https://ndkthreads.com)
- **PixelBits420** — Fair-launch cryptocurrency

## License

MIT
