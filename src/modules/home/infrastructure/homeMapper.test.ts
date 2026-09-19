import { describe, expect, it } from "vitest";
import type { ContentBlock } from "@/shared/content/types";
import { mapHomeBlocks } from "./homeMapper";

const t = (value: string) => [{ kind: "text" as const, value }];
const h = (level: 1 | 2 | 3 | 4, value: string): ContentBlock => ({ kind: "heading", level, text: t(value) });
const p = (value: string): ContentBlock => ({ kind: "paragraph", text: t(value) });

describe("mapHomeBlocks", () => {
  it("maps the live page shape: heading-4 tagline, heading-2 label, heading-3 sections", () => {
    const home = mapHomeBlocks([
      h(4, "Tagline"),
      h(2, "Label"),
      h(3, "First"),
      p("a"),
      h(3, "Second"),
      p("b"),
      p("c"),
    ]);
    expect(home.tagline).toEqual(t("Tagline"));
    expect(home.sectionLabel).toEqual(t("Label"));
    expect(home.sections).toEqual([
      { heading: t("First"), paragraphs: [t("a")] },
      { heading: t("Second"), paragraphs: [t("b"), t("c")] },
    ]);
  });

  it("uses the first paragraph as tagline when there is no heading-4", () => {
    const home = mapHomeBlocks([p("Tagline"), h(3, "S"), p("x")]);
    expect(home.tagline).toEqual(t("Tagline"));
    expect(home.sectionLabel).toBeNull();
  });

  it("keeps links in rich text", () => {
    const link: ContentBlock = {
      kind: "paragraph",
      text: [{ kind: "link", value: "docs", href: "/documentation/x" }],
    };
    const home = mapHomeBlocks([h(4, "T"), h(3, "S"), link]);
    expect(home.sections[0].paragraphs[0]).toEqual([{ kind: "link", value: "docs", href: "/documentation/x" }]);
  });

  it("skips empty blocks and unsupported blocks without losing real content", () => {
    const home = mapHomeBlocks([
      h(4, "T"),
      p("   "),
      { kind: "unsupported", type: "image" },
      h(3, "S"),
      { kind: "unsupported", type: "bulleted_list_item" },
      p("kept"),
    ]);
    expect(home.sections).toEqual([{ heading: t("S"), paragraphs: [t("kept")] }]);
  });

  it("does not lose a further top-level heading: it becomes a section, not a second label", () => {
    const home = mapHomeBlocks([h(4, "T"), h(2, "Label"), h(2, "Another"), p("x")]);
    expect(home.sectionLabel).toEqual(t("Label"));
    expect(home.sections).toEqual([{ heading: t("Another"), paragraphs: [t("x")] }]);
  });

  it("attaches stray paragraphs before any heading to a heading-less section", () => {
    const home = mapHomeBlocks([h(4, "T"), p("stray"), h(3, "S"), p("x")]);
    expect(home.sections[0]).toEqual({ heading: null, paragraphs: [t("stray")] });
  });

  it("rejects a page with no tagline instead of rendering it incomplete", () => {
    expect(() => mapHomeBlocks([{ kind: "unsupported", type: "image" }])).toThrow(/no tagline/);
    expect(() => mapHomeBlocks([])).toThrow(/no tagline/);
  });
});
