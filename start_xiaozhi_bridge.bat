@echo off
REM ═══════════════════════════════════════════════════════
REM   PURPCLAW x OPENCLAW x XIAOZHI MCP BRIDGE LAUNCHER
REM ═══════════════════════════════════════════════════════

REM ── YOUR TOKEN ───────────────────────────────────────
set XIAOZHI_MCP_URL=wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg4MzkwOCwiYWdlbnRJZCI6MTY1NzQ1NiwiZW5kcG9pbnRJZCI6ImFnZW50XzE2NTc0NTYiLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc1MjI5NjMxLCJleHAiOjE4MDY3ODcyMzF9.YCwiCVyo1YZmkMPhhWkAoc76IbRmuDf0WOYC1vOCdTeVPzhzG_qiUL68D6G-0D-9nhkpeSydnozNK00rBccduw

REM ── OpenClaw settings ────────────────────────────────
set OPENCLAW_GATEWAY=ws://127.0.0.1:18789
set MCP_BRIDGE_URL=http://localhost:3001

echo.
echo   [PURPCLAW] Booting xiaozhi MCP bridge...
echo.

cd /d "%~dp0"
node lib\xiaozhi_bridge.js

pause
