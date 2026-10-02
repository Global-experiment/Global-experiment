import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (no native add-on to build
 * or audit). Parameters follow OWASP's scrypt guidance: N=2^17, r=8, p=1.
 * Stored format: scrypt$<log2 N>$<r>$<p>$<salt b64url>$<hash b64url>, so the
 * cost can be raised later and old hashes still verify.
 */
const LOG2_N = 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
export const MIN_PASSWORD_LENGTH = 12;

function scrypt(password: string, salt: Buffer, log2N: number, r: number, p: number): Promise<Buffer> {
  const options: ScryptOptions = { N: 2 ** log2N, r, p, maxmem: 256 * 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, LOG2_N, R, P);
  return ["scrypt", LOG2_N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, log2N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !log2N || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), Number(log2N), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A valid hash of a random password, verified against when the email is
 * unknown so a failed login costs the same whether or not the account
 * exists (no user enumeration through timing).
 */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyHash;
}
