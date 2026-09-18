#Requires -Version 5.1
# Story Timeline release script - run .\release.ps1 -Help for usage.
[CmdletBinding(DefaultParameterSetName = 'Build')]
param(
    # Bare .\release.ps1 prompts for this (Mandatory); -Help is its own set so it never prompts.
    [Parameter(ParameterSetName = 'Build', Mandatory, Position = 0)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [Parameter(ParameterSetName = 'Build')] [switch]$CreateRelease,
    [Parameter(ParameterSetName = 'Build')] [switch]$PreRelease,
    [Parameter(ParameterSetName = 'Build')] [string]$Notes = "",
    [Parameter(ParameterSetName = 'Build')] [switch]$TestRelease,

    [Parameter(ParameterSetName = 'Help', Mandatory)] [Alias("h")] [switch]$Help
)

if ($Help) {
    Write-Host @'

  Story Timeline release script

  USAGE
    .\release.ps1                       prompts for the version, then builds everything
    .\release.ps1 1.2.0                 same, version given up front
    .\release.ps1 1.2.0 -CreateRelease  build everything, then tag + push + publish to GitHub
    .\release.ps1 1.2.0 -TestRelease    build test installers (see below), never publishes
    .\release.ps1 -Help                 this text

  WHAT A BUILD DOES
    1. Writes the version into StoryTimelineMk2.csproj, app.manifest,
       Frontend/package.json and Installer/InstallerContext.cs
    2. Builds all four artifacts into release\v<version>\
         StoryTimeline-v<x>-setup.exe              installer, ~5 MB, fetches .NET 10 runtime if missing
         StoryTimeline-v<x>-setup-offline.exe      installer, ~50 MB, runtime bundled
         StoryTimeline-v<x>-portable.zip           app only, ~5 MB, needs .NET 10 runtime
         StoryTimeline-v<x>-portable-offline.zip   app only, ~50 MB, self-contained
    Nothing leaves your machine unless you pass -CreateRelease.

  FLAGS
    -CreateRelease   git tag v<x>, push the tag, create the GitHub release with all four files
    -PreRelease      mark that GitHub release as a pre-release (the in-app update checker
                     ignores pre-releases). Only meaningful with -CreateRelease.
    -Notes "..."     release notes for the GitHub release. Default: GitHub auto-generates
                     them from merged PRs. Only meaningful with -CreateRelease.
    -TestRelease     artifacts get a -test suffix; the installer always shows the .NET
                     runtime page and downloads the runtime even if it is installed, and
                     writes log.txt next to the installer exe. Cannot combine with
                     -CreateRelease. Pass the current version to leave source files unchanged.
    -Help, -h        this text

'@
    exit 0
}
if ($TestRelease -and $CreateRelease) {
    Write-Host "  ERROR: -TestRelease cannot be combined with -CreateRelease" -ForegroundColor Red
    exit 1
}
if (-not $CreateRelease -and ($PreRelease -or $Notes)) {
    Write-Host "  NOTE: -PreRelease / -Notes only apply together with -CreateRelease (ignored)" -ForegroundColor Yellow
}

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Log([string]$msg)  { Write-Host "    $msg" -ForegroundColor Cyan }
function Ok([string]$msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Fail([string]$msg) { Write-Host "" ; Write-Host "  ERROR: $msg" -ForegroundColor Red; exit 1 }

function WriteUtf8([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
}

Write-Host ""
Write-Host "  Story Timeline release script" -ForegroundColor Magenta
Write-Host "  Version : $Version" -ForegroundColor Magenta
Write-Host "  Publish : $CreateRelease" -ForegroundColor Magenta
if ($TestRelease) { Write-Host "  TEST RELEASE: forced runtime download + log.txt, artifacts suffixed -test" -ForegroundColor Yellow }
Write-Host ""

# --------------------------------------------------------------------------
# 1. Bump version everywhere
# --------------------------------------------------------------------------
Write-Host "[1/3] Bumping version to $Version" -ForegroundColor Yellow

$AssemblyVersion = "$Version.0"

# .csproj
$csprojPath = "$Root\StoryTimelineMk2.csproj"
$csproj = Get-Content $csprojPath -Raw -Encoding UTF8
$csproj = $csproj -replace '<Version>[^<]+</Version>',                 "<Version>$Version</Version>"
$csproj = $csproj -replace '<AssemblyVersion>[^<]+</AssemblyVersion>', "<AssemblyVersion>$AssemblyVersion</AssemblyVersion>"
$csproj = $csproj -replace '<FileVersion>[^<]+</FileVersion>',         "<FileVersion>$AssemblyVersion</FileVersion>"
WriteUtf8 $csprojPath $csproj
Ok ".csproj"

# app.manifest  (version="x.y.z.w" format)
$manifestPath = "$Root\app.manifest"
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8
$manifest = $manifest -replace 'version="\d+\.\d+\.\d+\.\d+"', "version=`"$AssemblyVersion`""
WriteUtf8 $manifestPath $manifest
Ok "app.manifest"

# Frontend/package.json
$pkgPath = "$Root\Frontend\package.json"
$pkg = Get-Content $pkgPath -Raw -Encoding UTF8
$pkg = $pkg -replace '"version"\s*:\s*"[^"]+"', ('"version": "' + $Version + '"')
WriteUtf8 $pkgPath $pkg
Ok "Frontend/package.json"

# Installer/InstallerContext.cs
$ctxPath = "$Root\Installer\InstallerContext.cs"
$ctx = Get-Content $ctxPath -Raw -Encoding UTF8
$ctx = $ctx -replace 'AppVersion\s*=\s*"[^"]+"', ('AppVersion = "' + $Version + '"')
WriteUtf8 $ctxPath $ctx
Ok "Installer/InstallerContext.cs"

# --------------------------------------------------------------------------
# 2. Publish app + installer, once per flavour
#
#    online  : framework-dependent app (~10 MB). The installer downloads the
#              .NET Desktop Runtime if the machine doesn't have it.
#    offline : self-contained app (~50 MB). No downloads needed at install time.
#
#    The installer itself targets .NET Framework 4.8 (ships with Windows), so
#    it is the same tiny exe in both cases - only the embedded AppFiles.zip differs.
# --------------------------------------------------------------------------
Write-Host "[2/3] Building app + installer for each flavour" -ForegroundColor Yellow

Log "npm install..."
Push-Location "$Root\Frontend"
npm install --silent
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm install failed" }
Pop-Location

$ReleaseDir = "$Root\release\v$Version"
Remove-Item $ReleaseDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $ReleaseDir | Out-Null

$AppFilesZip = "$Root\Installer\AppFiles.zip"
$Artifacts   = @()
$TestSuffix  = if ($TestRelease) { "-test" } else { "" }

foreach ($flavour in @(
    @{ Name = "online";  Suffix = "";         SelfContained = "false" },
    @{ Name = "offline"; Suffix = "-offline"; SelfContained = "true"  }
)) {
    $name    = $flavour.Name
    $suffix  = $flavour.Suffix
    $offline = $flavour.SelfContained -eq "true"

    # --- app ---
    Log "dotnet publish app ($name)..."
    $AppPublish = "$Root\bin\publish\$name"
    Remove-Item $AppPublish -Recurse -Force -ErrorAction SilentlyContinue
    dotnet publish "$Root\StoryTimelineMk2.csproj" `
        -c Release -r win-x64 -o $AppPublish `
        --self-contained $flavour.SelfContained `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:EnableCompressionInSingleFile=$($flavour.SelfContained) `
        -p:DebugType=none `
        -p:DebugSymbols=false `
        --nologo -v minimal
    if ($LASTEXITCODE -ne 0) { Fail "dotnet publish (app, $name) failed" }
    if (-not (Test-Path "$AppPublish\StoryTimeline.exe")) { Fail "StoryTimeline.exe not found in $AppPublish" }

    # --- portable zip ---
    $PortableZip = "$ReleaseDir\StoryTimeline-v$Version-portable$suffix$TestSuffix.zip"
    Compress-Archive -Path "$AppPublish\*" -DestinationPath $PortableZip -Force
    Ok "Portable ($name) -> $PortableZip ($([math]::Round((Get-Item $PortableZip).Length / 1MB, 1)) MB)"
    $Artifacts += $PortableZip

    # --- installer (embeds the same zip as a resource) ---
    Log "dotnet publish installer ($name)..."
    Copy-Item $PortableZip $AppFilesZip -Force
    $InstallerPublish = "$Root\Installer\bin\publish\$name"
    Remove-Item $InstallerPublish -Recurse -Force -ErrorAction SilentlyContinue
    dotnet publish "$Root\Installer\StoryTimelineInstaller.csproj" `
        -c Release -o $InstallerPublish `
        -p:OfflinePayload=$offline `
        -p:TestBuild=$TestRelease `
        -p:DebugType=none `
        -p:DebugSymbols=false `
        --nologo -v minimal
    if ($LASTEXITCODE -ne 0) { Fail "dotnet publish (installer, $name) failed" }
    Remove-Item $AppFilesZip -ErrorAction SilentlyContinue

    $SetupExe = "$ReleaseDir\StoryTimeline-v$Version-setup$suffix$TestSuffix.exe"
    Copy-Item "$InstallerPublish\StoryTimelineInstaller.exe" $SetupExe
    Ok "Setup    ($name) -> $SetupExe ($([math]::Round((Get-Item $SetupExe).Length / 1MB, 1)) MB)"
    $Artifacts += $SetupExe
}

# --------------------------------------------------------------------------
# 3. GitHub release
# --------------------------------------------------------------------------
if (-not $CreateRelease) {
    Write-Host "[3/3] Skipped (pass -CreateRelease to publish to GitHub)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Artifacts ready in: $ReleaseDir" -ForegroundColor Green
    Write-Host ""
    exit 0
}

Write-Host "[3/3] Creating GitHub release" -ForegroundColor Yellow

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Fail "GitHub CLI (gh) not found. Install from https://cli.github.com"
}

$tag = "v$Version"

Log "Tagging commit as $tag..."
git tag $tag
if ($LASTEXITCODE -ne 0) { Fail "git tag failed - tag may already exist. Delete with: git tag -d $tag" }

Log "Pushing tag..."
git push origin $tag
if ($LASTEXITCODE -ne 0) { Fail "git push tag failed" }

$ghArgs = @("release", "create", $tag) + $Artifacts + @(
    "--title", "Story Timeline $tag"
)

if ($Notes) {
    $ghArgs += "--notes"
    $ghArgs += $Notes
} else {
    $ghArgs += "--generate-notes"
}

if ($PreRelease) { $ghArgs += "--prerelease" }

Log "Creating release..."
& gh @ghArgs
if ($LASTEXITCODE -ne 0) { Fail "gh release create failed" }

Ok "Published: https://github.com/WolfyD/StoryTimelineMk2/releases/tag/$tag"
Write-Host ""
Write-Host "  Release complete!" -ForegroundColor Green
Write-Host ""
