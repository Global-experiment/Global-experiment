-- Delivery 6, Part 1 — archive-only for comments, supporting documents and pictures (ADR 017, OPS-147).
-- Nothing removed here is lost: deleted comments become archived (and restorable), and the current
-- profile pictures are recorded in admin_user_pictures, where replaced and removed ones are kept from now on.
CREATE TABLE "admin_user_pictures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "admin_user_pictures_type_known" CHECK ("admin_user_pictures"."content_type" in ('image/png', 'image/jpeg', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_known";--> statement-breakpoint
ALTER TABLE "record_comments" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "treasury_documents" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "treasury_documents" ADD COLUMN "archived_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_user_pictures" ADD CONSTRAINT "admin_user_pictures_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_user_pictures_account_idx" ON "admin_user_pictures" USING btree ("admin_user_id","uploaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_user_pictures_account_key_unique" ON "admin_user_pictures" USING btree ("admin_user_id","storage_key");--> statement-breakpoint
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_archived_by_admin_id_admin_users_id_fk" FOREIGN KEY ("archived_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_known" CHECK ("audit_events"."action" in ('created', 'imported', 'duplicated', 'updated', 'archived', 'restored', 'deleted', 'comment_added', 'comment_edited', 'comment_deleted', 'access_granted', 'access_changed', 'access_revoked', 'invited', 'activated', 'link_created', 'link_revoked', 'password_changed', 'email_changed', 'deactivated', 'reactivated', 'permission_denied', 'comment_archived', 'comment_restored', 'file_archived', 'file_restored'));--> statement-breakpoint
UPDATE "record_comments" SET "archived_at" = "deleted_at" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
INSERT INTO "admin_user_pictures" ("admin_user_id", "storage_key", "content_type", "uploaded_at")
  SELECT "id", "picture_key", "picture_type", "updated_at" FROM "admin_users" WHERE "picture_key" IS NOT NULL AND "picture_type" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "record_comments" DROP COLUMN "deleted_at";
