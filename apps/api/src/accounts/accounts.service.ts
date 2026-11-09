import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { actorFor, AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor } from "../audit/audit.types.js";
import { diffRecord, type FieldSpec } from "../audit/record-fields.js";
import { AuthRepository } from "../auth/auth.repository.js";
import { adminUserPictures } from "../auth/auth.schema.js";
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
import { countExistingExpertise } from "../expertise/expertise-refs.js";
import { FILE_STORAGE, sniffContentType, type FileStorage } from "../files/file-storage.js";
import { refreshGrantNames } from "../services/grant-name.js";
import type {
  AccountDto,
  AccountsListQuery,
  InvitationDto,
  NewInvitationDto,
  OneTimeLinkDto,
  ProfileDto,
  ProfileRequest,
  UpdateAccountRequest,
} from "./accounts.contracts.js";
import { AccountsRepository } from "./accounts.repository.js";

/** One-time links of an account (password reset) last 72 hours (decision 13). */
export const LINK_HOURS = 72;
/** Invitation links last 7 days (OPS-141, client 2026-11-03). */
export const INVITATION_DAYS = 7;
/** Profile pictures: PNG, JPEG or WebP, at most 2 MB (never SVG: it can carry script). */
export const PICTURE_MAX_BYTES = 2 * 1024 * 1024;
const LINK_GONE = "This link has expired or was already used.";

/** The account fields the history records. */
export const ACCOUNT_FIELDS: readonly FieldSpec<AccountDto & { timeZone?: string | null; appearance?: string }>[] = [
  { field: "displayName", label: "Display name", kind: "text", get: (a) => a.displayName },
  { field: "role", label: "Role", kind: "select", get: (a) => a.role },
  { field: "description", label: "Description", kind: "text", get: (a) => a.description },
  { field: "expertise", label: "Expertise", kind: "relation", get: (a) => a.expertise.map((item) => ({ id: item.id, label: item.name })) },
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
 * Admin accounts (admin-desktop.pdf p15, p18): invitation links anyone
 * can sign up with (OPS-141) and reset links the Rootadmin copies (decision
 * 13), roles, deactivation instead of deletion (decision 14), the last
 * active Rootadmin always kept, and each admin's own profile — description
 * and expertise included (OPS-144, OPS-135), which a Rootadmin can also set
 * for other accounts. Every change is in the account's history.
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

  // ---- Invitation links (OPS-141, accounts.manage) ----

  /**
   * "New invitation link": no email, no role asked. The link is returned
   * once (only its hash is stored), works once, for 7 days, until revoked.
   */
  async createInvitation(principal: AdminPrincipal): Promise<NewInvitationDto> {
    const token = generateSessionToken();
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 86_400_000);
    return this.db.transaction(async (tx) => {
      const id = await this.repository.createInvitation(tx, { tokenHash: hashSessionToken(token), expiresAt, createdById: principal.id, createdAt: now });
      await this.audit.record(tx, {
        entityType: "admin_invitation",
        entityId: id,
        action: "link_created",
        actor: actorFor(principal),
        source: "admin",
        meta: { label: "Invitation link", purpose: "Invitation link", expiresAt: expiresAt.toISOString() },
      });
      // The token rides in the fragment: browsers never send it, so no server or proxy log records it.
      return { invitation: (await this.repository.findInvitation(id, now, tx))!, link: `${this.config.publicSiteUrl}/admin/join#${token}` };
    });
  }

  listInvitations(): Promise<InvitationDto[]> {
    return this.repository.listInvitations(this.clock());
  }

  async revokeInvitation(id: string, principal: AdminPrincipal): Promise<InvitationDto> {
    const now = this.clock();
    const invitation = await this.repository.findInvitation(id, now);
    if (!invitation) throw new NotFoundError("Invitation link not found.");
    if (invitation.status === "used") throw new ConflictError("This invitation link was already used.");
    if (invitation.status === "revoked") return invitation;
    return this.db.transaction(async (tx) => {
      if (!(await this.repository.revokeInvitation(tx, id, principal.id, now))) throw new ConflictError("This invitation link was already used.");
      await this.audit.record(tx, {
        entityType: "admin_invitation",
        entityId: id,
        action: "link_revoked",
        actor: actorFor(principal),
        source: "admin",
        meta: { label: "Invitation link" },
      });
      return (await this.repository.findInvitation(id, now, tx))!;
    });
  }

  // ---- Managing accounts (accounts.manage) ----

  /** A fresh link for an account: an invitation while invited, a password reset when active. */
  async createLink(id: string, principal: AdminPrincipal): Promise<OneTimeLinkDto> {
    const account = await this.get(id);
    if (account.status === "deactivated") throw new ConflictError("Reactivate the account first.");
    const purpose = account.status === "invited" ? "invite" : "reset";
    return this.db.transaction(async (tx) => {
      const link = await this.issueLink(tx, id, purpose, principal.id);
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: id,
        action: "link_created",
        actor: actorFor(principal),
        source: "admin",
        meta: { label: account.name, purpose: purpose === "invite" ? "Invitation link" : "Password reset link", expiresAt: link.expiresAt },
      });
      return link;
    });
  }

  /** A Rootadmin on any account: its role (a new account has none, OPS-141), and its profile's name, description and expertise. */
  async update(id: string, input: UpdateAccountRequest, principal: AdminPrincipal): Promise<AccountDto> {
    const before = await this.get(id);
    if (
      input.role !== undefined &&
      input.role !== "owner" &&
      before.role?.key === "owner" &&
      before.status === "active" &&
      (await this.repository.otherActiveOwners(id)) === 0
    ) {
      throw new ConflictError("This is the last active Rootadmin: make another account Rootadmin first.");
    }
    await this.checkExpertise(input.expertiseIds);
    return this.db.transaction(async (tx) => {
      const values: Record<string, unknown> = {};
      if (input.role !== undefined) values.role = input.role;
      await this.writeProfile(tx, id, input, values);
      const after = (await this.repository.find(id, tx))!;
      await this.recordChanges(tx, before, after, actorFor(principal));
      // A new role applies at once: the account signs in again with its new rights.
      if (input.role !== undefined && input.role !== before.role?.key) await this.auth.revokeSessionsOf(tx, id);
      return after;
    });
  }

  /** The profile fields an account holder and a Rootadmin both change; a new name renames the account's permissions (OPS-138). */
  private async writeProfile(
    tx: Executor,
    id: string,
    input: Pick<ProfileRequest, "displayName" | "description" | "expertiseIds">,
    values: Record<string, unknown>,
  ) {
    if (input.displayName !== undefined) values.displayName = input.displayName;
    if (input.description !== undefined) values.description = input.description;
    await this.repository.update(tx, id, values);
    if (input.expertiseIds !== undefined) await this.repository.setExpertise(tx, id, input.expertiseIds);
    if (input.displayName !== undefined) await refreshGrantNames(tx, { adminUserId: id });
  }

  private async checkExpertise(ids: readonly string[] | undefined) {
    if (ids?.length && (await countExistingExpertise(this.db, ids)) !== ids.length)
      throw new ValidationFailedError([{ path: "expertiseIds", message: "Unknown expertise." }]);
  }

  async deactivate(id: string, principal: AdminPrincipal): Promise<AccountDto> {
    const account = await this.get(id);
    if (account.status === "deactivated") return account;
    await this.keepARootadmin(account);
    return this.db.transaction(async (tx) => {
      await this.repository.update(tx, id, { status: "deactivated", deactivatedAt: this.clock() });
      await this.auth.revokeSessionsOf(tx, id);
      await this.expireLinks(tx, id);
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: id,
        action: "deactivated",
        actor: actorFor(principal),
        source: "admin",
        meta: { label: account.name },
      });
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
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: id,
        action: "reactivated",
        actor: actorFor(principal),
        source: "admin",
        meta: { label: account.name },
      });
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
    await this.checkExpertise(input.expertiseIds);
    await this.db.transaction(async (tx) => {
      const values: Record<string, unknown> = {};
      if (input.timeZone !== undefined) values.timeZone = input.timeZone;
      if (input.appearance !== undefined) values.appearance = input.appearance;
      await this.writeProfile(tx, principal.id, input, values);
      const after = (await this.repository.findProfile(principal.id, tx))!;
      await this.recordChanges(tx, before, after, actorFor(principal));
    });
    return this.profile(principal);
  }

  /**
   * A new picture. The previous one is archived, not removed (ADR 017): it
   * stays in the account's previous pictures and can be used again.
   */
  async setPicture(principal: AdminPrincipal, file: { buffer: Buffer; size: number } | undefined): Promise<ProfileDto> {
    if (!file) throw new ValidationFailedError([{ path: "file", message: "Choose a picture." }]);
    if (file.size > PICTURE_MAX_BYTES) throw new ValidationFailedError([{ path: "file", message: "Pictures can be at most 2 MB." }]);
    const type = sniffPicture(file.buffer);
    if (!type) throw new ValidationFailedError([{ path: "file", message: "Use a PNG, JPEG or WebP image." }]);
    const previous = await this.repository.findProfile(principal.id);
    const { key } = await this.storage.put(file.buffer);
    await this.db.transaction(async (tx) => {
      const now = this.clock();
      await tx
        .update(adminUserPictures)
        .set({ archivedAt: now })
        .where(and(eq(adminUserPictures.adminUserId, principal.id), isNull(adminUserPictures.archivedAt)));
      // The same file as an earlier picture: that picture comes back.
      await tx
        .insert(adminUserPictures)
        .values({ adminUserId: principal.id, storageKey: key, contentType: type, uploadedAt: now })
        .onConflictDoUpdate({ target: [adminUserPictures.adminUserId, adminUserPictures.storageKey], set: { archivedAt: null, uploadedAt: now } });
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
    return this.profile(principal);
  }

  /** Removing the picture archives it (ADR 017): the account shows its initial again, and the picture stays restorable. */
  async removePicture(principal: AdminPrincipal): Promise<ProfileDto> {
    const previous = await this.repository.findProfile(principal.id);
    if (!previous?.pictureKey) return this.profile(principal);
    await this.db.transaction(async (tx) => {
      const [archived] = await tx
        .update(adminUserPictures)
        .set({ archivedAt: this.clock() })
        .where(and(eq(adminUserPictures.adminUserId, principal.id), isNull(adminUserPictures.archivedAt)))
        .returning({ id: adminUserPictures.id });
      await this.repository.update(tx, principal.id, { pictureKey: null, pictureType: null });
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: principal.id,
        action: "file_archived",
        actor: actorFor(principal),
        source: "admin",
        changes: [{ field: "picture", label: "Profile picture", kind: "text", before: "Set", after: null }],
        meta: { label: previous.name, file: { kind: "picture", id: archived?.id ?? null, name: "Profile picture" } },
      });
    });
    return this.profile(principal);
  }

  /** The account's archived pictures, newest first (Profile → Previous pictures). */
  async previousPictures(principal: AdminPrincipal): Promise<{ id: string; uploadedAt: string; archivedAt: string }[]> {
    const rows = await this.db
      .select({ id: adminUserPictures.id, uploadedAt: adminUserPictures.uploadedAt, archivedAt: adminUserPictures.archivedAt })
      .from(adminUserPictures)
      .where(and(eq(adminUserPictures.adminUserId, principal.id), isNotNull(adminUserPictures.archivedAt)))
      .orderBy(desc(adminUserPictures.archivedAt), desc(adminUserPictures.uploadedAt));
    return rows.map((row) => ({ id: row.id, uploadedAt: row.uploadedAt.toISOString(), archivedAt: row.archivedAt!.toISOString() }));
  }

  /** One of the account's own pictures (archived ones included), for the Previous pictures list. */
  async ownPicture(principal: AdminPrincipal, pictureId: string): Promise<{ bytes: Buffer; type: string }> {
    const [row] = await this.db
      .select()
      .from(adminUserPictures)
      .where(and(eq(adminUserPictures.id, pictureId), eq(adminUserPictures.adminUserId, principal.id)));
    if (!row) throw new NotFoundError("Picture not found.");
    return { bytes: await this.storage.get(row.storageKey), type: row.contentType };
  }

  /** Uses an archived picture again; the current one, if any, is archived in its place. */
  async restorePicture(principal: AdminPrincipal, pictureId: string): Promise<ProfileDto> {
    const profile = await this.repository.findProfile(principal.id);
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(adminUserPictures)
        .where(and(eq(adminUserPictures.id, pictureId), eq(adminUserPictures.adminUserId, principal.id)));
      if (!row) throw new NotFoundError("Picture not found.");
      if (!row.archivedAt) return;
      await tx
        .update(adminUserPictures)
        .set({ archivedAt: this.clock() })
        .where(and(eq(adminUserPictures.adminUserId, principal.id), isNull(adminUserPictures.archivedAt)));
      await tx.update(adminUserPictures).set({ archivedAt: null }).where(eq(adminUserPictures.id, row.id));
      await this.repository.update(tx, principal.id, { pictureKey: row.storageKey, pictureType: row.contentType });
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: principal.id,
        action: "file_restored",
        actor: actorFor(principal),
        source: "admin",
        changes: [{ field: "picture", label: "Profile picture", kind: "text", before: profile?.pictureKey ? "Set" : null, after: "Set" }],
        meta: { label: profile?.name ?? principal.email, file: { kind: "picture", id: row.id, name: "Profile picture" } },
      });
    });
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
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: principal.id,
        action: "password_changed",
        actor: actorFor(principal),
        source: "admin",
        meta: { label: principal.displayName ?? principal.email.split("@")[0]! },
      });
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
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: principal.id,
        action: "deactivated",
        actor: actorFor(principal),
        source: "admin",
        meta: { label: account.name, self: true },
      });
    });
  }

  // ---- One-time links, used without a session ----

  async inspectToken(token: string): Promise<{ purpose: "invite" | "reset"; email: string; name: string; expiresAt: string }> {
    const found = await this.liveToken(token);
    return {
      purpose: found.purpose as "invite" | "reset",
      email: found.email,
      name: found.displayName ?? found.email.split("@")[0]!,
      expiresAt: found.expiresAt.toISOString(),
    };
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

  // ---- Invitation links, used without a session (OPS-141) ----

  async inspectInvitation(token: string): Promise<{ expiresAt: string }> {
    const found = await this.liveInvitation(token);
    return { expiresAt: found.expiresAt.toISOString() };
  }

  /**
   * Whoever holds a live invitation link makes their own account: active,
   * no role and no permissions until a Rootadmin gives it a role. The link
   * is used in the same transaction, so two sign-ups with one link can't
   * both succeed. Returns the new account's id (the controller signs it in).
   */
  async signUp(token: string, email: string, password: string): Promise<{ id: string }> {
    const found = await this.liveInvitation(token);
    const problems = passwordProblems(password, { email, name: null });
    if (problems.length > 0) throw new ValidationFailedError(problems.map((message) => ({ path: "password", message })));
    if (await this.repository.emailTaken(email)) throw new ConflictError("An account with this email already exists: sign in instead.");
    const passwordHash = await hashPassword(password);
    const now = this.clock();
    return this.db.transaction(async (tx) => {
      const id = await this.repository.createSignedUp(tx, { email, passwordHash, invitedById: found.createdById });
      if (!(await this.repository.useInvitation(tx, found.id, id, now))) throw new NotFoundError(LINK_GONE);
      const label = email.split("@")[0]!;
      await this.audit.record(tx, {
        entityType: "admin_user",
        entityId: id,
        action: "created",
        actor: { type: "admin", id, label, role: null },
        source: "admin",
        meta: { label, collection: "Accounts", via: "Invitation link", invitationId: found.id },
      });
      return { id };
    });
  }

  private async liveInvitation(token: string) {
    const found = await this.repository.findInvitationByToken(hashSessionToken(token));
    if (!found || found.usedAt || found.revokedAt || found.expiresAt.getTime() <= this.clock().getTime()) throw new NotFoundError(LINK_GONE);
    return found;
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
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + LINK_HOURS * 3_600_000);
    await this.repository.createToken(tx, { adminUserId, purpose, tokenHash: hashSessionToken(token), expiresAt, createdById, createdAt: now });
    // The token rides in the fragment: browsers never send it, so no server or proxy log records it.
    const path = purpose === "invite" ? "/admin/welcome" : "/admin/reset-password";
    return { link: `${this.config.publicSiteUrl}${path}#${token}`, purpose, expiresAt: expiresAt.toISOString() };
  }

  /** Unused links stop working (deactivation, a new password). */
  private async expireLinks(tx: Executor, adminUserId: string) {
    await this.repository.expireTokens(tx, adminUserId);
  }

  private async keepARootadmin(account: AccountDto) {
    if (account.role?.key === "owner" && account.status === "active" && (await this.repository.otherActiveOwners(account.id)) === 0) {
      throw new ConflictError("This is the last active Rootadmin: it can't be deactivated.");
    }
  }

  private async checkCurrentPassword(id: string, password: string) {
    const hash = await this.repository.passwordHashOf(id);
    if (!hash || !(await verifyPassword(password, hash))) throw new ForbiddenError("Your current password isn't right.");
  }

  private async recordChanges(tx: Executor, before: Parameters<typeof diffRecord>[1], after: Parameters<typeof diffRecord>[2], actor: AuditActor) {
    const changes = diffRecord(ACCOUNT_FIELDS, before as never, after as never);
    if (changes.length === 0) return;
    await this.audit.record(tx, {
      entityType: "admin_user",
      entityId: (after as AccountDto).id,
      action: "updated",
      actor,
      source: "admin",
      changes,
      meta: { label: (after as AccountDto).name },
    });
  }
}
