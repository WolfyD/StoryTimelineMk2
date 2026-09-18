#Requires -Version 5.1
<#
.SYNOPSIS
    Bump version, build artifacts, and optionally publish a GitHub release.

.PARAMETER Version
    SemVer string, e.g. "1.1.0"

.PARAMETER CreateRelease
    If set, tags the commit and creates a GitHub release via `gh`.

.PARAMETER PreRelease
    Marks the GitHub release as a pre-release.

.PARAMETER Notes
    Optional release notes. If omitted and -CreateRelease is set,
    GitHub auto-generates notes from merged PRs.

.EXAMPLE
    # Build artifacts only (no GitHub push)
    .\release.ps1 -Version 1.1.0

.EXAMPLE
    # Full release with auto-generated notes
    .\release.ps1 -Version 1.1.0 -CreateRelease

.EXAMPLE
    # Full release with custom notes
    .\release.ps1 -Version 1.1.0 -CreateRelease -Notes "Bug fixes and performance improvements."
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [switch]$CreateRelease,
    [switch]$PreRelease,
    [string]$Notes = ""
)

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
Write-Host ""

# --------------------------------------------------------------------------
# 1. Bump version everywhere
# --------------------------------------------------------------------------
Write-Host "[1/6] Bumping version to $Version" -ForegroundColor Yellow

$AssemblyVersion = "$Version.0"

# .csproj
$csprojPath = "$Root\StoryTimelineMk2.csproj"
$csproj = Get-Content $csprojPath -Raw
$csproj = $csproj -replace '<Version>[^<]+</Version>',                 "<Version>$Version</Version>"
$csproj = $csproj -replace '<AssemblyVersion>[^<]+</AssemblyVersion>', "<AssemblyVersion>$AssemblyVersion</AssemblyVersion>"
$csproj = $csproj -replace '<FileVersion>[^<]+</FileVersion>',         "<FileVersion>$AssemblyVersion</FileVersion>"
WriteUtf8 $csprojPath $csproj
Ok ".csproj"

# app.manifest  (version="x.y.z.w" format)
$manifestPath = "$Root\app.manifest"
$manifest = Get-Content $manifestPath -Raw
$manifest = $manifest -replace 'version="\d+\.\d+\.\d+\.\d+"', "version=`"$AssemblyVersion`""
WriteUtf8 $manifestPath $manifest
Ok "app.manifest"

# Frontend/package.json
$pkgPath = "$Root\Frontend\package.json"
$pkg = Get-Content $pkgPath -Raw
$pkg = $pkg -replace '"version"\s*:\s*"[^"]+"', ('"version": "' + $Version + '"')
WriteUtf8 $pkgPath $pkg
Ok "Frontend/package.json"

# Installer/InstallerContext.cs
$ctxPath = "$Root\Installer\InstallerContext.cs"
$ctx = Get-Content $ctxPath -Raw
$ctx = $ctx -replace 'AppVersion\s*=\s*"[^"]+"', ('AppVersion = "' + $Version + '"')
WriteUtf8 $ctxPath $ctx
Ok "Installer/InstallerContext.cs"

# --------------------------------------------------------------------------
# 2. Publish main app
# --------------------------------------------------------------------------
Write-Host "[2/6] Publishing main app (self-contained, single-file)" -ForegroundColor Yellow

Log "npm install..."
Push-Location "$Root\Frontend"
npm install --silent
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm install failed" }
Pop-Location

Log "dotnet publish..."
dotnet publish "$Root\StoryTimelineMk2.csproj" `
    -c Release -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:DebugType=none `
    -p:DebugSymbols=false `
    --nologo -v minimal

if ($LASTEXITCODE -ne 0) { Fail "dotnet publish (main app) failed" }

$AppPublish = "$Root\bin\Release\net10.0-windows\win-x64\publish"
if (-not (Test-Path "$AppPublish\StoryTimeline.exe")) {
    Fail "Expected StoryTimeline.exe not found in $AppPublish"
}
Ok "Main app -> $AppPublish"

# --------------------------------------------------------------------------
# 3. Bundle app files into Installer/AppFiles.zip
#    The installer project embeds this zip as a resource.
# --------------------------------------------------------------------------
Write-Host "[3/6] Bundling app files into installer resource" -ForegroundColor Yellow

$AppFilesZip = "$Root\Installer\AppFiles.zip"
Remove-Item $AppFilesZip -ErrorAction SilentlyContinue
Compress-Archive -Path "$AppPublish\*" -DestinationPath $AppFilesZip -Force
Ok "AppFiles.zip -> $AppFilesZip ($([math]::Round((Get-Item $AppFilesZip).Length / 1MB, 1)) MB)"

# --------------------------------------------------------------------------
# 4. Publish installer (now embeds AppFiles.zip)
# --------------------------------------------------------------------------
Write-Host "[4/6] Publishing installer (with embedded app files)" -ForegroundColor Yellow

dotnet publish "$Root\Installer\StoryTimelineInstaller.csproj" `
    -c Release -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:DebugType=none `
    -p:DebugSymbols=false `
    --nologo -v minimal

if ($LASTEXITCODE -ne 0) { Fail "dotnet publish (installer) failed" }

$InstallerExe = "$Root\Installer\bin\Release\net10.0-windows\win-x64\publish\StoryTimelineInstaller.exe"
if (-not (Test-Path $InstallerExe)) { Fail "Expected StoryTimelineInstaller.exe not found" }

# Clean up the intermediate zip now that it's embedded
Remove-Item $AppFilesZip -ErrorAction SilentlyContinue

$installerSizeMB = [math]::Round((Get-Item $InstallerExe).Length / 1MB, 1)
Ok "Installer -> $InstallerExe ($installerSizeMB MB)"

# --------------------------------------------------------------------------
# 5. Stage release artifacts
# --------------------------------------------------------------------------
Write-Host "[5/6] Creating release artifacts" -ForegroundColor Yellow

$ReleaseDir = "$Root\release\v$Version"
Remove-Item $ReleaseDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $ReleaseDir | Out-Null

# Setup: single self-contained exe - download and run, no extraction needed
$SetupExe = "$ReleaseDir\StoryTimeline-v$Version-setup.exe"
Copy-Item $InstallerExe $SetupExe
Ok "Setup    -> $SetupExe"

# Portable: zip of app publish output - extract anywhere and run StoryTimeline.exe
$PortableZip = "$ReleaseDir\StoryTimeline-v$Version-portable.zip"
Compress-Archive -Path "$AppPublish\*" -DestinationPath $PortableZip -Force
Ok "Portable -> $PortableZip"

# --------------------------------------------------------------------------
# 6. GitHub release
# --------------------------------------------------------------------------
if (-not $CreateRelease) {
    Write-Host "[6/6] Skipped (pass -CreateRelease to publish to GitHub)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Artifacts ready in: $ReleaseDir" -ForegroundColor Green
    Write-Host ""
    exit 0
}

Write-Host "[6/6] Creating GitHub release" -ForegroundColor Yellow

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

$ghArgs = @(
    "release", "create", $tag,
    $SetupExe,
    $PortableZip,
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
