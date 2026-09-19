# 10 — Schema Migrations

Both SQLite files the app owns are versioned with `PRAGMA user_version` and upgraded by a small
migration runner on every launch. **From 1.0.2 on, no schema change is made directly**: every change
is a numbered step, because any install may still be running a database written by an older build.

| Database | Path | Migration list | Entry point |
|----------|------|----------------|-------------|
| Timeline data | `<DataRoot>/timeline.sqlite` | `Database/Migrations/MainDbMigrations.cs` | `DbInitializer.Initialize()` |
| Usage statistics | `<exe folder>/usage.sqlite` | `Database/Migrations/StatsDbMigrations.cs` | `StatsDbInitializer.Initialize()` |

## How it works

`SchemaMigrator.Migrate(db, dbPath, steps, dbLabel, backupFirst, backupSuffix = "")`
(`Database/Migrations/SchemaMigrator.cs`) runs these stages, in order, and logs each one to `app.log`
under the `SchemaMigrator` tag:

1. **version check** — reads `PRAGMA user_version` (a database written before versioning existed,
   1.0.1 and earlier, reports **0**) and logs
   `timeline database <path>: schema version 0 (app 1.0.1); app 1.0.2 supports up to 2`.
   If the version is **higher** than the last step the build knows about, it throws
   `"The timeline database was created by a newer version of Story Timeline … Update the app to open it.
   The database was not changed."` — the file is never touched. If the version is already current, it returns.
2. **integrity check** — `PRAGMA quick_check` on the live file. Anything but `ok` aborts before any
   change (`"… failed its integrity check before the upgrade, so nothing was changed: <problems>"`).
3. **pre-migration backup** — when `backupFirst` is set and the file already has tables (see below).
4. **migration N (name)** — every step whose number is above the current version, in order. **Each step
   runs in its own transaction together with the `PRAGMA user_version = N` stamp**, so a crash
   mid-upgrade leaves the file at the last fully-applied step and the next launch resumes from there.
   Each step logs `applying migration N (name)` and `applied migration N (name) in X ms`, and the run
   ends with `upgrade complete, schema version N`.

Every failure — at any stage — surfaces as a `MigrationException` (an `InvalidOperationException`)
carrying `Info` (`MigrationInfo`: label, path, from/to schema versions and the app versions they map
to), `Stage` (the stage name above), `BackupPath` (set once the backup exists, otherwise `null`) and a
message that always states what state the file was left in (`"… migration 2 (add items.mood) failed
and was rolled back; the database was left at schema version 1. <SQLite error>"`). The original
exception is the `InnerException`.

**How failures reach the user:** `Program.cs` catches the timeline-database failure, logs it and shows
`Forms/f_ErrorReport` — a plain WinForms dialog with the full `ErrorReport.Build(...)` text in a
read-only box and *Copy report / Open log folder / Open backups folder* buttons — then exits. A
usage-statistics failure shows the same dialog but the app still starts. The report lists the app
version, log path, database, `Schema version: 0 (app 1.0.1) → 2 (app 1.0.2)`, the failed stage, the
backup path (or `none — the database was not modified`) and the exception with stack trace, so a pasted
report is enough to diagnose the problem.

Steps receive a `MigrationDb` — a thin wrapper exposing `Execute / ExecuteScalar / Query /
QueryFirstOrDefault` that always pass the open transaction (Microsoft.Data.Sqlite rejects commands
that omit it).

### Pre-migration backup

Before any step runs on a **live** database, `Migrate` writes a complete copy into the user's backups
folder via `VACUUM INTO` (`BackupService.CreatePreMigrationBackup`):

| Database | File name |
|----------|-----------|
| Timeline | `backups/pre v1.0.1-v1.0.2 migration backup - 2026-09-19 14-30-05.sqlite` |
| Usage statistics | `backups/pre v1.0.1-v1.0.2 migration backup (usage stats) - 2026-09-19 14-30-05.sqlite` |

The versions are **app** versions, not schema numbers: "from" is the release whose schema the file
carries (`Migration.AppVersion` of the last applied step — `SchemaMigrator.AppVersionOf`; version 0
maps to the baseline's release, 1.0.1) and "to" is `UpdateChecker.CurrentVersion`. The copy is
verified before it counts (`BackupService.VerifyBackup`: re-opened read-only, `PRAGMA quick_check`
must be `ok`, `user_version` and the `sqlite_master` table count must match the source); a copy that
fails verification is deleted and the upgrade aborts with stage `pre-migration backup` and the
database untouched. Success logs `Pre-migration backup written and verified: <path> (<n> KB)`.

Conditions: the file already has tables and is behind. These files are listed with the other backups
but **exempt from `PruneOldBackups`** (prefix `BackupService.PreMigrationPrefix` = `pre v`). A fresh
(empty) database and the importer's scratch copy (`backupFirst: false`) skip the backup.

### Step 1 — the 1.0.1 baseline

`MainDbMigrations.V1_Baseline` is the whole pre-versioning initializer moved verbatim
(`CREATE TABLE IF NOT EXISTS …`, column probing + `ALTER TABLE ADD COLUMN`, indexes, seed data, and
`NormaliseLegacyRows`, which absorbed the old `DatabaseImporter.ApplyLegacyMigrations`). It is
idempotent on purpose: every existing install is at version 0 and replays it once; a brand-new file
runs it as its first step. The same applies to `StatsDbMigrations` step 1.

## Adding a migration

1. Append a step to the relevant `Steps` array with the **next** number:

   ```csharp
   new(2, "add items.mood", "1.0.2", db =>
   {
       db.Execute("ALTER TABLE items ADD COLUMN mood TEXT");
       db.Execute("UPDATE items SET mood = 'neutral' WHERE mood IS NULL");
   }),
   ```

   The third argument is the app version that ships the step (the `<Version>` in the csproj); it is
   what the pre-migration backup name shows the user. Write plain `ALTER` / `UPDATE` / `CREATE` — a step
   runs exactly once per database, so there is no need for `IF NOT EXISTS` or column probing. Keep the
   CREATE TABLE text in step 1 untouched; a new column goes in the new step, not in the original DDL.
   (`ALTER TABLE … ADD COLUMN` cannot take a `DEFAULT CURRENT_TIMESTAMP` — SQLite rejects
   non-constant defaults there; use `DEFAULT NULL` + `UPDATE`.)
2. If the change needs new seed rows (a new built-in preset, item type, …), insert them in the step.
3. Update the schema reference in `02-database.md` and the model/repo code as usual.
4. Run `dotnet test StoryTimelineMk2.Tests` — `SchemaMigratorTests.MainV0Fixture_MigratesToSameSchemaAsFreshDb`
   builds a 1.0.1 database from `StoryTimelineMk2.Tests/Fixtures/main_schema_v0_1.0.1.sql`, migrates
   it, and asserts that every table's columns (name, type, NOT NULL, default, PK) and every index match
   a freshly created database. If it fails, the new step does not produce the same result as the
   fresh DDL — fix the step, never the fixture.

### Rules

- **Never edit a step that has shipped.** Users who already ran it will not run it again.
- **Never renumber or remove steps.** Versions must stay consecutive from 1 and every step carries a
  release version (`MigrationChains_AreNumberedConsecutivelyFromOne_AndTaggedWithAReleaseVersion`).
- **Downgrades are not supported.** A newer file is refused rather than partially read.
- **Don't reference repo/model classes from a step.** Steps must keep working after those classes change;
  use SQL only.
- **The frozen fixtures are never edited by hand.** They document what 1.0.1 shipped. If a later release
  should get its own fixture, generate it from a database that build actually wrote.

## Importing backups

`DatabaseImporter.ImportV2Backup` no longer reasons about which columns a backup might have. It:

1. Snapshots the backup to a scratch file (`%TEMP%/stl_import_<guid>.sqlite`) with `VACUUM INTO`
   (so a database with a WAL sidecar is captured whole).
2. Runs `DbInitializer.Initialize(scratch, backupFirst: false, dbLabel: "imported backup")` — the
   scratch copy is migrated to the current schema exactly like a live database would be (integrity
   check included, backup skipped).
3. `ATTACH`es the scratch file and copies each table in `V2CopyPlan` using the column set common to both
   sides (`pragma_table_info` intersection, by name — a migrated file has ALTER-added columns at the
   end, a fresh one declares them inline).
4. Deletes the scratch file.

A backup stamped by a newer app version — or one that fails `quick_check` — fails in step 2 with a
`MigrationException` whose `Info.DbPath` is rewritten to the file the user picked (the scratch copy is
deleted). `MessageRouter.HandleExecuteImportDB` shows it in the `f_ErrorReport` dialog ("The backup
could not be imported. Your current data was not changed.") and replies `{ status: "error", reported: true }`
so `App.vue` skips its own `alert()`; the menu-driven `HandleDBImport` path shows the same dialog.
