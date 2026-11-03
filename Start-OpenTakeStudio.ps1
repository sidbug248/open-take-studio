param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$studioUrl = 'http://127.0.0.1:4310'
$studioRunning = $false
try {
    $studioHealth = Invoke-RestMethod -Uri "$studioUrl/api/health" -TimeoutSec 2
    $studioRunning = ($studioHealth.ok -eq $true -and $studioHealth.sdkVersion -eq '0.5.0')
} catch { }
if (-not $studioRunning) {
    if (-not (Test-Path -LiteralPath 'node_modules/tsx/dist/cli.mjs')) { throw 'Install dependencies first with npm ci.' }
    if (-not (Test-Path -LiteralPath 'dist/index.html')) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
    }
    New-Item -ItemType Directory -Force 'data' | Out-Null
    $studioNode = (Get-Command node.exe).Source
    $studioProcess = Start-Process -FilePath $studioNode -ArgumentList @('--import','tsx','server/index.ts','--production') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/server.out.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/server.err.log') -PassThru
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'data/server.pid'), [string]$studioProcess.Id)
    for ($studioAttempt=0; $studioAttempt -lt 30; $studioAttempt++) {
        Start-Sleep -Milliseconds 300
        try { $studioHealth=Invoke-RestMethod -Uri "$studioUrl/api/health" -TimeoutSec 2; if ($studioHealth.ok) { $studioRunning=$true; break } } catch { }
    }
    if (-not $studioRunning) { throw 'Server did not become ready. Inspect data/server.err.log.' }
}
Write-Output "Open Take Studio is running at $studioUrl"
if (-not $NoBrowser) { Start-Process $studioUrl -WindowStyle Hidden }
