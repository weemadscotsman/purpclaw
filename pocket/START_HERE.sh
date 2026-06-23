#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  PurpClaw Pocket OS Launcher — Linux/macOS
# ─────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POCKETHOME="$SCRIPT_DIR"
PURPCLAW_HOME="$POCKETHOME/purpclaw"

clear
echo
echo "  ╔═══════════════════════════════════════════════════╗"
echo "  ║           PurpClaw Pocket OS v0.1.6              ║"
echo "  ║   Private AI that lives with you, not the cloud  ║"
echo "  ╚═══════════════════════════════════════════════════╝"
echo

# ── 1. Environment detection ──
echo "  [1/5] Detecting environment..."
if ! command -v python3 &> /dev/null; then
    echo "    ERROR: python3 not found in PATH"
    exit 1
fi
if ! command -v node &> /dev/null; then
    echo "    ERROR: node not found in PATH"
    exit 1
fi
python3 "$POCKETHOME/detect.py"
echo

# ── 2. First-run check ──
if [ ! -f "$POCKETHOME/vault/.initialized" ]; then
    echo "  [2/5] First run detected. Starting onboarding..."
    if [ -x "$POCKETHOME/onboard.sh" ]; then
        bash "$POCKETHOME/onboard.sh"
    else
        echo "    WARNING: onboard.sh not found, skipping"
    fi
else
    echo "  [2/5] Pocket OS already initialized."
fi
echo

# ── 3. Start services ──
echo "  [3/5] Starting PurpClaw services..."
if [ -f "$PURPCLAW_HOME/bin/purpclaw.js" ]; then
    cd "$PURPCLAW_HOME"
    node bin/purpclaw.js safe-start --core 2>/dev/null || true
else
    echo "    ERROR: PurpClaw installation not found at $PURPCLAW_HOME"
    exit 1
fi
echo

# ── 4. Health check ──
echo "  [4/5] Waiting for services to come up..."
sleep 8

HEALTH=0
if curl -s -o /dev/null -w "%{http_code}" http://localhost:7780/api/health 2>/dev/null | grep -q "200"; then
    HEALTH=1
    echo "    API gateway OK"
else
    echo "    WARNING: API not responding yet, continuing anyway"
fi

# ── 5. Open dashboard ──
echo
echo "  [5/5] Opening dashboard..."
sleep 2

DASHBOARD_URL="http://localhost:3000"
if command -v xdg-open &> /dev/null; then
    xdg-open "$DASHBOARD_URL" 2>/dev/null &
elif command -v open &> /dev/null; then
    open "$DASHBOARD_URL" 2>/dev/null &
fi

echo
echo "  ╔═══════════════════════════════════════════════════╗"
echo "  ║  PurpClaw Pocket OS is running                    ║"
echo "  ║                                                   ║"
echo "  ║  Dashboard: http://localhost:3000                 ║"
echo "  ║  CLI:        node bin/purpclaw.js ask \"...\"       ║"
echo "  ║  TUI:        node bin/purpclaw.js tui             ║"
echo "  ║                                                   ║"
echo "  ║  Press Ctrl+C to stop.                            ║"
echo "  ╚═══════════════════════════════════════════════════╝"
echo

# Wait for Ctrl+C
trap 'echo "  Shutting down..."; cd "$PURPCLAW_HOME"; node bin/purpclaw.js stop 2>/dev/null; echo "  Done."; exit 0' INT TERM
wait
