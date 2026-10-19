# Release — admin shell (Step 3, 2026-10-19)

**Status: run on 2026-10-19.** Decision 16 of
[overview §2.3](../architecture/overview.md). No migration, no setting, no
environment change.

**What ships:** the sidebar from the module registry
(`src/modules/admin/registry.ts`) in the order of admin-desktop.pdf p2 (19 Oct),
with Contracting and Cloud added and the unbuilt modules "Coming soon" (dimmed
as in the Figma); search and "Collapse menu" fixed at the top; plain section
labels without separators; the light/dark preview toggle on the user card;
"2 sorts", "People updated" after a sort change, column labels without a
band; browser tab titles that follow the page header (record names
included); sticky headers on Profile and Notion import.

Procedure: backup (`o-backup.sh`, SHA-256 on the server and on the owner's
computer), then `p-release.sh` (stop, pull, `npm ci`, builds, `chown .next`,
clear the data cache, start, health checks).

## Rollback

Stop both services; `git checkout 6cba61c`, `npm ci`, both builds, `chown`;
start. No database change.

## Record of the run — 2026-10-19

| Step | Result |
|---|---|
| Backup | `ge-prod-20261019-100439.dump`, 289,726 bytes, SHA-256 `2b27b4d0af714285c318e01f44f9978d079b400fe61202eb269c034ad55ab6b2`; copied to `ge-db-backups`, hash identical. Entries 19, people 2, organizations 2, 9 migrations. |
| Release | Stopped 10:05:01 UTC, up 10:05:33 (**32 seconds** offline); `6cba61c..e46d901`; builds OK. |
| Checks | Public pages, `/api/health`, `/admin/login` 200; admin pages without a session send to the sign-in, as before; the new sidebar is in the build. Logs: no errors. |
