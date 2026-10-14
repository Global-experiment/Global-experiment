CREATE TABLE "treasury_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by_admin_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treasury_documents_file_name_present" CHECK (length(btrim("treasury_documents"."file_name")) between 1 and 255),
	CONSTRAINT "treasury_documents_content_type_known" CHECK ("treasury_documents"."content_type" in ('application/pdf', 'image/png', 'image/jpeg')),
	CONSTRAINT "treasury_documents_size_range" CHECK ("treasury_documents"."size_bytes" between 1 and 20971520),
	CONSTRAINT "treasury_documents_sha256_hex" CHECK ("treasury_documents"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "treasury_documents_storage_key_shape" CHECK ("treasury_documents"."storage_key" ~ '^[a-z0-9][a-z0-9/._-]{0,254}$')
);
--> statement-breakpoint
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_entry_id_treasury_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."treasury_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_uploaded_by_admin_id_admin_users_id_fk" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "treasury_documents_entry_idx" ON "treasury_documents" USING btree ("entry_id","uploaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "treasury_documents_entry_sha256_unique" ON "treasury_documents" USING btree ("entry_id","sha256");--> statement-breakpoint
CREATE INDEX "treasury_documents_storage_key_idx" ON "treasury_documents" USING btree ("storage_key");