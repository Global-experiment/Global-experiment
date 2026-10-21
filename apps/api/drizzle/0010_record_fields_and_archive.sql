CREATE TABLE "contact_channels" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_channels_key_shape" CHECK ("contact_channels"."key" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "contact_channels_label_present" CHECK (length(btrim("contact_channels"."label")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "person_contact_channels" (
	"person_id" uuid NOT NULL,
	"channel_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_contact_channels_pk" PRIMARY KEY("person_id","channel_key")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "archived_by_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "next_followup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "first_contact_on" date;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "last_contact_on" date;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "ai_relevance_score" smallint;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "relevance_score" smallint;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "other_socials" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "archived_by_id" uuid;--> statement-breakpoint
ALTER TABLE "treasury_entries" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "treasury_entries" ADD COLUMN "archived_by_id" uuid;--> statement-breakpoint
ALTER TABLE "person_contact_channels" ADD CONSTRAINT "person_contact_channels_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_contact_channels" ADD CONSTRAINT "person_contact_channels_channel_key_contact_channels_key_fk" FOREIGN KEY ("channel_key") REFERENCES "public"."contact_channels"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_archived_by_id_admin_users_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_archived_by_id_admin_users_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_archived_by_id_admin_users_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organizations_archived_at_idx" ON "organizations" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "people_next_followup_at_idx" ON "people" USING btree ("next_followup_at");--> statement-breakpoint
CREATE INDEX "people_archived_at_idx" ON "people" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "treasury_entries_archived_at_idx" ON "treasury_entries" USING btree ("archived_at");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_relevance_scores_range" CHECK (("people"."ai_relevance_score" is null or "people"."ai_relevance_score" between 0 and 10) and ("people"."relevance_score" is null or "people"."relevance_score" between 0 and 10));--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_other_socials_length" CHECK ("people"."other_socials" is null or length("people"."other_socials") between 1 and 2048);--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_contact_dates_order" CHECK ("people"."first_contact_on" is null or "people"."last_contact_on" is null or "people"."first_contact_on" <= "people"."last_contact_on");--> statement-breakpoint
-- Decision 8 (2026-10-19): the contact channels lookup, seeded (vocabulary, not demo data); admins edit it later.
INSERT INTO "contact_channels" ("key", "label", "sort_order") VALUES
  ('email', 'Email', 10), ('phone', 'Phone', 20), ('whatsapp', 'WhatsApp', 30), ('signal', 'Signal', 40),
  ('telegram', 'Telegram', 50), ('linkedin', 'LinkedIn', 60), ('x', 'X', 70), ('matrix', 'Matrix', 80), ('workana', 'Workana', 90)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- The follow-up becomes a date and time: an existing date is that day at 09:00 in Zurich (the start of the working day).
UPDATE "people" SET "next_followup_at" = ("next_followup_on"::timestamp + interval '9 hours') AT TIME ZONE 'Europe/Zurich' WHERE "next_followup_on" IS NOT NULL;--> statement-breakpoint
DROP INDEX "people_next_followup_on_idx";--> statement-breakpoint
ALTER TABLE "people" DROP COLUMN "next_followup_on";--> statement-breakpoint
-- Archived entries leave the public pages too (same columns, in the same order).
CREATE OR REPLACE VIEW "treasury_public_entries" AS
  SELECT "id", "entry_number", "entry_type", "currency", "gross_amount", "net_amount", "cadence",
         "occurred_on", "occurred_at", "published_at", "review_status_key", "recurrence_id",
         "adjusts_entry_id", "source", "livemode",
         CASE WHEN "review_status_key" IN ('qualified', 'not_required') THEN "public_description" END AS "public_description",
         "sample"
  FROM "treasury_entries"
  WHERE "publication_status" = 'published' AND "archived_at" IS NULL;
