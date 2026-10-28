/**
 * The password rules as a live checklist (invitation, reset and profile
 * pages). The API decides — apps/api/src/auth/password-strength.ts — and
 * this mirrors it rule for rule; passwordRules.test.ts checks they agree.
 */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const PASSPHRASE_LENGTH = 20;

const COMMON = new Set([
  "password1234", "password12345", "password123456", "123456789012", "1234567890123", "qwertyuiop12", "qwertyuiopas",
  "iloveyou1234", "letmein12345", "welcome12345", "administrator", "admin1234567", "passw0rd1234", "abc123456789",
  "globalexperiment", "global experiment", "experiment123",
]);

export interface PasswordRule {
  id: "length" | "mix" | "personal" | "repeat" | "common";
  label: string;
  met: boolean;
}

/** Every rule with whether `password` meets it, in the order the pages list them. */
export function passwordRules(password: string, context: { email?: string | null; name?: string | null } = {}): PasswordRule[] {
  const lower = password.toLowerCase();
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  const local = context.email?.split("@")[0]?.toLowerCase();
  const name = context.name?.trim().toLowerCase();
  const personal = (local !== undefined && local.length >= 3 && lower.includes(local)) || (name !== undefined && name.length >= 3 && lower.includes(name));
  return [
    { id: "length", label: `${PASSWORD_MIN} to ${PASSWORD_MAX} characters`, met: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX },
    { id: "mix", label: `Three of lowercase, uppercase, digits, symbols — or ${PASSPHRASE_LENGTH} characters or more`, met: password.length >= PASSPHRASE_LENGTH || classes >= 3 },
    { id: "personal", label: "Not your email or your name", met: password.length > 0 && !personal },
    { id: "repeat", label: "Not one character repeated", met: password.length > 0 && new Set(password).size > 2 },
    { id: "common", label: "Not a common password", met: password.length > 0 && !COMMON.has(lower) },
  ];
}

export const passwordAccepted = (password: string, context: { email?: string | null; name?: string | null } = {}) => passwordRules(password, context).every((rule) => rule.met);
