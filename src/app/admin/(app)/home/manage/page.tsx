import type { Metadata } from "next";
import { getHomeContent } from "@/modules/home/application/getHomeContent";
import { HomeSections } from "@/modules/home/ui/HomeSections";
import { notionHomeUrl } from "@/modules/admin/notionLinks";
import { ManagedInNotionBadge } from "@/modules/admin/ui/PublicPageHeader";
import { RecordLayout } from "@/modules/admin/ui/RecordForm";
import { RichText } from "@/shared/ui/RichText";

export const metadata: Metadata = { title: "Home content" };

/**
 * Home's backend view while cms.mode = notion (decision 1 of 2026-10-19):
 * the content, read-only, with the "Managed in Notion" badge. The native
 * editor (admin-desktop.pdf p7) replaces it when the CMS moves here.
 */
export default async function AdminHomeContentPage() {
  const content = await getHomeContent();
  return (
    <RecordLayout backHref="/admin/home" backLabel="Home" title="Home content">
      <ManagedInNotionBadge notionUrl={notionHomeUrl()} />
      <section aria-labelledby="home-tagline" className="flex flex-col gap-1">
        <h2 id="home-tagline" className="text-meta text-text-muted">
          Tagline
        </h2>
        <p className="text-body">
          <RichText text={content.tagline} />
        </p>
      </section>
      <section aria-labelledby="home-sections" className="flex max-w-[656px] flex-col gap-1">
        <h2 id="home-sections" className="text-meta text-text-muted">
          Sections
        </h2>
        <HomeSections content={content} />
      </section>
    </RecordLayout>
  );
}
