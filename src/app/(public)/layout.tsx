import { ReportLauncherProvider } from "@/shared/report/ReportLauncher";

/**
 * Public site: every "Send feedback" / "Report issue" entry point opens its
 * qualification sheet over the current page (see ReportLauncher). The
 * route group adds no markup of its own.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <ReportLauncherProvider>{children}</ReportLauncherProvider>;
}
