/**
 * Password rules for the invitation and reset pages and the profile
 * (NIST SP 800-63B style: length first, no forced rotation): 12 to 128
 * characters; under 20, at least three of lowercase, uppercase, digit,
 * symbol; never the email or the name; not one repeated character; not a
 * common password. The web app shows the same list
 * (src/modules/admin/auth/passwordRules.ts).
 */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const PASSPHRASE_LENGTH = 20;

const COMMON = new Set([
  "password1234", "password12345", "password123456", "123456789012", "1234567890123", "qwertyuiop12", "qwertyuiopas",
  "iloveyou1234", "letmein12345", "welcome12345", "administrator", "admin1234567", "passw0rd1234", "abc123456789",
  "globalexperiment", "global experiment", "experiment123",
]);

export interface PasswordContext {
  email?: string | null;
  name?: string | null;
}

/** The rules a password breaks, as sentences (empty = accepted). */
export function passwordProblems(password: string, context: PasswordContext = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX) problems.push(`Use at most ${PASSWORD_MAX} characters.`);
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length < PASSPHRASE_LENGTH && classes < 3) {
    problems.push(`Mix at least three of: lowercase, uppercase, digits, symbols — or use ${PASSPHRASE_LENGTH} characters or more.`);
  }
  const lower = password.toLowerCase();
  const local = context.email?.split("@")[0]?.toLowerCase();
  const name = context.name?.trim().toLowerCase();
  if ((local && local.length >= 3 && lower.includes(local)) || (name && name.length >= 3 && lower.includes(name))) {
    problems.push("Don't use your email or your name.");
  }
  if (password.length > 0 && new Set(password).size <= 2) problems.push("Don't repeat the same character.");
  if (COMMON.has(lower)) problems.push("This password is too common.");
  return problems;
}
