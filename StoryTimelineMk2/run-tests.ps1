# run-tests.ps1 — run the full test suite (xUnit + Vitest + Playwright)
# Usage: .\run-tests.ps1 [-Suite backend|frontend|e2e]
param(
    [ValidateSet('backend', 'frontend', 'e2e', 'all')]
    [string]$Suite = 'all'
)

$Root = $PSScriptRoot
$FrontendDir = Join-Path $Root 'Frontend'
$ErrorOccurred = $false

function Run-Step([string]$Label, [scriptblock]$Block) {
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    & $Block
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $Label" -ForegroundColor Red
        $script:ErrorOccurred = $true
    } else {
        Write-Host "PASSED: $Label" -ForegroundColor Green
    }
}

if ($Suite -in @('backend', 'all')) {
    Run-Step 'Backend (xUnit)' {
        dotnet test "$Root\StoryTimelineMk2.Tests" --logger "console;verbosity=minimal"
    }
}

if ($Suite -in @('frontend', 'all')) {
    Run-Step 'Frontend (Vitest)' {
        Push-Location $FrontendDir
        npm run test
        Pop-Location
    }
}

if ($Suite -in @('e2e', 'all')) {
    Run-Step 'E2E (Playwright)' {
        Push-Location $FrontendDir
        npm run test:e2e
        Pop-Location
    }
}

Write-Host ''
if ($ErrorOccurred) {
    Write-Host 'One or more test suites FAILED.' -ForegroundColor Red
    exit 1
} else {
    Write-Host 'All test suites passed.' -ForegroundColor Green
    exit 0
}
