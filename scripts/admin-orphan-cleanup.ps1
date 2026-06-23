# ═══════════════════════════════════════════════════════════════════════════
# PURPCLAW Admin Orphan Cleanup
# ═══════════════════════════════════════════════════════════════════════════
#
# Run this in an ADMIN PowerShell when:
#   - `purpclaw doctor` reports orphan processes
#   - Services answer their port but PM2 doesn't manage them
#   - Crash-loops persist because an elevated process is squatting the port
#
# What it does:
#   1. For each known PURPCLAW service port, find the process holding it
#   2. Cross-reference against PM2's managed PID list
#   3. If the holder is NOT a PM2 child, offer to stop it
#   4. Confirm before each kill (no surprises)
#   5. Print a final report so you can `purpclaw safe-start` the recovered ones
#
# This script is the bridge across the elevation boundary that the regular
# CLI can't cross. It's deliberately conservative — confirms each action.
#
# Usage (in ADMIN PowerShell):
#   cd "E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW"
#   .\scripts\admin-orphan-cleanup.ps1
#
# Pass -Force to skip confirmations (DANGEROUS — review the plan first):
#   .\scripts\admin-orphan-cleanup.ps1 -Force
#
# Pass -DryRun to see what it would do without killing anything:
#   .\scripts\admin-orphan-cleanup.ps1 -DryRun
# ═══════════════════════════════════════════════════════════════════════════

param(
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Verify we're running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "✗ This script must be run as Administrator." -ForegroundColor Red
    Write-Host "  Right-click PowerShell → Run as Administrator → re-run this script." -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  PURPCLAW ADMIN ORPHAN CLEANUP" -ForegroundColor Magenta
if ($DryRun) { Write-Host "  · DRY RUN — no processes will be stopped ·" -ForegroundColor Yellow }
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

# ── PURPCLAW service ports ────────────────────────────────────────────────────
$KnownPorts = @{
    3000 = "purpclaw-nextjs (Mission Control UI)"
    7777 = "purpclaw-avatar"
    7779 = "purpclaw-yolo"
    7780 = "purpclaw-api"
    7781 = "purpclaw-voice"
    7782 = "purpclaw-eventbus"
    7783 = "purpclaw-state"
    7784 = "purpclaw-orchestrator"
    7785 = "purpclaw-modal"
    7786 = "purpclaw-diagnostics"
    7787 = "purpclaw-rules"
    7790 = "purpclaw-tower"
    7791 = "purpclaw-gatekeeper"
    7792 = "purpclaw-bridge"
    7880 = "purpclaw-memory"
    7881 = "purpclaw-context"
    7884 = "purpclaw-bridge-ns"
    7885 = "purpclaw-pool"
    7889 = "purpclaw-vision"
    7890 = "purpclaw-metrics"
    7892 = "purpclaw-reasoning"
    7895 = "purpclaw-autodream"
    7896 = "purpclaw-stt"
    7897 = "purpclaw-workers"
}

# ── Read PM2's managed PID list ──────────────────────────────────────────────
Write-Host "Step 1: Read PM2 managed PIDs"
$pm2Pids = @{}
try {
    $pm2Raw = & npx.cmd pm2 jlist 2>$null
    if ($LASTEXITCODE -eq 0 -and $pm2Raw) {
        $pm2Json = $pm2Raw | ConvertFrom-Json
        foreach ($p in $pm2Json) {
            if ($p.pid -gt 0) {
                $pm2Pids[$p.pid] = $p.name
            }
        }
        Write-Host "  ✓ PM2 daemon alive — $($pm2Pids.Count) managed PIDs" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ PM2 daemon not responding — every port-holder will be treated as potential orphan" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ Could not read PM2 state: $_" -ForegroundColor Yellow
}
Write-Host ""

# ── Scan known ports for orphans ─────────────────────────────────────────────
Write-Host "Step 2: Scan ports for processes"
$orphans = @()
$managed = @()
$free    = @()

foreach ($port in $KnownPorts.Keys | Sort-Object) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conn) {
        $free += [PSCustomObject]@{ Port = $port; Service = $KnownPorts[$port] }
        continue
    }
    $procId = $conn.OwningProcess | Select-Object -First 1
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
    } catch {
        continue
    }
    $entry = [PSCustomObject]@{
        Port    = $port
        Service = $KnownPorts[$port]
        PID     = $procId
        Name    = $proc.ProcessName
        Start   = $proc.StartTime
    }
    if ($pm2Pids.ContainsKey($procId)) {
        $entry | Add-Member -NotePropertyName "PM2Name" -NotePropertyValue $pm2Pids[$procId]
        $managed += $entry
    } else {
        $orphans += $entry
    }
}

Write-Host "  $($managed.Count) ports managed by PM2  ·  $($orphans.Count) orphan(s)  ·  $($free.Count) free" -ForegroundColor Gray
Write-Host ""

# ── Report orphans ───────────────────────────────────────────────────────────
if ($orphans.Count -eq 0) {
    Write-Host "✔  No orphans found. PM2 is in sync with port reality." -ForegroundColor Green
    Write-Host ""
    if ($managed.Count -gt 0) {
        Write-Host "PM2-managed services:" -ForegroundColor Gray
        foreach ($m in $managed) {
            Write-Host ("  ✓  :{0}  {1,-25}  pid {2}" -f $m.Port, $m.PM2Name, $m.PID) -ForegroundColor DarkGray
        }
    }
    exit 0
}

Write-Host "ORPHANS FOUND:" -ForegroundColor Yellow
foreach ($o in $orphans) {
    Write-Host ("  ⚠  :{0}  {1,-30}  pid {2}  ({3})  started {4}" -f $o.Port, $o.Service, $o.PID, $o.Name, $o.Start) -ForegroundColor Yellow
}
Write-Host ""

# ── Stop orphans ─────────────────────────────────────────────────────────────
if ($DryRun) {
    Write-Host "DRY RUN — no processes stopped." -ForegroundColor Yellow
    Write-Host "Re-run without -DryRun to apply." -ForegroundColor Gray
    exit 0
}

$stopped = 0
$failed  = 0

foreach ($o in $orphans) {
    $prompt = "Stop pid $($o.PID) ($($o.Name)) holding :$($o.Port)?"
    $proceed = $Force
    if (-not $proceed) {
        $ans = Read-Host "$prompt [y/N]"
        $proceed = ($ans -eq "y" -or $ans -eq "Y")
    }
    if ($proceed) {
        try {
            Stop-Process -Id $o.PID -Force -ErrorAction Stop
            Write-Host "  ✓  Stopped pid $($o.PID)" -ForegroundColor Green
            $stopped++
        } catch {
            Write-Host "  ✗  Failed to stop pid $($o.PID): $_" -ForegroundColor Red
            $failed++
        }
    } else {
        Write-Host "  ·  Skipped pid $($o.PID)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ("  COMPLETE  ·  $stopped stopped  ·  $failed failed") -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

if ($stopped -gt 0) {
    Write-Host "Next step: back in a regular terminal, bring those services up cleanly:" -ForegroundColor Gray
    foreach ($o in $orphans) {
        $short = $o.Service -replace '^purpclaw-', ''
        Write-Host ("  purpclaw safe-start $short") -ForegroundColor Cyan
    }
    Write-Host ""
    Write-Host "Then verify:" -ForegroundColor Gray
    Write-Host "  purpclaw smoke" -ForegroundColor Cyan
    Write-Host "  purpclaw doctor" -ForegroundColor Cyan
    Write-Host ""
}
