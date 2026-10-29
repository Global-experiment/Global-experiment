import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "../audit/audit.schema.js";
import { ALLOW_ANONYMOUS } from "../auth/admin-area.js";
import { adminPermissions, adminRolePermissions, adminRoles, adminUsers } from "../auth/auth.schema.js";
import { signedInAdmin, signedInAs } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { MISSING_REQUIREMENT, meets } from "./permission.guard.js";
import { PERMISSIONS, ROLE_KEYS, ROLE_PERMISSIONS, ROLES } from "./permissions.js";
import { REQUIREMENT, type Requirement } from "./requires.js";

/**
 * Access control (overview §3.1): every /api/admin endpoint declares the
 * permission it needs, the database grants match permissions.ts, and every
 * role is refused (403) exactly where its permissions fall short — on
 * every endpoint — with the attempt in the account's history.
 */

interface Route {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: string;
  anonymous: boolean;
  requirement: Requirement | undefined;
}

const METHODS: Partial<Record<RequestMethod, Route["method"]>> = {
  [RequestMethod.GET]: "get",
  [RequestMethod.POST]: "post",
  [RequestMethod.PATCH]: "patch",
  [RequestMethod.PUT]: "put",
  [RequestMethod.DELETE]: "delete",
};

/** Every route the app serves under /api/admin, from the controllers' own metadata. */
function adminRoutes(t: TestApp): Route[] {
  const routes: Route[] = [];
  for (const nestModule of t.app.get(ModulesContainer).values()) {
    for (const wrapper of nestModule.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => unknown) | null;
      if (!controller) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? "").replace(/^\/|\/$/g, "");
      if (!/^admin(\/|$)/.test(base)) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== "function" || name === "constructor") continue;
        const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (!method || path === undefined) continue;
        routes.push({
          method,
          path: `/api/${base}/${path}`.replace(/\/+/g, "/").replace(/\/$/, ""),
          anonymous: Reflect.getMetadata(ALLOW_ANONYMOUS, handler) === true,
          requirement: (Reflect.getMetadata(REQUIREMENT, handler) ?? Reflect.getMetadata(REQUIREMENT, controller)) as Requirement | undefined,
        });
      }
    }
  }
  return routes;
}

/** A route's requirement in words: "treasury.publish", "treasury.update | treasury.review", "<:type>.read", "signed in", "anonymous". */
function requirementLabel(route: Route): string {
  const requirement = route.requirement;
  if (route.anonymous || !requirement) return "anonymous";
  if (requirement.kind === "signed-in") return "signed in";
  if (requirement.kind === "param") return `<:${requirement.param}>.${requirement.action}`;
  return requirement.permissions.join(requirement.kind === "any" ? " | " : " & ");
}

/**
 * The reviewed route table: every admin endpoint and what it needs. A new
 * endpoint, or a changed permission, must be added here on purpose.
 */
const EXPECTED_ROUTES: Record<string, string> = {
  "DELETE /api/admin/access-grants/:id": "access.delete",
  "DELETE /api/admin/comments/:id": "signed in",
  "DELETE /api/admin/expertise/domains/:id": "taxonomy.delete",
  "DELETE /api/admin/expertise/fields/:id": "taxonomy.delete",
  "DELETE /api/admin/expertise/items/:id": "taxonomy.delete",
  "DELETE /api/admin/organizations/:id": "directory.delete",
  "DELETE /api/admin/organizations/:id/expertise/:expertiseId": "directory.update",
  "DELETE /api/admin/organizations/:id/people/:personId": "directory.update",
  "DELETE /api/admin/people/:id": "directory.delete",
  "DELETE /api/admin/people/:id/expertise/:expertiseId": "directory.update",
  "DELETE /api/admin/people/:id/organizations/:organizationId": "directory.update",
  "DELETE /api/admin/profile/picture": "signed in",
  "DELETE /api/admin/services/:id": "services.delete",
  "DELETE /api/admin/treasury/:id": "treasury.delete",
  "DELETE /api/admin/treasury/documents/:documentId": "treasury.update",
  "GET /api/admin/access-grants": "access.read",
  "GET /api/admin/access-grants/:id": "access.read",
  "GET /api/admin/accounts": "accounts.read",
  "GET /api/admin/accounts/:id": "accounts.read",
  "GET /api/admin/accounts/:id/picture": "signed in",
  "GET /api/admin/auth/session": "signed in",
  "GET /api/admin/expertise/search": "taxonomy.read",
  "GET /api/admin/expertise/tree": "taxonomy.read",
  "GET /api/admin/history": "signed in",
  "GET /api/admin/history/:type/:id": "<:type>.read",
  "GET /api/admin/history/actors": "signed in",
  "GET /api/admin/imports/csv/runs/:id": "directory.read",
  "GET /api/admin/imports/jobs/:id": "imports.read",
  "GET /api/admin/imports/runs": "imports.read",
  "GET /api/admin/imports/status": "imports.read",
  "GET /api/admin/organizations": "directory.read",
  "GET /api/admin/organizations/:id": "directory.read",
  "GET /api/admin/people": "directory.read",
  "GET /api/admin/people/:id": "directory.read",
  "GET /api/admin/people/options": "directory.read",
  "GET /api/admin/profile": "signed in",
  "GET /api/admin/services": "services.read",
  "GET /api/admin/services/:id": "services.read",
  "GET /api/admin/services/options": "services.read",
  "GET /api/admin/treasury": "treasury.read",
  "GET /api/admin/treasury/:id": "treasury.read",
  "GET /api/admin/treasury/:id/documents": "treasury.read",
  "GET /api/admin/treasury/documents/:documentId": "treasury.read",
  "GET /api/admin/treasury/options": "treasury.read",
  "PATCH /api/admin/access-grants/:id": "access.update",
  "PATCH /api/admin/accounts/:id": "accounts.manage",
  "PATCH /api/admin/comments/:id": "signed in",
  "PATCH /api/admin/expertise/domains/:id": "taxonomy.update",
  "PATCH /api/admin/expertise/fields/:id": "taxonomy.update",
  "PATCH /api/admin/expertise/items/:id": "taxonomy.update",
  "PATCH /api/admin/organizations/:id": "directory.update",
  "PATCH /api/admin/people/:id": "directory.update",
  "PATCH /api/admin/profile": "signed in",
  "PATCH /api/admin/services/:id": "services.update",
  "PATCH /api/admin/treasury/:id": "treasury.update | treasury.review",
  "POST /api/admin/access-grants": "access.create",
  "POST /api/admin/access-grants/:id/archive": "access.update",
  "POST /api/admin/access-grants/:id/restore": "access.update",
  "POST /api/admin/accounts": "accounts.manage",
  "POST /api/admin/accounts/:id/deactivate": "accounts.manage",
  "POST /api/admin/accounts/:id/link": "accounts.manage",
  "POST /api/admin/accounts/:id/reactivate": "accounts.manage",
  "POST /api/admin/auth/login": "anonymous",
  "POST /api/admin/auth/logout": "signed in",
  "POST /api/admin/auth/tokens/accept": "anonymous",
  "POST /api/admin/auth/tokens/inspect": "anonymous",
  "POST /api/admin/expertise/domains": "taxonomy.create",
  "POST /api/admin/expertise/fields": "taxonomy.create",
  "POST /api/admin/expertise/items": "taxonomy.create",
  "POST /api/admin/history/:type/:id/comments": "<:type>.read",
  "POST /api/admin/history/:type/:id/views": "<:type>.read",
  "POST /api/admin/imports/:kind/apply": "<:kind>.import",
  "POST /api/admin/imports/csv/:table/confirm": "<:table>.create",
  "POST /api/admin/imports/csv/:table/preview": "<:table>.create",
  "POST /api/admin/imports/:kind/dry-run": "<:kind>.import",
  "POST /api/admin/organizations": "directory.create",
  "POST /api/admin/organizations/:id/archive": "directory.update",
  "POST /api/admin/organizations/:id/duplicate": "directory.create",
  "POST /api/admin/organizations/:id/restore": "directory.update",
  "POST /api/admin/people": "directory.create",
  "POST /api/admin/people/:id/archive": "directory.update",
  "POST /api/admin/people/:id/duplicate": "directory.create",
  "POST /api/admin/people/:id/restore": "directory.update",
  "POST /api/admin/profile/deactivate": "signed in",
  "POST /api/admin/profile/email": "signed in",
  "POST /api/admin/profile/password": "signed in",
  "POST /api/admin/profile/picture": "signed in",
  "POST /api/admin/services": "services.create",
  "POST /api/admin/services/:id/archive": "services.update",
  "POST /api/admin/services/:id/restore": "services.update",
  "POST /api/admin/treasury/:id/archive": "treasury.update",
  "POST /api/admin/treasury/:id/documents": "treasury.update",
  "POST /api/admin/treasury/:id/publish": "treasury.publish",
  "POST /api/admin/treasury/:id/restore": "treasury.update",
  "POST /api/admin/treasury/:id/review": "treasury.review",
  "POST /api/admin/treasury/:id/unpublish": "treasury.publish",
  "PUT /api/admin/organizations/:id/expertise/:expertiseId": "directory.update",
  "PUT /api/admin/organizations/:id/people/:personId": "directory.update",
  "PUT /api/admin/people/:id/expertise/:expertiseId": "directory.update",
  "PUT /api/admin/people/:id/organizations/:organizationId": "directory.update",
};

const FAKE_ID = "00000000-0000-4000-8000-000000000000";
/** Real-looking route parameters: a known record type and import kind, unknown ids. */
const PARAMS: Record<string, string> = { type: "person", kind: "directory", table: "people" };
const fill = (path: string) => path.replace(/:([A-Za-z]+)/g, (_, name: string) => PARAMS[name] ?? FAKE_ID);
const paramsOf = (path: string) => Object.fromEntries([...path.matchAll(/:([A-Za-z]+)/g)].map(([, name]) => [name!, PARAMS[name!] ?? FAKE_ID]));

/** Calls that would do real work when allowed (sign out, start an import): only checked where a refusal is expected. */
const SIDE_EFFECTS = [/\/auth\/logout$/, /\/imports\/:kind\/(dry-run|apply)$/, /\/profile\/(deactivate|password|email)$/];

describe("access control", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ TRUST_PROXY_HOPS: "1" });
    await signedInAdmin(t); // the Rootadmin exists before the other roles
  });
  afterAll(async () => {
    await t.close();
  });

  it("every /api/admin endpoint declares its permission (or is the sign-in or a one-time link)", () => {
    const routes = adminRoutes(t);
    expect(routes.length).toBeGreaterThan(80);
    const undeclared = routes.filter((route) => !route.anonymous && !route.requirement).map((route) => `${route.method.toUpperCase()} ${route.path}`);
    expect(undeclared).toEqual([]);
    const anonymous = routes.filter((route) => route.anonymous).map((route) => `${route.method.toUpperCase()} ${route.path}`).sort();
    expect(anonymous).toEqual(["POST /api/admin/auth/login", "POST /api/admin/auth/tokens/accept", "POST /api/admin/auth/tokens/inspect"]);
    // Every permission named by a route exists.
    for (const route of routes) {
      const requirement = route.requirement;
      if (requirement && (requirement.kind === "all" || requirement.kind === "any")) for (const permission of requirement.permissions) expect(PERMISSIONS).toHaveProperty(permission);
    }
  });

  it("seeds the roles, the permission keys and the role grants exactly as permissions.ts (migration 0012)", async () => {
    const roles = await t.db.select().from(adminRoles);
    expect(Object.fromEntries(roles.map((role) => [role.key, role.label]))).toEqual(Object.fromEntries(Object.entries(ROLES).map(([key, role]) => [key, role.label])));
    expect((await t.db.select({ key: adminPermissions.key }).from(adminPermissions)).map((row) => row.key).sort()).toEqual(Object.keys(PERMISSIONS).sort());
    for (const role of ROLE_KEYS) {
      const granted = (await t.db.select({ key: adminRolePermissions.permissionKey }).from(adminRolePermissions).where(eq(adminRolePermissions.roleKey, role))).map((row) => row.key).sort();
      expect(granted, role).toEqual([...new Set(ROLE_PERMISSIONS[role])].sort());
    }
  });

  it("declares exactly the reviewed permission on each endpoint (overview §3.1)", () => {
    const actual = Object.fromEntries(adminRoutes(t).map((route) => [`${route.method.toUpperCase()} ${route.path}`, requirementLabel(route)]));
    expect(actual).toEqual(EXPECTED_ROUTES);
  });

  it("refuses an endpoint that forgot its declaration (fails closed)", () => {
    expect(MISSING_REQUIREMENT).toMatch(/doesn't declare/);
  });

  for (const role of ROLE_KEYS) {
    it(`${ROLES[role].label}: 403 exactly where the role's permissions fall short, on every endpoint`, async () => {
      // A second Rootadmin for the owner's walk, so the test owner's own session is never touched.
      const agent = await signedInAs(t, role, role === "owner" ? "owner-two@example.org" : undefined);
      const permissions = new Set(ROLE_PERMISSIONS[role]);
      const mismatches: string[] = [];
      for (const route of adminRoutes(t)) {
        if (route.anonymous || !route.requirement) continue;
        const allowed = meets(route.requirement, permissions, paramsOf(route.path));
        if (allowed && SIDE_EFFECTS.some((pattern) => pattern.test(route.path))) continue;
        // An unknown key makes every strict body a 400 *after* the permission check.
        const response = await agent.call(route.method, fill(route.path), { notAField: true });
        if ((response.status === 403) === allowed) mismatches.push(`${route.method.toUpperCase()} ${route.path}: ${response.status} (expected ${allowed ? "not 403" : "403"})`);
      }
      expect(mismatches).toEqual([]);
    });
  }

  it("records a refused attempt on the account's history (permission_denied)", async () => {
    const moderator = await signedInAs(t, "moderation");
    await moderator.get("/api/admin/treasury").expect(403);
    const [account] = await t.db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, "moderation@example.org"));
    const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, account!.id), eq(auditEvents.action, "permission_denied")));
    expect(events.at(-1)).toMatchObject({ entityType: "admin_user", meta: { permission: "treasury.read", route: "GET /api/admin/treasury" } });
  });
});
