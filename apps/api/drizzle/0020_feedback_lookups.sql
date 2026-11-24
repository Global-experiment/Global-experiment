-- Custom SQL migration file, put your code below! --
-- Feedbacks and issues: the lookups of migration 0019. The statuses are the client's (2026-11-23: none = new,
-- Roadmap item, Discarded; archiving is the archive action). The types are the composers' (src/shared/report/
-- reportKinds.ts = Figma p12–p13), each tied to its kind.
INSERT INTO "submission_statuses" ("key", "label", "sort_order") VALUES
  ('roadmap_item', 'Roadmap item', 1),
  ('discarded', 'Discarded', 2)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "submission_types" ("key", "kind", "label", "description", "sort_order") VALUES
  ('feature_request', 'feedback', 'Feature request', 'Asks for new capability', 1),
  ('enhancement', 'feedback', 'Enhancement', 'Improve existing capability', 2),
  ('ux_friction', 'feedback', 'UX friction', 'Usable but confusing/inefficient', 3),
  ('content_suggestion', 'feedback', 'Content suggestion', 'Wording, documentation, copy', 4),
  ('comparison', 'feedback', 'Comparison', 'References a competitor product', 5),
  ('praise', 'feedback', 'Praise', 'Unsolicited compliment', 6),
  ('functional_bug', 'issue', 'Functional bug', 'Feature doesn''t behave as specified', 1),
  ('visual_bug', 'issue', 'Visual bug', 'UI/rendering/layout defect', 2),
  ('crash', 'issue', 'Crash', 'Application termination or freeze', 3),
  ('performance', 'issue', 'Performance', 'Slowness, lag, timeout, resource usage', 4),
  ('data_loss', 'issue', 'Data loss', 'User data corrupted, missing, or deleted', 5),
  ('security_vulnerability', 'issue', 'Security vulnerability', 'Exploitable flaw (routes to security team, not public triage)', 6),
  ('accessibility', 'issue', 'Accessibility', 'WCAG/a11y non-conformance', 7),
  ('broken_link', 'issue', 'Broken link', '404, dead link, misrouted navigation', 8),
  ('compatibility', 'issue', 'Compatibility', 'Browser/OS/device-specific failure', 9)
ON CONFLICT ("key") DO NOTHING;
