-- Delivery 4, Candide's first feedback batch (docs/releases/2026-11-03-feedback-batch-1.md).
-- New tables first, then the data the cards ask to keep, then the removed columns.
CREATE TABLE "admin_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	CONSTRAINT "admin_invitations_expiry_after_creation" CHECK ("admin_invitations"."expires_at" > "admin_invitations"."created_at"),
	CONSTRAINT "admin_invitations_used_or_revoked" CHECK ("admin_invitations"."used_at" is null or "admin_invitations"."revoked_at" is null)
);
--> statement-breakpoint
CREATE TABLE "admin_user_expertise" (
	"admin_user_id" uuid NOT NULL,
	"expertise_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_expertise_pk" PRIMARY KEY("admin_user_id","expertise_id")
);
--> statement-breakpoint
CREATE TABLE "service_category_tags" (
	"service_id" uuid NOT NULL,
	"category_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_category_tags_pk" PRIMARY KEY("service_id","category_key")
);
--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_created_by_id_admin_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_used_by_id_admin_users_id_fk" FOREIGN KEY ("used_by_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_revoked_by_id_admin_users_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_expertise" ADD CONSTRAINT "admin_user_expertise_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_expertise" ADD CONSTRAINT "admin_user_expertise_expertise_id_expertise_items_id_fk" FOREIGN KEY ("expertise_id") REFERENCES "public"."expertise_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_category_tags" ADD CONSTRAINT "service_category_tags_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_category_tags" ADD CONSTRAINT "service_category_tags_category_key_service_categories_key_fk" FOREIGN KEY ("category_key") REFERENCES "public"."service_categories"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invitations_token_hash_unique" ON "admin_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_user_expertise_expertise_id_idx" ON "admin_user_expertise" USING btree ("expertise_id");--> statement-breakpoint
CREATE INDEX "service_category_tags_category_key_idx" ON "service_category_tags" USING btree ("category_key");--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_known";--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_known" CHECK ("audit_events"."action" in ('created', 'imported', 'duplicated', 'updated', 'archived', 'restored', 'deleted', 'comment_added', 'comment_edited', 'comment_deleted', 'access_granted', 'access_changed', 'access_revoked', 'invited', 'activated', 'link_created', 'link_revoked', 'password_changed', 'email_changed', 'deactivated', 'reactivated', 'permission_denied'));--> statement-breakpoint
-- OPS-144: the profile description.
ALTER TABLE "admin_users" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_description_length" CHECK ("admin_users"."description" is null or char_length("admin_users"."description") <= 5000);--> statement-breakpoint
-- OPS-141: an account made from an invitation link has no role until a Rootadmin gives it one.
ALTER TABLE "admin_users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
-- OPS-130 (client, 2026-11-03): ownership lives on the permission. A service's responsible account
-- without a permission on it gets an Active Owner permission, with one History event, before the
-- field goes; one who already has a permission there keeps it as it is.
WITH "moved" AS (
	INSERT INTO "access_grants" ("service_id", "admin_user_id", "level_key", "status_key")
	SELECT s."id", s."responsible_admin_id", 'owner', 'active'
	FROM "services" s
	WHERE s."responsible_admin_id" IS NOT NULL
		AND NOT EXISTS (
			SELECT 1 FROM "access_grants" g
			WHERE g."service_id" = s."id" AND g."admin_user_id" = s."responsible_admin_id" AND g."archived_at" IS NULL
		)
	RETURNING "id", "grant_number", "service_id", "admin_user_id"
)
INSERT INTO "audit_events" ("entity_type", "entity_id", "action", "actor_type", "actor_label", "source", "meta")
SELECT 'access_grant', m."id"::text, 'access_granted', 'automation', 'Automation', 'system',
	jsonb_build_object(
		'label', '#' || m."grant_number" || ' · ' || s."name" || ' / ' || coalesce(u."display_name", split_part(u."email", '@', 1)) || ' / Owner',
		'collection', 'Permissions',
		'account', coalesce(u."display_name", split_part(u."email", '@', 1)),
		'level', 'Owner',
		'service', s."name",
		'note', 'Was the service''s Responsible account.',
		'related', jsonb_build_array(
			jsonb_build_object('type', 'admin_user', 'id', m."admin_user_id"::text),
			jsonb_build_object('type', 'service', 'id', m."service_id"::text)
		)
	)
FROM "moved" m
JOIN "services" s ON s."id" = m."service_id"
JOIN "admin_users" u ON u."id" = m."admin_user_id";--> statement-breakpoint
-- OPS-149: each service's category becomes its first tag.
INSERT INTO "service_category_tags" ("service_id", "category_key", "position")
SELECT "id", "category_key", 0 FROM "services" WHERE "category_key" IS NOT NULL;--> statement-breakpoint
-- OPS-153: "Other" is a contact channel (the client's Notion export uses it). Vocabulary, not demo data.
INSERT INTO "contact_channels" ("key", "label", "sort_order") VALUES ('other', 'Other', 100)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- OPS-138: every permission is named "Service / Account / Permission level" (grant-name.ts does the same).
UPDATE "access_grants" g SET "name" = left(concat_ws(' / ',
	(SELECT s."name" FROM "services" s WHERE s."id" = g."service_id"),
	(SELECT coalesce(u."display_name", split_part(u."email", '@', 1)) FROM "admin_users" u WHERE u."id" = g."admin_user_id"),
	(SELECT upper(left(l."label", 1)) || substr(l."label", 2) FROM "access_levels" l WHERE l."key" = g."level_key")
), 200);--> statement-breakpoint
-- OPS-130, 136, 142, 149: the removed fields (OPS-136 and 142 had no values in production).
ALTER TABLE "admin_users" DROP CONSTRAINT "admin_users_note_length";--> statement-breakpoint
ALTER TABLE "admin_users" DROP CONSTRAINT "admin_users_person_id_people_id_fk";
--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT "services_category_key_service_categories_key_fk";
--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT "services_responsible_admin_id_admin_users_id_fk";
--> statement-breakpoint
DROP INDEX "admin_users_person_unique";--> statement-breakpoint
ALTER TABLE "admin_users" DROP COLUMN "note";--> statement-breakpoint
ALTER TABLE "admin_users" DROP COLUMN "person_id";--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN "category_key";--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN "responsible_admin_id";
