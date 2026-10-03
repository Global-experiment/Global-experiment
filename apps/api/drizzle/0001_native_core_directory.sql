CREATE TABLE "expertise_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expertise_domains_name_present" CHECK (length(btrim("expertise_domains"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "expertise_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expertise_fields_name_present" CHECK (length(btrim("expertise_fields"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "expertise_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expertise_items_name_present" CHECK (length(btrim("expertise_items"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "organization_expertise" (
	"organization_id" uuid NOT NULL,
	"expertise_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_expertise_pk" PRIMARY KEY("organization_id","expertise_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_present" CHECK (length(btrim("organizations"."name")) between 1 and 200),
	CONSTRAINT "organizations_website_length" CHECK ("organizations"."website" is null or length("organizations"."website") <= 2048),
	CONSTRAINT "organizations_note_length" CHECK ("organizations"."note" is null or length("organizations"."note") <= 5000)
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"state_key" text,
	"source_key" text,
	"personal_note" text,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"email" text,
	"phone" text,
	"website" text,
	"linkedin" text,
	"x" text,
	"other_contact" text,
	"last_followup_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_name_present" CHECK (length(btrim("people"."name")) between 1 and 200),
	CONSTRAINT "people_email_shape" CHECK ("people"."email" is null or "people"."email" ~ '^[^@\s]+@[^@\s]+$'),
	CONSTRAINT "people_personal_note_length" CHECK ("people"."personal_note" is null or length("people"."personal_note") <= 5000),
	CONSTRAINT "people_contact_lengths" CHECK (coalesce(length("people"."email"), 0) <= 320 and coalesce(length("people"."phone"), 0) <= 64
        and coalesce(length("people"."website"), 0) <= 2048 and coalesce(length("people"."linkedin"), 0) <= 2048
        and coalesce(length("people"."x"), 0) <= 2048 and coalesce(length("people"."other_contact"), 0) <= 500)
);
--> statement-breakpoint
CREATE TABLE "people_expertise" (
	"person_id" uuid NOT NULL,
	"expertise_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_expertise_pk" PRIMARY KEY("person_id","expertise_id")
);
--> statement-breakpoint
CREATE TABLE "people_organizations" (
	"person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_organizations_pk" PRIMARY KEY("person_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "person_sources" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_sources_key_shape" CHECK ("person_sources"."key" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "person_sources_label_present" CHECK (length(btrim("person_sources"."label")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "person_states" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_states_key_shape" CHECK ("person_states"."key" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "person_states_label_present" CHECK (length(btrim("person_states"."label")) between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "expertise_fields" ADD CONSTRAINT "expertise_fields_domain_id_expertise_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."expertise_domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expertise_items" ADD CONSTRAINT "expertise_items_field_id_expertise_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."expertise_fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_expertise" ADD CONSTRAINT "organization_expertise_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_expertise" ADD CONSTRAINT "organization_expertise_expertise_id_expertise_items_id_fk" FOREIGN KEY ("expertise_id") REFERENCES "public"."expertise_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_state_key_person_states_key_fk" FOREIGN KEY ("state_key") REFERENCES "public"."person_states"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_source_key_person_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."person_sources"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "people_expertise" ADD CONSTRAINT "people_expertise_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_expertise" ADD CONSTRAINT "people_expertise_expertise_id_expertise_items_id_fk" FOREIGN KEY ("expertise_id") REFERENCES "public"."expertise_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_organizations" ADD CONSTRAINT "people_organizations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_organizations" ADD CONSTRAINT "people_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expertise_domains_name_unique" ON "expertise_domains" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "expertise_fields_domain_name_unique" ON "expertise_fields" USING btree ("domain_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "expertise_items_field_name_unique" ON "expertise_items" USING btree ("field_id",lower("name"));--> statement-breakpoint
CREATE INDEX "expertise_items_name_idx" ON "expertise_items" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "organization_expertise_expertise_id_idx" ON "organization_expertise" USING btree ("expertise_id");--> statement-breakpoint
CREATE INDEX "organizations_name_idx" ON "organizations" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "organizations_updated_at_idx" ON "organizations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "people_email_idx" ON "people" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "people_state_key_idx" ON "people" USING btree ("state_key");--> statement-breakpoint
CREATE INDEX "people_source_key_idx" ON "people" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "people_created_at_idx" ON "people" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "people_updated_at_idx" ON "people" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "people_last_followup_at_idx" ON "people" USING btree ("last_followup_at");--> statement-breakpoint
CREATE INDEX "people_expertise_expertise_id_idx" ON "people_expertise" USING btree ("expertise_id");--> statement-breakpoint
CREATE INDEX "people_organizations_organization_id_idx" ON "people_organizations" USING btree ("organization_id");--> statement-breakpoint
-- Known vocabulary (provisional, editable rows — not an enum). States are the
-- three Figma evidences; sources are the provenance examples named in the
-- client brief. Labels and the complete lists remain open client decisions.
INSERT INTO "person_states" ("key", "label", "sort_order") VALUES
  ('sourced', 'Sourced', 10),
  ('contacted', 'Contacted', 20),
  ('collaborating', 'Collaborating', 30)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "person_sources" ("key", "label", "sort_order") VALUES
  ('candide', 'Candide', 10),
  ('ai', 'AI', 20),
  ('contribution_email', 'Contribution email', 30),
  ('waitlist', 'Waitlist', 40),
  ('notion_import', 'Notion import', 50)
ON CONFLICT ("key") DO NOTHING;
