CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"source" text NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_entity_type_shape" CHECK ("audit_events"."entity_type" ~ '^[a-z][a-z_]{1,39}$'),
	CONSTRAINT "audit_events_action_known" CHECK ("audit_events"."action" in ('created', 'imported', 'duplicated', 'updated', 'archived', 'restored', 'deleted', 'comment_added', 'comment_edited', 'comment_deleted')),
	CONSTRAINT "audit_events_actor_type_known" CHECK ("audit_events"."actor_type" in ('admin', 'automation')),
	CONSTRAINT "audit_events_actor_label_present" CHECK (length(btrim("audit_events"."actor_label")) between 1 and 120),
	CONSTRAINT "audit_events_source_known" CHECK ("audit_events"."source" in ('admin', 'import', 'stripe', 'system')),
	CONSTRAINT "audit_events_changes_array" CHECK (jsonb_typeof("audit_events"."changes") = 'array'),
	CONSTRAINT "audit_events_meta_object" CHECK (jsonb_typeof("audit_events"."meta") = 'object')
);
--> statement-breakpoint
CREATE TABLE "record_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "record_comments_body_length" CHECK (length(btrim("record_comments"."body")) between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE "record_views" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "record_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"viewer_id" uuid,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"in_history" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_author_id_admin_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_views" ADD CONSTRAINT "record_views_viewer_id_admin_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","id");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "record_comments_entity_idx" ON "record_comments" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "record_views_entity_idx" ON "record_views" USING btree ("entity_type","entity_id","viewed_at");--> statement-breakpoint
CREATE INDEX "record_views_viewer_idx" ON "record_views" USING btree ("viewer_id","entity_type","entity_id","viewed_at");--> statement-breakpoint
-- Append-only: the audit log is never rewritten. Updates and deletes are refused (TRUNCATE too), whoever runs them.
CREATE FUNCTION "audit_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_events_no_update_or_delete" BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();--> statement-breakpoint
CREATE TRIGGER "audit_events_no_truncate" BEFORE TRUNCATE ON "audit_events" FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_append_only"();
