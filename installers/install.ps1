# ─────────────────────────────────────────────────────────────
# PURPCLAW Installer — Windows (run as Administrator)
#   iex (irm install.purpclaw.dev | iex)
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
$PURP_DIR = "$env:USERPROFILE\\.purpclaw"

Write-Host ""
Write-Host "  PURPCLAW  — the tiny haunted workshop" -ForegroundColor Cyan
Write-Host ""

# ── Node check ───────────────────────────────────────────────
try { node -v | Out-Null } catch {
  Write-Host "  [!] Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
  exit 1
}
Write-Host "  Node.js : $(node -v)" -ForegroundColor Gray
Write-Host "  Install : $PURP_DIR" -ForegroundColor Gray

# ── Clone or pull ────────────────────────────────────────────
if (Test-Path "$PURP_DIR\\.git") {
  Write-Host "  [~] Updating existing installation..." -ForegroundColor Yellow
  Set-Location $PURP_DIR
  git pull
} else {
  Write-Host "  [+] Cloning PURPCLAW..." -ForegroundColor Green
  git clone https://github.com/YOUR_GITHUB/purpclaw.git $PURP_DIR
}

Set-Location $PURP_DIR

# ── Install deps ─────────────────────────────────────────────
Write-Host "  [+] Installing npm dependencies..." -ForegroundColor Green
npm install

# ── PM2 global ───────────────────────────────────────────────
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "  [+] Installing PM2..." -ForegroundColor Green
  npm install -g pm2
}

# ── First-run wizard ─────────────────────────────────────────
Write-Host ""
Write-Host "  [+] First-run wizard..." -ForegroundColor Green
node bin\\purpclaw.js init --wizard

Write-Host ""
Write-Host "  ─────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "  PURPCLAW installed at: $PURP_DIR" -ForegroundColor Cyan
Write-Host "  Start:  cd $PURP_DIR; npm start" -ForegroundColor White
Write-Host ""
