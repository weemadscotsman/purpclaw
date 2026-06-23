<#
  clean-foreign-logs.ps1
  ----------------------
  Caps disk used by foreign AI tools that log without rotation (opencode being
  the offender on 2026-06-03: ~30GB in one day). Tool-agnostic: it just trims
  named directories down to a size/age budget. Safe — only touches the dirs
  listed in $TARGETS, only deletes files, never directories.

  Usage:
    powershell -File scripts\clean-foreign-logs.ps1            # dry-run (shows what it WOULD delete)
    powershell -File scripts\clean-foreign-logs.ps1 -Apply     # actually delete
    powershell -File scripts\clean-foreign-logs.ps1 -Apply -MaxAgeDays 3 -MaxDirMB 500
#>
param(
  [switch]$Apply,
  [int]$MaxAgeDays = 7,     # delete files older than this
  [int]$MaxDirMB   = 1024   # AND if dir still over this, delete oldest until under budget
)

$TARGETS = @(
  "C:\Users\Admin\.local\share\opencode\log",
  "C:\Users\Admin\.local\share\opencode\tool-output"
)

function Format-MB($bytes) { "{0:N1} MB" -f ($bytes / 1MB) }

$totalReclaimed = 0
foreach ($dir in $TARGETS) {
  if (-not (Test-Path $dir)) { Write-Host "skip (absent): $dir"; continue }
  $files = Get-ChildItem $dir -File -Recurse -ErrorAction SilentlyContinue
  if (-not $files) { Write-Host "clean (empty): $dir"; continue }

  $before = ($files | Measure-Object Length -Sum).Sum
  $cutoff = (Get-Date).AddDays(-$MaxAgeDays)
  $toDelete = [System.Collections.Generic.List[object]]::new()

  # 1) age-based
  foreach ($f in $files) { if ($f.LastWriteTime -lt $cutoff) { $toDelete.Add($f) } }

  # 2) size-based: if survivors still exceed budget, drop oldest first
  $survivors = $files | Where-Object { $toDelete -notcontains $_ } | Sort-Object LastWriteTime
  $survSize  = ($survivors | Measure-Object Length -Sum).Sum
  $budget    = $MaxDirMB * 1MB
  foreach ($f in $survivors) {
    if ($survSize -le $budget) { break }
    $toDelete.Add($f); $survSize -= $f.Length
  }

  $reclaim = ($toDelete | Measure-Object Length -Sum).Sum
  Write-Host ("`n{0}" -f $dir)
  Write-Host ("  size now: {0} | would remove {1} files = {2}" -f (Format-MB $before), $toDelete.Count, (Format-MB $reclaim))

  if ($Apply) {
    foreach ($f in $toDelete) {
      try { Remove-Item $f.FullName -Force -ErrorAction Stop } catch { Write-Host "  LOCKED: $($f.Name)" }
    }
    $totalReclaimed += $reclaim
  }
}

if ($Apply) { Write-Host ("`n=== reclaimed {0} ===" -f (Format-MB $totalReclaimed)) }
else { Write-Host "`n(DRY RUN - re-run with -Apply to delete)" }
