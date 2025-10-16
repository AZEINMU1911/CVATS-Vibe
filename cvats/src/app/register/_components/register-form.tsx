"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthAlert, AuthField, AuthShell } from "@/components/auth/auth-ui";

const initialState = { email: "", password: "" };

const useRegisterFormState = () => {
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Unable to create account. Please try again.");
        setIsSubmitting(false);
        return;
      }

      setSuccess("Account created! Redirecting to login...");
      setTimeout(() => {
        router.push("/login?registered=1");
      }, 1200);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  return {
    form,
    error,
    success,
    isSubmitting,
    handleChange,
    handleSubmit,
  };
};

export const RegisterForm = () => {
  const { form, error, success, isSubmitting, handleChange, handleSubmit } = useRegisterFormState();

  return (
    <AuthShell
      title="Register"
      subtitle={{ text: "Already have an account?", href: "/login", linkText: "Log in" }}
    >
      <AuthAlert tone="error" message={error} />
      <AuthAlert tone="success" message={success} />
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <AuthField label="Email" type="email" name="email" value={form.email} onChange={handleChange} />
        <AuthField label="Password" type="password" name="password" value={form.password} onChange={handleChange} />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:bg-blue-500/40"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
};
