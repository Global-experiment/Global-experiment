import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin — Global Experiment", template: "%s — Admin — Global Experiment" },
  robots: { index: false, follow: false },
};

/** Owner administration (desktop only, figma.pdf p40–p44). Never indexed. */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
