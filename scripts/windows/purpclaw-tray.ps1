param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$node = (Get-Command node.exe).Source
$agentScript = Join-Path $ProjectRoot "scripts\windows\tray-agent.js"
$agent = Start-Process -FilePath $node -ArgumentList @($agentScript) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
$voiceHostScript = Join-Path $ProjectRoot "scripts\windows\voice-session-host.js"
$script:voiceHost = Start-Process -FilePath $node -ArgumentList @($voiceHostScript) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = [System.Drawing.SystemIcons]::Application
$icon.Text = "PurpClaw"
$icon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

function Add-MenuItem([string]$Text, [scriptblock]$Action) {
  $item = New-Object System.Windows.Forms.ToolStripMenuItem
  $item.Text = $Text
  $item.Add_Click($Action)
  [void]$menu.Items.Add($item)
}

function Open-Url([string]$Url) {
  Start-Process $Url
}

function Set-PurpSetting([string]$Key, [object]$Value) {
  $body = @{ key = $Key; value = $Value } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3030/api/settings" -ContentType "application/json" -Body $body | Out-Null
  $icon.BalloonTipTitle = "PurpClaw"
  $icon.BalloonTipText = "$Key set to $Value"
  $icon.ShowBalloonTip(2500)
}

function Restart-VoiceHost {
  if ($script:voiceHost -and -not $script:voiceHost.HasExited) {
    Stop-Process -Id $script:voiceHost.Id -Force
  }
  $script:voiceHost = Start-Process -FilePath $node -ArgumentList @($voiceHostScript) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
}

Add-MenuItem "Open Mission Control" { Open-Url "http://127.0.0.1:3030/mission" }
Add-MenuItem "Open Settings" { Open-Url "http://127.0.0.1:3030/settings" }
Add-MenuItem "Enable Microphone" {
  Set-PurpSetting "voice.sttEnabled" $true
  Restart-VoiceHost
  $icon.BalloonTipText = "Microphone and voice ingress enabled."
  $icon.ShowBalloonTip(3000)
}
Add-MenuItem "Disable Microphone" {
  Set-PurpSetting "voice.sttEnabled" $false
  Restart-VoiceHost
  $icon.BalloonTipText = "Microphone disabled. Text voice commands remain available."
  $icon.ShowBalloonTip(3000)
}
Add-MenuItem "Run Product Factory" {
  Start-Process -FilePath $node -ArgumentList @("scripts\demo-factory.js") -WorkingDirectory $ProjectRoot -WindowStyle Hidden
  $icon.BalloonTipTitle = "PurpClaw Product Factory"
  $icon.BalloonTipText = "Autonomous product mission started."
  $icon.ShowBalloonTip(3000)
}
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
Add-MenuItem "Computer Use: Off" { Set-PurpSetting "computerUse.enabled" $false }
Add-MenuItem "Computer Use: Observe" {
  Set-PurpSetting "computerUse.enabled" $true
  Set-PurpSetting "computerUse.mode" "observe"
}
Add-MenuItem "Computer Use: Assist" {
  Set-PurpSetting "computerUse.enabled" $true
  Set-PurpSetting "computerUse.mode" "assist"
}
Add-MenuItem "Computer Use: Autonomous" {
  Set-PurpSetting "computerUse.enabled" $true
  Set-PurpSetting "computerUse.mode" "autonomous"
}
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
Add-MenuItem "Restart PurpClaw Core" {
  $pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
  if (-not $pm2) {
    $icon.BalloonTipText = "PM2 is not installed. Run npm install -g pm2."
    $icon.ShowBalloonTip(3000)
    return
  }
  Start-Process -FilePath $pm2.Source -ArgumentList @("restart", "all", "--update-env") -WorkingDirectory $ProjectRoot -WindowStyle Hidden
}
Add-MenuItem "Exit Tray" {
  $icon.Visible = $false
  if ($agent -and -not $agent.HasExited) { Stop-Process -Id $agent.Id -Force }
  if ($script:voiceHost -and -not $script:voiceHost.HasExited) { Stop-Process -Id $script:voiceHost.Id -Force }
  [System.Windows.Forms.Application]::Exit()
}

$icon.ContextMenuStrip = $menu
$icon.Add_DoubleClick({ Open-Url "http://127.0.0.1:3030/mission" })
$icon.BalloonTipTitle = "PurpClaw"
$icon.BalloonTipText = "Tray controls and interactive computer-use agent are online."
$icon.ShowBalloonTip(3000)

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  $icon.Visible = $false
  $icon.Dispose()
  if ($agent -and -not $agent.HasExited) { Stop-Process -Id $agent.Id -Force }
  if ($script:voiceHost -and -not $script:voiceHost.HasExited) { Stop-Process -Id $script:voiceHost.Id -Force }
}
