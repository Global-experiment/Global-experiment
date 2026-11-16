/**
 * Cleans an icon SVG so it fits the project's icon assets (public/assets/icons/figma/):
 * the colour comes from the text (fill="currentColor"), the size from the CSS (no width or height), and
 * nothing is left from the export (no XML declaration, comments, title, ids, classes, styles or data
 * attributes). The viewBox is kept as it is. Pure: a string in, a string out (scripts/icons-add.mjs uses it).
 *
 * Refuses anything that isn't a plain vector icon: a script, an embedded image, foreign content, an event
 * handler or a link to another file.
 */

const UNSAFE = /<(script|image|foreignObject|iframe|use)\b|\son[a-z]+\s*=|\b(?:xlink:)?href\s*=|javascript:/i;

/** Attributes no element keeps. */
const EXPORT_LEFTOVERS = /\s(?:id|class|style|data-[\w-]+|xml:space|xmlns:xlink|version|enable-background|x|y)\s*=\s*("[^"]*"|'[^']*')/g;

/**
 * @param {string} source the SVG as downloaded
 * @returns {string} the cleaned SVG, one line, ending with a newline
 */
export function cleanSvg(source) {
  if (typeof source !== "string" || !/<svg[\s>]/i.test(source)) throw new Error("Not an SVG file.");
  if (UNSAFE.test(source)) throw new Error("The SVG contains something other than shapes (a script, an image or a link): refused.");

  let svg = source
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(title|desc|metadata)\b[\s\S]*?<\/\1>/gi, "")
    .replace(EXPORT_LEFTOVERS, "");

  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) throw new Error("Not an SVG file.");
  const viewBox = /\sviewBox\s*=\s*("[^"]*"|'[^']*')/i.exec(open[0]);
  if (!viewBox) throw new Error("The SVG has no viewBox, so it can't be sized by CSS.");

  // The root: only the namespace, the viewBox and the colour of the text.
  svg = svg.replace(open[0], `<svg xmlns="http://www.w3.org/2000/svg" viewBox=${viewBox[1].replace(/'/g, '"')} fill="currentColor">`);

  // The shapes: no colour of their own (fill="none" stays: it draws an outline's inside empty).
  svg = svg
    .replace(/(<(?!svg\b)[a-z][^>]*?)\sfill\s*=\s*("[^"]*"|'[^']*')/gi, (match, before, value) => (/^["']none["']$/i.test(value) ? match : before))
    .replace(/(<(?!svg\b)[a-z][^>]*?)\sstroke\s*=\s*("[^"]*"|'[^']*')/gi, (match, before, value) =>
      /^["']none["']$/i.test(value) ? match : `${before} stroke="currentColor"`,
    );

  return `${svg.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim()}\n`;
}

/** "manage_accounts" → "manage-accounts", the project's file names. */
export const fileNameFor = (name, filled = false) => `${name.replace(/_/g, "-")}${filled ? "-filled" : ""}.svg`;
