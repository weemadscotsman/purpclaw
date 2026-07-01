<#
  purpclaw-watchdog.ps1  —  PurpClaw-ONLY resource watchdog.

  WHY THIS EXISTS (not a duplicate of pm2 max_memory_restart):
  pm2's max_memory_restart only watches processes pm2 still TRACKS. When
  cognitive_spine orphans on a Windows socket-rebind (WinError 10048), pm2 loses
  the handle and stops watching its memory -> it leaks unbounded (saw 1.4 GB /
  234 threads). This watchdog checks the REAL process bound to :7880, so it
  catches an orphaned leaker pm2 can't.

  HARD SAFETY RULE: it only ever acts on KNOWN PurpClaw services (pm2 names
  starting 'purpclaw-') and the process bound to the cognitive port. It will
  NEVER kill an unknown node/python process (VS Code, Electron, agent shells).

  USAGE:
    powershell scripts/purpclaw-watchdog.ps1                 # one-shot status + alerts
    powershell scripts/purpclaw-watchdog.ps1 -IntervalSec 60 # loop every 60s
    powershell scripts/purpclaw-watchdog.ps1 -AutoHeal       # auto-recover cognitive on breach
#>
param(
  [int]    $IntervalSec     = 0,
  [int]    $CognitiveMaxMB  = 1500,
  [int]    $MaxThreads      = 50,
  [int]    $MaxRestarts     = 80,
  [int]    $CognitivePort   = 7880,
  [switch] $AutoHeal
)

$ROOT    = Split-Path -Parent $PSScriptRoot
$LOGFILE = Join-Path $ROOT 'agent_work\watchdog.log'

function Log($level, $msg) {
  $line = '{0} | {1,-5} | {2}' -f (Get-Date -Format 'HH:mm:ss'), $level, $msg
  Write-Host $line
  try { Add-Content -Path $LOGFILE -Value $line -ErrorAction SilentlyContinue } catch {}
}

function Get-PortProcess($port) {
  $owner = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
  if (-not $owner) { return $null }
  return Get-Process -Id $owner -ErrorAction SilentlyContinue
}

function Get-Pm2Services {
  $raw = (& pm2 jlist 2>$null) -join ''
  if (-not $raw) { return @() }
  $raw = $raw.TrimStart([char]0xFEFF, [char]0xBBEF)
  $raw = $raw.Substring($raw.IndexOf('['))
  try { $arr = $raw | ConvertFrom-Json } catch { return @() }
  return $arr | Where-Object { $_.name -like 'purpclaw-*' } | ForEach-Object {
    [PSCustomObject]@{
      name     = $_.name
      mb       = [math]::Round(($_.monit.memory) / 1MB)
      restarts = $_.pm2_env.restart_time
      status   = $_.pm2_env.status
    }
  }
}

function Invoke-Cycle {
  $alerts = 0

  # 1. Cognitive — checked BY PORT so an orphaned leaker cannot hide.
  $cog = Get-PortProcess $CognitivePort
  if ($cog) {
    $mb = [math]::Round($cog.WS / 1MB); $th = $cog.Threads.Count
    $tag = 'OK'; if ($mb -gt $CognitiveMaxMB -or $th -gt $MaxThreads) { $tag = 'WARN' }
    Log $tag ('cognitive :{0}  pid={1}  RAM={2}MB  threads={3}' -f $CognitivePort, $cog.Id, $mb, $th)
    if ($mb -gt $CognitiveMaxMB) { Log 'WARN' ('cognitive RAM {0}MB over {1}MB' -f $mb, $CognitiveMaxMB); $alerts++ }
    if ($th -gt $MaxThreads)     { Log 'WARN' ('cognitive threads {0} over {1} (thread leak?)' -f $th, $MaxThreads); $alerts++ }

    if ($AutoHeal -and ($mb -gt $CognitiveMaxMB -or $th -gt $MaxThreads)) {
      Log 'HEAL' 'recovering cognitive: delete slot, free port, fresh start'
      & pm2 delete purpclaw-cognitive 2>$null | Out-Null
      Start-Sleep 2
      $still = Get-PortProcess $CognitivePort
      if ($still) { Stop-Process -Id $still.Id -Force -ErrorAction SilentlyContinue; Log 'HEAL' ('killed port owner pid={0}' -f $still.Id) }
      Start-Sleep 2
      Push-Location $ROOT
      & pm2 start ecosystem.config.js --only purpclaw-cognitive --update-env 2>$null | Out-Null
      Pop-Location
      Log 'HEAL' 'cognitive restarted (bounded thread pool active)'
    }
  } else {
    Log 'WARN' ('nothing listening on :{0} (cognitive down?)' -f $CognitivePort); $alerts++
  }

  # 2. pm2 services — restart climb / not-online (orphan or crash-loop signal).
  foreach ($s in (Get-Pm2Services)) {
    if ($s.restarts -gt $MaxRestarts) { Log 'WARN' ('{0} restarts={1} over {2} (crash-loop/orphan?)' -f $s.name, $s.restarts, $MaxRestarts); $alerts++ }
    if ($s.status -ne 'online')       { Log 'WARN' ('{0} status={1}' -f $s.name, $s.status); $alerts++ }
  }

  # 3. Idle auto-train (the GPU/CPU appetite switch).
  $envFile = Join-Path $ROOT '.env'
  if (Test-Path $envFile) {
    $at = (Select-String -Path $envFile -Pattern '^PURPCLAW_IDLE_AUTO_TRAIN=' | Select-Object -Last 1).Line
    if ($at -and ($at -notmatch '=\s*0\s*$')) { Log 'WARN' ('idle auto-train ON ({0}) - idle box will train models' -f $at); $alerts++ }
  }

  if ($alerts -eq 0) { Log 'OK' 'all PurpClaw checks green' }
  return $alerts
}

try { New-Item -ItemType Directory -Force -Path (Split-Path $LOGFILE) -ErrorAction SilentlyContinue | Out-Null } catch {}
Log 'INFO' ('watchdog start  cogMax={0}MB threads={1} restarts={2} autoHeal={3}' -f $CognitiveMaxMB, $MaxThreads, $MaxRestarts, $AutoHeal.IsPresent)
if ($IntervalSec -le 0) {
  exit (Invoke-Cycle)
} else {
  while ($true) { [void](Invoke-Cycle); Start-Sleep -Seconds $IntervalSec }
}
