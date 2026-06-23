"""
石家庄铁道大学新闻爬虫 - PowerShell版
用法: 右键用 PowerShell 运行, 或: powershell -File scrape_stdu.ps1
"""

$baseUrl = "http://www.stdu.edu.cn"
$outFile = "stdu_news_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"

function Get-WebContent {
    param([string]$Url)
    try {
        $resp = Invoke-WebRequest -Uri $Url -Headers @{
            "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        } -TimeoutSec 15 -UseBasicParsing
        return $resp.Content
    } catch {
        return $null
    }
}

$pages = @(
    "$baseUrl/news/",
    "$baseUrl/news/index.html",
    "$baseUrl/xww/",
    "$baseUrl/xww/index.htm"
)

$allNews = @()
$seen = @{}

foreach ($url in $pages) {
    Write-Host "Fetching: $url"
    $html = Get-WebContent -Url $url
    if (-not $html) {
        Write-Host "  -> Failed"
        continue
    }

    # 提取 <a href="..." title="...">
    $matches = [regex]::Matches($html, '<a[^>]+href=["'']([^"'']+)["''][^>]*title=["'']([^"'']+)["'']([^>]*)>([^<]+)</a>')
    $count = 0
    foreach ($m in $matches) {
        $href = $m.Groups[1].Value.Trim()
        $title = ($m.Groups[2].Value.Trim(), $m.Groups[4].Value.Trim())[[string]::IsNullOrEmpty($m.Groups[2].Value.Trim())]
        if ($title.Length -lt 5) { continue }
        if ($seen.ContainsKey($href)) { continue }
        $seen[$href] = $true
        if (-not $href.StartsWith("http")) {
            $href = $baseUrl + $href
        }
        $allNews += [PSCustomObject]@{
            title = $title
            url   = $href
        }
        $count++
    }
    Write-Host "  -> Found $count items"
}

Write-Host "`n总计: $($allNews.Count) 条新闻`n"
$i = 1
foreach ($n in $allNews) {
    Write-Host "$i. $($n.title)"
    Write-Host "   $($n.url)"
    $i++
}

$allNews | ConvertTo-Json -Depth 5 | Out-File -FilePath $outFile -Encoding UTF8
Write-Host "`n已保存到 $outFile"
