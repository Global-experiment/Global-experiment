import { Suspense } from "react";
import { RedirectToLogin } from "@/modules/admin/auth/RedirectToLogin";
import { getAdminSession } from "@/modules/admin/api/server";
import { AdminShell } from "@/modules/admin/ui/AdminShell";

/**
 * Every admin screen except login. The NestJS session decides access: no
 * admin page renders (or fetches records) without a live owner session,
 * and the API independently refuses every /api/admin request without one.
 */
export default async function AdminAppLayout({ children }: LayoutProps<"/admin">) {
  const session = await getAdminSession();

  if (session.status === "signed-out") {
    return (
      <Suspense>
        <RedirectToLogin />
      </Suspense>
    );
  }

  if (session.status === "unavailable") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-base px-2 text-text-primary">
        <div className="max-w-[420px]">
          <h1 className="text-body font-bold">Admin API unavailable</h1>
          <p role="alert" className="mt-2 text-body text-text-muted">
            The native API isn&rsquo;t reachable, so the administration can&rsquo;t verify your session. Start it
            with <code>npm run api:dev</code> and reload this page.
          </p>
        </div>
      </main>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
