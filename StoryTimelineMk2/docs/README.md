# StoryTimelineMk2 — Project Documentation

Generated 2026-09-11 by a multi-agent documentation sweep. Each file is verified against the
code it documents, with `file.cs:123`-style references throughout.

## Contents

| # | File | Covers |
|---|------|--------|
| 01 | [01-architecture.md](01-architecture.md) | Stack overview, Vite entry points ↔ WinForms windows, startup sequence, AppConfig, build/run/test commands, repo layout |
| 02 | [02-database.md](02-database.md) | Full schema, ER relationships, per-repo API reference, importer, migrations |
| 03 | [03-bridge-protocol.md](03-bridge-protocol.md) | The complete 62-action frontend↔backend message contract with payload/response shapes, push actions, protocol quirks |
| 04 | [04-windows-host.md](04-windows-host.md) | Window inventory, BorderlessFormBase deep-dive (borderless drag/resize system), lifecycle flows, WebView2 setup |
| 05 | [05-frontend-pages.md](05-frontend-pages.md) | Each page: layout, state, interactions, modals, data flow on load |
| 06 | [06-frontend-components.md](06-frontend-components.md) | All ~34 components: props/emits/slots contracts, usage map, TimelineCanvas deep-dive |
| 07 | [07-store-and-utils.md](07-store-and-utils.md) | timelineStore, types/models, layout math, Konva node builders, filter/relative rules, calendar math |
| 08 | [08-domain-concepts.md](08-domain-concepts.md) | TimelineItem TypeIds, custom calendars, LOD ladder, layout presets, filter system, hidden ranges, glossary |
| 09 | [09-testing.md](09-testing.md) | Test pyramid, run commands, bridge-mock and e2e-real (CDP) strategies, coverage map |

> **Note:** the older lowercase docs in this folder (`architecture.md`, `bridge-api.md`,
> `data-model.md`, `development.md`, `frontend.md`, `overview.md`) predate this set and may be
> stale — the audit found at least one outdated claim in `architecture.md`. Prefer the numbered
> docs; consider deleting or refreshing the old ones.

## Companion documents (repo root)

- **[../AUDIT_FINDINGS.md](../AUDIT_FINDINGS.md)** — full codebase audit: ~120 findings across
  database, bridge/host, pages, components, FE↔BE contract, and styling, with severities and fixes.
- **[../CHANGES.md](../CHANGES.md)** — every change applied during the overnight session
  (all low-risk bug fixes; nothing committed).
- **[../CLAUDE.md](../CLAUDE.md)** — working conventions for AI-assisted development.
