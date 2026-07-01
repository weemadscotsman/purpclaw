@echo off
rem ─────────────────────────────────────────────────────────────
rem  PurpClaw Pocket OS Launcher — Windows
rem ─────────────────────────────────────────────────────────────
rem
rem  FIXED 2026-06-29:
rem  PURPCLAW_HOME now points to the actual runtime root,
rem  not pocket\purpclaw\ which does not exist.
rem
rem  The Pocket OS runtime commands are:
rem    node bin\purpclaw.js pocket <subcommand>
rem
rem  Audio onboarding assets: pocket\guide\
rem ─────────────────────────────────────────────────────────────

setlocal

rem Find the PURPCLAW root — this script lives in pocket\
set "POCKET_DIR=%~dp0"
set "POCKET_DIR=%POCKET_DIR:~0,-1%"
rem Go up one level to get the repo root
for %%I in ("%POCKET_DIR%") do set "PURPCLAW_HOME=%%~dpI"
set "PURPCLAW_HOME=%PURPCLAW_HOME:~0,-1%"

cls
echo.
echo   ╔═══════════════════════════════════════════════════╗
echo   ║           PurpClaw Pocket OS v0.3.0         ║
echo   ║   Private AI that lives with you, not the cloud  ║
echo   ╚═══════════════════════════════════════════════════╝
echo.

rem ── 1. Environment detection ──
echo   [1/5] Detecting environment...
where python >nul 2>&1
if errorlevel 1 (
    echo     ERROR: python not found in PATH
    exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
    echo     ERROR: node not found in PATH
    exit /b 1
)
python "%POCKET_DIR%\detect.py"
echo.

rem ── 2. First-run check ──
if not exist "%POCKET_DIR%\vault\.initialized" (
    echo   [2/5] First run detected. Starting onboarding...
    if exist "%POCKET_DIR%\onboard.bat" (
        call "%POCKET_DIR%\onboard.bat"
    ) else (
        echo     WARNING: onboard.bat not found, skipping
    )
) else (
    echo   [2/5] Pocket OS already initialized.
)
echo.

rem ── 3. Start services ──
echo   [3/5] Starting PurpClaw services...
if exist "%PURPCLAW_HOME%\bin\purpclaw.js" (
    cd /d "%PURPCLAW_HOME%"
    call node bin\purpclaw.js safe-start --core 2>nul
) else (
    echo     ERROR: PurpClaw installation not found at:
    echo            %PURPCLAW_HOME%
    echo     Expected: %%PURPCLAW_HOME%%\bin\purpclaw.js
    echo.
    echo     Are you running from the correct directory?
    echo     The pocket^ folder should be inside the PURPCLAW repo root.
    exit /b 1
)
echo.

rem ── 4. Health check ──
echo   [4/5] Waiting for services to come up...
timeout /t 8 /nobreak >nul

curl -s -o nul -w "%%{http_code}" http://localhost:7780/api/health 2>nul | findstr /r "200" >nul
if errorlevel 1 (
    echo     WARNING: API not responding yet, continuing anyway
) else (
    echo     API gateway OK
)

rem ── 5. Open dashboard ──
echo.
echo   [5/5] Opening dashboard...
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo   ╔═══════════════════════════════════════════════════╗
echo   ║  PurpClaw Pocket OS is running                    ║
echo   ║                                                   ║
echo   ║  Dashboard: http://localhost:3000                 ║
echo   ║  CLI:        node bin\purpclaw.js ask "..."       ║
echo   ║  TUI:        node bin\purpclaw.js tui             ║
echo   ║  Pocket:     node bin\purpclaw.js pocket status   ║
echo   ║                                                   ║
echo   ║  Press Ctrl+C to stop.                            ║
echo   ╚═══════════════════════════════════════════════════╝
echo.

rem Wait for Ctrl+C
pause
