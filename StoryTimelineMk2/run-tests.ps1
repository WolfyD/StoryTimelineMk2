<#
.SYNOPSIS
    Runs all test suites and writes a Markdown summary to test-report.md.
.DESCRIPTION
    Suites (in order):
      1. C#   -- dotnet test  (StoryTimelineMk2.Tests)
      2. Unit -- Vitest       (Frontend component/unit tests)
      3. E2E  -- Playwright with mock bridge  (src/test/e2e/)
      4. Real -- Playwright against live app  (src/test/e2e-real/)
                 Auto-skipped when CDP port 9222 is not reachable.
.EXAMPLE
    .\run-tests.ps1
    .\run-tests.ps1 -SkipRealApp
#>
param([switch]$SkipRealApp)

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$here       = $PSScriptRoot
$frontend   = Join-Path $here 'Frontend'
$testCsproj = Join-Path $here 'StoryTimelineMk2.Tests\StoryTimelineMk2.Tests.csproj'
$reportFile = Join-Path $here 'test-report.md'

$suites = [System.Collections.Generic.List[hashtable]]::new()

# -----------------------------------------------------------------------------
function Invoke-Suite {
    param(
        [string]$Label,
        [scriptblock]$Body,
        [string]$Dir = $here
    )

    $sep = '-' * 52
    Write-Host "`n$sep" -ForegroundColor DarkGray
    Write-Host "  $Label" -ForegroundColor Cyan
    Write-Host "$sep`n" -ForegroundColor DarkGray

    $t0       = [datetime]::UtcNow
    $prev     = Get-Location
    $captured = [System.Collections.Generic.List[string]]::new()
    $exitCode = 0

    Set-Location $Dir
    try {
        $raw = & $Body | ForEach-Object {
            $line = "$_"
            Write-Host "  $line"
            $line
        }
        $exitCode = $LASTEXITCODE
        @($raw) | Where-Object { $_ -ne $null } | ForEach-Object { $captured.Add($_) }
    } catch {
        $msg = "EXCEPTION: $_"
        Write-Host "  $msg" -ForegroundColor Red
        $captured.Add($msg)
        $exitCode = 1
    } finally {
        Set-Location $prev
    }

    $secs   = [math]::Round(([datetime]::UtcNow - $t0).TotalSeconds, 1)
    $status = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
    $color  = if ($exitCode -eq 0) { 'Green' } else { 'Red' }
    Write-Host "`n  => $status in ${secs}s" -ForegroundColor $color

    return @{ Label = $Label; Status = $status; ExitCode = $exitCode; Secs = $secs; Lines = $captured }
}

function Add-Skipped {
    param([string]$Label, [string]$Reason)
    Write-Host "`n  [SKIP] $Label  ($Reason)" -ForegroundColor Yellow
    $script:suites.Add(@{
        Label    = $Label
        Status   = 'SKIP'
        ExitCode = 0
        Secs     = 0
        Lines    = [System.Collections.Generic.List[string]]@($Reason)
    })
}

# -- 1. C# --------------------------------------------------------------------
$suites.Add((Invoke-Suite 'C# -- dotnet test' {
    dotnet test $testCsproj --logger "console;verbosity=normal"
} -Dir $here))

# -- 2. Vitest ----------------------------------------------------------------
$suites.Add((Invoke-Suite 'Frontend -- Vitest (unit/component)' {
    npm run test
} -Dir $frontend))

# -- 3. Playwright mock bridge ------------------------------------------------
$suites.Add((Invoke-Suite 'Frontend -- Playwright (mock bridge)' {
    npm run test:e2e
} -Dir $frontend))

# -- 4. Playwright real app ---------------------------------------------------
$cdpUp = try {
    $sock = [System.Net.Sockets.TcpClient]::new()
    $sock.Connect('localhost', 9222)
    $sock.Dispose()
    $true
} catch { $false }

if ($SkipRealApp) {
    Add-Skipped 'Frontend -- Playwright (real app)' 'flag -SkipRealApp passed'
} elseif (-not $cdpUp) {
    Add-Skipped 'Frontend -- Playwright (real app)' 'CDP port 9222 not open -- start app + npm run dev first'
} else {
    $suites.Add((Invoke-Suite 'Frontend -- Playwright (real app)' {
        npm run test:e2e:real
    } -Dir $frontend))
}

# -- Build report -------------------------------------------------------------
$pass    = @($suites | Where-Object { $_.Status -eq 'PASS' }).Count
$fail    = @($suites | Where-Object { $_.Status -eq 'FAIL' }).Count
$skip    = @($suites | Where-Object { $_.Status -eq 'SKIP' }).Count
$stamp   = Get-Date -Format 'yyyy-MM-dd HH:mm'
$topMark = if ($fail -gt 0) { 'FAIL' } else { 'PASS' }

$sb = [System.Text.StringBuilder]::new()

[void]$sb.AppendLine("# Test Report [$topMark] -- $stamp")
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| Suite | Status | Time |')
[void]$sb.AppendLine('|-------|:------:|-----:|')
foreach ($s in $suites) {
    $icon = switch ($s.Status) { 'PASS' { '[PASS]' } 'FAIL' { '[FAIL]' } default { '[SKIP]' } }
    $dur  = if ($s.Secs -gt 0) { "$($s.Secs)s" } else { '--' }
    [void]$sb.AppendLine("| $($s.Label) | $icon | $dur |")
}
[void]$sb.AppendLine('')
[void]$sb.AppendLine("**$pass passed, $fail failed, $skip skipped**")

foreach ($s in $suites) {
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine('---')
    [void]$sb.AppendLine('')
    $icon = switch ($s.Status) { 'PASS' { '[PASS]' } 'FAIL' { '[FAIL]' } default { '[SKIP]' } }
    [void]$sb.AppendLine("## $icon $($s.Label)")
    [void]$sb.AppendLine('')

    $all  = @($s.Lines)
    $tail = if ($all.Count -gt 60) {
        @("... ($($all.Count - 60) earlier lines omitted)") + ($all | Select-Object -Last 60)
    } else { $all }

    [void]$sb.AppendLine('```')
    [void]$sb.AppendLine(($tail -join "`n"))
    [void]$sb.AppendLine('```')
}

$sb.ToString() | Out-File -FilePath $reportFile -Encoding utf8 -Force

# -- Final summary ------------------------------------------------------------
$dline = '=' * 52
Write-Host "`n$dline" -ForegroundColor DarkGray
$summaryColor = if ($fail -gt 0) { 'Red' } else { 'Green' }
Write-Host "  [$topMark]  $pass passed, $fail failed, $skip skipped" -ForegroundColor $summaryColor
Write-Host "  Report => $reportFile"
Write-Host "$dline`n" -ForegroundColor DarkGray

exit $(if ($fail -gt 0) { 1 } else { 0 })
