import { describe, expect, it } from "vitest";
import { autoMapping } from "./csv-fields.js";
import { CSV_MAX_BYTES, CSV_MAX_ROWS, CsvFileError, parseCsv } from "./csv-parse.js";
import { comparableUrl, parseBoolean, parseDate, parseInstant, splitNames } from "./csv-values.js";

const bytes = (text: string) => new TextEncoder().encode(text);
const fails = (input: Uint8Array, message: RegExp) => expect(() => parseCsv(input)).toThrow(message);

describe("CSV file", () => {
  it("reads comma-separated UTF-8 with a header row, quotes, doubled quotes and line breaks inside quotes", () => {
    const parsed = parseCsv(bytes('Name,Description,Email\r\n"Zoë Müller","Says ""hi"", often\nand twice",zoe@example.net\r\nAli,,ali@example.net\r\n'));
    expect(parsed.delimiter).toBe(",");
    expect(parsed.headers).toEqual(["Name", "Description", "Email"]);
    expect(parsed.rows).toEqual([
      { line: 2, cells: ["Zoë Müller", 'Says "hi", often\nand twice', "zoe@example.net"], extraCells: false },
      { line: 4, cells: ["Ali", "", "ali@example.net"], extraCells: false },
    ]);
  });

  it("reads semicolon-separated files (European spreadsheets) and strips a byte-order mark", () => {
    const parsed = parseCsv(bytes("﻿Name;Website;Note\nAcme, Inc.;acme.test;a, b\n"));
    expect(parsed.delimiter).toBe(";");
    expect(parsed.headers).toEqual(["Name", "Website", "Note"]);
    expect(parsed.rows[0]!.cells).toEqual(["Acme, Inc.", "acme.test", "a, b"]);
  });

  it("pads short rows, flags rows with extra cells, skips blank lines, names empty headers", () => {
    const parsed = parseCsv(bytes("Name,,Email\nA\n\n,,\nB,x,b@example.net,surplus\n"));
    expect(parsed.headers).toEqual(["Name", "Column 2", "Email"]);
    expect(parsed.rows).toEqual([
      { line: 2, cells: ["A", "", ""], extraCells: false },
      { line: 5, cells: ["B", "x", "b@example.net"], extraCells: true },
    ]);
  });

  it("refuses what isn't a usable CSV file, with a sentence to act on", () => {
    fails(new Uint8Array(), /The file is empty/);
    fails(new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0xe9, 0x74, 0xe9]), /isn't UTF-8 text/);
    fails(bytes("Name\n"), /no data rows/);
    fails(bytes('Name\n"open quote\n'), /never closed/);
    fails(bytes("Name,name\nA,B\n"), /Two columns are named "name"/);
    fails(new Uint8Array(CSV_MAX_BYTES + 1).fill(0x41), /larger than 2 MB/);
    fails(bytes(`Name\n${"x\n".repeat(CSV_MAX_ROWS + 1)}`), /at most 5000 can be imported/);
    fails(bytes("PK\u0003\u0004\u0000binary"), /isn't a CSV text file/);
    expect(() => parseCsv(new Uint8Array())).toThrow(CsvFileError);
  });
});

describe("column matching", () => {
  it("matches header names to fields whatever their case and punctuation, each field once, and skips the rest", () => {
    expect(autoMapping("people", ["Full name", "E-mail", "Personal note", "Organization", "Person ID", "Follow-up", "Twitter", "email", "Mystery"])).toEqual([
      "name",
      "email",
      "description",
      "organizations",
      null, // a display number: never imported
      "nextFollowupAt",
      "x",
      null, // Email already taken by "E-mail"
      null,
    ]);
    expect(autoMapping("organizations", ["Organization", "Website", "ID", "Org ID"])).toEqual(["name", "website", "id", null]);
  });
});

describe("cell values", () => {
  it("reads dates as written by spreadsheets and Notion, and refuses ambiguous or impossible ones", () => {
    expect(["2026-10-30", "2026/10/30", "30.10.2026", "October 30, 2026", "Oct 30, 2026", "30 October 2026"].map(parseDate)).toEqual(Array(6).fill("2026-10-30"));
    expect(["10/30/2026", "30/10/2026", "2026-02-30", "soon", ""].map(parseDate)).toEqual([null, null, null, null, null]);
    expect(parseInstant("2026-10-30T09:00:00+01:00")).toBe("2026-10-30T08:00:00.000Z");
    expect(parseInstant("2026-10-30 09:00")).toBeNull();
  });

  it("reads yes / no", () => {
    expect(["Yes", "x", "TRUE", "1", "✓"].map(parseBoolean)).toEqual([true, true, true, true, true]);
    expect(["No", "false", "0"].map(parseBoolean)).toEqual([false, false, false]);
    expect(parseBoolean("maybe")).toBeNull();
  });

  it("splits lists of names, keeping a known name with a comma whole and dropping Notion's link suffix", () => {
    const known = new Set(["acme, inc.", "beta", "gamma"]);
    const isKnown = (name: string) => known.has(name.toLowerCase());
    expect(splitNames("Acme, Inc.", isKnown)).toEqual(["Acme, Inc."]);
    expect(splitNames("Beta; Gamma", isKnown)).toEqual(["Beta", "Gamma"]);
    expect(splitNames("Beta, Gamma", isKnown)).toEqual(["Beta", "Gamma"]);
    expect(splitNames("Beta (https://www.notion.so/Beta-0123), Gamma (https://www.notion.so/Gamma-4567)", isKnown)).toEqual(["Beta", "Gamma"]);
    expect(splitNames("Beta\nUnknown", isKnown)).toEqual(["Beta", "Unknown"]);
  });

  it("compares websites without scheme, www. or trailing slash", () => {
    expect(comparableUrl("https://www.Acme.test/")).toBe(comparableUrl("acme.test"));
  });
});
