# PURPCLAW Bridge Supervisor
# Auto-restarts xiaozhi_bridge.js if it crashes

$env:XIAOZHI_MCP_URL = "wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg4MzkwOCwiYWdlbnRJZCI6MTY1NzQ1NiwiZW5kcG9pbnRJZCI6ImFnZW50XzE2NTc0NTYiLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc1NDk2NDYwLCJleHAiOjE4MDcwNTQwNjB9.70xTbKmRJPunsN4ZSeX6FzSaQSf8p1vEL0hKfTYu5XIvcF61kBSuDvsfMo49cAe7qatZv1qrq_wcNKmOAaI_vw"
$env:MINIMAX_API_KEY = ""
$env:OPENAI_API_KEY = ""
$env:DEEPSEEK_API_KEY = ""

$bridgePath = "C:\Users\Admin\Desktop\PURPCLAW\lib\xiaozhi_bridge.js"
$workingDir = "C:\Users\Admin\Desktop\PURPCLAW"
$maxRestarts = 10
$restartCount = 0
$baseDelay = 2

Write-Host "PURPCLAW Bridge Supervisor Starting..."

function Cleanup {
    Write-Host "Supervisor shutting down..."
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*xiaozhi_bridge.js*" } | Stop-Process -Force -ErrorAction SilentlyContinue
}

# Handle Ctrl+C
[Console]::TreatControlCAsInput = $true
$script:Cancelled = $false
$cancelHandler = {
    if (!$script:Cancelled) {
        $script:Cancelled = $true
        Cleanup
        exit
    }
}
try { [Console]::CancelKeyPress += $cancelHandler } catch { }

while ($restartCount -lt $maxRestarts) {
    if ($script:Cancelled) { break }

    Write-Host "[Supervisor] Starting bridge (attempt $($restartCount + 1)/$maxRestarts)..."

    try {
        $process = Start-Process -FilePath "node" -ArgumentList $bridgePath -WorkingDirectory $workingDir -WindowStyle Hidden -PassThru -ErrorAction Stop

        Write-Host "[Supervisor] Bridge started with PID $($process.Id)"

        # Wait for process to exit
        $process.WaitForExit()

        $exitCode = $process.ExitCode
        Write-Host "[Supervisor] Bridge exited with code $exitCode"

        if ($exitCode -ne 0 -and $restartCount -lt $maxRestarts -and !$script:Cancelled) {
            $delay = $baseDelay * [Math]::Pow(2, $restartCount)
            if ($delay -gt 60) { $delay = 60 }

            Write-Host "[Supervisor] Restarting in $delay seconds..."
            Start-Sleep -Seconds $delay
            $restartCount++
        }
    }
    catch {
        Write-Host "[Supervisor] Failed to start bridge: $_"
        Write-Host "[Supervisor] Retrying in 5 seconds..."
        Start-Sleep -Seconds 5
        $restartCount++
    }
}

if ($restartCount -ge $maxRestarts) {
    Write-Host "[Supervisor] Max restarts reached ($maxRestarts). Bridge stopped."
    Write-Host "[Supervisor] Check logs at C:\Users\Admin\Desktop\PURPCLAW\log.log"
}
