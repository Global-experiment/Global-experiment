import { and, eq, isNull, sql } from "drizzle-orm";
import { ROLE_KEYS, ROLES, type Role } from "../access-control/permissions.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { AUTOMATION } from "../audit/audit.types.js";
import { adminTokens, adminUsers } from "../auth/auth.schema.js";
import { generateSessionToken, hashSessionToken } from "../auth/session-token.js";
import type { Database } from "../common/database/database.module.js";
import { LINK_HOURS } from "./accounts.service.js";

export interface InviteCommandInput {
  email: string;
  role: string;
  displayName?: string | null;
}

export interface InviteCommandResult {
  /** "invited": a new account; "new_link": it was already invited, the older link stops working. */
  outcome: "invited" | "new_link";
  link: string;
  expiresAt: string;
}

/**
 * The `admin:invite` command (the deploy runbook, decision 15 of
 * 2026-10-19): the same invitation as "New account" in Accounts, made from
 * the server — an invited account and a one-time link (72 h, single use;
 * only its hash is stored). An account still invited gets a new link; an
 * active or deactivated one is left alone. Recorded in the account's
 * history as made by Automation.
 */
export async function inviteByCommand(db: Database, input: InviteCommandInput, publicSiteUrl: string, now = new Date()): Promise<InviteCommandResult> {
  if (!ROLE_KEYS.includes(input.role as Role)) throw new Error(`Unknown role "${input.role}". Use one of: ${ROLE_KEYS.join(", ")}.`);
  const email = input.email.trim();
  const displayName = input.displayName?.trim() || null;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: adminUsers.id, status: adminUsers.status, displayName: adminUsers.displayName })
      .from(adminUsers)
      .where(sql`lower(${adminUsers.email}) = ${email.toLowerCase()}`)
      .limit(1);
    if (existing && existing.status !== "invited") {
      throw new Error(existing.status === "active" ? "This account is already active: nothing to do." : "This account is deactivated: reactivate it in Accounts first.");
    }
    const id = existing?.id ?? (await tx.insert(adminUsers).values({ email, displayName, role: input.role, status: "invited", passwordHash: null }).returning({ id: adminUsers.id }))[0]!.id;
    const label = existing?.displayName ?? displayName ?? email.split("@")[0]!;

    const token = generateSessionToken();
    const expiresAt = new Date(now.getTime() + LINK_HOURS * 3_600_000);
    await tx.update(adminTokens).set({ usedAt: now }).where(and(eq(adminTokens.adminUserId, id), isNull(adminTokens.usedAt)));
    await tx.insert(adminTokens).values({ adminUserId: id, purpose: "invite", tokenHash: hashSessionToken(token), expiresAt, createdById: null });
    await recordAuditEvent(
      tx,
      existing
        ? { entityType: "admin_user", entityId: id, action: "link_created", actor: AUTOMATION, source: "system", meta: { label, purpose: "Invitation link", expiresAt: expiresAt.toISOString(), origin: "admin:invite" } }
        : { entityType: "admin_user", entityId: id, action: "invited", actor: AUTOMATION, source: "system", meta: { label, role: ROLES[input.role as Role].label, collection: "Accounts", origin: "admin:invite" } },
      now,
    );
    return { outcome: existing ? "new_link" : "invited", link: `${publicSiteUrl}/admin/welcome#${token}`, expiresAt: expiresAt.toISOString() };
  });
}
