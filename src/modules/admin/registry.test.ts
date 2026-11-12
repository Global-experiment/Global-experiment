import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../../../apps/api/src/access-control/permissions";
import { activeModuleKey, ADMIN_MODULES, filterModules, modulesFor } from "./registry";

describe("admin module registry", () => {
  it("lists the Design System Desktop menu destinations once and in order", () => {
    expect(ADMIN_MODULES.map((entry) => entry.label)).toEqual([
      "Home",
      "Documentation",
      "Treasury",
      "People",
      "Organizations",
      "Services",
      "Permissions",
      "Accounts",
      "Expertise",
      "Fields",
      "Domains",
      "History",
    ]);
    expect(new Set(ADMIN_MODULES.map((entry) => entry.href)).size).toBe(ADMIN_MODULES.length);
  });

  it("uses permissions defined by the API", () => {
    for (const entry of ADMIN_MODULES) {
      if (entry.permission) expect(Object.keys(PERMISSIONS), entry.key).toContain(entry.permission);
    }
  });

  it("shows each role only the modules it can read", () => {
    const menu = (role: keyof typeof ROLE_PERMISSIONS) => modulesFor(ADMIN_MODULES, new Set(ROLE_PERMISSIONS[role])).map((entry) => entry.key);
    expect(menu("owner")).toEqual(ADMIN_MODULES.map((entry) => entry.key));
    const moderator = menu("moderation");
    for (const hidden of ["treasury", "services", "permissions", "accounts"]) expect(moderator, hidden).not.toContain(hidden);
    for (const shown of ["home", "people", "history", "expertise"]) expect(moderator, shown).toContain(shown);
    expect(menu("treasury")).toEqual(expect.arrayContaining(["treasury", "services", "permissions"]));
    expect(menu("treasury")).not.toContain("accounts");
    expect(menu("compliance")).toContain("accounts");
    expect(modulesFor(ADMIN_MODULES, new Set())).toEqual([]);
  });

  it("highlights one row per page, including sub-pages and pages that belong to a module", () => {
    expect(activeModuleKey(ADMIN_MODULES, "/admin/organizations")).toBe("organizations");
    expect(activeModuleKey(ADMIN_MODULES, "/admin/organizations/12")).toBe("organizations");
    expect(activeModuleKey(ADMIN_MODULES, "/admin/imports")).toBe("people");
    expect(activeModuleKey(ADMIN_MODULES, "/admin/history")).toBe("history");
    expect(activeModuleKey(ADMIN_MODULES, "/admin/peoplex")).toBeUndefined();
    expect(activeModuleKey(ADMIN_MODULES, "/admin/profile")).toBeUndefined();
  });

  it("filters by label while preserving the destination order", () => {
    expect(filterModules(ADMIN_MODULES, " ORGAN ").map((entry) => entry.key)).toEqual(["organizations"]);
    expect(filterModules(ADMIN_MODULES, "zzz")).toEqual([]);
    expect(filterModules(ADMIN_MODULES, "")).toEqual(ADMIN_MODULES);
  });
});
