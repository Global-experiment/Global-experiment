import { describe, expect, it } from "vitest";
import { autoMapping } from "./csv-fields.js";
import { parseCsv } from "./csv-parse.js";
import { csvCounts, CsvMappingError, planCsvImport, type CsvSnapshot, type ValueChoices } from "./csv-plan.js";

// Test fixtures only.
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const snapshot: CsvSnapshot = {
  records: [
    { id: id(1), name: "Ada Existing", email: "ada@example.net", website: null },
    { id: id(2), name: "Bo Existing", email: null, website: "https://bo.test/" },
    { id: id(3), name: "Cy Existing", email: null, website: null },
  ],
  states: [
    { key: "sourced", label: "Sourced" },
    { key: "collaborating", label: "Collaborating" },
  ],
  sources: [{ key: "other", label: "Other" }],
  channels: [
    { key: "email", label: "Email" },
    { key: "signal", label: "Signal" },
  ],
  organizations: [
    { id: id(10), name: "Acme, Inc." },
    { id: id(11), name: "Twin" },
    { id: id(12), name: "Twin" },
  ],
  expertise: [
    { id: id(20), name: "Facilitation" },
    { id: id(21), name: "Copywriting" },
    { id: id(22), name: "Économie sociale" },
  ],
};

const plan = (csv: string, options: { include?: number[]; mapping?: (string | null)[]; choices?: ValueChoices } = {}) => {
  const parsed = parseCsv(new TextEncoder().encode(csv));
  return planCsvImport(
    {
      table: "people",
      fileName: "people.csv",
      parsed,
      mapping: options.mapping ?? autoMapping("people", parsed.headers),
      include: options.include,
      choices: options.choices,
    },
    snapshot,
  );
};

describe("CSV import plan (people)", () => {
  it("turns valid rows into the detail page's create request, relations found by name", () => {
    const result = plan(
      "Name,Email,State,Source,Organizations,Expertise,Contact channels,Do not contact,Relevance score,First contact,Follow-up date,Website\n" +
        'Dana New,dana@example.net,collaborating,Other,"Acme, Inc.",facilitation,"Email; Signal",no,7,30.10.2026,2026-11-02,dana.test\n',
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ line: 2, name: "Dana New", status: "create", errors: [], duplicate: null });
    expect(result.rows[0]!.request).toEqual({
      name: "Dana New",
      email: "dana@example.net",
      stateKey: "collaborating",
      sourceKey: "other",
      organizationIds: [id(10)],
      expertiseIds: [id(20)],
      contactChannelKeys: ["email", "signal"],
      doNotContact: false,
      relevanceScore: 7,
      firstContactOn: "2026-10-30",
      // A date alone: 09:00 in Zurich (winter: UTC+1).
      nextFollowupAt: "2026-11-02T08:00:00.000Z",
      website: "dana.test",
    });
  });

  it("reports every real problem of a row, with the field it's about, using the detail page's rules; unknown values are only warnings", () => {
    const result = plan(
      "Name,Email,Website,State,Relevance score,First contact,Organizations,ID\n" +
        "Eve Broken,not-an-email,not a link,Unknown,eleven,2026-02-30,Nowhere Ltd,PER-12\n" +
        ",,,,,,,\n" +
        "Fay Twin,,,,12,,Twin,not-a-uuid\n",
    );
    expect(result.rows.map((row) => [row.line, row.status, row.errors, row.warnings])).toEqual([
      [
        2,
        "error",
        ["Relevance score: use a whole number from 0 to 10.", "First contact: use a date like 2026-10-30."],
        ['State: no state named "Unknown"; imported without it.', 'Organizations: no organization named "Nowhere Ltd"; imported without it.'],
      ],
      [
        4,
        "error",
        ["ID (UUID): use the record's UUID (PER-, ORG- and GE- numbers aren't used)."],
        ['Organizations: several are named "Twin"; imported without it.'],
      ],
    ]);
    // Once the lookups pass, the request schema speaks: email, link and score range.
    const second = plan("Name,Email,Website,Relevance score\nGus,not-an-email,not a link,12\n,a@example.net,,\n");
    expect(second.rows.map((row) => row.errors)).toEqual([
      ["Email: Invalid email address.", "Website: Invalid link. Use an address like https://example.org.", "Relevance score: Use a whole number from 0 to 10."],
      ["Name is required."],
    ]);
  });

  it("flags possible duplicates — same UUID, email, website or name as a record or an earlier row — never on display numbers", () => {
    const result = plan(
      "ID,Name,Email,Website,Person ID\n" +
        `${id(3)},Someone Else,,,\n` +
        ",New Name,ADA@example.net,,\n" +
        ",Other,,http://www.bo.test,\n" +
        ",  cy   EXISTING ,,,\n" +
        ",Hal Fresh,hal@example.net,,PER-1\n" +
        ",Hal Again,hal@example.net,,PER-1\n" +
        ",Ivy Fresh,,,PER-1\n",
    );
    expect(result.rows.map((row) => [row.line, row.status, row.duplicate?.reason ?? null, row.duplicate?.existing?.id ?? null])).toEqual([
      [2, "duplicate", "Same ID as Cy Existing", id(3)],
      [3, "duplicate", "Same email as Ada Existing", id(1)],
      [4, "duplicate", "Same website as Bo Existing", id(2)],
      [5, "duplicate", "Same name as Cy Existing", id(3)],
      [6, "create", null, null],
      [7, "duplicate", "Same email as row 6", null],
      // PER-1 three times: display numbers are not compared.
      [8, "create", null, null],
    ]);
    expect(csvCounts(result)).toEqual({ fileName: "people.csv", rows: 7, create: 2, duplicates: 5, duplicatesIncluded: 0, errors: 0, warnings: 0 });
  });

  describe("unknown values (OPS-153)", () => {
    // As Notion exported the client's file on 2026-10-30: links after each name. "Pigeon" stands for a channel the admin doesn't have ("Other" is one since migration 0014).
    const notion =
      "Name,Email,Expertise,Contact channels\n" +
      'Kim Lee,kim@example.net,"Copywriting (https://app.notion.com/p/Copywriting-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f?pvs=21), Game design (https://app.notion.com/p/Game-design-0f0f?pvs=21)","Email, Pigeon"\n' +
      'Lou Ray,lou@example.net,"  copywriting ",Pigeon\n' +
      'Max Roe,not-an-email,"Game design (https://app.notion.com/p/Game-design-0f0f?pvs=21)",\n' +
      ",nameless@example.net,Copywriting,\n";

    it("imports the row without the value it doesn't know, with a warning; Notion's app.notion.com links are removed", () => {
      const result = plan(notion);
      expect(result.rows.map((row) => [row.line, row.status])).toEqual([
        [2, "create"],
        [3, "create"],
        // Real errors still refuse a row: an invalid email, no name.
        [4, "error"],
        [5, "error"],
      ]);
      expect(result.rows[0]!.request).toMatchObject({ expertiseIds: [id(21)], contactChannelKeys: ["email"] });
      expect(result.rows[0]!.warnings).toEqual([
        'Expertise: no expertise named "Game design"; imported without it.',
        'Contact channels: no contact channel named "Pigeon"; imported without it.',
      ]);
      // Case and extra spaces ignored.
      expect(result.rows[1]!.request).toMatchObject({ expertiseIds: [id(21)] });
      expect(result.rows[2]!.errors).toEqual(["Email: Invalid email address."]);
      expect(result.rows[3]!.errors).toEqual(["Name is required."]);
      expect(csvCounts(result)).toMatchObject({ create: 2, errors: 2, warnings: 2 });
    });

    it("lists each unknown value once, with its rows and what it can be mapped to", () => {
      const result = plan(notion);
      expect(
        result.unknown.map((field) => [field.field, field.label, field.values.map((value) => [value.value, value.key, value.rows, value.problem])]),
      ).toEqual([
        ["contactChannels", "Contact channels", [["Pigeon", "pigeon", 2, "unknown"]]],
        ["expertise", "Expertise", [["Game design", "game design", 2, "unknown"]]],
      ]);
      expect(result.unknown[1]!.options.map((option) => option.label)).toEqual(["Copywriting", "Économie sociale", "Facilitation"]);
    });

    it("maps an unknown value to an existing one, or skips it, as the admin chose", () => {
      const result = plan(notion, { choices: { expertise: { "game design": id(20) }, contactChannels: { pigeon: null } } });
      expect(result.rows[0]!.request).toMatchObject({ expertiseIds: [id(21), id(20)], contactChannelKeys: ["email"] });
      expect(result.rows[0]!.warnings).toEqual(['Contact channels: "Pigeon" skipped.']);
      expect(result.unknown.find((field) => field.field === "expertise")!.values[0]).toMatchObject({ value: "Game design", choice: id(20) });
      // A choice that isn't one of the options changes nothing.
      expect(plan(notion, { choices: { expertise: { "game design": id(99) } } }).rows[0]!.request).toMatchObject({ expertiseIds: [id(21)] });
    });

    it("removes Notion's links (www.notion.so and app.notion.com) on every value column, then matches the existing values", () => {
      const notionSo = (name: string) => `${name} (https://www.notion.so/${name.replace(/\W+/g, "-")}-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f)`;
      const notionApp = (name: string) => `${name} (https://app.notion.com/p/${name.replace(/\W+/g, "-")}-0f0f?pvs=21)`;
      const csv =
        "Name,Email,State,Source,Contact channels,Organizations,Expertise\n" +
        `Uma Link,uma@example.net,"${notionSo("Collaborating")}","${notionApp("Other")}","${notionSo("Email")}, ${notionApp("Signal")}","${notionSo("Acme, Inc.")}","${notionSo("Facilitation")}, ${notionApp("Économie sociale")}"\n`;
      expect(plan(csv).rows[0]).toMatchObject({
        status: "create",
        warnings: [],
        request: {
          stateKey: "collaborating",
          sourceKey: "other",
          contactChannelKeys: ["email", "signal"],
          organizationIds: [id(10)],
          expertiseIds: [id(20), id(22)],
        },
      });
      expect(plan(csv).unknown).toEqual([]);
    });

    it("matches accents too", () => {
      expect(plan("Name,Expertise\nNoa,economie   SOCIALE\n").rows[0]).toMatchObject({ status: "create", warnings: [], request: { expertiseIds: [id(22)] } });
    });
  });

  it("imports a flagged row only when the admin includes it, still marked as a possible duplicate", () => {
    const result = plan("Name,Email\nAda Existing,\nNew,\n", { include: [2] });
    expect(result.rows[0]).toMatchObject({ status: "create", included: true, duplicate: { reason: "Same name as Ada Existing" } });
    expect(csvCounts(result)).toMatchObject({ create: 2, duplicates: 0, duplicatesIncluded: 1 });
  });

  it("follows the admin's column choices, and refuses choices that can't work", () => {
    const csv = "A,B\nJo,jo@example.net\n";
    expect(plan(csv, { mapping: ["name", "email"] }).rows[0]!.request).toEqual({ name: "Jo", email: "jo@example.net" });
    expect(plan(csv, { mapping: ["name", null] }).rows[0]!.request).toEqual({ name: "Jo" });
    expect(() => plan(csv, { mapping: [null, "email"] })).toThrow(new CsvMappingError("Choose the column that holds the Name: every record needs one."));
    expect(() => plan(csv, { mapping: ["name", "name"] })).toThrow(/Two columns are set to Name/);
    expect(() => plan(csv, { mapping: ["name", "salary"] })).toThrow(/Unknown field "salary"/);
    expect(() => plan(csv, { mapping: ["name"] })).toThrow(/don't match the file's columns/);
  });

  it("organizations use their own rules (no people fields)", () => {
    const parsed = parseCsv(new TextEncoder().encode("Name,Website,State\nNew Org,new.test,Sourced\nAcme, Inc.,,\n"));
    const mapping = autoMapping("organizations", parsed.headers);
    expect(mapping).toEqual(["name", "website", null]);
    const result = planCsvImport(
      { table: "organizations", fileName: "orgs.csv", parsed, mapping },
      { ...snapshot, records: [{ id: id(10), name: "Acme", email: null, website: null }] },
    );
    expect(result.rows.map((row) => [row.status, row.request])).toEqual([
      ["create", { name: "New Org", website: "new.test" }],
      // An unquoted comma inside a name: the row has more cells than the header.
      ["error", null],
    ]);
  });
});
