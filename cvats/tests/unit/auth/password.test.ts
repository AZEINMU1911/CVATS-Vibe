import { describe, expect, it } from "vitest";
import { validatePassword } from "@/lib/auth/password";

describe("validatePassword", () => {
  it("rejects short passwords", () => {
    const result = validatePassword("Ab1");
    expect(result).toEqual({ ok: false, error: "Password must be at least 8 characters." });
  });

  it("rejects passwords missing numbers", () => {
    const result = validatePassword("Password");
    expect(result).toEqual({ ok: false, error: "Password must include letters and numbers." });
  });

  it("rejects passwords missing letters", () => {
    const result = validatePassword("12345678");
    expect(result).toEqual({ ok: false, error: "Password must include letters and numbers." });
  });

  it("accepts strong passwords", () => {
    const result = validatePassword("GoodPass123");
    expect(result).toEqual({ ok: true });
  });
});
