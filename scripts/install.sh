#!/usr/bin/env bash
# PurpClaw One-Line Installer (macOS / Linux)
# Usage: curl -fsSL https://raw.githubusercontent.com/weemadscotsman/purpclaw/main/scripts/install.sh | bash

set -e
BRANCH="${BRANCH:-main}"
REPO="https://github.com/weemadscotsman/purpclaw/archive/refs/heads/${BRANCH}.tar.gz"
DEST="${HOME}/.purpclaw"
INSTALL_DIR="${DEST}/current"

echo ""
echo "  🟣 PurpClaw — AI Workstation OS Installer"
echo ""

# ── Node.js check ──────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js not found. Install from https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "  ✗ Node.js 18+ required (found v$NODE_VER)"
  exit 1
fi
echo "  ✓ Node.js $(node -v)"

# ── Download & extract ─────────────────────────────────────
echo "  ↓ Downloading purpclaw..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$REPO" | tar -xz -C "$INSTALL_DIR" --strip-components=1 2>/dev/null

# ── Install ─────────────────────────────────────────────────
cd "$INSTALL_DIR"
echo "  ↓ Installing dependencies..."
npm install --production --no-audit --no-fund --silent

# ── Link globally ───────────────────────────────────────────
npm link --silent 2>/dev/null || sudo npm link --silent 2>/dev/null
echo "  ✓ purpclaw added to PATH"

# ── First-run config ────────────────────────────────────────
CONFIG_DIR="${HOME}/.purpclaw"
mkdir -p "$CONFIG_DIR"
CONFIG_FILE="${CONFIG_DIR}/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo '{"provider":"ollama","model":"qwen2.5:3b"}' > "$CONFIG_FILE"
  echo "  ✓ Config created at ~/.purpclaw/config.json"
fi

echo ""
echo "  🟣 PurpClaw installed!"
echo ""
echo "  Quick start:"
echo "    purpclaw ask 'hello'"
echo "    purpclaw tui ng"
echo "    purpclaw ask --provider ollama 'write a script'"
echo ""
echo "  Set API keys in ~/.purpclaw/config.json or .env"
echo ""