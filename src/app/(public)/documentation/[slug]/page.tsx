import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/shared/ui/Container";
import { NavHeader } from "@/shared/ui/NavHeader";
import { Tag } from "@/shared/ui/Tag";
import { getArticleBySlug } from "@/modules/documentation/application/getArticleBySlug";
import { DocumentationContent } from "@/modules/documentation/ui/DocumentationContent";

export const revalidate = 300;

interface DocumentationArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: DocumentationArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};
  return { title: `${article.title} — Documentation — Global Experiment` };
}

export default async function DocumentationArticlePage({ params }: DocumentationArticlePageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col">
      <NavHeader title={article.title} backHref="/documentation" />
      <Container className="py-6">
        {article.expertise.length > 0 ? (
          <div className="mb-6 flex flex-wrap gap-2">
            {article.expertise.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : null}
        <DocumentationContent blocks={article.content} />
      </Container>
    </main>
  );
}
