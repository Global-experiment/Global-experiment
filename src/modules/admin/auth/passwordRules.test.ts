import { describe, expect, it } from "vitest";
import { passwordProblems } from "../../../../apps/api/src/auth/password-strength";
import { passwordAccepted, passwordRules } from "./passwordRules";

const context = { email: "stanley.q@example.org", name: "Stanley" };
const SAMPLES = [
  "",
  "short1A!",
  "alllowercaseletters",
  "Gardens keep 3 quiet rivers",
  "a perfectly long passphrase",
  "Abcdefghij12",
  "abcdefghij12",
  "aaaaaaaaaaaaaaaaaaaa",
  "abababababababababab",
  "Password1234",
  "password1234",
  "global experiment",
  "my stanley.q password 1",
  "Stanley-Rules-2026",
  "x".repeat(129),
  "Ünïcödé pässwörd 42",
];

describe("password rules (web checklist)", () => {
  it.each(SAMPLES)("accepts exactly what the API accepts: %j", (password) => {
    expect(passwordAccepted(password, context)).toBe(passwordProblems(password, context).length === 0);
  });

  it("lists every rule, unmet for an empty password", () => {
    expect(passwordRules("").map((rule) => [rule.id, rule.met])).toEqual([
      ["length", false],
      ["mix", false],
      ["personal", false],
      ["repeat", false],
      ["common", false],
    ]);
  });

  it("a long passphrase needs no character mix", () => {
    expect(passwordRules("a perfectly long passphrase").find((rule) => rule.id === "mix")?.met).toBe(true);
    expect(passwordRules("abcdefghij12").find((rule) => rule.id === "mix")?.met).toBe(false);
  });
});
