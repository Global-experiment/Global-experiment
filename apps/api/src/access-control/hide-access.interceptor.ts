import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { map, type Observable } from "rxjs";
import type { AdminRequest } from "../auth/admin-area.js";

/**
 * A person's access grants (their Permissions field) are Permissions data:
 * a role without access.read sees people, but not who has access to what.
 * Empties `permissions` on the person (or page of people) a handler returns.
 */
@Injectable()
export class HideAccessInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (request.admin?.permissions.has("access.read")) return next.handle();
    return next.handle().pipe(map(hideAccess));
  }
}

function hideAccess(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  if ("items" in body && Array.isArray(body.items)) return { ...body, items: body.items.map(hideAccess) };
  if ("permissions" in body && Array.isArray(body.permissions)) return { ...body, permissions: [] };
  return body;
}
