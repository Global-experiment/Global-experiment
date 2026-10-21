import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PersonRecord } from "@/modules/admin/people/PersonRecord";

export const metadata: Metadata = { title: "Person" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminPersonPage({ params }: PageProps<"/admin/people/[id]">) {
  const { id } = await params;
  // "new": a person made with "Duplicate as a draft", created on Submit.
  if (id !== "new" && !UUID.test(id)) notFound();
  return <PersonRecord id={id} />;
}
