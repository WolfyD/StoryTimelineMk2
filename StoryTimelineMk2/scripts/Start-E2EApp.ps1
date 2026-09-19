<#
.SYNOPSIS
    Prepares and launches StoryTimelineMk2 for Playwright real E2E testing.

.DESCRIPTION
    1. Kills any running StoryTimeline / WebView2 processes (to free port 9222).
    2. Sets STORYTIMELINE_DATA_ROOT to an isolated temp folder so tests never
       touch the user's real database.
    3. Builds timeline.sqlite from the frozen 1.0.1 schema fixture plus
       scripts\e2e-seed.sql, so the app upgrades a real pre-versioning
       database (and writes its pre-migration backup) on every run.
    4. Sets STORYTIMELINE_REMOTE_DEBUG_PORT=9222 so all WebView2 windows share
       one browser process and expose a CDP endpoint.
    5. Builds the .NET project in Debug configuration.
    6. Starts the WinForms app with explicit env vars via ProcessStartInfo.

    After this script returns, run from Frontend/:
        npm run test:e2e:real

.PARAMETER Port
    CDP remote debugging port.  Defaults to 9222.

.PARAMETER DataRoot
    Path for the isolated test database.
    Defaults to $env:TEMP\StoryTimelineE2E.

.PARAMETER KeepData
    If specified, existing data in DataRoot is NOT deleted before the run.
    Useful for iterating on tests without recreating the database each time.
#>
param(
    [int]    $Port     = 9222,
    [string] $DataRoot = "$env:TEMP\StoryTimelineE2E",
    [switch] $KeepData
)

$ErrorActionPreference = 'Stop'
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

# 1. Kill stale app and WebView2 processes so port 9222 is free
Write-Host "Stopping any running StoryTimeline instances..."
Get-Process -Name StoryTimeline      -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name msedgewebview2     -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800

# 2. Prepare isolated data directory
if (-not $KeepData -and (Test-Path $DataRoot)) {
    Write-Host "Cleaning existing test data at $DataRoot"
    Remove-Item -Recurse -Force $DataRoot
}
New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null

# 3. Build the seed database: frozen 1.0.1 schema (schema version 0) + generic sample rows.
#    Skipped with -KeepData when a database is already there.
$schemaSql = Join-Path $projectDir "StoryTimelineMk2.Tests\Fixtures\main_schema_v0_1.0.1.sql"
$seedSql   = Join-Path $projectDir "scripts\e2e-seed.sql"
$seedDest  = Join-Path $DataRoot   "timeline.sqlite"

if (Test-Path $seedDest) {
    Write-Host "Keeping existing database at $seedDest"
} else {
    $python = Get-Command python, python3 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $python) { throw "python/python3 not found on PATH - needed to build the E2E seed database." }
    Write-Host "Building seed database at $seedDest"
    & $python.Source -c "import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); c.execute('PRAGMA foreign_keys = OFF'); [c.executescript(open(f, encoding='utf-8').read()) for f in sys.argv[2:]]; c.commit()" $seedDest $schemaSql $seedSql
    if ($LASTEXITCODE -ne 0) { throw "Seed database build failed (exit $LASTEXITCODE)" }
}

# 4. Clear the shared WebView2 test cache (stale profiles cause CDP port conflicts)
$testCache = Join-Path $env:LOCALAPPDATA "StoryTimelineMk2_Cache\test-shared"
if (Test-Path $testCache) {
    Write-Host "Clearing WebView2 test cache at $testCache"
    Remove-Item -Recurse -Force $testCache -ErrorAction SilentlyContinue
}

# 5. Build the .NET project (Debug)
Write-Host "Building StoryTimelineMk2 (Debug)..."
Push-Location $projectDir
try {
    dotnet build StoryTimelineMk2.csproj -c Debug --nologo -v quiet
    if ($LASTEXITCODE -ne 0) { throw "dotnet build failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

# 6. Launch the app with explicit env vars via ProcessStartInfo
#    (more reliable than $env: inheritance through Start-Process in PS 5.1)
$exePath = Join-Path $projectDir "bin\Debug\net10.0-windows\StoryTimeline.exe"
if (-not (Test-Path $exePath)) {
    throw "Executable not found at $exePath - did the build succeed?"
}

Write-Host ""
Write-Host "Launching with:"
Write-Host "  STORYTIMELINE_DATA_ROOT         = $DataRoot"
Write-Host "  STORYTIMELINE_REMOTE_DEBUG_PORT = $Port"
Write-Host ""

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName         = $exePath
$psi.UseShellExecute  = $false   # required for explicit EnvironmentVariables access
$psi.CreateNoWindow   = $false   # keep the WinForms window visible

# Copy current environment into the start info
$currentEnv = [System.Environment]::GetEnvironmentVariables()
foreach ($key in $currentEnv.Keys) {
    $psi.EnvironmentVariables[$key] = $currentEnv[$key]
}

# Override with test-specific values
$psi.EnvironmentVariables["STORYTIMELINE_DATA_ROOT"]         = $DataRoot
$psi.EnvironmentVariables["STORYTIMELINE_REMOTE_DEBUG_PORT"] = "$Port"

$proc = [System.Diagnostics.Process]::Start($psi)

Write-Host "App started (PID $($proc.Id))"
Write-Host "CDP endpoint: http://localhost:$Port"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  cd Frontend"
Write-Host "  npm run test:e2e:real          # headless"
Write-Host "  npm run test:e2e:real:ui       # visual Playwright UI"
Write-Host ""
Write-Host "To stop the app: Stop-Process -Id $($proc.Id)"
