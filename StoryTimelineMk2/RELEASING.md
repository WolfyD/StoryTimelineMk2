# Releasing Story Timeline

## Prerequisites

| Tool | Purpose | Where to get |
| ---- | ------- | ------------ |
| .NET 10 SDK | Build & publish C# | <https://dotnet.microsoft.com> |
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
# Build artifacts only (no GitHub push) - good for testing the build
.\release.ps1 -Version 1.1.0

# Full release with auto-generated GitHub release notes (from merged PRs)
.\release.ps1 -Version 1.1.0 -CreateRelease

# Full release with custom notes
.\release.ps1 -Version 1.1.0 -CreateRelease -Notes "Bug fixes."

# Pre-release (shown as pre-release on GitHub, NOT picked up by update checker)
.\release.ps1 -Version 1.1.0-beta -CreateRelease -PreRelease
```

Artifacts land in `release/v<version>/`:

```text
release/v1.1.0/
  StoryTimeline-v1.1.0-setup.exe      <- single-file installer
  StoryTimeline-v1.1.0-portable.zip   <- app files only, no installer
```

The `release/` directory is gitignored.

---

## What's in each artifact

### `StoryTimeline-vX.Y.Z-setup.exe` - for most users

A single `.exe` - download and run. No extraction step needed.

The installer has the app files embedded inside it as a zip resource. At install
time it extracts them directly to the chosen install directory. It also:

- Lets the user pick an install directory
- Creates Start Menu / Desktop shortcuts
- Writes an Uninstall entry to Add/Remove Programs
- Copies itself to the install directory as the uninstaller
- Can install WebView2 if not present

### `StoryTimeline-vX.Y.Z-portable.zip` - no installation required

Extract anywhere, run `StoryTimeline.exe` directly. No registry entries, no
shortcuts. Suitable for USB drives or systems where the user cannot install software.

Contents:

```text
StoryTimeline.exe       <- the app (single-file, self-contained .NET exe)
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
2. `cd Frontend && npm install && npm run build`
3. `Compress-Archive -Path bin\...\publish\* -DestinationPath Installer\AppFiles.zip`
4. `dotnet publish StoryTimelineMk2.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true`
5. `dotnet publish Installer\StoryTimelineInstaller.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true`
6. `git tag v1.x.x && git push origin v1.x.x`
7. Create GitHub release on that tag, upload `setup.exe` and `portable.zip`

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
