import { statSync } from "node:fs";
import { recordAuditEvent } from "../audit/audit.service.js";
import { AUTOMATION } from "../audit/audit.types.js";
import { inArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../common/database/database.module.js";
import { expertiseDomains, expertiseFields, expertiseItems } from "../expertise/expertise.schema.js";
import { organizationExpertise, organizations } from "../organizations/organizations.schema.js";
import { people, peopleExpertise } from "../people/people.schema.js";

/**
 * Finds and removes demo/sample directory records (project rule "No demo
 * data, anywhere" — docs/architecture/data-model.md §5). A row is demo when
 * any marker holds:
 *
 * - its id is in the reserved range of the former demo seed (`de000000-…`);
 * - an email or website on `example.org` or a subdomain (a reserved domain,
 *   RFC 2606: no real person or organization can use it);
 * - the text "Fictional sample" in its name or free-text fields;
 * - a name (or taxonomy Stable ID) starting with `DEMO-`.
 *
 * Expertise rows are only removed when nothing real still depends on them
 * (no remaining person/organization tag, no remaining child); otherwise
 * they are kept and reported, never forced.
 */
export const SEED_ID_PREFIX = "de000000-";

type Kind = "person" | "organization" | "domain" | "field" | "expertise";

export interface DemoRow {
  kind: Kind;
  id: string;
  name: string;
  reasons: string[];
}

export interface SkippedRow extends DemoRow {
  keptBecause: string;
}

export interface PurgePlan {
  delete: DemoRow[];
  skip: SkippedRow[];
}

type Executor = Pick<Database, "select" | "delete">;

const seedId = (column: unknown) => sql<boolean>`${column}::text like ${`${SEED_ID_PREFIX}%`}`;
const exampleDomain = (column: unknown) => sql<boolean>`coalesce(${column} ~* '(@|://)([a-z0-9-]+\\.)*example\\.org([/:?#]|$)', false)`;
const fictional = (column: unknown) => sql<boolean>`coalesce(${column} ilike '%fictional sample%', false)`;
const demoPrefix = (column: unknown) => sql<boolean>`coalesce(${column} like 'DEMO-%', false)`;

const reasonsOf = (row: Record<string, unknown>, labels: Record<string, string>) =>
  Object.entries(labels)
    .filter(([key]) => row[key] === true)
    .map(([, label]) => label);

const any = (...conditions: SQL[]) => sql.join(conditions, sql` or `);

/** Everything the purge would delete, and what it would keep despite a demo marker. Read-only. */
export async function planDemoPurge(db: Executor): Promise<PurgePlan> {
  const personMarkers = {
    seed: seedId(people.id),
    email: exampleDomain(people.email),
    website: exampleDomain(people.website),
    fictional: sql<boolean>`${fictional(people.name)} or ${fictional(people.personalNote)} or ${fictional(people.otherContact)}`,
    prefix: demoPrefix(people.name),
  };
  const personRows = await db
    .select({ id: people.id, name: people.name, ...personMarkers })
    .from(people)
    .where(any(...Object.values(personMarkers)))
    .orderBy(people.personNumber);

  const organizationMarkers = {
    seed: seedId(organizations.id),
    email: exampleDomain(organizations.email),
    website: exampleDomain(organizations.website),
    fictional: sql<boolean>`${fictional(organizations.name)} or ${fictional(organizations.description)}`,
    prefix: demoPrefix(organizations.name),
  };
  const organizationRows = await db
    .select({ id: organizations.id, name: organizations.name, ...organizationMarkers })
    .from(organizations)
    .where(any(...Object.values(organizationMarkers)))
    .orderBy(organizations.orgNumber);

  const labels = {
    seed: `former demo seed id (${SEED_ID_PREFIX}…)`,
    email: "example.org email",
    website: "example.org website",
    fictional: '"Fictional sample" text',
    prefix: "DEMO- prefix",
  };
  const plan: PurgePlan = { delete: [], skip: [] };
  for (const row of personRows) plan.delete.push({ kind: "person", id: row.id, name: row.name, reasons: reasonsOf(row, labels) });
  for (const row of organizationRows) plan.delete.push({ kind: "organization", id: row.id, name: row.name, reasons: reasonsOf(row, labels) });

  const deletedPeople = new Set(personRows.map((row) => row.id));
  const deletedOrganizations = new Set(organizationRows.map((row) => row.id));

  // Taxonomy, bottom-up: an item may go only if every tag on it belongs to a
  // record that is itself being deleted; a field/domain only if all its
  // children go too.
  const taxonomyMarkers = <T extends typeof expertiseItems | typeof expertiseFields | typeof expertiseDomains>(table: T) => ({
    seed: seedId(table.id),
    fictional: fictional(table.name),
    prefix: sql<boolean>`${demoPrefix(table.name)} or ${demoPrefix(table.stableId)}`,
  });
  const taxonomyLabels = { seed: labels.seed, fictional: labels.fictional, prefix: "DEMO- prefix (name or Stable ID)" };

  const itemMarkers = taxonomyMarkers(expertiseItems);
  const items = await db
    .select({ id: expertiseItems.id, name: expertiseItems.name, fieldId: expertiseItems.fieldId, ...itemMarkers })
    .from(expertiseItems)
    .where(any(...Object.values(itemMarkers)))
    .orderBy(expertiseItems.name);
  const itemIds = items.map((item) => item.id);
  const [personTags, organizationTags] = itemIds.length
    ? await Promise.all([
        db.select({ expertiseId: peopleExpertise.expertiseId, ownerId: peopleExpertise.personId }).from(peopleExpertise).where(inArray(peopleExpertise.expertiseId, itemIds)),
        db
          .select({ expertiseId: organizationExpertise.expertiseId, ownerId: organizationExpertise.organizationId })
          .from(organizationExpertise)
          .where(inArray(organizationExpertise.expertiseId, itemIds)),
      ])
    : [[], []];
  const deletedItems = new Set<string>();
  for (const item of items) {
    const row = { kind: "expertise" as const, id: item.id, name: item.name, reasons: reasonsOf(item, taxonomyLabels) };
    const realPeople = personTags.filter((tag) => tag.expertiseId === item.id && !deletedPeople.has(tag.ownerId)).length;
    const realOrganizations = organizationTags.filter((tag) => tag.expertiseId === item.id && !deletedOrganizations.has(tag.ownerId)).length;
    if (realPeople + realOrganizations > 0) {
      plan.skip.push({ ...row, keptBecause: `still tagged on ${realPeople} real people and ${realOrganizations} real organizations` });
    } else {
      plan.delete.push(row);
      deletedItems.add(item.id);
    }
  }

  const fieldMarkers = taxonomyMarkers(expertiseFields);
  const fields = await db
    .select({ id: expertiseFields.id, name: expertiseFields.name, domainId: expertiseFields.domainId, ...fieldMarkers })
    .from(expertiseFields)
    .where(any(...Object.values(fieldMarkers)))
    .orderBy(expertiseFields.name);
  const fieldChildren = fields.length
    ? await db.select({ id: expertiseItems.id, fieldId: expertiseItems.fieldId }).from(expertiseItems).where(inArray(expertiseItems.fieldId, fields.map((field) => field.id)))
    : [];
  const deletedFields = new Set<string>();
  for (const field of fields) {
    const row = { kind: "field" as const, id: field.id, name: field.name, reasons: reasonsOf(field, taxonomyLabels) };
    const remaining = fieldChildren.filter((child) => child.fieldId === field.id && !deletedItems.has(child.id)).length;
    if (remaining > 0) plan.skip.push({ ...row, keptBecause: `still has ${remaining} expertise that stay` });
    else {
      plan.delete.push(row);
      deletedFields.add(field.id);
    }
  }

  const domainMarkers = taxonomyMarkers(expertiseDomains);
  const domains = await db
    .select({ id: expertiseDomains.id, name: expertiseDomains.name, ...domainMarkers })
    .from(expertiseDomains)
    .where(any(...Object.values(domainMarkers)))
    .orderBy(expertiseDomains.name);
  const domainChildren = domains.length
    ? await db.select({ id: expertiseFields.id, domainId: expertiseFields.domainId }).from(expertiseFields).where(inArray(expertiseFields.domainId, domains.map((domain) => domain.id)))
    : [];
  for (const domain of domains) {
    const row = { kind: "domain" as const, id: domain.id, name: domain.name, reasons: reasonsOf(domain, taxonomyLabels) };
    const remaining = domainChildren.filter((child) => child.domainId === domain.id && !deletedFields.has(child.id)).length;
    if (remaining > 0) plan.skip.push({ ...row, keptBecause: `still has ${remaining} fields that stay` });
    else plan.delete.push(row);
  }

  return plan;
}

const ENTITY_OF = { person: "person", organization: "organization", expertise: "expertise_item", field: "expertise_field", domain: "expertise_domain" } as const;

/** Deletes exactly the plan's rows in one transaction (links go with them), each logged. Returns the plan it applied. */
export async function purgeDemoData(db: Database): Promise<PurgePlan> {
  return db.transaction(async (tx) => {
    // Re-planned inside the transaction, so it deletes what it reports.
    const plan = await planDemoPurge(tx);
    const ids = (kind: Kind) => plan.delete.filter((row) => row.kind === kind).map((row) => row.id);
    const remove = async (table: typeof people | typeof organizations | typeof expertiseItems | typeof expertiseFields | typeof expertiseDomains, kind: Kind) => {
      const list = ids(kind);
      if (list.length === 0) return;
      // Logged before the rows go (Automation: an operator command).
      for (const row of plan.delete.filter((candidate) => candidate.kind === kind)) {
        await recordAuditEvent(tx, { entityType: ENTITY_OF[kind], entityId: row.id, action: "deleted", actor: AUTOMATION, source: "system", meta: { label: row.name, origin: "purge-demo-data" } });
      }
      await tx.delete(table).where(inArray(table.id, list));
    };
    await remove(people, "person");
    await remove(organizations, "organization");
    await remove(expertiseItems, "expertise");
    await remove(expertiseFields, "field");
    await remove(expertiseDomains, "domain");
    return plan;
  });
}

export const BACKUP_MAX_AGE_HOURS = 24;

/**
 * A confirmed purge needs a database backup taken just before it: an
 * existing, non-empty file modified within the last 24 hours. Returns why
 * it's refused, or undefined when it's acceptable.
 */
export function backupRefusal(path: string | undefined, now = Date.now()): string | undefined {
  if (!path) return "a fresh database backup file is required: --backup <path>.";
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return `backup file "${path}" doesn't exist.`;
  }
  if (!stats.isFile()) return `backup "${path}" is not a file.`;
  if (stats.size === 0) return `backup file "${path}" is empty.`;
  const ageHours = (now - stats.mtimeMs) / 3_600_000;
  if (ageHours > BACKUP_MAX_AGE_HOURS) {
    return `backup file "${path}" is ${Math.floor(ageHours)} hours old; take a new one (max ${BACKUP_MAX_AGE_HOURS} hours).`;
  }
  return undefined;
}

export interface PurgeArgs {
  confirm: boolean;
  backup?: string;
}

export function parsePurgeArgs(argv: readonly string[]): PurgeArgs {
  const args: PurgeArgs = { confirm: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--confirm") args.confirm = true;
    else if (arg === "--dry-run") args.confirm = false;
    else if (arg === "--backup") args.backup = argv[++index];
    else if (arg?.startsWith("--backup=")) args.backup = arg.slice("--backup=".length);
    else throw new Error(`Unknown argument: ${arg}. Use --dry-run (default), or --confirm --backup <path>.`);
  }
  if (argv.includes("--dry-run") && args.confirm) throw new Error("--dry-run and --confirm can't be combined.");
  return args;
}

/** Human-readable listing of a plan (no connection details, no personal data beyond names). */
export function formatPlan(plan: PurgePlan, heading: string): string {
  const order: Kind[] = ["person", "organization", "expertise", "field", "domain"];
  const lines = [heading];
  for (const kind of order) {
    const rows = plan.delete.filter((row) => row.kind === kind);
    lines.push("", `${kind} — ${rows.length} to delete`);
    for (const row of rows) lines.push(`  ${row.id}  ${row.name}  [${row.reasons.join("; ")}]`);
  }
  if (plan.skip.length > 0) {
    lines.push("", `kept despite a demo marker — ${plan.skip.length}`);
    for (const row of plan.skip) lines.push(`  ${row.kind} ${row.id}  ${row.name}  [${row.reasons.join("; ")}] — ${row.keptBecause}`);
  }
  const counts = order.map((kind) => `${plan.delete.filter((row) => row.kind === kind).length} ${kind}`).join(", ");
  lines.push("", `Total: ${counts}; ${plan.skip.length} kept.`);
  return lines.join("\n");
}
