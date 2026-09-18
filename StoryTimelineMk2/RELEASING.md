# Releasing Story Timeline

## Prerequisites

| Tool | Purpose | Where to get |
| ---- | ------- | ------------ |
| .NET 10 SDK | Build & publish C# | <https://dotnet.microsoft.com> |
| .NET Framework 4.8 targeting pack | Build the installer (comes with Visual Studio; the SDK also pulls reference assemblies via NuGet) | <https://dotnet.microsoft.com/download/dotnet-framework/net48> |
| Node.js 20+ | Build Vue frontend | <https://nodejs.org> |
| GitHub CLI (`gh`) | Create GitHub releases | <https://cli.github.com> |

Verify with:

```sh
dotnet --version    # 10.x.x
node --version      # 20.x.x or higher
gh --version
gh auth status      # must be logged in
```

---

## How versioning works

There is **one version number** per release. The script propagates it to all four locations automatically:

| File | Field |
| ---- | ----- |
| `StoryTimelineMk2.csproj` | `<Version>`, `<AssemblyVersion>`, `<FileVersion>` |
| `app.manifest` | `assemblyIdentity version=` |
| `Frontend/package.json` | `"version"` |
| `Installer/InstallerContext.cs` | `AppVersion` constant |

Everything downstream reads from these:

- **About modal** - reads `__APP_VERSION__` injected by Vite from `package.json` at build time
- **Update checker** - reads `Assembly.GetExecutingAssembly().GetName().Version` at runtime
- **Installer UI** - reads `InstallerContext.AppVersion` at runtime

---

## Running the release script

```powershell
# Default: prompts for the version, bumps it everywhere, builds all four artifacts.
# Nothing is pushed or published.
.\release.ps1
.\release.ps1 1.1.0            # same, version given up front

# Build, then tag + push + create the GitHub release (notes auto-generated from merged PRs)
.\release.ps1 1.1.0 -CreateRelease

# ...with custom notes
.\release.ps1 1.1.0 -CreateRelease -Notes "Bug fixes."

# ...as a pre-release (NOT picked up by the in-app update checker).
# The version itself must stay plain x.y.z - no "-beta" suffix.
.\release.ps1 1.1.0 -CreateRelease -PreRelease

# Test installers: -test suffix, the installer always shows the .NET runtime page and
# writes log.txt next to its exe. Pass the current version to leave source files unchanged.
.\release.ps1 1.0.0 -TestRelease

# Usage text
.\release.ps1 -Help
```

Artifacts land in `release/v<version>/`:

```text
release/v1.1.0/
  StoryTimeline-v1.1.0-setup.exe              <- installer, ~5 MB   (default download)
  StoryTimeline-v1.1.0-setup-offline.exe      <- installer, ~50 MB  (bundles the .NET runtime)
  StoryTimeline-v1.1.0-portable.zip           <- app only, ~5 MB    (needs .NET 10 Desktop Runtime)
  StoryTimeline-v1.1.0-portable-offline.zip   <- app only, ~50 MB   (self-contained)
```

The `release/` directory is gitignored.

---

## What's in each artifact

### `-setup.exe` / `-setup-offline.exe` - for most users

A single `.exe` - download and run. No extraction step needed.

The installer targets .NET Framework 4.8, which ships with Windows 10/11, so it runs
without any runtime download. The app files are embedded inside it as a zip resource
and extracted to the chosen install directory. It also:

- Lets the user pick an install directory
- Creates Start Menu / Desktop shortcuts
- Writes an Uninstall entry to Add/Remove Programs
- Copies itself to the install directory as the uninstaller
- Installs WebView2 if not present
- **`-setup.exe` only:** if the .NET 10 Desktop Runtime is missing, shows a page where the
  user chooses between letting the installer download it (~60 MB from Microsoft) or
  skipping and installing it themselves. The runtime is shared machine-wide, so later updates are
  ~5 MB each. `-setup-offline.exe` embeds a self-contained app and never downloads it.

### `-portable.zip` / `-portable-offline.zip` - no installation required

Extract anywhere, run `StoryTimeline.exe` directly. No registry entries, no
shortcuts. Suitable for USB drives or systems where the user cannot install software.

`-portable.zip` needs the .NET 10 Desktop Runtime on the machine (Windows shows a
download prompt if it's missing). `-portable-offline.zip` is self-contained.

Contents:

```text
StoryTimeline.exe       <- the app (single-file .NET exe)
Frontend/
  dist/                 <- Vue UI assets (must stay next to the exe)
```

---

## Update checker

The in-app update checker hits:

```text
GET https://api.github.com/repos/WolfyD/StoryTimelineMk2/releases/latest
```

Rules:

- Only **published, non-draft, non-pre-release** releases are returned by `/releases/latest`
- The release **tag must be semver** - `v1.1.0` or `1.1.0` (leading `v` is stripped)
- The checker runs once on app start (3 s delay), then at most once per 24 h
- Users can "Skip this version" - that version is suppressed forever unless they manually check

To trigger the checker: publish a release on GitHub with a tag higher than the currently installed version.

---

## Manual release checklist (if not using the script)

1. Bump all four version locations listed above
2. `cd Frontend && npm install`
3. For each flavour (`online`: `--self-contained false`, `offline`: `--self-contained true -p:EnableCompressionInSingleFile=true`):
   1. `dotnet publish StoryTimelineMk2.csproj -c Release -r win-x64 -o bin\publish\<flavour> --self-contained <...> -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true`
   2. `Compress-Archive -Path bin\publish\<flavour>\* -DestinationPath Installer\AppFiles.zip` (this is also the portable zip)
   3. `dotnet publish Installer\StoryTimelineInstaller.csproj -c Release -o Installer\bin\publish\<flavour> -p:OfflinePayload=<true|false>`
4. `git tag v1.x.x && git push origin v1.x.x`
5. Create GitHub release on that tag, upload all four artifacts

---

## Troubleshooting

### `git tag failed - tag may already exist`

```powershell
git tag -d v1.1.0          # delete local tag
git push origin :v1.1.0    # delete remote tag (if pushed)
```

### Update checker not seeing new version

- Confirm the GitHub release is **published** (not draft)
- Confirm it is **not** marked as pre-release
- Confirm the tag is plain semver (`v1.1.0`, not `release/1.1.0`)
- The user may have clicked "Skip this version" - they can re-check via About > Check for updates

### Installer throws "AppFiles.zip not found in installer resources"

The installer was built without the embedded app bundle. Always use `release.ps1` to build
the installer - it creates `Installer/AppFiles.zip` from the app publish output before
building the installer project, so the zip gets embedded as a resource.
