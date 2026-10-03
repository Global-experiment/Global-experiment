import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleList } from "@/modules/admin/people/PeopleList";

export const metadata: Metadata = { title: "People" };

export default function AdminPeoplePage() {
  return (
    <Suspense>
      <PeopleList />
    </Suspense>
  );
}
