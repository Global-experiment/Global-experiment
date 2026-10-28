"use client";

/**
 * Appearance (Profile settings, admin-desktop.pdf p18): System, Light or
 * Dark, saved on the admin's account and mirrored in localStorage so the
 * inline script in app/layout.tsx (THEME_INIT_SCRIPT) applies it before the
 * first paint, on the admin and the public pages alike. Dark is the site's
 * own default (no stored choice); "system" follows the device and its
 * changes. Replaces the temporary review toggle of 2026-10.
 */
export type Appearance = "system" | "light" | "dark";
export const APPEARANCE_STORAGE_KEY = "ge-theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

let media: MediaQueryList | null = null;
const onSystemChange = () => paint("system");

function paint(appearance: Appearance) {
  const light = appearance === "light" || (appearance === "system" && window.matchMedia(LIGHT_QUERY).matches);
  if (light) document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

export function applyAppearance(appearance: Appearance) {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // Storage blocked: it still applies to this page.
  }
  media?.removeEventListener("change", onSystemChange);
  media = null;
  if (appearance === "system") {
    media = window.matchMedia(LIGHT_QUERY);
    media.addEventListener("change", onSystemChange);
  }
  paint(appearance);
}
