import { describe, expect, it } from "vitest";
import type { NotionPage } from "../notion/notion-client.js";
import { layoutOf, toSourceOrganization, toSourcePerson } from "./directory-source.js";

// Test fixtures only: the shapes the Notion API returns (no live calls).
const PEOPLE_SCHEMA = {
  Name: { type: "title" },
  "*State": { type: "select" },
  "*Source": { type: "select" },
  "*Personal note": { type: "rich_text" },
  "Do not contact": { type: "checkbox" },
  Email: { type: "email" },
  Phone: { type: "phone_number" },
  Website: { type: "url" },
  LinkedIn: { type: "url" },
  X: { type: "url" },
  "Other contact details": { type: "rich_text" },
  "Wise recipient account ID": { type: "rich_text" },
  "Follow-up date": { type: "date" },
  "Person ID": { type: "unique_id" },
  Organizations: { type: "relation" },
  Expenses: { type: "relation" },
  "Access grants": { type: "relation" },
  Created: { type: "created_time" },
  Updated: { type: "last_edited_time" },
};
const ORGANIZATION_SCHEMA = {
  "*Name": { type: "title" },
  "*Description": { type: "rich_text" },
  "*Website": { type: "url" },
  "*Email": { type: "email" },
  "*Wise recipient account ID": { type: "rich_text" },
  "Organization ID": { type: "unique_id" },
  People: { type: "relation" },
  Expenses: { type: "relation" },
  "*Expertise": { type: "relation" },
};

const text = (value: string) => [{ plain_text: value }];

describe("Notion directory layout", () => {
  it("matches properties ignoring the * marker and reads the starred ones as required for completeness", () => {
    const layout = layoutOf("people", { properties: PEOPLE_SCHEMA });
    expect(layout.names.State).toBe("*State");
    expect(layout.required).toEqual(["State", "Source", "Personal note"]);
    expect(layout.absent).toEqual(["Expertise"]);
    expect(layout.unread).toEqual(["Created", "Updated"]);

    const organizations = layoutOf("organizations", { properties: ORGANIZATION_SCHEMA });
    expect(organizations.required).toEqual(["Name", "Description", "Website", "Email", "Wise recipient account ID", "Expertise"]);
    expect(organizations.absent).toEqual([]);
  });

  it("refuses to run when a property was renamed or retyped", () => {
    const withoutPhone: Record<string, { type: string }> = { ...PEOPLE_SCHEMA, "Do not contact": { type: "rich_text" } };
    delete withoutPhone.Phone;
    expect(() => layoutOf("people", { properties: withoutPhone })).toThrow(
      'The Notion people database changed shape: "Do not contact" should be checkbox, found rich_text; "Phone" is missing.',
    );
  });
});

describe("Notion directory records", () => {
  it("maps every People property", async () => {
    const layout = layoutOf("people", { properties: PEOPLE_SCHEMA });
    const page: NotionPage = {
      id: "person-1",
      created_time: "2026-10-14T08:00:00.000Z",
      properties: {
        Name: { type: "title", title: text(" Amina Diallo ") },
        "*State": { type: "select", select: { name: "In discussion" } },
        "*Source": { type: "select", select: null },
        "*Personal note": { type: "rich_text", rich_text: text("Met at the assembly.") },
        "Do not contact": { type: "checkbox", checkbox: true },
        Email: { type: "email", email: "amina@ngo.ch" },
        Phone: { type: "phone_number", phone_number: "+41 79 000 00 00" },
        Website: { type: "url", url: "https://amina.ch" },
        LinkedIn: { type: "url", url: null },
        X: { type: "url", url: "https://x.com/amina" },
        "Other contact details": { type: "rich_text", rich_text: text("Signal") },
        "Wise recipient account ID": { type: "rich_text", rich_text: text("12345678") },
        "Follow-up date": { type: "date", date: { start: "2026-11-03T09:30:00.000+01:00" } },
        "Person ID": { type: "unique_id", unique_id: { prefix: "PER", number: 42 } },
        Organizations: { id: "orgs", type: "relation", relation: [{ id: "org-1" }], has_more: true },
        Expenses: { type: "relation", relation: [{ id: "e1" }, { id: "e2" }] },
        "Access grants": { type: "relation", relation: [{ id: "g1" }] },
      },
    };
    // A truncated relation is read in full through the property endpoint.
    const person = await toSourcePerson(page, layout, async (_page, property) =>
      property.has_more ? ["org-1", "org-2"] : (property.relation ?? []).map((r) => r.id),
    );
    expect(person).toEqual({
      kind: "person",
      pageId: "person-1",
      createdTime: "2026-10-14T08:00:00.000Z",
      name: "Amina Diallo",
      number: 42,
      state: "In discussion",
      source: null,
      personalNote: "Met at the assembly.",
      doNotContact: true,
      email: "amina@ngo.ch",
      phone: "+41 79 000 00 00",
      website: "https://amina.ch",
      linkedin: null,
      x: "https://x.com/amina",
      otherContact: "Signal",
      wiseRecipientId: "12345678",
      // Notion's value as written (date and time with its offset); the plan turns it into an instant.
      nextFollowupAt: "2026-11-03T09:30:00.000+01:00",
      organizationPageIds: ["org-1", "org-2"],
      expertisePageIds: null, // no Expertise property in Notion
      expensesCount: 2,
      accessGrantsCount: 1,
      missingRequired: ["Source"],
    });
  });

  it("maps every Organization property and lists the empty starred ones", async () => {
    const layout = layoutOf("organizations", { properties: ORGANIZATION_SCHEMA });
    const organization = await toSourceOrganization(
      {
        id: "org-1",
        created_time: "2026-10-14T08:00:00.000Z",
        properties: {
          "*Name": { type: "title", title: text("Civic Lab") },
          "*Description": { type: "rich_text", rich_text: [] },
          "*Website": { type: "url", url: "https://civic-lab.org" },
          "*Email": { type: "email", email: null },
          "*Wise recipient account ID": { type: "rich_text", rich_text: text("98765432") },
          "Organization ID": { type: "unique_id", unique_id: { prefix: "ORG", number: 7 } },
          People: { type: "relation", relation: [{ id: "person-1" }] },
          Expenses: { type: "relation", relation: [] },
          "*Expertise": { type: "relation", relation: [] },
        },
      },
      layout,
    );
    expect(organization).toEqual({
      kind: "organization",
      pageId: "org-1",
      createdTime: "2026-10-14T08:00:00.000Z",
      name: "Civic Lab",
      number: 7,
      description: null,
      website: "https://civic-lab.org",
      email: null,
      wiseRecipientId: "98765432",
      peoplePageIds: ["person-1"],
      expertisePageIds: [],
      expensesCount: 0,
      missingRequired: ["Description", "Email", "Expertise"],
    });
  });
});
