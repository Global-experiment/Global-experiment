import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HistoryItem } from "../api/types";
import { HistoryEvent } from "./HistoryFeed";

// Test fixtures only.
const deleted = (meta: HistoryItem["meta"]): HistoryItem => ({
  id: "event:1",
  kind: "event",
  action: "deleted",
  occurredAt: "2026-10-30T10:00:00.000Z",
  actor: { type: "admin", label: "Rootadmin" },
  changes: [],
  meta,
});

describe("a deleted Treasury entry in the history", () => {
  it("shows what the entry was, since its page is gone", () => {
    const html = renderToStaticMarkup(
      <HistoryEvent
        entity="Treasury entry"
        onChanged={() => {}}
        item={deleted({
          label: "EXP-12 · −CHF 120.00",
          details: [
            { label: "Number", value: "EXP-12" },
            { label: "Name", value: "Legal advice" },
            { label: "Amount", value: "−CHF 120.00" },
          ],
        })}
      />,
    );
    expect(html).toContain("data-deleted-details");
    for (const text of ["Number", "EXP-12", "Name", "Legal advice", "Amount", "−CHF 120.00"]) expect(html).toContain(`>${text}<`);
  });

  it("shows nothing more for a deletion recorded without details", () => {
    const html = renderToStaticMarkup(<HistoryEvent entity="person" onChanged={() => {}} item={deleted({ label: "PER-3 · Ada" })} />);
    expect(html).not.toContain("data-deleted-details");
  });
});
