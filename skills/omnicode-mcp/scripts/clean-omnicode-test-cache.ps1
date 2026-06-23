#!/usr/bin/env pwsh
# clean-omnicode-test-cache.ps1
# Wipes C: bloat created by MCP server testing, especially omnicode-mcp.
# Safe to run any time: no services are stopped, files-in-use are silently skipped.
# Recovers 6-15 GB on Ted's machine after a heavy bench session.

$ErrorActionPreference = 'SilentlyContinue'
$root = $env:USERPROFILE
$local = $env:LOCALAPPDATA
$temp = $env:TEMP

$targets = @(
  @{ Path = "$local\uv\cache"; Tag = 'uv cache (MCP test venvs)' },
  @{ Path = "$local\python\pythoncore-3.14-64"; Tag = 'uv-managed Python 3.14 (NOT hermes venv 3.11)' },
  @{ Path = "$local\pnpm"; Tag = 'pnpm store' },
  @{ Path = "$local\pnpm-cache"; Tag = 'pnpm cache' },
  @{ Path = "$local\pnpm-state"; Tag = 'pnpm state' },
  @{ Path = "$local\npm-cache"; Tag = 'npm cache' },
  @{ Path = "$local\huggingface\hub"; Tag = 'huggingface model cache' },
  @{ Path = "$local\@mmx-agentelectron-updater"; Tag = 'MiniMax Code electron updater cache' },
  @{ Path = "$local\antigravity-updater"; Tag = 'antigravity updater cache' },
  @{ Path = "$local\pip\cache"; Tag = 'pip cache' },
  @{ Path = "$local\D3DSCache"; Tag = 'D3D shader cache' },
  @{ Path = "$local\node-gyp"; Tag = 'node-gyp cache' },
  @{ Path = "$local\next-swc"; Tag = 'next-swc cache' },
  @{ Path = "$root\.code-index"; Tag = 'omnicode code-index cache (rebuilds on next index_project)' }
)

function Get-DirSize($p) {
  if (-not (Test-Path $p)) { return 0 }
  $sum = 0
  Get-ChildItem $p -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $sum += $_.Length }
  $sum
}

$before = (Get-PSDrive C).Free
$totalFreed = 0

Write-Host ''
Write-Host 'omnicode-mcp test cache cleanup' -ForegroundColor Cyan
Write-Host ('C: free before: {0:N2} GB' -f ($before / 1GB))
Write-Host ''

foreach ($t in $targets) {
  $b = Get-DirSize $t.Path
  if ($b -gt 0) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $t.Path
    $a = Get-DirSize $t.Path
    $freed = [math]::Round(($b - $a) / 1GB, 2)
    $totalFreed += $freed
    Write-Host ('  [+] {0,-50} {1,6} GB freed' -f $t.Tag, $freed)
  }
}

# Wipe all omnicode test temp dirs (118+ after a heavy session)
$omniTemps = Get-ChildItem $temp -Filter "omni*" -Directory -ErrorAction SilentlyContinue
$tempFreed = 0
foreach ($o in $omniTemps) {
  $b = Get-DirSize $o.FullName
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $o.FullName
  $tempFreed += $b
}
if ($tempFreed -gt 0) {
  $g = [math]::Round($tempFreed / 1GB, 2)
  $totalFreed += $g
  Write-Host ('  [+] {0,-50} {1,6} GB freed' -f "Temp/omni* ($($omniTemps.Count) dirs)", $g)
}

# Wipe rotated codex log/sessions
$codexTargets = @("$root\.codex\log", "$root\.codex\sessions")
foreach ($p in $codexTargets) {
  if (Test-Path $p) {
    $b = Get-DirSize $p
    Get-ChildItem $p -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    $a = Get-DirSize $p
    $freed = [math]::Round(($b - $a) / 1GB, 2)
    $totalFreed += $freed
    Write-Host ('  [+] {0,-50} {1,6} GB freed' -f $p.Replace($root, '~'), $freed)
  }
}

# Wipe PM2 log files (rotated, safe to clear)
$pm2Logs = "$root\.pm2\logs"
if (Test-Path $pm2Logs) {
  $b = Get-DirSize $pm2Logs
  Get-ChildItem $pm2Logs -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  $a = Get-DirSize $pm2Logs
  $freed = [math]::Round(($b - $a) / 1GB, 2)
  $totalFreed += $freed
  Write-Host ('  [+] {0,-50} {1,6} GB freed' -f '~/.pm2/logs', $freed)
}

# Hermes state-snapshots: keep latest 3, nuke rest
$snaps = "$local\hermes\state-snapshots"
if (Test-Path $snaps) {
  $old = Get-ChildItem $snaps -Force -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -Skip 3
  $snapFreed = 0
  foreach ($s in $old) {
    $b = Get-DirSize $s.FullName
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $s.FullName
    $snapFreed += $b
  }
  if ($snapFreed -gt 0) {
    $g = [math]::Round($snapFreed / 1GB, 2)
    $totalFreed += $g
    Write-Host ('  [+] {0,-50} {1,6} GB freed' -f "hermes state-snapshots (old, kept 3 latest)", $g)
  }
}

$after = (Get-PSDrive C).Free
Write-Host ''
Write-Host ('Total freed:    {0:N2} GB' -f $totalFreed) -ForegroundColor Green
Write-Host ('C: free after:  {0:N2} GB' -f ($after / 1GB)) -ForegroundColor Green
Write-Host ''
Write-Host 'NOTE: did NOT touch hermes/ (active agent), ~/.claude, ~/.codex/config.toml,' -ForegroundColor DarkGray
Write-Host '      ~/.gemini, or the system Python 3.11 in the hermes venv.' -ForegroundColor DarkGray
