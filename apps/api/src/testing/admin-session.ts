import request from "supertest";
import { AuthRepository } from "../auth/auth.repository.js";
import { hashPassword } from "../auth/password.js";
import { TEST_ORIGIN, type TestApp } from "./test-app.js";

const OWNER_EMAIL = "owner@example.org";
const OWNER_PASSWORD = "a long and unique passphrase";

let ipCounter = 0;

/**
 * Logs the test owner in and returns an agent-like helper whose requests
 * carry the session cookie and an allow-listed Origin (CSRF check).
 */
export async function signedInAdmin(t: TestApp) {
  await new AuthRepository(t.db).upsertOwner(OWNER_EMAIL, await hashPassword(OWNER_PASSWORD));
  const res = await request(t.app.getHttpServer())
    .post("/api/admin/auth/login")
    .set("origin", TEST_ORIGIN)
    .set("x-forwarded-for", `198.51.100.${++ipCounter}`)
    .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
    .expect(204);
  const header = res.headers["set-cookie"] as unknown as string[];
  const cookie = header.find((value) => value.startsWith("ge_admin_session="))!.split(";")[0]!;

  const server = () => request(t.app.getHttpServer());
  const withAuth = (req: request.Test) => req.set("cookie", cookie).set("origin", TEST_ORIGIN);
  return {
    get: (path: string) => withAuth(server().get(path)),
    post: (path: string, body?: object) => withAuth(server().post(path)).send(body ?? {}),
    patch: (path: string, body: object) => withAuth(server().patch(path)).send(body),
    put: (path: string) => withAuth(server().put(path)),
    delete: (path: string) => withAuth(server().delete(path)),
  };
}

export type SignedInAdmin = Awaited<ReturnType<typeof signedInAdmin>>;
