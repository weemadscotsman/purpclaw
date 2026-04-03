# Companion Chorus Launcher - keeps console open
$ErrorActionPreference = "Stop"
$env:NODE_ENV = "development"

Write-Host "🎭 Launching Companion Chorus..." -ForegroundColor Cyan
Write-Host ""

try {
    $proc = Start-Process -FilePath "node" -ArgumentList "main.js" -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Normal
    
    Write-Host "✅ Process started with PID: $($proc.Id)" -ForegroundColor Green
    Write-Host ""
    Write-Host "The companion chorus window should be visible on your screen!" -ForegroundColor Yellow
    Write-Host "Watch the goops arrive and start talking!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press Ctrl+C in the chorus window to dismiss, or close the window." -ForegroundColor Gray
    
    # Don't wait - let it run
} catch {
    Write-Host "❌ Failed to start: $_" -ForegroundColor Red
}
