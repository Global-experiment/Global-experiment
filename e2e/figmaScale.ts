import type { Page } from "@playwright/test";

/**
 * Figma's frames are drawn at a 16px root; the public site is scaled up
 * (--public-root-size in globals.css, client review 2026-10-21). Specs that
 * measure the Figma geometry in px pin the root back to 16px first; the
 * scale itself is tested in public-ux.spec.ts.
 */
export async function atFigmaScale(page: Page) {
  await page.addInitScript(() => {
    const pin = () => {
      const style = document.createElement("style");
      style.dataset.figmaScale = "";
      style.textContent = ":root { --public-root-size: 100% !important; }";
      document.head.append(style);
    };
    if (document.head) pin();
    else document.addEventListener("DOMContentLoaded", pin, { once: true });
  });
}
