#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# PURPCLAW Installer — curl install.purpclaw.dev | sh
# ─────────────────────────────────────────────────────────────
set -e

PURP_DIR="${HOME}/.purpclaw"
VERSION="${PURPCLAW_VERSION:-latest}"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   PURPCLAW  — the tiny haunted workshop ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── Detect platform ──────────────────────────────────────────
OS="$(uname -s)"
if [[ "$OS" == "Darwin" ]]; then
  PLATFORM="darwin"
elif [[ "$OS" == "Linux" ]]; then
  PLATFORM="linux"
else
  echo "  [!] Unsupported OS: $OS"
  echo "     Install manually: https://purpclaw.dev/docs/install"
  exit 1
fi

# ── Node check ───────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  [!] Node.js not found."
  echo "     Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | tr -d 'v')
echo "  Node.js : $NODE_VERSION"
echo "  Platform: $PLATFORM"
echo "  Install : $PURP_DIR"
echo ""

# ── Clone or pull ────────────────────────────────────────────
if [[ -d "${PURP_DIR}/.git" ]]; then
  echo "  [~] PURPCLAW already installed — pulling latest..."
  cd "$PURP_DIR" && git pull
else
  echo "  [+] Cloning PURPCLAW..."
  git clone https://github.com/YOUR_GITHUB/purpclaw.git "$PURP_DIR"
fi

cd "$PURP_DIR"

# ── Install deps ─────────────────────────────────────────────
echo "  [+] Installing dependencies..."
npm install --silent 2>/dev/null || npm install

# ── PM2 global (if not present) ──────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "  [+] Installing PM2..."
  npm install -g pm2 --silent
fi

# ── Boot ─────────────────────────────────────────────────────
echo ""
echo "  [+] First-run wizard..."
node bin/purpclaw.js init --wizard

echo ""
echo "  ─────────────────────────────────────────"
echo "  PURPCLAW installed at: $PURP_DIR"
echo "  Start:  cd $PURP_DIR && npm start"
echo "  CLI:    purpclaw [command]"
echo ""
