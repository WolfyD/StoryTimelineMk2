# Building StoryTimeline Mk2

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| .NET SDK | 10.0+ | `dotnet --version` to check |
| Node.js | 18+ | `node --version` to check |
| npm | 9+ | bundled with Node |
| WebView2 Runtime | any | ships with Windows 11; [standalone installer](https://developer.microsoft.com/microsoft-edge/webview2/) for older Windows |

---

## Development (hot-reload)

1. Start the Vue dev server:
   ```
   cd Frontend
   npm install        # first time only
   npm run dev        # http://localhost:5173
   ```
2. Open `StoryTimelineMk2.sln` in Visual Studio and press **F5** (Debug).  
   The app auto-connects to the Vite dev server — changes in `Frontend/src/` reload instantly.

---

## Release build (single command)

From the repo root (where the `.csproj` lives):

```
dotnet publish StoryTimelineMk2.csproj -c Release -r win-x64 --self-contained false -o publish
```

Run this from the `StoryTimelineMk2\StoryTimelineMk2\` folder (where the `.csproj` lives).
Targeting the `.csproj` directly avoids a spurious NETSDK1194 warning that appears when MSBuild
discovers the `.slnx` in the parent directory and tries to apply `--output` across all projects.

This does **three things** in order:

1. Compiles the C# project in Release mode
2. Runs `npm run build-only` in `Frontend/` via the `PublishFrontend` MSBuild target
3. Copies the resulting `Frontend/dist/` next to the exe in the output folder

The ready-to-run output is in `publish/`.

### Self-contained build (no .NET runtime required on target machine)

```
dotnet publish StoryTimelineMk2.csproj -c Release -r win-x64 --self-contained true -o publish
```

Output is ~100 MB larger (~50 MB with `-p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true`) but runs on any Windows machine without a .NET 10 installation.

---

## CI build (GitHub Actions)

`.github/workflows/build.yml` produces the same four artifacts on a `windows-latest` runner. It runs
the frontend and .NET unit tests, then calls `release.ps1 <version>` **without** `-CreateRelease`, so
nothing is tagged or published from CI — the artifacts are attached to the workflow run instead.

- **Trigger:** Actions → Build → Run workflow (optional version box), or push a `v*` tag.
- **Version:** the tag wins, then the manual input, then whatever `<Version>` the csproj holds.
- **Why it exists:** SignPath Foundation only signs artifacts built by a pipeline (BL-70). The
  signing step is scaffolded as a comment at the bottom of the workflow.

Local releases are unchanged: `release.ps1 <version> -CreateRelease` still builds, tags and publishes
from your machine.

---

## Output folder structure

```
publish/
  StoryTimelineMk2.exe          ← entry point
  StoryTimelineMk2.dll
  Microsoft.Web.WebView2.*.dll
  e_sqlite3.dll
  ... (other runtime DLLs)
  Frontend/
    dist/
      index.html                ← main window
      timeline.html
      editItem.html
      settings.html
      calendar.html
      assets/
        *.js  *.css  *.woff2 …
```

The exe resolves the frontend at runtime as `{exe directory}\Frontend\dist\index.html`.  
If that file is missing it shows a warning dialog and exits.

---

## Data & cache locations

| Path | Contents |
|------|----------|
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\timeline.sqlite` | SQLite database |
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\logs\app.log` | Application log |
| `%LOCALAPPDATA%\StoryTimelineMk2_Data\backups\` | Auto/manual backups |
| `%LOCALAPPDATA%\StoryTimelineMk2_Cache\` | WebView2 browser cache |

These are created automatically on first run and are never touched by the build.

---

## Frontend-only rebuild

If you only changed frontend code and want to update an existing publish folder:

```
cd Frontend
npm run build-only
xcopy /E /I /Y dist ..\publish\Frontend\dist\
cd ..
```

---

## Notes

- `npm run build` also runs `vue-tsc --build` (type-check) which has pre-existing strictness errors in test files — these do **not** affect the runtime output. Use `npm run build-only` to skip type-check and just produce the dist.
- In Release mode the frontend is served via a virtual hostname (`https://app.local/`) mapped to the `Frontend/dist/` folder using WebView2's `SetVirtualHostNameToFolderMapping`. This gives the page a real HTTPS origin, which is required because Chromium blocks sub-resource loads for pages served under the `file://` protocol.
- WebView2 dev tools are currently enabled in both Debug and Release builds (`AreDevToolsEnabled = true` in `f_Main.cs`). Remove or guard that flag before a public release.
