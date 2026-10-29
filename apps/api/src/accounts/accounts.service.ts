import { Inject, Injectable } from "@nestjs/common";
import { actorFor, AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor } from "../audit/audit.types.js";
import { diffRecord, type FieldSpec } from "../audit/record-fields.js";
import { AuthRepository } from "../auth/auth.repository.js";
import type { AdminPrincipal } from "../auth/auth.service.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { passwordProblems } from "../auth/password-strength.js";
import { generateSessionToken, hashSessionToken } from "../auth/session-token.js";
import { CLOCK, type Clock } from "../common/clock/clock.js";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import type { Page } from "../common/listing/list-query.js";
import { FILE_STORAGE, sniffContentType, type FileStorage } from "../files/file-storage.js";
import type {
  AccountDto,
  AccountsListQuery,
  InviteRequest,
  OneTimeLinkDto,
  ProfileDto,
  ProfileRequest,
  UpdateAccountRequest,
} from "./accounts.contracts.js";
import { AccountsRepository } from "./accounts.repository.js";

/** One-time links last 72 hours (decision 13). */
export const LINK_HOURS = 72;
/** Profile pictures: PNG, JPEG or WebP, at most 2 MB (never SVG: it can carry script). */
export const PICTURE_MAX_BYTES = 2 * 1024 * 1024;
const LINK_GONE = "This link has expired or was already used.";

/** The account fields the history records. */
export const ACCOUNT_FIELDS: readonly FieldSpec<AccountDto & { timeZone?: string | null; appearance?: string }>[] = [
  { field: "displayName", label: "Display name", kind: "text", get: (a) => a.displayName },
  { field: "role", label: "Role", kind: "select", get: (a) => a.role },
  { field: "person", label: "Person", kind: "relation", get: (a) => (a.person ? [{ id: a.person.id, label: a.person.name }] : []) },
  { field: "note", label: "Note", kind: "text", get: (a) => a.note },
  { field: "timeZone", label: "Time zone", kind: "text", get: (a) => a.timeZone ?? null },
  { field: "appearance", label: "Appearance", kind: "text", get: (a) => a.appearance ?? null },
];

/** A WebP file starts "RIFF....WEBP"; PNG and JPEG come from the shared sniffer. */
function sniffPicture(bytes: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  const type = sniffContentType(bytes);
  return type === "image/png" || type === "image/jpeg" ? type : null;
}

/**
 * Admin accounts (admin-desktop.pdf p15, p18): invitations and reset links
 * the Rootadmin copies (decision 13), roles, deactivation instead of
 * deletion (decision 14), the last active Rootadmin always kept, and each
 * admin's own profile. Every change is in the account's history.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly repository: AccountsRepository,
    private readonly auth: AuthRepository,
    private readonly audit: AuditService,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  list(query: AccountsListQuery): Promise<Page<AccountDto>> {
    return this.repository.list(query);
  }

  async get(id: string): Promise<AccountDto> {
    const account = await this.repository.find(id);
    if (!account) throw new NotFoundError("Account not found.");
    return account;
  }

  // ---- Managing accounts (accounts.manage) ----

  /** "New account": an invited account and its one-time link, returned once. */
  async invite(input: InviteRequest, principal: AdminPrincipal): Promise<{ account: AccountDto } & OneTimeLinkDto> {
    if (await this.repository.emailTaken(input.email)) throw new ConflictError("An account with this email already exists.");
    await this.checkPerson(input.personId);
    return this.db.transaction(async (tx) => {
      const id = await this.repository.createInvited(tx, {
        email: input.email,
        displayName: input.displayName ?? null,
        role: input.role,
        personId: input.personId ?? null,
        note: input.note ?? null,
        invitedById: principal.id,
      });
      const link = await this.issueLink(tx, id, "invite", principal.id);
      const account = (await this.repository.find(id, tx))!;
      await this.audit.record(tx, { entityType: "admin_user", entityId: id, action: "invited", actor: actorFor(principal), source: "admin", meta: { label: account.name, role: account.role.label, collection: "Accounts" } });
      return { account, ...link };
    });
  }

  /** A fresh link for an account: an invitation while invited, a password reset when active. */
  async createLink(id: string, principal: AdminPrincipal): Promise<OneTimeLinkDto> {
    const account = await this.get(id);
    if (account.status === "deactivated") throw new ConflictError("Reactivate the account first.");
    const purpose = account.status === "invited" ? "invite" : "reset";
    return this.db.transaction(async (tx) => {
      const link = await this.issueLink(tx, id, purpose, principal.id);
      await this.audit.record(tx, { entityType: "admin_user", entityId: id, action: "link_created", actor: actorFor(principal), source: "admin", meta: { label: account.name, purpose: purpose === "invite" ? "Invitation link" : "Password reset link", expiresAt: link.expiresAt } });
      return link;
    });
  }

  async update(id: string, input: UpdateAccountRequest, principal: AdminPrincipal): Promise<AccountDto> {
    const before = await this.get(id);
    if (input.role !== undefined && input.role !== "owner" && before.role.key === "owner" && before.status === "active" && (await this.repository.otherActiveOwners(id)) === 0) {
      throw new ConflictError("This is the last active Rootadmin: make another account Rootadmin first.");
    }
    if (input.personId) await this.checkPerson(input.personId, id);
    return this.db.transaction(async (tx) => {
      const values: Record<string, unknown> = {};
      if (input.role !== undefined) values.role = input.role;
      if (input.note !== undefined) values.note = input.note;
      if (input.personId !== undefined) values.personId = input.personId;
      if (input.displayName !== undefined) values.displayName = input.displayName;
      await this.repository.update(tx, id, values);
      const after = (await this.repository.find(id, tx))!;
      await this.recordChanges(tx, before, after, actorFor(principal));
      // A new role applies at once: the account signs in again with its new rights.
      if (input.role !== undefined && input.role !== before.role.key) await this.auth.revokeSessionsOf(tx, id);
      return after;
    });
  }

  async deactivate(id: string, principal: AdminPrincipal): Promise<AccountDto> {
    const account = await this.get(id);
    if (account.status === "deactivated") return account;
    await this.keepARootadmin(account);
    return this.db.transaction(async (tx) => {
      await this.repository.update(tx, id, { status: "deactivated", deactivatedAt: this.clock() });
      await this.auth.revokeSessionsOf(tx, id);
      await this.expireLinks(tx, id);
      await this.audit.record(tx, { entityType: "admin_user", entityId: id, action: "deactivated", actor: actorFor(principal), source: "admin", meta: { label: account.name } });
      return (await this.repository.find(id, tx))!;
    });
  }

  /** Back to active — or to invited when it never set a password (it then needs a new link). */
  async reactivate(id: string, principal: AdminPrincipal): Promise<AccountDto> {
    const account = await this.get(id);
    if (account.status !== "deactivated") return account;
    const hasPassword = (await this.repository.passwordHashOf(id)) !== null;
    return this.db.transaction(async (tx) => {
      await this.repository.update(tx, id, { status: hasPassword ? "active" : "invited", deactivatedAt: null });
      await this.audit.record(tx, { entityType: "admin_user", entityId: id, action: "reactivated", actor: actorFor(principal), source: "admin", meta: { label: account.name } });
      return (await this.repository.find(id, tx))!;
    });
  }

  // ---- The signed-in admin's own profile (any role) ----

  async profile(principal: AdminPrincipal): Promise<ProfileDto> {
    const profile = await this.repository.findProfile(principal.id);
    if (!profile) throw new NotFoundError("Account not found.");
    const rest: Omit<typeof profile, "pictureKey"> & { pictureKey?: string | null } = { ...profile };
    delete rest.pictureKey;
    return { ...rest, permissionKeys: [...principal.permissions].sort() };
  }

  async updateProfile(principal: AdminPrincipal, input: ProfileRequest): Promise<ProfileDto> {
    const before = await this.profile(principal);
    await this.db.transaction(async (tx) => {
      const values: Record<string, unknown> = {};
      if (input.displayName !== undefined) values.displayName = input.displayName;
      if (input.timeZone !== undefined) values.timeZone = input.timeZone;
      if (input.appearance !== undefined) values.appearance = input.appearance;
      await this.repository.update(tx, principal.id, values);
      // Compare with the values written (no read outside this transaction while it's open).
      await this.recordChanges(tx, before, { ...before, ...values } as ProfileDto, actorFor(principal));
    });
    return this.profile(principal);
  }

  async setPicture(principal: AdminPrincipal, file: { buffer: Buffer; size: number } | undefined): Promise<ProfileDto> {
    if (!file) throw new ValidationFailedError([{ path: "file", message: "Choose a picture." }]);
    if (file.size > PICTURE_MAX_BYTES) throw new ValidationFailedError([{ path: "file", message: "Pictures can be at most 2 MB." }]);
    const type = sniffPicture(file.buffer);
    if (!type) throw new ValidationFailedError([{ path: "file", message: "Use a PNG, JPEG or WebP image." }]);
    const previous = await this.repository.findProfile(principal.id);
    const { key } = await this.storage.put(file.buffer);
    await this.db.transaction(async (tx) => {
      await this.repository.update(tx, principal.id, { pictureKey: key, pictureType: type });
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: principal.id,
        action: "updated",
        actor: actorFor(principal),
        source: "admin",
        changes: [{ field: "picture", label: "Profile picture", kind: "text", before: previous?.pictureKey ? "Set" : null, after: "Set" }],
        meta: { label: previous?.name ?? principal.email },
      });
    });
    if (previous?.pictureKey && previous.pictureKey !== key) await this.removeStoredFile(previous.pictureKey);
    return this.profile(principal);
  }

  async removePicture(principal: AdminPrincipal): Promise<ProfileDto> {
    const previous = await this.repository.findProfile(principal.id);
    if (!previous?.pictureKey) return this.profile(principal);
    await this.db.transaction(async (tx) => {
      await this.repository.update(tx, principal.id, { pictureKey: null, pictureType: null });
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: principal.id,
        action: "updated",
        actor: actorFor(principal),
        source: "admin",
        changes: [{ field: "picture", label: "Profile picture", kind: "text", before: "Set", after: null }],
        meta: { label: previous.name },
      });
    });
    await this.removeStoredFile(previous.pictureKey);
    return this.profile(principal);
  }

  /** Any signed-in admin sees other admins' pictures (user cards, history). */
  async picture(id: string): Promise<{ bytes: Buffer; type: string }> {
    const profile = await this.repository.findProfile(id);
    if (!profile?.pictureKey) throw new NotFoundError("No picture.");
    const bytes = await this.storage.get(profile.pictureKey);
    return { bytes, type: sniffPicture(bytes) ?? "application/octet-stream" };
  }

  async changeEmail(principal: AdminPrincipal, currentPassword: string, email: string): Promise<ProfileDto> {
    await this.checkCurrentPassword(principal.id, currentPassword);
    if (await this.repository.emailTaken(email, principal.id)) throw new ConflictError("An account with this email already exists.");
    const before = await this.profile(principal);
    await this.db.transaction(async (tx) => {
      await this.repository.update(tx, principal.id, { email });
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: principal.id,
        action: "email_changed",
        actor: actorFor(principal),
        source: "admin",
        changes: [{ field: "email", label: "Email", kind: "email", privacy: "contact", before: before.email, after: email }],
        meta: { label: before.name },
      });
    });
    return this.profile({ ...principal, email });
  }

  /** A new password signs the account out everywhere else. */
  async changePassword(principal: AdminPrincipal, currentPassword: string, newPassword: string): Promise<void> {
    await this.checkCurrentPassword(principal.id, currentPassword);
    const problems = passwordProblems(newPassword, { email: principal.email, name: principal.displayName });
    if (problems.length > 0) throw new ValidationFailedError(problems.map((message) => ({ path: "newPassword", message })));
    const passwordHash = await hashPassword(newPassword);
    await this.db.transaction(async (tx) => {
      await this.repository.update(tx, principal.id, { passwordHash });
      await this.auth.revokeSessionsOf(tx, principal.id, principal.sessionId);
      await this.expireLinks(tx, principal.id);
      await this.audit.record(tx, { entityType: "admin_user", entityId: principal.id, action: "password_changed", actor: actorFor(principal), source: "admin", meta: { label: principal.displayName ?? principal.email.split("@")[0]! } });
    });
  }

  /** "Delete account" (Figma p18) = deactivate (decision 14); the current session ends too. */
  async deactivateSelf(principal: AdminPrincipal, currentPassword: string): Promise<void> {
    await this.checkCurrentPassword(principal.id, currentPassword);
    const account = await this.get(principal.id);
    await this.keepARootadmin(account);
    await this.db.transaction(async (tx) => {
      await this.repository.update(tx, principal.id, { status: "deactivated", deactivatedAt: this.clock() });
      await this.auth.revokeSessionsOf(tx, principal.id);
      await this.expireLinks(tx, principal.id);
      await this.audit.record(tx, { entityType: "admin_user", entityId: principal.id, action: "deactivated", actor: actorFor(principal), source: "admin", meta: { label: account.name, self: true } });
    });
  }

  // ---- One-time links, used without a session ----

  async inspectToken(token: string): Promise<{ purpose: "invite" | "reset"; email: string; name: string; expiresAt: string }> {
    const found = await this.liveToken(token);
    return { purpose: found.purpose as "invite" | "reset", email: found.email, name: found.displayName ?? found.email.split("@")[0]!, expiresAt: found.expiresAt.toISOString() };
  }

  /** Sets the account's password from its link (used once): an invitation activates the account. */
  async acceptToken(token: string, password: string): Promise<{ email: string }> {
    const found = await this.liveToken(token);
    const problems = passwordProblems(password, { email: found.email, name: found.displayName });
    if (problems.length > 0) throw new ValidationFailedError(problems.map((message) => ({ path: "password", message })));
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      if (!(await this.repository.useToken(tx, found.id))) throw new NotFoundError(LINK_GONE);
      await this.repository.update(tx, found.adminUserId, { passwordHash, ...(found.purpose === "invite" ? { status: "active" } : {}) });
      await this.auth.revokeSessionsOf(tx, found.adminUserId);
      const label = found.displayName ?? found.email.split("@")[0]!;
      const self: AuditActor = { type: "admin", id: found.adminUserId, label, role: found.role };
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: found.adminUserId,
        action: found.purpose === "invite" ? "activated" : "password_changed",
        actor: self,
        source: "admin",
        meta: { label, via: found.purpose === "invite" ? "Invitation link" : "Password reset link" },
      });
    });
    return { email: found.email };
  }

  // ---- Helpers ----

  private async liveToken(token: string) {
    const found = await this.repository.findToken(hashSessionToken(token));
    if (!found || found.usedAt || found.expiresAt.getTime() <= this.clock().getTime() || found.status === "deactivated") throw new NotFoundError(LINK_GONE);
    if (found.purpose === "invite" && found.status !== "invited") throw new NotFoundError(LINK_GONE);
    return found;
  }

  private async issueLink(tx: Executor, adminUserId: string, purpose: "invite" | "reset", createdById: string): Promise<OneTimeLinkDto> {
    const token = generateSessionToken();
    const expiresAt = new Date(this.clock().getTime() + LINK_HOURS * 3_600_000);
    await this.repository.createToken(tx, { adminUserId, purpose, tokenHash: hashSessionToken(token), expiresAt, createdById });
    // The token rides in the fragment: browsers never send it, so no server or proxy log records it.
    const path = purpose === "invite" ? "/admin/welcome" : "/admin/reset-password";
    return { link: `${this.config.publicSiteUrl}${path}#${token}`, purpose, expiresAt: expiresAt.toISOString() };
  }

  /** Unused links stop working (deactivation, a new password). */
  private async expireLinks(tx: Executor, adminUserId: string) {
    await this.repository.expireTokens(tx, adminUserId);
  }

  private async keepARootadmin(account: AccountDto) {
    if (account.role.key === "owner" && account.status === "active" && (await this.repository.otherActiveOwners(account.id)) === 0) {
      throw new ConflictError("This is the last active Rootadmin: it can't be deactivated.");
    }
  }

  private async checkPerson(personId: string | null | undefined, exceptAccountId?: string) {
    if (!personId) return;
    if (!(await this.repository.personExists(personId))) throw new ValidationFailedError([{ path: "personId", message: "Unknown person." }]);
    if (await this.repository.personTaken(personId, exceptAccountId)) throw new ValidationFailedError([{ path: "personId", message: "Another account is linked to this person." }]);
  }

  private async checkCurrentPassword(id: string, password: string) {
    const hash = await this.repository.passwordHashOf(id);
    if (!hash || !(await verifyPassword(password, hash))) throw new ForbiddenError("Your current password isn't right.");
  }

  private async recordChanges(tx: Executor, before: Parameters<typeof diffRecord>[1], after: Parameters<typeof diffRecord>[2], actor: AuditActor) {
    const changes = diffRecord(ACCOUNT_FIELDS, before as never, after as never);
    if (changes.length === 0) return;
    await this.audit.record(tx, { entityType: "admin_user", entityId: (after as AccountDto).id, action: "updated", actor, source: "admin", changes, meta: { label: (after as AccountDto).name } });
  }

  private async removeStoredFile(key: string) {
    if (!(await this.repository.storageKeyInUse(key))) await this.storage.delete(key);
  }
}
