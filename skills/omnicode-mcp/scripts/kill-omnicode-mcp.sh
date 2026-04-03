#!/usr/bin/env bash
# kill-omnicode-mcp.sh
#
# Find and kill any running OmniCode MCP server process and any active
# bench-many / sweep children spawned by its CLI. Idempotent — safe to run
# when nothing is running.
#
# Use this BEFORE moving files in a watched repo, or whenever the user says
# "kill the mcp", "files are locked", or "im moving files".
#
# After running, the MCP will auto-respawn on the next tool call (Hermes
# spawns stdio children on demand). The file watcher (chokidar) does NOT
# auto-respawn — the user must re-index to reactivate change detection.
#
# Requires: PowerShell (any modern Windows) and taskkill (built-in).

set -e

echo "[kill-omnicode-mcp] searching for OmniCode MCP server + bench children..."

# PowerShell: find node processes whose command line matches OmniCode paths.
# Three patterns:
#   1. Any node process with "omnicode" in the command line (MCP server wrapper)
#   2. Any node process with "dist/server.js" (the bare server process)
#   3. Any node process with "dist/cli.js bench" (active bench-many / sweep children)
PIDS=$(powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*omnicode*' -or \$_.CommandLine -like '*dist/server.js*' -or \$_.CommandLine -like '*dist/cli.js bench*' } | ForEach-Object { \$_.ProcessId }" 2>/dev/null | tr -d '\r' | grep -E '^[0-9]+$' || true)

if [ -z "$PIDS" ]; then
  echo "[kill-omnicode-mcp] no matching processes found. Already clean."
  exit 0
fi

echo "[kill-omnicode-mcp] found PIDs: $PIDS"
for PID in $PIDS; do
  echo "[kill-omnicode-mcp] killing PID $PID..."
  taskkill //F //PID "$PID" 2>&1 || echo "  (already gone)"
done

# Verify
echo "[kill-omnicode-mcp] verifying..."
REMAINING=$(powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*omnicode*' -or \$_.CommandLine -like '*dist/server.js*' -or \$_.CommandLine -like '*dist/cli.js bench*' } | ForEach-Object { \$_.ProcessId }" 2>/dev/null | tr -d '\r' | grep -E '^[0-9]+$' || true)

if [ -z "$REMAINING" ]; then
  echo "[kill-omnicode-mcp] clean. File locks released. Safe to move files."
  echo "[kill-omnicode-mcp] note: file watcher (chokidar) is also dead."
  echo "[kill-omnicode-mcp] re-index later with index_project to reactivate it."
  exit 0
else
  echo "[kill-omnicode-mcp] WARNING: still running: $REMAINING"
  exit 1
fi
