"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthAlert, AuthField, AuthShell } from "@/components/auth/auth-ui";
import type { Route } from "next";

const initialState = { email: "", password: "" };

const DASHBOARD_ROUTE: Route = "/dashboard";

const getRedirectTarget = (param: string | null): Route => {
  if (!param) {
    return DASHBOARD_ROUTE;
  }

  if (param.startsWith("/dashboard")) {
    return DASHBOARD_ROUTE;
  }

  return DASHBOARD_ROUTE;
};

const useLoginFormState = () => {
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const callbackUrl = searchParams.get("callbackUrl");
  const router = useRouter();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: form.email,
        password: form.password,
      });

      if (result?.error) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      const destination = getRedirectTarget(callbackUrl);
      router.push(destination);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  return {
    form,
    error,
    isSubmitting,
    registeredMessage: registered ? "Account created successfully. Please sign in." : null,
    handleChange,
    handleSubmit,
  };
};

export const LoginForm = () => {
  const {
    form,
    error,
    isSubmitting,
    registeredMessage,
    handleChange,
    handleSubmit,
  } = useLoginFormState();

  return (
    <AuthShell
      title="Log in"
      subtitle={{ text: "Don’t have an account?", href: "/register", linkText: "Register" }}
    >
      <AuthAlert
        tone="success"
        message={registeredMessage}
      />
      <AuthAlert tone="error" message={error} />
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <AuthField label="Email" type="email" name="email" value={form.email} onChange={handleChange} />
        <AuthField label="Password" type="password" name="password" value={form.password} onChange={handleChange} />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
};
