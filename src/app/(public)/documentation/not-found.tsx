import Link from "next/link";

export default function DocumentationNotFound() {
  return (
    <div role="alert" className="px-6 py-16 text-center">
      <p className="text-base font-bold text-text-primary">Article not found</p>
      <p className="mt-2 text-sm text-text-muted">
        This page doesn&rsquo;t exist or is no longer published.
      </p>
      <Link href="/documentation" className="mt-6 inline-block text-sm underline">
        Back to Documentation
      </Link>
    </div>
  );
}
