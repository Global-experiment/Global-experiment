import { AdminIcon } from "../ui/adminIcons";
import { passwordRules } from "./passwordRules";

/**
 * The password rules, ticked as they're met (invitation, reset and
 * profile). Announced politely, so a screen reader hears progress without
 * being interrupted on every key.
 */
export function PasswordChecklist({ id, password, email, name }: { id: string; password: string; email?: string | null; name?: string | null }) {
  return (
    <ul id={id} aria-live="polite" className="flex flex-col gap-1 text-meta">
      {passwordRules(password, { email, name }).map((rule) => (
        <li key={rule.id} data-rule={rule.id} data-met={rule.met} className={`flex items-center gap-1 ${rule.met ? "text-text-primary" : "text-text-muted"}`}>
          <span aria-hidden="true" className="flex size-4 items-center justify-center">
            {rule.met ? <AdminIcon name="check_circle" /> : <span className="size-2 rounded-full ring-1 ring-text-muted" />}
          </span>
          {rule.label}
          <span className="sr-only">{rule.met ? " — met" : " — not met yet"}</span>
        </li>
      ))}
    </ul>
  );
}
