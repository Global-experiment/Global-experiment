import Link from "next/link";
import { Tag } from "@/shared/ui/Tag";
import type { DocumentationArticleSummary } from "@/modules/documentation/domain/types";

export function ArticleListItem({ article }: { article: DocumentationArticleSummary }) {
  return (
    <Link
      href={`/documentation/${article.slug}`}
      className="flex flex-col gap-2 border-b border-border-faint py-4 hover:bg-white/5"
    >
      <span className="text-sm font-bold text-text-primary">{article.title}</span>
      {article.expertise.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {article.expertise.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
