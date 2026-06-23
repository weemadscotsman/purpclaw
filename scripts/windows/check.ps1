param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Continue"
$failed = $false

function Report([string]$Name, [bool]$Ok, [string]$Detail) {
  $mark = if ($Ok) { "PASS" } else { "FAIL" }
  Write-Host ("{0,-5} {1,-24} {2}" -f $mark, $Name, $Detail)
  if (-not $Ok) { $script:failed = $true }
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
Report "Node.js" ($null -ne $node) $(if ($node) { (& $node.Source --version) } else { "node.exe not found" })

$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
Report "PM2" ($null -ne $pm2) $(if ($pm2) { $pm2.Source } else { "run npm install -g pm2" })

$required = @(
  "ecosystem.config.js",
  "scripts\windows\core-host.js",
  "scripts\windows\tray-agent.js",
  "scripts\windows\voice-session-host.js",
  "scripts\windows\purpclaw-tray.ps1"
)
foreach ($relative in $required) {
  $full = Join-Path $ProjectRoot $relative
  Report $relative (Test-Path $full) $full
}

foreach ($port in @(3030, 7780, 7781, 7782, 7784, 7792, 7796, 7896)) {
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  Write-Host ("INFO  {0,-24} {1}" -f "Port $port", $(if ($listening) { "listening" } else { "offline" }))
}

$service = Get-Service -Name "PurpClawCore" -ErrorAction SilentlyContinue
Write-Host ("INFO  {0,-24} {1}" -f "Windows service", $(if ($service) { $service.Status } else { "not installed" }))

$task = Get-ScheduledTask -TaskName "PurpClaw Tray" -ErrorAction SilentlyContinue
Write-Host ("INFO  {0,-24} {1}" -f "Tray scheduled task", $(if ($task) { $task.State } else { "not installed" }))

if ($failed) { exit 1 }
