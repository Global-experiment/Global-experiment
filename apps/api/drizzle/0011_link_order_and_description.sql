-- Client review of 2026-10-22: "Personal note" becomes the shared "Description",
-- and contact channels, organizations and expertise keep the order the admin
-- gives them (drag and drop; the first contact channel is the preferred one).
ALTER TABLE "people" RENAME COLUMN "personal_note" TO "description";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "people_personal_note_length" TO "people_description_length";--> statement-breakpoint
ALTER TABLE "people_organizations" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "people_expertise" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "person_contact_channels" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_expertise" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing links keep the order the record showed until now.
UPDATE "people_organizations" AS link SET "position" = ordered.position
FROM (
  SELECT po.person_id, po.organization_id, row_number() OVER (PARTITION BY po.person_id ORDER BY lower(o.name), o.id) - 1 AS position
  FROM "people_organizations" po JOIN "organizations" o ON o.id = po.organization_id
) AS ordered
WHERE link.person_id = ordered.person_id AND link.organization_id = ordered.organization_id;--> statement-breakpoint
UPDATE "people_expertise" AS link SET "position" = ordered.position
FROM (
  SELECT pe.person_id, pe.expertise_id,
    row_number() OVER (PARTITION BY pe.person_id ORDER BY lower(d.name), lower(f.name), lower(i.name)) - 1 AS position
  FROM "people_expertise" pe
  JOIN "expertise_items" i ON i.id = pe.expertise_id
  JOIN "expertise_fields" f ON f.id = i.field_id
  JOIN "expertise_domains" d ON d.id = f.domain_id
) AS ordered
WHERE link.person_id = ordered.person_id AND link.expertise_id = ordered.expertise_id;--> statement-breakpoint
UPDATE "organization_expertise" AS link SET "position" = ordered.position
FROM (
  SELECT oe.organization_id, oe.expertise_id,
    row_number() OVER (PARTITION BY oe.organization_id ORDER BY lower(d.name), lower(f.name), lower(i.name)) - 1 AS position
  FROM "organization_expertise" oe
  JOIN "expertise_items" i ON i.id = oe.expertise_id
  JOIN "expertise_fields" f ON f.id = i.field_id
  JOIN "expertise_domains" d ON d.id = f.domain_id
) AS ordered
WHERE link.organization_id = ordered.organization_id AND link.expertise_id = ordered.expertise_id;--> statement-breakpoint
UPDATE "person_contact_channels" AS link SET "position" = ordered.position
FROM (
  SELECT pc.person_id, pc.channel_key, row_number() OVER (PARTITION BY pc.person_id ORDER BY c.sort_order, c.key) - 1 AS position
  FROM "person_contact_channels" pc JOIN "contact_channels" c ON c.key = pc.channel_key
) AS ordered
WHERE link.person_id = ordered.person_id AND link.channel_key = ordered.channel_key;
