Start-Sleep -Seconds 1.5
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7792/api/speak' -Method POST -ContentType 'application/json' -Body '{"text":"Speak endpoint is live."}' -TimeoutSec 10
    Write-Host "STATUS: $($r.StatusCode)"
    Write-Host "BODY: $($r.Content)"
} catch {
    $ex = $_.Exception
    Write-Host "ERROR: $($ex.Message)"
    if ($ex.Response) {
        $reader = [System.IO.StreamReader]::new($ex.Response.GetResponseStream())
        Write-Host "BODY ON ERROR: $($reader.ReadToEnd())"
        $reader.Close()
    }
}
