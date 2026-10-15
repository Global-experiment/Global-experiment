ALTER TABLE "treasury_entries" ADD COLUMN "sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "treasury_entries_sample_idx" ON "treasury_entries" USING btree ("created_at") WHERE "treasury_entries"."sample";--> statement-breakpoint
ALTER TABLE "treasury_entries" ADD CONSTRAINT "treasury_entries_sample_manual_only" CHECK (not "treasury_entries"."sample" or "treasury_entries"."source" = 'manual');--> statement-breakpoint
-- The public view (not managed by drizzle-kit) gains `sample`, as its last column: CREATE OR REPLACE VIEW only appends.
CREATE OR REPLACE VIEW "treasury_public_entries" AS
  SELECT "id", "entry_number", "entry_type", "currency", "gross_amount", "net_amount", "cadence",
         "occurred_on", "occurred_at", "published_at", "review_status_key", "recurrence_id",
         "adjusts_entry_id", "source", "livemode",
         CASE WHEN "review_status_key" IN ('qualified', 'not_required') THEN "public_description" END AS "public_description",
         "sample"
  FROM "treasury_entries"
  WHERE "publication_status" = 'published';
