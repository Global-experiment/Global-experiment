CREATE TABLE "admin_permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_role_permissions" (
	"role_key" text NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "admin_role_permissions_pk" PRIMARY KEY("role_key","permission_key")
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_tokens_purpose_known" CHECK ("admin_tokens"."purpose" in ('invite', 'reset')),
	CONSTRAINT "admin_tokens_expiry_after_creation" CHECK ("admin_tokens"."expires_at" > "admin_tokens"."created_at")
);
--> statement-breakpoint
-- Roles, permission keys and grants (access-control/permissions.ts; overview §3.1). Seeded vocabulary, not demo data.
INSERT INTO "admin_roles" ("key", "label", "sort_order") VALUES
  ('owner', 'Rootadmin', 1),
  ('admin', 'Admin', 2),
  ('treasury', 'Treasury admin', 3),
  ('communication', 'Communication admin', 4),
  ('moderation', 'Moderator', 5),
  ('operations', 'Operation admin', 6),
  ('tech', 'Tech admin', 7),
  ('compliance', 'Compliance', 8);--> statement-breakpoint
INSERT INTO "admin_permissions" ("key", "module", "description") VALUES
  ('directory.read', 'directory', 'See people and organizations'),
  ('directory.create', 'directory', 'Create people and organizations'),
  ('directory.update', 'directory', 'Edit, link, archive and restore people and organizations'),
  ('directory.delete', 'directory', 'Delete people and organizations permanently'),
  ('directory.import', 'directory', 'Import people and organizations'),
  ('taxonomy.read', 'taxonomy', 'See expertise, fields and domains'),
  ('taxonomy.create', 'taxonomy', 'Create expertise, fields and domains'),
  ('taxonomy.update', 'taxonomy', 'Edit expertise, fields and domains'),
  ('taxonomy.delete', 'taxonomy', 'Delete expertise, fields and domains'),
  ('taxonomy.import', 'taxonomy', 'Import the taxonomy'),
  ('treasury.read', 'treasury', 'See the Treasury'),
  ('treasury.create', 'treasury', 'Create Treasury entries'),
  ('treasury.update', 'treasury', 'Edit Treasury entries, their documents and archive them'),
  ('treasury.review', 'treasury', 'Set the review status of expenses'),
  ('treasury.publish', 'treasury', 'Publish and unpublish Treasury entries'),
  ('treasury.delete', 'treasury', 'Delete Treasury entries permanently'),
  ('treasury.import', 'treasury', 'Import the Treasury'),
  ('cms.read', 'cms', 'See Home and Documentation content'),
  ('cms.create', 'cms', 'Create documentation'),
  ('cms.update', 'cms', 'Edit Home and Documentation'),
  ('cms.publish', 'cms', 'Publish Home and Documentation'),
  ('cms.delete', 'cms', 'Delete documentation'),
  ('cms.import', 'cms', 'Import Home and Documentation'),
  ('feedback.read', 'feedback', 'See feedbacks and issues'),
  ('feedback.update', 'feedback', 'Handle feedbacks and issues'),
  ('feedback.publish', 'feedback', 'Publish feedbacks and issues'),
  ('waitlist.read', 'waitlist', 'See the waitlist'),
  ('waitlist.update', 'waitlist', 'Handle the waitlist'),
  ('messages.read', 'messages', 'See messages and emails'),
  ('messages.update', 'messages', 'Answer messages and emails'),
  ('services.read', 'services', 'See services'),
  ('services.create', 'services', 'Create services'),
  ('services.update', 'services', 'Edit, archive and restore services'),
  ('services.delete', 'services', 'Delete services permanently'),
  ('access.read', 'access', 'See permissions (access grants)'),
  ('access.create', 'access', 'Grant access'),
  ('access.update', 'access', 'Change, revoke, archive and restore access'),
  ('access.delete', 'access', 'Delete access grants permanently'),
  ('accounts.read', 'accounts', 'See admin accounts'),
  ('accounts.manage', 'accounts', 'Invite, change and deactivate admin accounts; reset passwords'),
  ('history.read', 'history', 'See the whole history (otherwise: the modules the role can see)'),
  ('imports.read', 'imports', 'See the Imports page and its runs'),
  ('settings.manage', 'settings', 'Change platform settings');--> statement-breakpoint
INSERT INTO "admin_role_permissions" ("role_key", "permission_key") VALUES
  ('owner', 'directory.read'),
  ('owner', 'directory.create'),
  ('owner', 'directory.update'),
  ('owner', 'directory.delete'),
  ('owner', 'directory.import'),
  ('owner', 'taxonomy.read'),
  ('owner', 'taxonomy.create'),
  ('owner', 'taxonomy.update'),
  ('owner', 'taxonomy.delete'),
  ('owner', 'taxonomy.import'),
  ('owner', 'treasury.read'),
  ('owner', 'treasury.create'),
  ('owner', 'treasury.update'),
  ('owner', 'treasury.review'),
  ('owner', 'treasury.publish'),
  ('owner', 'treasury.delete'),
  ('owner', 'treasury.import'),
  ('owner', 'cms.read'),
  ('owner', 'cms.create'),
  ('owner', 'cms.update'),
  ('owner', 'cms.publish'),
  ('owner', 'cms.delete'),
  ('owner', 'cms.import'),
  ('owner', 'feedback.read'),
  ('owner', 'feedback.update'),
  ('owner', 'feedback.publish'),
  ('owner', 'waitlist.read'),
  ('owner', 'waitlist.update'),
  ('owner', 'messages.read'),
  ('owner', 'messages.update'),
  ('owner', 'services.read'),
  ('owner', 'services.create'),
  ('owner', 'services.update'),
  ('owner', 'services.delete'),
  ('owner', 'access.read'),
  ('owner', 'access.create'),
  ('owner', 'access.update'),
  ('owner', 'access.delete'),
  ('owner', 'accounts.read'),
  ('owner', 'accounts.manage'),
  ('owner', 'history.read'),
  ('owner', 'imports.read'),
  ('owner', 'settings.manage'),
  ('admin', 'directory.read'),
  ('admin', 'directory.create'),
  ('admin', 'directory.update'),
  ('admin', 'directory.import'),
  ('admin', 'taxonomy.read'),
  ('admin', 'taxonomy.import'),
  ('admin', 'treasury.read'),
  ('admin', 'treasury.create'),
  ('admin', 'treasury.update'),
  ('admin', 'treasury.review'),
  ('admin', 'cms.read'),
  ('admin', 'cms.create'),
  ('admin', 'cms.update'),
  ('admin', 'cms.publish'),
  ('admin', 'cms.delete'),
  ('admin', 'cms.import'),
  ('admin', 'feedback.read'),
  ('admin', 'feedback.update'),
  ('admin', 'waitlist.read'),
  ('admin', 'waitlist.update'),
  ('admin', 'messages.read'),
  ('admin', 'messages.update'),
  ('admin', 'services.read'),
  ('admin', 'services.create'),
  ('admin', 'services.update'),
  ('admin', 'access.read'),
  ('admin', 'access.create'),
  ('admin', 'access.update'),
  ('admin', 'accounts.read'),
  ('admin', 'history.read'),
  ('admin', 'imports.read'),
  ('treasury', 'directory.read'),
  ('treasury', 'taxonomy.read'),
  ('treasury', 'services.read'),
  ('treasury', 'access.read'),
  ('treasury', 'imports.read'),
  ('treasury', 'treasury.read'),
  ('treasury', 'treasury.create'),
  ('treasury', 'treasury.update'),
  ('treasury', 'treasury.review'),
  ('treasury', 'treasury.publish'),
  ('treasury', 'treasury.import'),
  ('communication', 'directory.read'),
  ('communication', 'taxonomy.read'),
  ('communication', 'treasury.read'),
  ('communication', 'feedback.read'),
  ('communication', 'cms.read'),
  ('communication', 'cms.create'),
  ('communication', 'cms.update'),
  ('communication', 'cms.publish'),
  ('communication', 'waitlist.read'),
  ('communication', 'waitlist.update'),
  ('communication', 'messages.read'),
  ('communication', 'messages.update'),
  ('moderation', 'directory.read'),
  ('moderation', 'taxonomy.read'),
  ('moderation', 'cms.read'),
  ('moderation', 'feedback.read'),
  ('moderation', 'feedback.update'),
  ('moderation', 'feedback.publish'),
  ('moderation', 'messages.read'),
  ('moderation', 'messages.update'),
  ('operations', 'taxonomy.read'),
  ('operations', 'treasury.read'),
  ('operations', 'waitlist.read'),
  ('operations', 'messages.read'),
  ('operations', 'directory.read'),
  ('operations', 'directory.create'),
  ('operations', 'directory.update'),
  ('operations', 'services.read'),
  ('operations', 'services.create'),
  ('operations', 'services.update'),
  ('operations', 'access.read'),
  ('operations', 'access.create'),
  ('operations', 'access.update'),
  ('tech', 'directory.read'),
  ('tech', 'treasury.read'),
  ('tech', 'cms.read'),
  ('tech', 'feedback.read'),
  ('tech', 'messages.read'),
  ('tech', 'history.read'),
  ('tech', 'taxonomy.read'),
  ('tech', 'taxonomy.import'),
  ('tech', 'services.read'),
  ('tech', 'services.create'),
  ('tech', 'services.update'),
  ('tech', 'access.read'),
  ('tech', 'access.create'),
  ('tech', 'access.update'),
  ('tech', 'imports.read'),
  ('compliance', 'directory.read'),
  ('compliance', 'taxonomy.read'),
  ('compliance', 'treasury.read'),
  ('compliance', 'cms.read'),
  ('compliance', 'feedback.read'),
  ('compliance', 'waitlist.read'),
  ('compliance', 'messages.read'),
  ('compliance', 'services.read'),
  ('compliance', 'access.read'),
  ('compliance', 'accounts.read'),
  ('compliance', 'history.read'),
  ('compliance', 'imports.read'),
  ('compliance', 'treasury.review');--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_known";--> statement-breakpoint
ALTER TABLE "admin_users" DROP CONSTRAINT "admin_users_role_known";--> statement-breakpoint
DROP INDEX "admin_users_single_owner";--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "account_number" integer NOT NULL GENERATED BY DEFAULT AS IDENTITY (sequence name "admin_users_account_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "picture_key" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "picture_type" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "appearance" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "invited_by_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_key_admin_roles_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."admin_roles"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permission_key_admin_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."admin_permissions"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "admin_tokens" ADD CONSTRAINT "admin_tokens_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tokens" ADD CONSTRAINT "admin_tokens_created_by_id_admin_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_tokens_token_hash_unique" ON "admin_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_tokens_admin_user_id_idx" ON "admin_tokens" USING btree ("admin_user_id");--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_admin_roles_key_fk" FOREIGN KEY ("role") REFERENCES "public"."admin_roles"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_invited_by_id_admin_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_account_number_unique" ON "admin_users" USING btree ("account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_person_unique" ON "admin_users" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_known" CHECK ("audit_events"."action" in ('created', 'imported', 'duplicated', 'updated', 'archived', 'restored', 'deleted', 'comment_added', 'comment_edited', 'comment_deleted', 'access_granted', 'access_changed', 'access_revoked', 'invited', 'activated', 'link_created', 'password_changed', 'email_changed', 'deactivated', 'reactivated', 'permission_denied'));--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_status_known" CHECK ("admin_users"."status" in ('active', 'invited', 'deactivated'));--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_password_when_active" CHECK ("admin_users"."status" = 'invited' or "admin_users"."password_hash" is not null);--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_appearance_known" CHECK ("admin_users"."appearance" in ('system', 'light', 'dark'));--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_time_zone_shape" CHECK ("admin_users"."time_zone" is null or char_length("admin_users"."time_zone") between 1 and 64);--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_note_length" CHECK ("admin_users"."note" is null or char_length("admin_users"."note") <= 2000);--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_picture_type_known" CHECK ("admin_users"."picture_type" is null or "admin_users"."picture_type" in ('image/png', 'image/jpeg', 'image/webp'));--> statement-breakpoint
-- Never without a Rootadmin (decision 14): a change or deletion of an active Rootadmin (role 'owner')
-- must leave at least one active Rootadmin. Checked at commit, so a swap within one transaction
-- works; a new installation (no accounts yet) is untouched, as only updates and deletions fire.
CREATE FUNCTION "admin_users_keep_a_rootadmin"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'active' AND OLD."role" = 'owner'
     AND NOT EXISTS (SELECT 1 FROM "admin_users" WHERE "status" = 'active' AND "role" = 'owner') THEN
    RAISE EXCEPTION 'The last active Rootadmin can''t be deactivated, demoted or deleted.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "admin_users_keep_a_rootadmin" AFTER UPDATE OR DELETE ON "admin_users"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "admin_users_keep_a_rootadmin"();
