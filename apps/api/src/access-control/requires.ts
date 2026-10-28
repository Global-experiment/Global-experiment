import { SetMetadata } from "@nestjs/common";
import type { Module, Permission } from "./permissions.js";

/**
 * What an admin endpoint needs (overview §3.1). Every handler under
 * /api/admin declares exactly one of these, or the permission guard refuses
 * it (fail closed) — a test walks every route to prove none is missing:
 *
 * - `@Requires("treasury.publish")`: that permission;
 * - `@RequiresAny("treasury.update", "treasury.review")`: one of them (the
 *   handler checks which fields each allows);
 * - `@RequiresForParam("type", ENTITY_MODULE, "read")`: the module named by
 *   a route parameter (a record's history, an import's kind);
 * - `@SignedIn()`: any active admin (their own session, profile, the
 *   History page, which then shows only what they may read).
 */
export const REQUIREMENT = "access:requirement";

export type Requirement =
  | { kind: "all"; permissions: Permission[] }
  | { kind: "any"; permissions: Permission[] }
  | { kind: "param"; param: string; modules: Readonly<Record<string, Module>>; action: string }
  | { kind: "signed-in" };

export const Requires = (...permissions: Permission[]) => SetMetadata(REQUIREMENT, { kind: "all", permissions } satisfies Requirement);
export const RequiresAny = (...permissions: Permission[]) => SetMetadata(REQUIREMENT, { kind: "any", permissions } satisfies Requirement);
export const RequiresForParam = (param: string, modules: Readonly<Record<string, Module>>, action: string) =>
  SetMetadata(REQUIREMENT, { kind: "param", param, modules, action } satisfies Requirement);
export const SignedIn = () => SetMetadata(REQUIREMENT, { kind: "signed-in" } satisfies Requirement);
