/**
 * Shown when a visitor triggers an action whose backend isn't built yet
 * this milestone (e.g. submitting the Waitlist/Donate/Feedback/Issue
 * forms). Never navigates to a fake success screen and never claims the
 * action succeeded — see docs/architecture/decisions/008-route-shells.md.
 */
export function InertActionNotice() {
  return (
    <p role="status" className="mt-3 text-body text-text-muted">
      This isn&rsquo;t connected yet — it will be available in a later milestone.
    </p>
  );
}
