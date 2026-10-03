import { describe, expect, it } from "vitest";
import { loginHref, safeAdminNext } from "./paths";

describe("admin paths", () => {
  it("keeps internal admin destinations", () => {
    expect(safeAdminNext("/admin/people/123?q=a")).toBe("/admin/people/123?q=a");
  });

  it.each([null, "", "https://evil.example", "//evil.example", "/\evil", "/treasury", "/admin/login?next=/x"])(
    "refuses %s",
    (raw) => {
      expect(safeAdminNext(raw)).toBe("/admin/people");
    },
  );

  it("encodes the return path", () => {
    expect(loginHref("/admin/people?q=a b")).toBe("/admin/login?next=%2Fadmin%2Fpeople%3Fq%3Da%20b");
    expect(loginHref()).toBe("/admin/login");
  });
});
