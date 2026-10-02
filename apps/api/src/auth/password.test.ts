import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "./password.js";
import { generateSessionToken, hashSessionToken, SESSION_TOKEN_PATTERN } from "./session-token.js";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$17$8$1$")).toBe(true);
    expect(hash).not.toContain("correct horse");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("correct horse battery stapl", hash)).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same password here"), hashPassword("same password here")]);
    expect(a).not.toBe(b);
  });

  it("rejects passwords shorter than the minimum", async () => {
    await expect(hashPassword("x".repeat(MIN_PASSWORD_LENGTH - 1))).rejects.toThrow(/at least/);
  });

  it("treats malformed stored hashes as non-matching instead of throwing", async () => {
    await expect(verifyPassword("anything at all", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("anything at all", "bcrypt$10$abc")).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  it("are 256-bit url-safe values, stored only as a SHA-256 hex digest", () => {
    const token = generateSessionToken();
    expect(token).toMatch(SESSION_TOKEN_PATTERN);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
    expect(generateSessionToken()).not.toBe(token);
  });
});
