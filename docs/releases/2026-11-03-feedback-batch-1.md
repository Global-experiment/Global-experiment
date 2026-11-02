# Your first feedback batch — 3 November 2026

Everything from your cards OPS-8, 128, 130, 135, 136, 138, 141, 142, 144,
147, 148, 149, 151, 153 and 154, card by card.

## Accounts, profile and permissions

**OPS-141 · Invitation links.** On **Accounts**, "New account" is now
**New invitation link**. The window makes the link at once (nothing to fill
in) and shows it only this once, with a **Copy** button: send it
privately. Whoever opens it creates their own account (email and password)
and lands on their empty profile.
- A link works **once**, for **7 days**.
- **Invitation links** (next to the button) lists the links: waiting,
  used (with the account made), revoked or expired. A waiting one can be
  **revoked**.
- A new account has **no role and no rights** until a Rootadmin gives it
  one: open it from Accounts (view "No role") and pick its role. Until
  then it only sees its own profile.

**OPS-144 · Description on the profile.** Everyone can write a
description in **Profile settings**. A Rootadmin can also edit it on any
account. It shows on the account and in the Accounts list (where Note
was).

**OPS-135 · Expertise on accounts.** Everyone sets their own expertise in
Profile settings (same picker as on People, up to 10). A Rootadmin can set
it on any account. People keep their own expertise as before.

**OPS-136 · No link between People and accounts.** People is the CRM,
accounts are the experiment's participants: the link is gone. No account
was linked.

**OPS-142 · No note on accounts.** Gone. No account had one.

**OPS-148 · Permission page order.** A permission now shows Service,
Account, Permission level, Status, **Scope**, Granted, Revoked,
**Expired**, **People**, then Name. The list uses the same names.

**OPS-138 · Permission names.** A permission is named automatically
"Service / Account / Permission level", for example
"ChatGPT / Candide / Owner". The name follows changes to the service, the
account or the level, and it can't be typed. Existing permissions were
renamed the same way; the one you had named by hand already followed this
pattern.

**OPS-151 · One history event.** Granting a permission is now **one**
event: "Candide granted Stanley Superadmin on GitHub". It shows on the
permission, the account, the service and the person, not as three
separate events. A later change is also a single event.

## Services

**OPS-149 · Several categories.** Category takes several tags. Each
service kept its category as its first tag.

**OPS-130 · No Responsible account.** Who is in charge of a service is its
**Owner** permission. Before removing the field, we made sure nothing was
lost: you were Responsible for Cloudflare, Figma, GitHub, Hetzner and
Stripe, and already had an Owner permission on Cloudflare and GitHub. As
you decided, we added an **Active Owner permission** for you on **Figma,
Hetzner and Stripe**, each with its history event.

## Archive only

**OPS-147 · Nothing is deleted.** "Delete permanently" is gone everywhere
(People, Organizations, Treasury entries, manual ones too, Services,
Permissions, Expertise), for every role, Rootadmin included, and the
server refuses it too. Archive and restore work as before. Past "deleted"
events stay readable in History.

## Imports

**OPS-153 · Your CSV import of 30 October.** It added 24 people and
refused 370 rows, for two reasons only:
- **Expertise (351 rows):** Notion now writes links after each name as
  "Copywriting (https://app.notion.com/p/…)". Our import recognised
  Notion's older link format but not this one, so it didn't find the
  names. All 76 expertise names in your file do exist in the admin.
- **Contact channels (188 rows):** "Other" isn't one of the channels
  (Email, Phone, WhatsApp, Signal, Telegram, LinkedIn, X, Matrix,
  Workana).

None of the 370 rows had a real error (missing name, invalid email).

What changed:
- Notion's new link format is recognised. Names match even when their
  case, accents or spaces differ.
- A value that isn't in the admin no longer refuses its row. On the
  **Columns** step, every such value is listed once, with how many rows
  use it. Choose an existing value for it, or **skip** it (the default).
- A row with a skipped value is still imported, without that value. The
  **Check** step and the **report** list what was left out.
- Rows with real errors (no name, invalid email…) are still refused, with
  the reason.

The 24 people you imported were not touched. You can import the same file
again: those 24 will show as possible duplicates and be skipped.

**OPS-154 · No Notion import.** CSV is the only import: More options →
**Import CSV** on People and on Organizations. The Notion import is gone
(button, page actions, schedule). The **Imports** page lists every import
run, past Notion runs included, and each CSV import opens its report.

## Public website

**OPS-128 · Treasury.** The stats come first. The filters (Expenses /
Donations) now sit below them, just above the history. The sentence under
the stats ("sample figures until the Wise account is connected") is gone.

**OPS-8 · Share.** On the public pages shown in the admin (Home,
Documentation, Treasury), Share copies the link and shows the message, and
its icon turns into a check for a moment, like Contribute's copy button.
The public website's own header already did this.

## Good to know

- The roles and permissions themselves are unchanged. The teams and
  memberships model you are designing can be added later without undoing
  any of this.
- No email is sent yet: you send invitation links yourself.
