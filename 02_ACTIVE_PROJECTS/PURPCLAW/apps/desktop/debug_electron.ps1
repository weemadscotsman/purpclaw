$ErrorActionPreference = "SilentlyContinue"
$start = Get-Date
$errLog = "$env:TEMP\electron_err_$PID.log"
$env:ELECTRON_ENABLE_LOGGING = "1"
$env:ELECTRON_LOG_FILE = $errLog
$proc = Start-Process -FilePath 'C:\Users\Admin\AppData\Roaming\npm\node_modules\badclaude\node_modules\electron\dist\electron.exe' -ArgumentList 'E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\apps\desktop','--no-sandbox','--disable-gpu','--enable-logging','--v=1' -PassThru -RedirectStandardError $errLog
Start-Sleep 10
$out = Get-Content $errLog -Raw -ErrorAction SilentlyContinue
Write-Host "[EXIT CODE] $($proc.HasExited) $($proc.ExitCode)"
Write-Host "[ERROR LOG]"
Write-Host $out
