# Accounts, Permissions, Services and Profile — 28 October 2026

The modules you prioritised on 23 October, so two real accounts can work
in the admin side by side, each with its own name in the history.

## What changed

**Accounts (Monitoring → Accounts, Figma p15)**

- The list shows Name, Role, Email, Note, Expertise and Permissions, with
  the views **All, Active, Invited and Deactivated**.
- **New account** creates an invitation: enter the email, a name, the
  role, and optionally the person in People and a note. You get a
  **one-time link** to copy and send privately (no email is sent yet). It
  works once, for 72 hours; making a new one cancels the old one. The link
  is shown only at that moment — we keep only a fingerprint of it.
- Clicking an account opens its profile, view-only. A Rootadmin can also
  change its role, note and linked person, make a new invitation or
  **password reset link**, and deactivate or reactivate it.
- There can be **several Rootadmins**, but never none: the last active
  Rootadmin can't be deactivated or demoted. Accounts are deactivated,
  never deleted, so the history keeps their names.

**Roles**

- Rootadmin, Admin, Treasury admin, Communication admin, Moderator,
  Operation admin, Tech admin and Compliance, each with its own rights
  (the table is in the architecture overview, §3.1).
- Every action is checked by the server. The admin only shows what the
  role can do: the menu, the New / Import / Archive / Delete / Publish /
  Review buttons, and records open view-only when the role can't edit.
- A refused attempt is recorded in that account's history.

**Services (Figma p16) and Permissions (Figma p17)**

- Both start empty and are fully editable: Services with status,
  category, hosting model, URL, description and responsible account;
  Permissions with the person (and their admin account), the service,
  the level, the status, the resource scope and the granted, expires and
  revoked dates.
- Views as in Figma: **All services, Active services, Access review** and
  **All permissions, Active permissions, Review queue**, plus Archived.
  The review lists show what needs confirmation, is planned or invited,
  or (for permissions) expires within 30 days.
- Each has the usual detail page with the right panel and its history.
- **Granted, changed and revoked access** also shows in the history of
  the person, the account and the service.
- **People:** the Permissions field is now on the record, with chips
  "Service · level" and an "Add a permission" button.

**Profile settings (Figma p18, from the user card)**

- Display name, profile picture (PNG, JPEG or WebP, up to 2 MB), time
  zone, appearance **System / Light / Dark** (this replaces the temporary
  light-preview button), email change and password change (both ask for
  your current password), the read-only Account ID, and your service
  access.
- Save changes, Discard changes, Sign out and Deactivate account.
- Appearance "System" follows your device: if your computer is set to
  light, the admin now shows in light. Choose "Dark" to keep it dark.

**Sign-in**

- Invitation and reset links open a page where you choose your own
  password; a checklist shows the rules as you type (12 characters or
  more; under 20, a mix of letters, digits or symbols; not your email or
  name; not a common password). Then you sign in as usual.
- "Forgot password?" now says to ask a Rootadmin for a reset link.

## Your two accounts

Invitation links for Candide and Stanley Qiang (Rootadmin) were made
during the release and sent to you privately. The existing owner account
and its email are unchanged.

## Known limits

- No email is sent yet: links are copied and passed on by hand.
- Services and Permissions have no Notion import yet (decision 6): they
  are entered in the admin.
- On Profile settings the right panel starts under the page title rather
  than at the very top as in Figma.
