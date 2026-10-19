import { ReportLauncherProvider } from "@/shared/report/ReportLauncher";
import { ToastHost } from "@/shared/ui/toast";

/**
 * Public site: every "Send feedback" / "Report issue" entry point opens its
 * qualification sheet over the current page (see ReportLauncher). The
 * toast host shows "Link copied to clipboard" and the other public toasts.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <ReportLauncherProvider>
      {children}
      <ToastHost />
    </ReportLauncherProvider>
  );
}
