import type { Metadata } from "next";
import { TreasuryView } from "@/app/(public)/treasury/TreasuryView";
import { PublicPageHeader } from "@/modules/admin/ui/PublicPageHeader";
import { loadTreasuryPage } from "@/shared/treasury/loadTreasuryPage";

export const metadata: Metadata = { title: "Treasury" };

/**
 * Treasury as visitors see it, inside the admin (the p6 pattern): the admin
 * header with "Administrate" (the admin Treasury list), then the public
 * page's content; its pills and pages stay under /admin/treasury.
 */
export default async function AdminTreasuryPublicPage(props: PageProps<"/admin/treasury">) {
  const data = await loadTreasuryPage(await props.searchParams);
  return (
    <div className="pb-6">
      <PublicPageHeader title="Treasury" administrateHref="/admin/treasury/manage" publicPath="/treasury" />
      <TreasuryView {...data} embedded={{ basePath: "/admin/treasury" }} />
    </div>
  );
}
