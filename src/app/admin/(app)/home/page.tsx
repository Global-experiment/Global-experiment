import type { Metadata } from "next";
import { getHomeContent } from "@/modules/home/application/getHomeContent";
import { homeWordmark } from "@/modules/home/ui/homeNavigation";
import { HomeView } from "@/modules/home/ui/HomeView";
import { PublicPageHeader } from "@/modules/admin/ui/PublicPageHeader";
import { Container } from "@/shared/ui/Container";

export const metadata: Metadata = { title: "Home" };

/**
 * Home as visitors see it, inside the admin (admin-desktop.pdf p6): the
 * admin header with "Administrate" (the read-only content view while Home
 * is managed in Notion), Share and ⋮, then the public page's content.
 */
export default async function AdminHomePage() {
  const content = await getHomeContent();
  return (
    <div className="pb-6">
      <PublicPageHeader title="Home" administrateHref="/admin/home/manage" publicPath="/" />
      <Container>
        {/* The public header's wordmark row (p6). */}
        <p className="flex min-h-10 items-center justify-center gap-1">
          <span className="text-body font-bold text-text-primary">{homeWordmark.brand}</span>
          <span className="text-meta text-text-muted">{homeWordmark.eyebrow}</span>
        </p>
      </Container>
      <HomeView content={content} taglineAs="h2" />
    </div>
  );
}
