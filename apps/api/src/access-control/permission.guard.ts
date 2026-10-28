import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuditService } from "../audit/audit.service.js";
import { isAdminArea, isAnonymousAllowed, type AdminRequest } from "../auth/admin-area.js";
import { ForbiddenError } from "../common/errors/api-error.js";
import { REQUIREMENT, type Requirement } from "./requires.js";

export const MISSING_REQUIREMENT = "This endpoint doesn't declare its permission.";

/** Whether a principal's permissions meet a requirement (route params resolve the module). */
export function meets(requirement: Requirement, permissions: ReadonlySet<string>, params: Record<string, string | undefined> = {}): boolean {
  switch (requirement.kind) {
    case "signed-in":
      return true;
    case "all":
      return requirement.permissions.every((permission) => permissions.has(permission));
    case "any":
      return requirement.permissions.some((permission) => permissions.has(permission));
    case "param": {
      const area = requirement.modules[params[requirement.param] ?? ""];
      // An unknown value reaches nothing: the handler's validation answers 400 before any work.
      if (!area) return true;
      // history.read reads every record type's history.
      if (requirement.action === "read" && permissions.has("history.read")) return true;
      return permissions.has(area === "settings" ? "settings.manage" : `${area}.${requirement.action}`);
    }
  }
}

/**
 * Global guard, after AdminSessionGuard: every /api/admin handler must
 * declare what it needs (requires.ts), and the signed-in admin's role must
 * have it. Fails closed: a handler without a declaration is refused for
 * everyone. A refusal is a 403 and a "permission_denied" history event on
 * the account (overview §3.1).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isAdminArea(context, this.reflector) || isAnonymousAllowed(context, this.reflector)) return true;
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const admin = request.admin;
    if (!admin) return true; // AdminSessionGuard has already answered 401.
    const requirement = this.reflector.getAllAndOverride<Requirement | undefined>(REQUIREMENT, [context.getHandler(), context.getClass()]);
    if (!requirement) throw new ForbiddenError(MISSING_REQUIREMENT);
    if (meets(requirement, admin.permissions, request.params as Record<string, string>)) return true;
    const needed =
      requirement.kind === "param"
        ? `${requirement.modules[(request.params as Record<string, string>)[requirement.param] ?? ""] ?? "?"}.${requirement.action}`
        : requirement.kind === "signed-in"
          ? ""
          : requirement.permissions.join(requirement.kind === "any" ? " or " : " and ");
    await this.audit.recordDenied(admin, needed, `${request.method} ${request.route?.path ?? request.path}`);
    throw new ForbiddenError("Your role doesn't allow this.");
  }
}
