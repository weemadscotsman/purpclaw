$ErrorActionPreference = 'Continue'

$services = @(
  @{ Name='Mission UI'; Port=3030; Path='/mission'; Method='GET'; Required=$true; Owner='purpclaw-nextjs' },
  @{ Name='Unified API'; Port=7780; Path='/api/health'; Method='GET'; Required=$true; Owner='purpclaw-api' },
  @{ Name='Event Bus'; Port=7782; Path='/health'; Method='GET'; Required=$true; Owner='purpclaw-eventbus' },
  @{ Name='State Store'; Port=7783; Path='/health'; Method='GET'; Required=$true; Owner='purpclaw-state' },
  @{ Name='Orchestrator'; Port=7784; Path='/api/health'; Method='GET'; Required=$true; Owner='purpclaw-orchestrator' },
  @{ Name='Agent Tower'; Port=7790; Path='/tower/status'; Method='GET'; Required=$true; Owner='purpclaw-tower' },
  @{ Name='Gatekeeper'; Port=7791; Path='/health'; Method='GET'; Required=$true; Owner='purpclaw-gatekeeper' },
  @{ Name='Harness'; Port=7798; Path='/health'; Method='GET'; Required=$false; Owner='purpclaw-harness' },
  @{ Name='Cognitive Spine'; Port=7880; Path='/cognitive/health'; Method='GET'; Required=$true; Owner='purpclaw-cognitive' },
  @{ Name='Memory Durability'; Port=7880; Path='/memory/health'; Method='GET'; Required=$true; Owner='purpclaw-cognitive' },
  @{ Name='Memory Recall'; Port=7880; Path='/memory/recall'; Method='POST'; Body='{"query":"health check memory route","limit":1}'; Required=$true; Owner='purpclaw-cognitive' },
  @{ Name='Diagnostics'; Port=7880; Path='/diagnostics/diagnose'; Method='POST'; Body='{"source":"health-check"}'; Required=$true; Owner='purpclaw-cognitive' },
  @{ Name='AutoDream'; Port=7880; Path='/autodream/dream'; Method='POST'; Body='{}'; Required=$false; Owner='purpclaw-cognitive' },
  @{ Name='Context Bus'; Port=7881; Path='/health'; Method='GET'; Required=$true; Owner='purpclaw-context' },
  @{ Name='Knowledge Pool'; Port=7885; Path='/health'; Method='GET'; Required=$false; Owner='purpclaw-pool' },
  @{ Name='Metrics'; Port=7890; Path='/health'; Method='GET'; Required=$true; Owner='purpclaw-metrics' },
  @{ Name='Workers'; Port=7897; Path='/health'; Method='GET'; Required=$true; Owner='purpclaw-workers' },
  @{ Name='Swarm Coordinator'; Port=7898; Path='/health'; Method='GET'; Required=$false; Owner='purpclaw-coordinator' }
)

$results = foreach ($svc in $services) {
  $url = "http://127.0.0.1:$($svc.Port)$($svc.Path)"
  $listen = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $svc.Port } | Select-Object -First 1
  $procId = if ($listen) { $listen.OwningProcess } else { $null }
  $command = if ($procId) { (Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue).CommandLine } else { $null }
  $status = 'DOWN'
  $code = $null
  $errorMessage = $null
  try {
    $params = @{ Uri=$url; Method=$svc.Method; TimeoutSec=8; UseBasicParsing=$true }
    if ($svc.Method -ne 'GET') {
      $params.ContentType = 'application/json'
      $params.Body = $svc.Body
    }
    $resp = Invoke-WebRequest @params
    $code = [int]$resp.StatusCode
    $status = if ($code -ge 200 -and $code -lt 500) { 'HTTP_OK' } else { 'HTTP_BAD' }
  } catch {
    $errorMessage = $_.Exception.Message
    $status = if ($listen) { 'PORT_UP_HTTP_FAIL' } else { 'DOWN' }
  }
  [pscustomobject]@{
    name = $svc.Name
    owner = $svc.Owner
    required = [bool]$svc.Required
    port = $svc.Port
    path = $svc.Path
    method = $svc.Method
    status = $status
    httpStatus = $code
    pid = $procId
    command = $command
    error = $errorMessage
  }
}

$summary = [pscustomobject]@{
  generatedAt = (Get-Date).ToString('o')
  canonicalRoot = (Resolve-Path .).Path
  canonicalUi = 'http://127.0.0.1:3030/mission'
  requiredOk = ($results | Where-Object { $_.required -and $_.status -eq 'HTTP_OK' }).Count
  requiredTotal = ($results | Where-Object { $_.required }).Count
  services = $results
}

$summary | ConvertTo-Json -Depth 8
