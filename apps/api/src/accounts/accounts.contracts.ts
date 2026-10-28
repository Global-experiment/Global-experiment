import { z } from "zod";
import { ROLE_KEYS } from "../access-control/permissions.js";
import { listQuerySchema } from "../common/listing/list-query.js";

/** Request contracts and response shapes for accounts, the profile and the one-time links. */

const email = z.string().trim().max(320).pipe(z.email("Invalid email address."));
const displayName = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(80, "Use at most 80 characters."))
  .transform((value) => value || null)
  .nullable();
const role = z.enum(ROLE_KEYS as [string, ...string[]], "Unknown role.");
const note = z
  .string()
  .max(2000)
  .transform((value) => value.trim() || null)
  .nullable();

/** "New account" (admin-desktop.pdf p15): an invitation the owner copies (decision 13, no email sent). */
export const InviteRequest = z.strictObject({
  email,
  displayName: displayName.optional(),
  role,
  personId: z.uuid().nullable().optional(),
  note: note.optional(),
});
export type InviteRequest = z.output<typeof InviteRequest>;

/** What a Rootadmin changes on an account (accounts.manage). */
export const UpdateAccountRequest = z
  .strictObject({ role: role.optional(), note: note.optional(), personId: z.uuid().nullable().optional(), displayName: displayName.optional() })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");
export type UpdateAccountRequest = z.output<typeof UpdateAccountRequest>;

export const ACCOUNT_SORT_FIELDS = ["name", "number", "role", "email", "status", "lastLogin", "created"] as const;
export type AccountSortField = (typeof ACCOUNT_SORT_FIELDS)[number];
export const AccountsListQuery = listQuerySchema({
  sortFields: ACCOUNT_SORT_FIELDS,
  defaultSort: [{ field: "name", direction: "asc" }],
  filters: {
    status: { operators: ["is", "is_not"], value: z.enum(["active", "invited", "deactivated"]) },
    role: { operators: ["is", "is_not"], value: z.string().regex(/^[a-z]{1,40}$/) },
  },
});
export type AccountsListQuery = z.output<typeof AccountsListQuery>;

/** Profile settings (admin-desktop.pdf p18): the signed-in admin's own fields. */
export const ProfileRequest = z
  .strictObject({
    displayName: displayName.optional(),
    timeZone: z
      .string()
      .max(64)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, "Unknown time zone.")
      .nullable()
      .optional(),
    appearance: z.enum(["system", "light", "dark"]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");
export type ProfileRequest = z.output<typeof ProfileRequest>;

export const ChangeEmailRequest = z.strictObject({ currentPassword: z.string().min(1, "Enter your current password.").max(200), email });
export type ChangeEmailRequest = z.output<typeof ChangeEmailRequest>;

export const ChangePasswordRequest = z.strictObject({ currentPassword: z.string().min(1, "Enter your current password.").max(200), newPassword: z.string().max(200) });
export type ChangePasswordRequest = z.output<typeof ChangePasswordRequest>;

export const DeactivateSelfRequest = z.strictObject({ currentPassword: z.string().min(1, "Enter your current password.").max(200) });
export type DeactivateSelfRequest = z.output<typeof DeactivateSelfRequest>;

/** The one-time token from the link's fragment (43 base64url characters). */
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This link isn't valid.");
export const InspectTokenRequest = z.strictObject({ token });
export type InspectTokenRequest = z.output<typeof InspectTokenRequest>;
export const AcceptTokenRequest = z.strictObject({ token, password: z.string().max(200) });
export type AcceptTokenRequest = z.output<typeof AcceptTokenRequest>;

export interface VocabularyEntry {
  key: string;
  label: string;
}

export interface AccountDto {
  id: string;
  /** "GE-000001" (Figma p18). */
  accountId: string;
  name: string;
  displayName: string | null;
  email: string;
  role: VocabularyEntry;
  status: "active" | "invited" | "deactivated";
  note: string | null;
  person: { id: string; name: string } | null;
  /** The linked person's expertise (the Accounts list's Expertise column). */
  expertise: { id: string; name: string }[];
  /** The linked person's or the account's access grants ("GitHub / admin"). */
  permissions: { id: string; service: string; level: string | null; status: VocabularyEntry | null }[];
  hasPicture: boolean;
  lastLoginAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** An invitation or reset link waiting to be used (never the link itself). */
  pendingLink: { purpose: "invite" | "reset"; expiresAt: string } | null;
}

export interface ProfileDto extends AccountDto {
  timeZone: string | null;
  appearance: "system" | "light" | "dark";
  permissionKeys: string[];
}

export interface OneTimeLinkDto {
  /** The full link, returned once to the Rootadmin who made it; only its hash is stored. */
  link: string;
  purpose: "invite" | "reset";
  expiresAt: string;
}
