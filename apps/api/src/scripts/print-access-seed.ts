/**
 * Prints the SQL seed of migration 0012 from access-control/permissions.ts
 * (roles, permission keys, role grants). Run once when the model changes:
 *   npx tsx apps/api/src/scripts/print-access-seed.ts
 * The access-control test checks the database still matches the file.
 */
import { MODULES, PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "../access-control/permissions.js";

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const lines: string[] = [];
lines.push(
  `INSERT INTO "admin_roles" ("key", "label", "sort_order") VALUES\n${Object.entries(ROLES)
    .map(([key, role]) => `  (${quote(key)}, ${quote(role.label)}, ${role.sortOrder})`)
    .join(",\n")};`,
);
lines.push(
  `INSERT INTO "admin_permissions" ("key", "module", "description") VALUES\n${Object.entries(PERMISSIONS)
    .map(([key, description]) => {
      const area = key.split(".")[0]!;
      if (!(area in MODULES)) throw new Error(`Unknown module in ${key}`);
      return `  (${quote(key)}, ${quote(area)}, ${quote(description)})`;
    })
    .join(",\n")};`,
);
lines.push(
  `INSERT INTO "admin_role_permissions" ("role_key", "permission_key") VALUES\n${Object.entries(ROLE_PERMISSIONS)
    .flatMap(([role, keys]) => [...new Set(keys)].map((key) => `  (${quote(role)}, ${quote(key)})`))
    .join(",\n")};`,
);
process.stdout.write(lines.join("--> statement-breakpoint\n") + "\n");
