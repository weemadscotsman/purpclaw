@echo off
setlocal EnableDelayedExpansion

title 🫧 GOOP MASTER LAUNCHER 🫧
color 0A

:: ═══════════════════════════════════════════════════════════════
::  GOOP MASTER LAUNCHER — One Launcher To Rule Them All
::  Consolidated from 4 bat files into 1
:: ═══════════════════════════════════════════════════════════════

set "PURPCLAW=C:\Users\Admin\Desktop\PURPCLAW"
set "RIG_TERMINAL=C:\Users\Admin\Desktop\RECENT WORK\rig_terminal"
set "TESSERACT=C:\Program Files\Tesseract-OCR"
set "PYTHON_DIR=C:\vm4w\nodejs"

:: Add to PATH explicitly
set "PATH=%TESSERACT%;%PYTHON_DIR%;C:\Program Files\nodejs;C:\Windows\System32;%PATH%"

:: Environment for services
set "XIAOZHI_MCP_URL=wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg4MzkwOCwiYWdlbnRJZCI6MTY1NzQ1NiwiZW5kcG9pbnRJZCI6ImFnZW50XzE2NTc0NTYiLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc1Mzk2MTAxLCJleHAiOjE4MDY5NTM3MDF9.XGyB1-HbRdJHZAGcbKjqykT5tbJUUSjQpO_003Q0CgLSQk80JzHnt2Nt9bCqSw-aupQFZL-iT7IFq92QdbW24g"
set "MINIMAX_API_KEY=sk-cp-iSxo1Bb-S13ngdnv10cgZnJwQHKn65RAsUrGMtCQCI2TG2w4YNJ9NdzBnBFqziCFvu815lEqD4dLyvSdNCgAWsju-_pGdRq1iqNoSqVc-HLkFMynQrfDlqQ"
set "TESSERACT_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe"

:: ═══════════════════════════════════════════════════════════════
::  SECTION 0: Check what's already running
:: ═══════════════════════════════════════════════════════════════
echo.
echo  ╔═══════════════════════════════════════════════════════════╗
echo  ║     🫧 GOOP MASTER LAUNCHER v1.0 🫧                    ║
echo  ╚═══════════════════════════════════════════════════════════╝
echo.
echo  🔍 Checking what's already running...
echo.

for %%P in (7780 7781 7777 7778 7779 3030 9999 9227) do (
    netstat -ano | findstr ":%%P " | findstr "LISTENING" >nul
    if !errorlevel!==0 (
        for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING" ^| findstr "TCP"') do (
            echo    ✅ Port %%P — ALREADY RUNNING (PID: %%A)
        )
    ) else (
        echo    ⚪ Port %%P — NOT RUNNING
    )
)

echo.
echo  ═══════════════════════════════════════════════════════════════
echo.

:: ═══════════════════════════════════════════════════════════════
::  SECTION 1: Kill existing PURPCLAW services (clean start)
:: ═══════════════════════════════════════════════════════════════
echo  [1/5] 🧹 Cleaning up old processes...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *PURPCLAW*" >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *Control API*" >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *Guardian*" >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *Voice*" >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *Bridge*" >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *xiaozhi*" >nul 2>&1
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *Ball*" >nul 2>&1
timeout /t 2 /nobreak >nul
echo     ✅ Old processes cleaned
echo.

:: ═══════════════════════════════════════════════════════════════
::  SECTION 2: Launch PURPCLAW Core Services
:: ═══════════════════════════════════════════════════════════════
echo  [2/5] 🚀 Launching PURPCLAW v7.0 Core...
echo.

cd /d %PURPCLAW%

echo    💀 Starting Control API (7780)...
start "PURPCLAW: Control API" cmd /k "cd /d %PURPCLAW% && node control_api.js"
timeout /t 2 /nobreak >nul

echo    🔒 Starting GUARDIAN Security (7781)...
start "PURPCLAW: Guardian" cmd /k "cd /d %PURPCLAW% && node skills/guardian/security_control_api.js"
timeout /t 2 /nobreak >nul

echo    🎤 Starting Voice Bridge (7778/7777)...
start "PURPCLAW: Voice Bridge" cmd /k "cd /d %PURPCLAW% && node unified_bridge.js"
timeout /t 2 /nobreak >nul

echo.

:: ═══════════════════════════════════════════════════════════════
::  SECTION 3: Launch Xiaozhi Ball Bridge
:: ═══════════════════════════════════════════════════════════════
echo  [3/5] 🥁 Launching Xiaozhi Ball Bridge...
powershell -ExecutionPolicy Bypass -File "%PURPCLAW%\start_bridge.ps1"
timeout /t 3 /nobreak >nul
echo.

:: ═══════════════════════════════════════════════════════════════
::  SECTION 4: Launch dashboards
:: ═══════════════════════════════════════════════════════════════
echo  [4/5] 🌐 Opening dashboards...
start "" "http://localhost:3030"    :: Visualizer
start "" "http://localhost:7780"  :: Control API
start "" "http://localhost:7781"  :: Guardian
start "" "http://localhost:9999"  :: Avatar
start "" "http://localhost:3000"   :: PULSE Island
echo.

:: ═══════════════════════════════════════════════════════════════
::  SECTION 5: Launch Rig Terminal
:: ═══════════════════════════════════════════════════════════════
echo  [5/5] 🛠️  Starting Rig Terminal...
start "" "C:\Users\Admin\Desktop\RIG_TERMINAL.bat"
echo.

:: ═══════════════════════════════════════════════════════════════
::  HEALTH CHECK — Wait for services to come up
:: ═══════════════════════════════════════════════════════════════
echo  ═══════════════════════════════════════════════════════════════
echo  🩺 HEALTH CHECK — Waiting for services to initialize...
echo.

set "HEALTH_TIMEOUT=15"
set "HEALTH_INTERVAL=2"

for %%P in (7780 7781 7777 7778 3030 9999) do (
    set "PORT_FOUND=0"
    echo    Checking port %%P...
    for /L %%I in (1,1,%HEALTH_TIMEOUT%) do (
        netstat -ano | findstr ":%%P " | findstr "LISTENING" >nul
        if !errorlevel!==0 (
            set "PORT_FOUND=1"
            goto :found_%%P
        )
        timeout /t !HEALTH_INTERVAL! /nobreak >nul
    )
    :found_%%P
    if "!PORT_FOUND!"=="1" (
        echo      ✅ Port %%P — READY
    ) else (
        echo      ⚠️  Port %%P — NOT RESPONDING (may need more time)
    )
)

echo.
echo  ═══════════════════════════════════════════════════════════════
echo  📊 FINAL STATUS
echo  ═══════════════════════════════════════════════════════════════
echo.
echo    💀 Control API      — localhost:7780
echo    🔒 GUARDIAN         — localhost:7781
echo    🎤 Voice Bridge     — localhost:7778/7777
echo    🥁 Xiaozhi Ball     — api.xiaozhi.me
echo    👁️  Visualizer      — localhost:3030
echo    🦞 Avatar           — localhost:9999
echo    🏠 PULSE Island     — localhost:3000
echo    🛠️  Rig Terminal    — RUNNING
echo.
echo  ═══════════════════════════════════════════════════════════════
echo  🧪 SAMANTHA CAN NOW:
echo  ═══════════════════════════════════════════════════════════════
echo  • file_read, file_write, system_status, lcd_display
echo  • screenshot (uses Tesseract at %TESSERACT%)
echo  • All 66 PURPCLAW tools
echo.
echo  🔧 EXPLICIT PATHS SET:
echo    Tesseract: %TESSERACT%
echo    Python:   %PYTHON_DIR%
echo    Node:     C:\Program Files\nodejs
echo.
echo  ═══════════════════════════════════════════════════════════════
echo  ✅ GOOP MASTER LAUNCHER — COMPLETE
echo  ═══════════════════════════════════════════════════════════════
echo.
echo GOOP GOOP GOOP 🫧🦞🛠️
echo.
pause
