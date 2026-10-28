import request from "supertest";
import { ALL_PERMISSIONS } from "../access-control/permissions.js";
import { AuthRepository } from "../auth/auth.repository.js";
import { adminUsers } from "../auth/auth.schema.js";
import type { AdminPrincipal } from "../auth/auth.service.js";
import { hashPassword } from "../auth/password.js";
import { TEST_ORIGIN, type TestApp } from "./test-app.js";

const OWNER_EMAIL = "owner@example.org";
const OWNER_PASSWORD = "a long and unique passphrase";
const ROLE_PASSWORD = "Another long passphrase 42";

let ipCounter = 0;

async function login(t: TestApp, email: string, password: string) {
  const res = await request(t.app.getHttpServer())
    .post("/api/admin/auth/login")
    .set("origin", TEST_ORIGIN)
    .set("x-forwarded-for", `198.51.100.${++ipCounter % 250}`)
    .send({ email, password })
    .expect(204);
  const header = res.headers["set-cookie"] as unknown as string[];
  const cookie = header.find((value) => value.startsWith("ge_admin_session="))!.split(";")[0]!;
  const server = () => request(t.app.getHttpServer());
  const withAuth = (req: request.Test) => req.set("cookie", cookie).set("origin", TEST_ORIGIN);
  return {
    cookie,
    get: (path: string) => withAuth(server().get(path)),
    post: (path: string, body?: object) => withAuth(server().post(path)).send(body ?? {}),
    patch: (path: string, body: object) => withAuth(server().patch(path)).send(body),
    put: (path: string) => withAuth(server().put(path)),
    delete: (path: string) => withAuth(server().delete(path)),
    /** Any method, for walking every route. */
    call: (method: "get" | "post" | "patch" | "put" | "delete", path: string, body?: object) => withAuth(server()[method](path)).send(body ?? {}),
    /** multipart/form-data with one file field. */
    upload: (path: string, field: string, bytes: Buffer, fileName: string) => withAuth(server().post(path)).attach(field, bytes, fileName),
  };
}

/** Signs an existing account in (another session of the same account, for instance). */
export const signInWith = (t: TestApp, email: string, password: string) => login(t, email, password);

/**
 * Logs the test owner (a Rootadmin) in and returns an agent-like helper
 * whose requests carry the session cookie and an allow-listed Origin (CSRF).
 */
export async function signedInAdmin(t: TestApp) {
  await new AuthRepository(t.db).upsertOwner(OWNER_EMAIL, await hashPassword(OWNER_PASSWORD));
  return login(t, OWNER_EMAIL, OWNER_PASSWORD);
}

/** An active account with this role (created on first use), signed in. The owner must exist first. */
export async function signedInAs(t: TestApp, role: string, email = `${role}@example.org`) {
  await t.db
    .insert(adminUsers)
    .values({ email, role, status: "active", passwordHash: await hashPassword(ROLE_PASSWORD) })
    .onConflictDoNothing();
  return login(t, email, ROLE_PASSWORD);
}

export type SignedInAdmin = Awaited<ReturnType<typeof signedInAdmin>>;

/** A principal for calling services directly in tests (the Rootadmin's permissions unless given). */
export function testPrincipal(overrides: Partial<AdminPrincipal> = {}): AdminPrincipal {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "o@example.org",
    role: "owner",
    roleLabel: "Rootadmin",
    displayName: null,
    accountNumber: 1,
    timeZone: null,
    appearance: "system",
    hasPicture: false,
    personId: null,
    permissions: new Set(ALL_PERMISSIONS),
    sessionId: "s",
    ...overrides,
  };
}
