import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NavigationTracker } from "@/shared/ui/NavigationTracker";
import "./globals.css";

/*
 * Figma's exported type is anonymised (unnamed glyph sets) but its shapes
 * match Inter — see the --font-sans comment in globals.css. `next/font`
 * self-hosts the file at build time (no runtime Google Fonts request) and
 * exposes it as a CSS variable that --font-sans reads, so every existing
 * `font-sans` usage picks it up with no other change.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Global Experiment",
  description: "Global Experiment — v0.1 public foundation.",
};

/**
 * `resizes-content`: on Android Chrome the on-screen keyboard shrinks the
 * layout viewport, so the sticky CTA lands above it natively with no
 * JS offset and no page jump. iOS ignores the key; there useKeyboardInset
 * (VisualViewport) lifts the bar instead.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

/**
 * Sets `data-theme` before the first paint, from the same localStorage key
 * ThemeToggle writes to — otherwise the page would flash dark (the CSS
 * default) and then swap to a stored light preference. Part of the
 * temporary theme toggle (client feedback item 7); remove alongside
 * ThemeToggle.tsx and the `[data-theme="light"]` block in globals.css.
 */
const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("ge-theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full font-sans antialiased ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <NavigationTracker />
        {children}
      </body>
    </html>
  );
}
