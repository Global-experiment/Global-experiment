import { describe, expect, it } from "vitest";
import { activeModuleKey, ADMIN_MODULES, filterModules } from "./registry";

describe("admin module registry", () => {
  it("lists the sidebar exactly as the Figma (decision 16, plus Contracting)", () => {
    expect(ADMIN_MODULES.map(({ section, modules }) => [section, modules.map((entry) => entry.label)])).toEqual([
      ["Communication", ["Home", "Documentation", "Treasury"]],
      ["Admin", ["Feedbacks and issues", "People", "Organizations", "Contracting", "Messages", "Cloud"]],
      ["Monitoring", ["Services", "Permissions", "Accounts", "History", "Analytics", "Technical dashboard", "Emails"]],
      ["Other", ["Expertise", "Fields", "Domains", "Organizations", "Waitlist"]],
    ]);
  });

  it("keeps the decided modules 'Coming soon' and gives every live module a page (History is live since 2026-10-21)", () => {
    const all = ADMIN_MODULES.flatMap((group) => group.modules);
    expect(new Set(all.map((entry) => entry.key)).size).toBe(all.length);
    for (const key of ["waitlist", "messages", "cloud", "analytics", "technical_dashboard", "emails", "contracting"]) {
      expect(all.find((entry) => entry.key === key)?.status, key).toBe("coming_soon");
    }
    for (const entry of all.filter((candidate) => candidate.status === "live")) expect(entry.href, entry.key).toMatch(/^\/admin\//);
    for (const entry of all.filter((candidate) => candidate.status === "coming_soon")) expect(entry.href, entry.key).toBeUndefined();
  });

  it("highlights one row per page, including sub-pages and pages that belong to a module", () => {
    expect(activeModuleKey(ADMIN_MODULES, "/admin/organizations")).toBe("organizations");
    expect(activeModuleKey(ADMIN_MODULES, "/admin/organizations/12")).toBe("organizations");
    expect(activeModuleKey(ADMIN_MODULES, "/admin/imports")).toBe("people");
    expect(activeModuleKey(ADMIN_MODULES, "/admin/history")).toBe("history");
    expect(activeModuleKey(ADMIN_MODULES, "/admin/peoplex")).toBeUndefined();
    expect(activeModuleKey(ADMIN_MODULES, "/admin/profile")).toBeUndefined();
  });

  it("filters by label and drops empty sections", () => {
    expect(filterModules(ADMIN_MODULES, " ORGAN ").map((group) => [group.section, group.modules.map((entry) => entry.key)])).toEqual([
      ["Admin", ["organizations"]],
      ["Other", ["organizations_other"]],
    ]);
    expect(filterModules(ADMIN_MODULES, "zzz")).toEqual([]);
    expect(filterModules(ADMIN_MODULES, "")).toHaveLength(4);
  });
});
