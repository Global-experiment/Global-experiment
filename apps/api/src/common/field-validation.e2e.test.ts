import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChangeEmailRequest, SignUpRequest } from "../accounts/accounts.contracts.js";
import { Slug } from "../cms/cms.contracts.js";
import { signedInAdmin, type SignedInAdmin } from "../testing/admin-session.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { FIELD_MESSAGES } from "./field-rules.js";

/**
 * OPS-70: the page checks a field when it is left, but the page is not security. The API refuses every value
 * a rule forbids with a 400 and the field's message (validation_failed, details.issues), with the same shared
 * rules as the page (field-rules.ts). Fixtures in this file only.
 */
describe("the API refuses invalid field values (OPS-70)", () => {
  let t: TestApp;
  let owner: SignedInAdmin;
  beforeAll(async () => {
    t = await createTestApp();
    owner = await signedInAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });

  const refused = async (response: { status: number; body: { error: { code: string; details?: { issues?: { path: string; message: string }[] } } } }) => {
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_failed");
    return response.body.error.details!.issues![0]!;
  };

  it("People: email, links, scores and the contact dates, on create and on edit", async () => {
    expect(await refused(await owner.post("/api/admin/people", { name: "Ada", email: "ada@exa_mple.org" }))).toEqual({
      path: "email",
      message: FIELD_MESSAGES.email,
    });
    expect(await refused(await owner.post("/api/admin/people", { name: "Ada", email: "ada@example" }))).toMatchObject({ path: "email" });
    const person = (await owner.post("/api/admin/people", { name: "Ada", email: "ada@example.org" }).expect(201)).body;
    expect(await refused(await owner.patch(`/api/admin/people/${person.id}`, { email: "ada@@example.org" }))).toEqual({
      path: "email",
      message: FIELD_MESSAGES.email,
    });
    expect(await refused(await owner.patch(`/api/admin/people/${person.id}`, { website: "not a link" }))).toEqual({
      path: "website",
      message: FIELD_MESSAGES.link,
    });
    expect(await refused(await owner.patch(`/api/admin/people/${person.id}`, { relevanceScore: 11 }))).toMatchObject({ path: "relevanceScore" });
    expect(await refused(await owner.patch(`/api/admin/people/${person.id}`, { name: "  " }))).toEqual({ path: "name", message: "Name is required." });
    expect(await refused(await owner.patch(`/api/admin/people/${person.id}`, { firstContactOn: "2026-10-05", lastContactOn: "2026-10-01" }))).toEqual({
      path: "lastContactOn",
      message: "The last contact can't be before the first contact.",
    });
    // Nothing invalid was stored.
    expect((await owner.get(`/api/admin/people/${person.id}`).expect(200)).body).toMatchObject({ email: "ada@example.org", website: null, name: "Ada" });
    // A blank email clears it; a valid one is kept.
    expect((await owner.patch(`/api/admin/people/${person.id}`, { email: "  " }).expect(200)).body.email).toBeNull();
  });

  it("Organizations: email and website", async () => {
    expect(await refused(await owner.post("/api/admin/organizations", { name: "Studio", email: "studio@example" }))).toEqual({
      path: "email",
      message: FIELD_MESSAGES.email,
    });
    const studio = (await owner.post("/api/admin/organizations", { name: "Studio" }).expect(201)).body;
    expect(await refused(await owner.patch(`/api/admin/organizations/${studio.id}`, { website: "https://localhost" }))).toEqual({
      path: "website",
      message: FIELD_MESSAGES.link,
    });
    expect(await refused(await owner.patch(`/api/admin/organizations/${studio.id}`, { email: "studio @example.org" }))).toMatchObject({ path: "email" });
  });

  it("Services and Permissions: the address, the name, and dates in order", async () => {
    expect(await refused(await owner.post("/api/admin/services", { name: "Git", url: "ftp://example.org" }))).toEqual({
      path: "url",
      message: FIELD_MESSAGES.link,
    });
    expect(await refused(await owner.post("/api/admin/services", { name: " " }))).toMatchObject({ path: "name" });
    const service = (await owner.post("/api/admin/services", { name: "Git", url: "git.example.org" }).expect(201)).body;
    expect(await refused(await owner.post("/api/admin/access-grants", { serviceId: service.id, grantedOn: "2026-10-10", expiresOn: "2026-10-01" }))).toEqual({
      path: "expiresOn",
      message: "Expired can't be before granted.",
    });
  });

  it("Profile: a new email address", async () => {
    expect(await refused(await owner.post("/api/admin/profile/email", { currentPassword: "a long and unique passphrase", email: "owner@example" }))).toEqual({
      path: "email",
      message: FIELD_MESSAGES.email,
    });
  });

  it("the contracts behind sign-up, a new email and a page address use the same rules", () => {
    const token = "a".repeat(43);
    expect(SignUpRequest.safeParse({ token, email: "new@example", password: "x" }).success).toBe(false);
    expect(SignUpRequest.safeParse({ token, email: " new@example.org ", password: "x" }).data?.email).toBe("new@example.org");
    expect(ChangeEmailRequest.safeParse({ currentPassword: "x", email: "new@exa_mple.org" }).error?.issues[0]?.message).toBe(FIELD_MESSAGES.email);
    expect(Slug.safeParse("Version 0.1").error?.issues[0]?.message).toBe(FIELD_MESSAGES.slug);
    expect(Slug.safeParse("version-0-1").success).toBe(true);
  });
});
