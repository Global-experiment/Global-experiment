-- Source "Other": an option of the Notion 0.1 native People database
-- (checked 2026-10-14), so the importer can map it instead of leaving the
-- source empty. Vocabulary row only — sorted after Contribution email.
INSERT INTO "person_sources" ("key", "label", "sort_order") VALUES
  ('other', 'Other', 40)
ON CONFLICT ("key") DO NOTHING;
