# PurpClaw One-Line Installer (PowerShell)
# Usage: iex (irm https://raw.githubusercontent.com/weemadscotsman/purpclaw/main/scripts/install.ps1)

param([switch]$SkipNodeCheck, [string]$Branch = "main")

$ErrorActionPreference = "Stop"
Write-Host "`n  🟣 PurpClaw — AI Workstation OS Installer`n" -ForegroundColor Magenta

# ── Node.js check ──────────────────────────────────────────
if (-not $SkipNodeCheck) {
  try {
    $nodeVersion = (node --version 2>&1).Replace("v","")
    if ([int]$nodeVersion.Split(".")[0] -lt 18) {
      Write-Host "  ✗ Node.js 18+ required (found $nodeVersion)" -ForegroundColor Red
      Write-Host "  Install: https://nodejs.org" -ForegroundColor Gray
      exit 1
    }
    Write-Host "  ✓ Node.js $nodeVersion" -ForegroundColor Green
  } catch {
    Write-Host "  ✗ Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
  }
}

# ── Download ────────────────────────────────────────────────
$repo = "https://github.com/weemadscotsman/purpclaw/archive/refs/heads/$Branch.zip"
$tmp = "$env:TEMP\purpclaw.zip"
$dest = "$env:LOCALAPPDATA\purpclaw"

Write-Host "  ↓ Downloading purpclaw..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $repo -OutFile $tmp -UseBasicParsing

Write-Host "  📦 Extracting..." -ForegroundColor Cyan
Expand-Archive -Force -Path $tmp -DestinationPath "$env:TEMP\purpclaw-extract"
$extracted = Get-ChildItem "$env:TEMP\purpclaw-extract" | Select-Object -First 1
Copy-Item -Recurse -Force "$($extracted.FullName)" $dest

# ── Install ─────────────────────────────────────────────────
Push-Location $dest
Write-Host "  ↓ Installing dependencies..." -ForegroundColor Cyan
npm install --production --no-audit --no-fund 2>&1 | Out-Null
Write-Host "  ✓ Dependencies installed" -ForegroundColor Green

# ── Link globally ───────────────────────────────────────────
npm link 2>&1 | Out-Null
Write-Host "  ✓ purpclaw added to PATH" -ForegroundColor Green

# ── First-run config ────────────────────────────────────────
$configDir = "$env:USERPROFILE\.purpclaw"
if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }
$configFile = "$configDir\config.json"
if (-not (Test-Path $configFile)) {
  @{ provider = "ollama"; model = "qwen2.5:3b" } | ConvertTo-Json | Set-Content $configFile
  Write-Host "  ✓ Config created at ~/.purpclaw/config.json" -ForegroundColor Green
}

# ── Cleanup ─────────────────────────────────────────────────
Pop-Location
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\purpclaw-extract" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n  🟣 PurpClaw installed!`n" -ForegroundColor Magenta
Write-Host "  Quick start:" -ForegroundColor Gray
Write-Host "    purpclaw ask 'hello'" -ForegroundColor Cyan
Write-Host "    purpclaw tui ng" -ForegroundColor Cyan
Write-Host "    purpclaw ask --provider ollama 'write a script'" -ForegroundColor Cyan
Write-Host "`n  Set API keys in ~/.purpclaw/config.json or .env`n" -ForegroundColor Gray