import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global Experiment",
  description: "Global Experiment — v0.1 public foundation.",
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
    <html lang="en" className="h-full font-sans antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
