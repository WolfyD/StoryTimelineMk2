# StoryTimelineMk2 — Signing and distribution backlog

Split out of `BACKLOG.md` on 2026-09-23. Getting the Windows installer signed is its own
track: neither item blocks a release, both wait on things outside the code (a Store account,
a reputation SignPath can see), and leaving them in the main backlog made 1.1.0 look unfinished
when it was not. Pick this file up on its own.

Numbers stay as they are — BL numbers are permanent and unique across both files.

---

## [BL-69] Microsoft Store channel (MSIX)

**Status:** Deferred (2026-09-21) — was behind the browser build, which finished 2026-09-22, so
nothing blocks this now bar the decision to start. The free route to a warning-free install on
Windows, and the one signing route with no licence or reputation conditions, so this is where to
restart when signing comes back up.

Package the app as MSIX and publish it to the Microsoft Store. Individual developer registration is
free (since late 2025) and the Store re-signs submissions with its own certificate, so Store
installs raise no SmartScreen warning and updates arrive through the Store. Needs no licence of any
particular kind and does not replace BL-70 — the GitHub installer stays the primary channel, the
Store is the frictionless one.

Work: an MSIX packaging project, Store account and name reservation, package identity plus a check
on how the virtualised `%LOCALAPPDATA%` behaves (the app writes `StoryTimelineMk2_Data` and
`_Cache`), and a decision on whether the in-app updater hides itself in a Store build.

---

## [BL-70] Signed installer — SignPath Foundation + CI build

**Status:** In progress (2026-09-21). Licence prerequisite done (AGPL-3.0); the CI half is in —
`.github/workflows/build.yml` runs the tests and then `release.ps1 <version>` (without
`-CreateRelease`) on `windows-latest` and uploads all four artifacts, triggered by hand or by a
`v*` tag. Two green runs (~4 min, all 950 tests, four artifacts, 14-day retention).

**Deferred on 2026-09-21, behind the browser build (BL-67 / BL-68). SignPath application parked.** Their form also asks for a project download page
and evidence of reputation — media coverage, download statistics, GitHub insights, community
discussion — which this project does not have yet. Revisit once a few releases have accumulated
download counts and traffic. Nothing else is blocked by it: the CI build stands on its own and
BL-69 (Store) has no such bar. When it does happen, uncomment the signing step at the bottom of
the workflow and fill in the org / project / policy slugs and `SIGNPATH_API_TOKEN`.

Get `StoryTimelineSetup.exe` signed with a free OV certificate from SignPath Foundation so the
installer stops showing "unknown publisher". Their conditions:

- An OSI-approved licence with no commercial dual-licensing — **satisfied**: the repo is AGPL-3.0
  and every dependency is compatible (Dapper, Microsoft.Data.Sqlite, WebView2, Vue, Pinia, Konva
  and Phosphor are MIT-ish; Remixicon is Apache-2.0, compatible with v3).
- Public repository and a maintainer account with MFA.
- A project download page, plus evidence the project is **widely used or trusted** — this is the
  one that is not satisfied yet, and it is a judgement call on their side, not a checkbox.
- **Artifacts must be built by a CI pipeline**, not on a developer machine — **done**:
  `.github/workflows/build.yml` calls the same `release.ps1` on `windows-latest`, so there is one
  build definition rather than two, and SignPath pulls the artifact from the workflow run.

Sequence: Actions build (done), apply to SignPath, then have releases use the CI-built signed
artifacts instead of local ones — `release.ps1 -CreateRelease` still builds and publishes locally,
so the last step is teaching it (or a second workflow) to attach the signed artifacts to the tag.
Certum Open Source (~€69 first year, ~€29/yr after) is the paid fallback if SignPath declines.

---

