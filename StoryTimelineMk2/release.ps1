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

    [Parameter(ParameterSetName = 'Dev', Mandatory)] [switch]$Dev,

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
    .\release.ps1 -Dev                  self-contained Windows + browser (win/linux) builds
    .\release.ps1 -Help                 this text

  WHAT A BUILD DOES
    1. Writes the version into StoryTimelineMk2.csproj, app.manifest,
       Frontend/package.json and Installer/InstallerContext.cs
    2. Builds all eight artifacts into release\v<version>\
         StoryTimeline-v<x>-setup.exe              installer, ~5 MB, fetches .NET 10 runtime if missing
         StoryTimeline-v<x>-setup-offline.exe      installer, ~50 MB, runtime bundled
         StoryTimeline-v<x>-portable.zip           app only, ~5 MB, needs .NET 10 runtime
         StoryTimeline-v<x>-portable-offline.zip   app only, ~50 MB, self-contained
         StoryTimeline-v<x>-web-win-x64.zip        browser build, ~60 MB, self-contained
         StoryTimeline-v<x>-web-linux-x64.tar.gz   browser build, ~60 MB, self-contained
         StoryTimeline-v<x>-web-osx-arm64.tar.gz   browser build, ~60 MB, Apple Silicon
         StoryTimeline-v<x>-web-osx-x64.tar.gz     browser build, ~60 MB, Intel Macs
       The browser builds are self-contained only - a framework-dependent one would
       mean asking a Mac or Linux user to install .NET first. They are unsigned, so
       macOS needs:  xattr -dr com.apple.quarantine StoryTimeline.Server
    Nothing leaves your machine unless you pass -CreateRelease.

  FLAGS
    -CreateRelease   git tag v<x>, push the tag, create the GitHub release with all eight files
    -PreRelease      mark that GitHub release as a pre-release (the in-app update checker
                     ignores pre-releases). Only meaningful with -CreateRelease.
    -Notes "..."     release notes for the GitHub release. Default: releases\<version>.md
                     if it exists, otherwise GitHub auto-generates them from merged PRs.
                     Only meaningful with -CreateRelease.
    -TestRelease     artifacts get a -test suffix; the installer always shows the .NET
                     runtime page and downloads the runtime even if it is installed, and
                     writes log.txt next to the installer exe. Cannot combine with
                     -CreateRelease. Pass the current version to leave source files unchanged.
    -Dev             publishes only the offline (self-contained) builds, unarchived, and
                     stops: no version bump, no installer, no archive, nothing published.
                     Takes no version and no other flags.
                       release\dev\win\StoryTimeline.exe             the WinForms app
                       release\dev\web-win\StoryTimeline.Server.exe  the browser build
                                                                     (BL-68) - run it, then
                                                                     open the address it prints
                       release\dev\web-linux\StoryTimeline.Server    the same, for WSL:
                                                                     wsl ./StoryTimeline.Server
                     No macOS build here: it cannot be run on this machine anyway, so it is
                     built only for a real release.
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

# dotnet publish of the app, one flavour. The csproj's PublishFrontend target runs
# `npm run build-only` and copies Frontend\dist next to the exe.
function PublishApp([string]$name, [string]$selfContained, [string]$outDir) {
    Log "dotnet publish app ($name)..."
    Remove-Item $outDir -Recurse -Force -ErrorAction SilentlyContinue
    dotnet publish "$Root\StoryTimelineMk2.csproj" `
        -c Release -r win-x64 -o $outDir `
        --self-contained $selfContained `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:EnableCompressionInSingleFile=$selfContained `
        -p:DebugType=none `
        -p:DebugSymbols=false `
        --nologo -v minimal
    if ($LASTEXITCODE -ne 0) { Fail "dotnet publish (app, $name) failed" }
    if (-not (Test-Path "$outDir\StoryTimeline.exe")) { Fail "StoryTimeline.exe not found in $outDir" }
}

# The browser build (BL-68): Kestrel serving the same SPA over a WebSocket bridge.
# SkipFrontendBuild is safe because the app publish above has just rebuilt Frontend\dist.
function PublishServer([string]$rid, [string]$outDir) {
    Log "dotnet publish server ($rid)..."
    Remove-Item $outDir -Recurse -Force -ErrorAction SilentlyContinue
    dotnet publish "$Root\StoryTimeline.Server\StoryTimeline.Server.csproj" `
        -c Release -r $rid -o $outDir `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:EnableCompressionInSingleFile=true `
        -p:DebugType=none `
        -p:DebugSymbols=false `
        -p:SkipFrontendBuild=true `
        --nologo -v minimal
    if ($LASTEXITCODE -ne 0) { Fail "dotnet publish (server, $rid) failed" }
    # Only Windows gets the .exe suffix; the Unix RIDs produce a bare binary.
    $ServerExe = if ($rid -like "win-*") { "StoryTimeline.Server.exe" } else { "StoryTimeline.Server" }
    if (-not (Test-Path "$outDir\$ServerExe")) { Fail "$ServerExe not found in $outDir" }
    if (-not (Test-Path "$outDir\wwwroot\index.html")) { Fail "wwwroot\index.html not found in $outDir" }
}

function NpmInstall {
    Log "npm install..."
    Push-Location "$Root\Frontend"
    npm install --silent
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm install failed" }
    Pop-Location
}

if ($Dev) {
    # Version comes from the csproj - source files are never touched in a dev build.
    $Version = [regex]::Match((Get-Content "$Root\StoryTimelineMk2.csproj" -Raw), '<Version>([^<]+)</Version>').Groups[1].Value
    $DevDir  = "$Root\release\dev"
    Write-Host ""
    Write-Host "  Story Timeline dev build (v$Version, offline flavour, unzipped)" -ForegroundColor Magenta
    Write-Host ""
    NpmInstall
    # Wipe the whole folder: anything from before the win/web split would sit next to the two
    # new folders looking current.
    Remove-Item $DevDir -Recurse -Force -ErrorAction SilentlyContinue
    # A dev build still running holds its own .exe open, and the publish then dies minutes later
    # with an MSB4018 that names nothing useful. Say which process to close instead.
    if (Test-Path $DevDir) {
        $Holders = Get-Process -Name StoryTimeline, StoryTimeline.Server -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -and $_.Path.StartsWith($DevDir, 'OrdinalIgnoreCase') }
        if ($Holders) {
            Write-Host "  ERROR: a previous dev build is still running - close it and run again:" -ForegroundColor Red
            $Holders | ForEach-Object { Write-Host "         $($_.ProcessName) (PID $($_.Id))" -ForegroundColor Red }
        } else {
            Write-Host "  ERROR: could not clear $DevDir - something has a file in it open." -ForegroundColor Red
        }
        exit 1
    }
    PublishApp "dev" "true" "$DevDir\win"
    PublishServer "win-x64"   "$DevDir\web-win"
    PublishServer "linux-x64" "$DevDir\web-linux"
    Write-Host ""
    Write-Host "  Ready: $DevDir\win\StoryTimeline.exe" -ForegroundColor Green
    Write-Host "         $DevDir\web-win\StoryTimeline.Server.exe (then open the address it prints)" -ForegroundColor Green
    Write-Host "         $DevDir\web-linux\StoryTimeline.Server  (wsl ./StoryTimeline.Server)" -ForegroundColor Green
    Write-Host ""
    exit 0
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
Write-Host "[1/4] Bumping version to $Version" -ForegroundColor Yellow

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
Write-Host "[2/4] Building app + installer for each flavour" -ForegroundColor Yellow

NpmInstall

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
    $AppPublish = "$Root\bin\publish\$name"
    PublishApp $name $flavour.SelfContained $AppPublish

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
# 3. Browser build (BL-68), one self-contained server per platform.
#
#    No online/offline split: a framework-dependent build would mean asking a
#    Mac or Linux user to install .NET first, which is the friction the browser
#    build exists to avoid.
#
#    The Unix ones are .tar.gz, not .zip, because zip carries no executable
#    bit. Setting that bit needs both tars - see the comment on $GnuTar below.
# --------------------------------------------------------------------------
Write-Host "[3/4] Building the browser build for each platform" -ForegroundColor Yellow

# Two tars, because neither does the job alone. Windows' own bsdtar has no
# --mode, and NTFS has no executable bit for it to carry, so it records 0644
# and the binary will not run on the other side. Git's GNU tar can force the
# mode, but it reads C:\ as a remote host without --force-local and has no
# gzip to shell out to. So GNU tar writes the modes, bsdtar does the gzip.
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Fail "tar not found - needed for the macOS/Linux archives. It ships with Windows 10 1803+."
}
$GnuTar = "$env:ProgramFiles\Git\usr\bin\tar.exe"
if (-not (Test-Path $GnuTar)) {
    Fail "GNU tar not found at $GnuTar - needed to mark the macOS/Linux binary executable. It ships with Git for Windows."
}

foreach ($web in @(
    @{ Rid = "win-x64";   Tar = $false },
    @{ Rid = "linux-x64"; Tar = $true  },
    @{ Rid = "osx-arm64"; Tar = $true  },
    @{ Rid = "osx-x64";   Tar = $true  }
)) {
    $rid        = $web.Rid
    $WebPublish = "$Root\bin\publish\web-$rid"
    PublishServer $rid $WebPublish

    if ($web.Tar) {
        $WebArchive = "$ReleaseDir\StoryTimeline-v$Version-web-$rid$TestSuffix.tar.gz"
        $WebTar     = "$WebPublish.tar"
        Remove-Item $WebArchive, $WebTar -Force -ErrorAction SilentlyContinue
        & $GnuTar -cf $WebTar --force-local "--mode=a+rx" "--owner=root:0" "--group=root:0" -C $WebPublish .
        if ($LASTEXITCODE -ne 0) { Fail "tar (web, $rid) failed" }
        tar -czf $WebArchive "@$WebTar"
        if ($LASTEXITCODE -ne 0) { Fail "gzip (web, $rid) failed" }
        Remove-Item $WebTar -Force
    } else {
        $WebArchive = "$ReleaseDir\StoryTimeline-v$Version-web-$rid$TestSuffix.zip"
        Compress-Archive -Path "$WebPublish\*" -DestinationPath $WebArchive -Force
    }
    Ok "Web      ($rid) -> $WebArchive ($([math]::Round((Get-Item $WebArchive).Length / 1MB, 1)) MB)"
    $Artifacts += $WebArchive
}

# --------------------------------------------------------------------------
# 4. GitHub release
# --------------------------------------------------------------------------
if (-not $CreateRelease) {
    Write-Host "[4/4] Skipped (pass -CreateRelease to publish to GitHub)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Artifacts ready in: $ReleaseDir" -ForegroundColor Green
    Write-Host ""
    exit 0
}

Write-Host "[4/4] Creating GitHub release" -ForegroundColor Yellow

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

$notesFile = Join-Path $Root "releases\$Version.md"
if ($Notes) {
    $ghArgs += "--notes"
    $ghArgs += $Notes
} elseif (Test-Path $notesFile) {
    Log "Release notes from releases\$Version.md"
    $ghArgs += "--notes-file"
    $ghArgs += $notesFile
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
