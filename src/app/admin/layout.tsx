import type { Metadata } from "next";

export const metadata: Metadata = {
  // The tab shows the page title only (client, 2026-10-23): "People", not "People — Admin — Global Experiment".
  title: { default: "Admin", template: "%s" },
  robots: { index: false, follow: false },
};

/** Owner administration (desktop only, figma.pdf p40–p44). Never indexed. */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
