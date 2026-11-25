# 024 — The admin menu shows only live modules

## Status

Accepted — 2026-11-24 (client decision, confirmed 2026-11-25). Replaces the
"Coming soon" part of decision 16 (overview §6).

## Context

Since 2026-10-19 (decision 16) the admin sidebar listed every module the
designs name, in four sections, with the ones not built yet disabled and
marked "Coming soon", and Organizations twice (Admin and Other). The
client's Figma component "Desktop menu" (Design system, page "1 Master")
now draws one flat list without sections, and the client decided that
the menu shows only what an admin can use.

## Decision

- **Live modules only.** The admin menu lists a module once its pages
  exist: no "Coming soon" rows, no disabled rows, each page once.
- **The registry switches it on.** Each module in
  `src/modules/admin/registry.ts` has an `active` flag. A module appears
  in the menu, in the registry's order, when it is listed with
  `active: true` and the signed-in role holds its permission. Nobody edits
  the menu itself to add a row.
- **The order is the Figma's.** Home, Feedbacks and issues (when live),
  Documentation, Treasury, People, Organizations, Services, Permissions,
  Accounts, Expertise, Fields, Domains, History.

## Consequences

- An admin never sees a row that leads nowhere. What is planned is in the
  roadmap, not in the menu.
- Feedbacks and issues (part 2) adds its row through the registry, with
  its lightbulb glyph, when its admin screens ship.
- Waitlist, Messages, Emails, Analytics, Technical dashboard, Contracting
  and Cloud are no longer shown until they are built.
