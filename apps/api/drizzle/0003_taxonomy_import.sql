CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"mode" text NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"triggered_by" text NOT NULL,
	CONSTRAINT "import_runs_kind_shape" CHECK ("import_runs"."kind" ~ '^[a-z][a-z_]{0,39}$'),
	CONSTRAINT "import_runs_mode_known" CHECK ("import_runs"."mode" in ('dry_run', 'apply', 'failed')),
	CONSTRAINT "import_runs_finished_after_start" CHECK ("import_runs"."finished_at" is null or "import_runs"."finished_at" >= "import_runs"."started_at"),
	CONSTRAINT "import_runs_triggered_by_present" CHECK (length(btrim("import_runs"."triggered_by")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "expertise_domains" DROP CONSTRAINT "expertise_domains_stable_id_length";--> statement-breakpoint
CREATE INDEX "import_runs_kind_started_at_idx" ON "import_runs" USING btree ("kind","started_at");--> statement-breakpoint
ALTER TABLE "expertise_domains" ADD CONSTRAINT "expertise_domains_stable_id_shape" CHECK ("expertise_domains"."stable_id" is null or "expertise_domains"."stable_id" ~ '^domain\.[0-9]{2}\.[a-z0-9_]+$');--> statement-breakpoint
-- Taxonomy statuses: the Notion Status options (Active, Proposed, Deprecated;
-- only Active is in use, 2026-10-14). "deprecated" is also what
-- `import:taxonomy --deprecate-missing` sets on rows Notion no longer has.
INSERT INTO "taxonomy_statuses" ("key", "label", "sort_order") VALUES
  ('proposed', 'Proposed', 20),
  ('deprecated', 'Deprecated', 30)
ON CONFLICT ("key") DO NOTHING;
