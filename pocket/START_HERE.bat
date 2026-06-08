@echo off
REM ─────────────────────────────────────────────────────────────
REM  PurpClaw Pocket OS Launcher — Windows
REM ─────────────────────────────────────────────────────────────
REM  Boots the PurpClaw stack from this USB drive.
REM  Opens dashboard in browser when ready.
REM ─────────────────────────────────────────────────────────────

setlocal
set SCRIPT_DIR=%~dp0
set POCKETHOME=%SCRIPT_DIR%
set PURPCLAW_HOME=%POCKETHOME%purpclaw

title PurpClaw Pocket OS
color 0B

echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║           PurpClaw Pocket OS v0.1.6              ║
echo  ║   Private AI that lives with you, not the cloud  ║
echo  ╚═══════════════════════════════════════════════════╝
echo.

REM ── 1. Environment detection ──
echo  [1/5] Detecting environment...
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ERROR: Python not found in PATH
    echo    Install Python 3.10+ from https://python.org
    pause
    exit /b 1
)
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ERROR: Node.js not found in PATH
    echo    Install Node 18+ from https://nodejs.org
    pause
    exit /b 1
)
python "%POCKETHOME%detect.py"
echo.

REM ── 2. First-run check ──
if not exist "%POCKETHOME%vault\.initialized" (
    echo  [2/5] First run detected. Starting onboarding...
    if exist "%POCKETHOME%onboard.bat" (
        call "%POCKETHOME%onboard.bat"
    ) else (
        echo    WARNING: onboard.bat not found, skipping
    )
) else (
    echo  [2/5] Pocket OS already initialized.
)
echo.

REM ── 3. Start services ──
echo  [3/5] Starting PurpClaw services...
if exist "%PURPCLAW_HOME%bin\purpclaw.js" (
    cd /d "%PURPCLAW_HOME%"
    call node bin\purpclaw.js safe-start --core 2>nul
) else (
    echo    ERROR: PurpClaw installation not found at %PURPCLAW_HOME%
    pause
    exit /b 1
)
echo.

REM ── 4. Health check ──
echo  [4/5] Waiting for services to come up...
timeout /t 8 /nobreak >nul

set HEALTH=0
curl -s -o nul -w "%%{http_code}" http://localhost:7780/api/health 2>nul | findstr "200" >nul
if %ERRORLEVEL% EQU 0 set HEALTH=1

if %HEALTH% EQU 1 (
    echo    API gateway OK
) else (
    echo    WARNING: API not responding yet, continuing anyway
)

REM ── 5. Open dashboard ──
echo.
echo  [5/5] Opening dashboard...
timeout /t 2 /nobreak >nul

if %HEALTH% EQU 1 (
    start http://localhost:3000
) else (
    start http://localhost:3000
)

echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║  PurpClaw Pocket OS is running                    ║
echo  ║                                                   ║
echo  ║  Dashboard: http://localhost:3000                 ║
echo  ║  CLI:        node bin\purpclaw.js ask "..."       ║
echo  ║  TUI:        node bin\purpclaw.js tui             ║
echo  ║                                                   ║
echo  ║  Press any key to stop.                           ║
echo  ╚═══════════════════════════════════════════════════╝
echo.

pause >nul

REM ── Shutdown ──
echo  Shutting down...
cd /d "%PURPCLAW_HOME%"
call node bin\purpclaw.js stop 2>nul
echo  Done.
endlocal
