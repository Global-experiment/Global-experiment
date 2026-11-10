-- OPS-155 — the expense detail page: every business field of an expense is editable by a Rootadmin.
-- A new permission, granted to the Rootadmin role only (permissions.ts); Treasury supporting documents leave the
-- platform, so treasury.update no longer mentions them. No table changes: treasury_documents stays until the
-- one-time deletion (ADR 021) has run.
INSERT INTO "admin_permissions" ("key", "module", "description") VALUES
  ('treasury.manage', 'treasury', 'Edit every business field of an expense (Rootadmin)')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "admin_role_permissions" ("role_key", "permission_key") VALUES ('owner', 'treasury.manage')
ON CONFLICT ("role_key", "permission_key") DO NOTHING;--> statement-breakpoint
UPDATE "admin_permissions" SET "description" = 'Edit the internal note of Treasury entries and archive them' WHERE "key" = 'treasury.update';
