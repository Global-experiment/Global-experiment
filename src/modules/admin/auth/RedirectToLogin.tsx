"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { loginHref } from "../api/paths";

/** Signed out: go to login, coming back to this exact admin URL afterwards. */
export function RedirectToLogin() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const query = params.toString();
    router.replace(loginHref(`${pathname}${query ? `?${query}` : ""}`));
  }, [router, pathname, params]);

  return (
    <p role="status" className="p-4 text-body text-text-muted">
      Redirecting to sign in…
    </p>
  );
}
