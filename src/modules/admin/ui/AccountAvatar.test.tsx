import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountAvatar, accountPictureUrl, initialOf } from "./AccountAvatar";

/** The generic picture without a photo: an empty, decorative span whose letter CSS draws from the attribute. */
const generic = (letter: string) => new RegExp(`^<span aria-hidden="true" data-avatar-initial="${letter}" class="[^"]*rounded-full[^"]*"></span>$`);

describe("profile picture", () => {
  it("shows the photo when the account has one, decorative and round", () => {
    const html = renderToStaticMarkup(<AccountAvatar name="Ada" picture={accountPictureUrl("a1", "v 2")} size={32} />);
    expect(html).toMatch(/<img [^>]*\/>$/);
    expect(html).toContain('src="/api/admin/accounts/a1/picture?v=v%202"');
    expect(html).toContain('alt=""');
    expect(html).toContain('width="32"');
    expect(html).toContain("rounded-full");
    expect(html).not.toContain("data-avatar-initial");
  });

  it("without a photo, shows the first letter of the name in a circle, centred, kept out of the page text", () => {
    for (const picture of [null, undefined, ""]) {
      const html = renderToStaticMarkup(<AccountAvatar name="Ada Lovelace" picture={picture} />);
      expect(html).toMatch(generic("A"));
      expect(html).toContain("items-center justify-center");
      expect(html).toContain("before:content-[attr(data-avatar-initial)]");
    }
  });

  it("keeps the letter's case and the whole of an accented or composed letter", () => {
    expect(initialOf("e2e-owner")).toBe("e");
    expect(initialOf("Q")).toBe("Q");
    expect(initialOf("  Élodie ")).toBe("É");
    expect(initialOf("Émile")).toBe("É");
    expect(initialOf("Ørjan")).toBe("Ø");
    expect(renderToStaticMarkup(<AccountAvatar name={"ñandú"} size={16} />)).toMatch(generic("ñ"));
  });

  it("an empty name gives the circle without a letter", () => {
    expect(initialOf("")).toBe("");
    expect(initialOf("   ")).toBe("");
    expect(renderToStaticMarkup(<AccountAvatar name="  " />)).toMatch(generic(""));
  });

  it("uses the theme's type sizes for each picture size", () => {
    expect(renderToStaticMarkup(<AccountAvatar name="A" size={16} />)).toContain("size-4 text-caption");
    expect(renderToStaticMarkup(<AccountAvatar name="A" />)).toContain("size-6 text-meta");
    expect(renderToStaticMarkup(<AccountAvatar name="A" size={32} />)).toContain("size-8 text-body");
  });
});
