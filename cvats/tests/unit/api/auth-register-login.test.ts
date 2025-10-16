import { describe, expect, it, beforeEach } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { userRepository, resetUserRepository } from "@/server/user-repository";
import { verifyPassword } from "@/lib/auth/password";

describe("auth flow", () => {
  beforeEach(() => {
    resetUserRepository();
  });

  it("registers a user and prevents duplicates", async () => {
    const first = await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "Password123" }),
      }),
    );
    expect(first.status).toBe(201);

    const duplicate = await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "Password123" }),
      }),
    );
    expect(duplicate.status).toBe(409);
  });

  it("hashes passwords and rejects invalid login attempts", async () => {
    await register(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "valid@example.com", password: "Password123" }),
      }),
    );

    const stored = await userRepository.findByEmail("valid@example.com");
    expect(stored).toBeTruthy();
    expect(stored?.passwordHash).toBeTruthy();

    const ok = await verifyPassword("Password123", stored!.passwordHash!);
    expect(ok).toBe(true);

    const bad = await verifyPassword("WrongPass1", stored!.passwordHash!);
    expect(bad).toBe(false);
  });
});
