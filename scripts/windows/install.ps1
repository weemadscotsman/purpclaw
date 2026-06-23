param(
  [switch]$InstallService,
  [switch]$InstallTray,
  [switch]$Uninstall,
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
$serviceDir = Join-Path $env:ProgramData "PurpClaw\service"
$wrapper = Join-Path $serviceDir "PurpClawCore.exe"
$config = Join-Path $serviceDir "PurpClawCore.xml"
$taskName = "PurpClaw Tray"
$winswUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Windows service installation requires an elevated PowerShell terminal."
  }
}

if ($Uninstall) {
  if (Test-Path $wrapper) {
    Assert-Administrator
    & $wrapper stop 2>$null
    & $wrapper uninstall
  }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "PurpClaw Windows integration removed."
  exit 0
}

if ($InstallService) {
  Assert-Administrator
  New-Item -ItemType Directory -Path $serviceDir -Force | Out-Null
  if (-not (Test-Path $wrapper)) {
    Invoke-WebRequest -UseBasicParsing -Uri $winswUrl -OutFile $wrapper
  }
  $node = (Get-Command node.exe).Source
  $hostScript = Join-Path $ProjectRoot "scripts\windows\core-host.js"
  $xml = @"
<service>
  <id>PurpClawCore</id>
  <name>PurpClaw Core</name>
  <description>PurpClaw local-first AI operating stack.</description>
  <executable>$node</executable>
  <arguments>&quot;$hostScript&quot;</arguments>
  <workingdirectory>$ProjectRoot</workingdirectory>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <stoptimeout>30sec</stoptimeout>
  <onfailure action="restart" delay="10 sec"/>
  <logpath>$serviceDir\logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10485760</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
</service>
"@
  Set-Content -LiteralPath $config -Value $xml -Encoding UTF8
  & $wrapper install
  & $wrapper start
  Write-Host "PurpClaw Core installed as an automatic Windows service."
}

if ($InstallTray) {
  $trayScript = Join-Path $ProjectRoot "scripts\windows\purpclaw-tray.ps1"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$trayScript`" -ProjectRoot `"$ProjectRoot`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host "PurpClaw tray installed for $env:USERNAME and started."
}

if (-not $InstallService -and -not $InstallTray) {
  Write-Host "Use -InstallService, -InstallTray, or both. Use -Uninstall to remove them."
}
