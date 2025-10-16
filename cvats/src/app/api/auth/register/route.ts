import { NextResponse } from "next/server";
import { z } from "zod";
import { userRepository } from "@/server/user-repository";
import { hashPassword, validatePassword } from "@/lib/auth/password";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a valid email and password." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const passwordCheck = validatePassword(parsed.data.password);
  if (!passwordCheck.ok) {
    return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await userRepository.create({ email, passwordHash });

  return NextResponse.json({ message: "Account created." }, { status: 201 });
}
