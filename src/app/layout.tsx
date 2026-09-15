import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global Experiment",
  description: "Global Experiment — v0.1 public foundation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full font-sans antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
