import { z } from "zod";
import { FIELD_MESSAGES, isSignificanceScore } from "../common/field-rules.js";
import { listQuerySchema } from "../common/listing/list-query.js";
import { RELATION_LIMITS } from "../common/relation-limits.js";
import { sanitizeSourcePage } from "../common/source-page-rule.js";
import { SUBMISSION_KINDS } from "./feedback.schema.js";

/** Request contracts (validated) and response shapes (stable JSON) for /api/feedback and /api/admin/feedback. */

export const MESSAGE_LIMIT = 5000;
const vocabularyKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Unknown value.");
const kind = z.enum(SUBMISSION_KINDS, "Choose feedback or issue.");

/**
 * What the public composer sends. The types are checked against the kind's list by the service (and by the
 * database); an unusable source page is dropped, as on the site, rather than refusing the visitor's text.
 */
export const SubmitRequest = z.strictObject({
  kind,
  message: z
    .string()
    .trim()
    .min(1, "Write your message first.")
    .max(MESSAGE_LIMIT, `Use at most ${MESSAGE_LIMIT.toLocaleString("en-US")} characters.`),
  types: z
    .array(vocabularyKey)
    .max(9)
    .refine((keys) => new Set(keys).size === keys.length, "Each type once.")
    .default([]),
  sourcePage: z
    .string()
    .max(2048)
    .nullable()
    .optional()
    .transform((value) => sanitizeSourcePage(value)),
  locale: z
    .string()
    .trim()
    .max(35)
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/, "Unknown language.")
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  token: z.string().min(1, "The check didn't finish. Please try again.").max(2048),
});
export type SubmitRequest = z.output<typeof SubmitRequest>;

export const FEEDBACK_SORT_FIELDS = ["submitted", "significance"] as const;
export type FeedbackSortField = (typeof FEEDBACK_SORT_FIELDS)[number];

export const FeedbackListQuery = listQuerySchema({
  sortFields: FEEDBACK_SORT_FIELDS,
  defaultSort: [{ field: "submitted", direction: "desc" }],
  filters: {
    /** The tabs: All submissions (no filter), Feedback, Issues. */
    kind: { operators: ["is"], value: kind },
    /** "is empty" = new. */
    status: { operators: ["is", "is_not", "is_empty"], value: vocabularyKey },
    /** The admins' feedback or issue type. */
    type: { operators: ["is", "is_not", "is_empty"], value: vocabularyKey },
    expertise: { operators: ["is"], value: z.uuid() },
    /** The archived view: without it, archived submissions are left out. */
    archived: { operators: ["is"], value: z.enum(["true", "false"]).transform((value) => value === "true") },
  },
});
export type FeedbackListQuery = z.output<typeof FeedbackListQuery>;

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Use at most ${max.toLocaleString("en-US")} characters.`)
    .transform((value) => value.trim() || null)
    .nullable()
    .optional();

/** 0 to 10 with one decimal (Figma shows 8.2): a number, or the text an admin typed. */
const significanceScore = z
  .union([z.number(), z.string()])
  .refine((value) => isSignificanceScore(String(value)), FIELD_MESSAGES.significance)
  .transform((value) => Number(String(value).trim()));

/** What "Submit changes" sends, applied together (one History event). */
export const UpdateSubmissionRequest = z
  .strictObject({
    kind: kind.optional(),
    typeKey: vocabularyKey.nullable().optional(),
    statusKey: vocabularyKey.nullable().optional(),
    expertiseIds: z
      .array(z.uuid())
      .max(RELATION_LIMITS.expertise, `A submission can have up to ${RELATION_LIMITS.expertise} expertise.`)
      .refine((ids) => new Set(ids).size === ids.length, "Each expertise once.")
      .optional(),
    significanceScore: significanceScore.nullable().optional(),
    decisionComment: optionalText(5000),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), "Nothing to update.");
export type UpdateSubmissionRequest = z.output<typeof UpdateSubmissionRequest>;

export interface VocabularyEntry {
  key: string;
  label: string;
}

export interface SubmissionTypeEntry extends VocabularyEntry {
  kind: (typeof SUBMISSION_KINDS)[number];
  description: string;
}

export interface FeedbackOptionsDto {
  kinds: VocabularyEntry[];
  types: SubmissionTypeEntry[];
  statuses: VocabularyEntry[];
}

export interface SubmissionExpertiseDto {
  id: string;
  name: string;
}

/** One row of the list, and the record (the record adds nothing hidden: every field is the admins'). */
export interface SubmissionDto {
  id: string;
  /** "Feedback issue ID". */
  number: number;
  kind: (typeof SUBMISSION_KINDS)[number];
  submittedKind: (typeof SUBMISSION_KINDS)[number];
  body: string;
  /** The types the visitor picked, as sent. */
  pickedTypes: VocabularyEntry[];
  sourcePage: string | null;
  locale: string | null;
  submittedAt: string;
  externalSubmissionId: string | null;
  translation: string | null;
  botScore: number | null;
  aiSignificanceScore: number | null;
  aiComment: string | null;
  aiNote: string | null;
  type: VocabularyEntry | null;
  /** null = new. */
  status: VocabularyEntry | null;
  expertise: SubmissionExpertiseDto[];
  significanceScore: number | null;
  decisionComment: string | null;
  /** "Last edited at": the last admin edit (the submission time until then). */
  updatedAt: string;
  archivedAt: string | null;
}
