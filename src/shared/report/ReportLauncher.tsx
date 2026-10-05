"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type MouseEvent, type ReactNode } from "react";
import { reportHref, type ReportKind } from "@/shared/navigation/sourcePage";
import { useCurrentSourcePage } from "@/shared/navigation/useCurrentSourcePage";
import { Button } from "@/shared/ui/Button";
import type { IconName } from "@/shared/ui/icons";
import { parseReportDraft, readReportDraftRaw, reportDraftKey } from "./reportDraft";
import { composerHref } from "./reportLinks";
import { ReportQualificationSheet } from "./ReportQualificationSheet";

type Launch = (kind: ReportKind, source: string) => void;

const LauncherContext = createContext<Launch | null>(null);

/**
 * Review #3 item 5 — qualify on the page the visitor is on, THEN go to the
 * paragraph: every "Send feedback" / "Report issue" entry point (article
 * actions, page-action menus, Treasury stat sheets…) opens this one
 * qualification sheet over the current page; its CTA navigates to the
 * composer with the chosen types and the origin page
 * (`composerHref`). Dismissing it (backdrop, Escape, drag) just stays put.
 * Mounted once for the public site (src/app/(public)/layout.tsx).
 */
export function ReportLauncherProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [request, setRequest] = useState<{ kind: ReportKind; source: string; id: number } | null>(null);
  const [open, setOpen] = useState(false);

  const launch = useCallback<Launch>((kind, source) => {
    // Next frame: a menu/detail sheet that launched this has closed first, so
    // its focus restoration can't land after this sheet's own focus.
    requestAnimationFrame(() => {
      setRequest((previous) => ({ kind, source, id: (previous?.id ?? 0) + 1 }));
      setOpen(true);
    });
  }, []);

  const initialTypes = request ? (parseReportDraft(request.kind, readReportDraftRaw(reportDraftKey(request.kind, request.source)))?.types ?? []) : [];

  return (
    <LauncherContext.Provider value={launch}>
      {children}
      {request ? (
        <ReportQualificationSheet
          key={request.id}
          kind={request.kind}
          open={open}
          initialTypes={initialTypes}
          onClose={() => setOpen(false)}
          onConfirm={(types) => {
            setOpen(false);
            router.push(composerHref(request.kind, request.source, types));
          }}
        />
      ) : null}
    </LauncherContext.Provider>
  );
}

/** Opens the qualification sheet; outside the provider it falls back to plain navigation. */
export function useReportLauncher(): Launch {
  const launch = useContext(LauncherContext);
  const router = useRouter();
  return useCallback<Launch>(
    (kind, source) => (launch ? launch(kind, source) : router.push(reportHref(kind, source))),
    [launch, router],
  );
}

/** Plain left-click only; modifier/middle clicks keep the link's own new-tab behaviour. */
const isPlainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * A report entry point. Still a real link to the composer (no-JS, new tab,
 * copy link — the composer then asks for the qualification itself), but a
 * plain click opens the qualification sheet over the current page.
 * `onLaunch` lets a containing sheet/menu close itself first.
 */
export function ReportLaunchButton({
  kind,
  source,
  icon,
  size,
  fullWidth,
  className,
  onLaunch,
  children,
}: {
  kind: ReportKind;
  /** Origin page; defaults to the current path + hash. */
  source?: string;
  icon: IconName;
  size?: "control" | "compact";
  fullWidth?: boolean;
  className?: string;
  onLaunch?: () => void;
  children: ReactNode;
}) {
  const current = useCurrentSourcePage();
  const launch = useReportLauncher();
  const from = source ?? current;
  return (
    <Button
      href={reportHref(kind, from)}
      icon={icon}
      size={size}
      fullWidth={fullWidth}
      className={className}
      onNavigate={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onLaunch?.();
        launch(kind, from);
      }}
    >
      {children}
    </Button>
  );
}
