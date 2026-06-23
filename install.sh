#!/usr/bin/env bash
# PURPCLAW install.sh
# ============================================================================
# One-liner bootstrap for macOS / Linux.
#
# Usage (after this file is hosted):
#   $ curl -fsSL https://purpclaw.dev/install.sh | bash
#
# Until then, run locally:
#   $ ./install.sh
# ============================================================================

set -e

C_MAGENTA='\033[35m'
C_CYAN='\033[36m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_RED='\033[31m'
C_GRAY='\033[90m'
C_RESET='\033[0m'

step() { printf "  ${C_CYAN}[PURPCLAW]${C_RESET} %s\n" "$1"; }
ok()   { printf "  ${C_GREEN}[✔]${C_RESET}        %s\n" "$1"; }
warn() { printf "  ${C_YELLOW}[!]${C_RESET}        %s\n" "$1"; }
fail() { printf "  ${C_RED}[✖]${C_RESET}        %s\n" "$1"; }

echo
printf "${C_MAGENTA}  ██████╗ ██╗   ██╗██████╗ ██████╗  ██████╗██╗      █████╗ ██╗    ██╗\n"
printf "  ██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██║     ██╔══██╗██║    ██║\n"
printf "  ██████╔╝██║   ██║██████╔╝██████╔╝██║     ██║     ███████║██║ █╗ ██║\n"
printf "  ██╔═══╝ ██║   ██║██╔══██╗██╔═══╝ ██║     ██║     ██╔══██║██║███╗██║\n"
printf "  ██║     ╚██████╔╝██║  ██║██║     ╚██████╗███████╗██║  ██║╚███╔███╔╝\n"
printf "  ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝      ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ${C_RESET}\n"
echo
printf "  ${C_GRAY}Autonomous Agent Runtime  ·  install.sh${C_RESET}\n"
echo

# ── 1. Node.js ────────────────────────────────────────────────────────────────
step 'Checking Node.js...'
if ! command -v node >/dev/null 2>&1; then
  fail 'Node.js not found'
  echo '  Install via your package manager or from https://nodejs.org/ (LTS)'
  echo '  Then re-run this script.'
  exit 1
fi
NODE_VER=$(node -v)
NODE_MAJOR=$(printf '%s' "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node $NODE_VER too old (need v18+)"
  echo '  Install a newer Node (LTS) and re-run.'
  exit 1
fi
ok "Node $NODE_VER"

# ── 2. Python 3.11 (optional) ────────────────────────────────────────────────
step 'Checking Python 3.11 (optional, for cognitive services)...'
PY_BIN=""
for cand in python3.11 python3 python; do
  if command -v "$cand" >/dev/null 2>&1; then
    if "$cand" -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3,11) else 1)' 2>/dev/null; then
      PY_BIN="$cand"; break
    fi
  fi
done
if [ -n "$PY_BIN" ]; then
  ok "Python ($PY_BIN)"
else
  warn 'Python 3.11+ not found — cognitive services (memory matrix, neuro-symbolic) will be unavailable.'
  warn 'Core harness still works. Install later from python.org.'
fi

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
step 'Checking PM2...'
if npx pm2 -v >/dev/null 2>&1; then
  ok "PM2 $(npx pm2 -v 2>/dev/null)"
else
  step 'Installing PM2 globally (npm install -g pm2)...'
  if ! npm install -g pm2 >/dev/null 2>&1; then
    fail 'PM2 install failed (try: sudo npm install -g pm2)'
    exit 1
  fi
  ok 'PM2 installed'
fi

# ── 4. Locate install dir ─────────────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PURPCLAW_DIR=""
for cand in "$SCRIPT_DIR" "$(pwd)/PURPCLAW" "$HOME/PURPCLAW"; do
  if [ -f "$cand/bin/purpclaw.js" ] && [ -f "$cand/ecosystem.config.js" ]; then
    PURPCLAW_DIR="$cand"; break
  fi
done
if [ -z "$PURPCLAW_DIR" ]; then
  fail 'PURPCLAW source not found.'
  echo '  Clone first:'
  echo '    git clone https://github.com/<...>/purpclaw.git'
  echo '    cd purpclaw && ./install.sh'
  exit 1
fi
ok "Found PURPCLAW at $PURPCLAW_DIR"
cd "$PURPCLAW_DIR"

# ── 5. npm install ────────────────────────────────────────────────────────────
step 'Installing Node dependencies (npm install)...'
if ! npm install --no-audit --no-fund >/tmp/purpclaw-npm.log 2>&1; then
  fail 'npm install failed. Last lines:'
  tail -n 6 /tmp/purpclaw-npm.log | sed 's/^/    /'
  exit 1
fi
ok 'Dependencies installed'

# ── 6. First-run wizard ───────────────────────────────────────────────────────
echo
step 'Launching first-run wizard...'
echo
if ! node bin/purpclaw.js init --wizard; then
  warn 'Wizard did not complete cleanly. Re-run any time:'
  echo '    node bin/purpclaw.js init --wizard'
  exit 1
fi

echo
ok 'INSTALL COMPLETE'
echo
printf "  ${C_GRAY}Next steps:${C_RESET}\n"
printf "    ${C_CYAN}node bin/purpclaw.js start${C_RESET}        boot the swarm\n"
printf "    ${C_CYAN}node bin/purpclaw.js mochi${C_RESET}        chat with your companion\n"
printf "    ${C_CYAN}node bin/purpclaw.js doctor${C_RESET}       health check\n"
printf "    ${C_CYAN}node bin/purpclaw.js run \"<task>\"${C_RESET} dispatch an agent\n"
echo
printf "  ${C_GRAY}Tip: alias purpclaw='node $PURPCLAW_DIR/bin/purpclaw.js'${C_RESET}\n"
echo
