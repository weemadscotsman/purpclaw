# PURPCLAW install.ps1
# ============================================================================
# One-liner bootstrap for Windows.
#
# Usage (after this file is hosted):
#   PS> iwr -useb https://purpclaw.dev/install.ps1 | iex
#
# Until then, run locally:
#   PS> .\install.ps1
#
# What it does:
#   1. Checks Node.js >= 18  (suggests install if missing)
#   2. Checks Python 3.11    (suggests install if missing — cognitive services)
#   3. Checks / installs PM2 globally
#   4. Determines install path (defaults to current directory if PURPCLAW is here, else $env:USERPROFILE\PURPCLAW)
#   5. Runs `npm install`
#   6. Hands off to `node bin/purpclaw.js init --wizard`
#
# It does NOT clone from GitHub (PURPCLAW is local-first). The expectation is
# that you have the repo here already, or downloaded a release tarball.
# ============================================================================

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "  [PURPCLAW] $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  [✔]        $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [!]        $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  [✖]        $msg" -ForegroundColor Red }

Write-Host ''
Write-Host '  ██████╗ ██╗   ██╗██████╗ ██████╗  ██████╗██╗      █████╗ ██╗    ██╗' -ForegroundColor Magenta
Write-Host '  ██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██║     ██╔══██╗██║    ██║' -ForegroundColor Magenta
Write-Host '  ██████╔╝██║   ██║██████╔╝██████╔╝██║     ██║     ███████║██║ █╗ ██║' -ForegroundColor Magenta
Write-Host '  ██╔═══╝ ██║   ██║██╔══██╗██╔═══╝ ██║     ██║     ██╔══██║██║███╗██║' -ForegroundColor Magenta
Write-Host '  ██║     ╚██████╔╝██║  ██║██║     ╚██████╗███████╗██║  ██║╚███╔███╔╝' -ForegroundColor Magenta
Write-Host '  ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝      ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ' -ForegroundColor Magenta
Write-Host ''
Write-Host '  Autonomous Agent Runtime  ·  install.ps1' -ForegroundColor Gray
Write-Host ''

# ── 1. Node.js ────────────────────────────────────────────────────────────────
Step 'Checking Node.js...'
try {
  $nodeVer = (& node -v) 2>$null
  if ($nodeVer -match 'v(\d+)') {
    $major = [int]$Matches[1]
    if ($major -ge 18) { Ok "Node $nodeVer" }
    else { Fail "Node $nodeVer too old (need v18+)"; Write-Host '  Install from https://nodejs.org/'; exit 1 }
  } else { throw "no version" }
} catch {
  Fail 'Node.js not found'
  Write-Host '  Install from https://nodejs.org/ (LTS recommended)'
  Write-Host '  Then re-run this script.'
  exit 1
}

# ── 2. Python 3.11 (optional — cognitive services) ───────────────────────────
Step 'Checking Python 3.11 (optional, for cognitive services)...'
try {
  $py = (& py -3.11 -c "import sys; print(sys.version.split()[0])") 2>$null
  if ($py) { Ok "Python $py" } else { throw "missing" }
} catch {
  Warn 'Python 3.11 not found — cognitive services (memory matrix, neuro-symbolic) will be unavailable'
  Warn 'You can still run the core harness without it. Install later from python.org.'
}

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
Step 'Checking PM2...'
$pm2Installed = $false
try {
  $pm2Ver = (& npx pm2 -v) 2>$null
  if ($pm2Ver) { Ok "PM2 $pm2Ver"; $pm2Installed = $true }
} catch { }
if (-not $pm2Installed) {
  Step 'Installing PM2 globally (npm install -g pm2)...'
  try {
    & npm install -g pm2 2>&1 | Out-Null
    Ok 'PM2 installed'
  } catch {
    Fail "PM2 install failed: $_"
    Write-Host '  You may need to run an elevated shell, or run: npm install -g pm2'
    exit 1
  }
}

# ── 4. Locate install dir ─────────────────────────────────────────────────────
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$candidates = @($scriptDir, (Join-Path (Get-Location) 'PURPCLAW'), (Join-Path $env:USERPROFILE 'PURPCLAW'))
$purpclawDir = $null
foreach ($c in $candidates) {
  if ((Test-Path (Join-Path $c 'bin\purpclaw.js')) -and (Test-Path (Join-Path $c 'ecosystem.config.js'))) {
    $purpclawDir = $c; break
  }
}
if (-not $purpclawDir) {
  Fail 'PURPCLAW source not found.'
  Write-Host '  Looked in:'
  foreach ($c in $candidates) { Write-Host "    $c" }
  Write-Host ''
  Write-Host '  Clone the repo first:'
  Write-Host '    git clone https://github.com/<...>/purpclaw.git'
  Write-Host '    cd purpclaw'
  Write-Host '    .\install.ps1'
  exit 1
}
Ok "Found PURPCLAW at $purpclawDir"
Set-Location $purpclawDir

# ── 5. npm install ────────────────────────────────────────────────────────────
Step 'Installing Node dependencies (npm install)...'
try {
  & npm install --no-audit --no-fund 2>&1 | Tee-Object -Variable npmLog | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "npm install exited $LASTEXITCODE" }
  Ok 'Dependencies installed'
} catch {
  Fail "npm install failed: $_"
  Write-Host '  Last lines of npm output:'
  $npmLog | Select-Object -Last 6 | ForEach-Object { Write-Host "    $_" }
  exit 1
}

# ── 6. First-run wizard ──────────────────────────────────────────────────────
Write-Host ''
Step 'Launching first-run wizard...'
Write-Host ''
& node "bin\purpclaw.js" init --wizard
if ($LASTEXITCODE -ne 0) {
  Warn "Wizard exited with code $LASTEXITCODE — you can re-run it any time:"
  Write-Host '    node bin\purpclaw.js init --wizard'
  exit $LASTEXITCODE
}

Write-Host ''
Ok 'INSTALL COMPLETE'
Write-Host ''
Write-Host '  Next steps:' -ForegroundColor Gray
Write-Host '    node bin\purpclaw.js start        ' -NoNewline; Write-Host 'boot the swarm' -ForegroundColor DarkGray
Write-Host '    node bin\purpclaw.js mochi        ' -NoNewline; Write-Host 'chat with your companion' -ForegroundColor DarkGray
Write-Host '    node bin\purpclaw.js doctor       ' -NoNewline; Write-Host 'health check' -ForegroundColor DarkGray
Write-Host '    node bin\purpclaw.js run "<task>" ' -NoNewline; Write-Host 'dispatch an agent' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Tip: add an alias so you do not have to type `node bin\purpclaw.js` every time.' -ForegroundColor DarkGray
Write-Host '       PowerShell:  Set-Alias purpclaw "$pwd\bin\purpclaw.js"' -ForegroundColor DarkGray
Write-Host ''
