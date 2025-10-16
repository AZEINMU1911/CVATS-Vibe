"use client";

import type { ChangeEvent, ReactNode } from "react";
import Link from "next/link";

export const AuthShell = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: { text: string; href: "/login" | "/register"; linkText: string };
  children: ReactNode;
}) => (
  <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
    <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
    <p className="mt-2 text-sm text-slate-600">
      {subtitle.text}{" "}
      <Link href={subtitle.href} className="text-blue-600 hover:underline">
        {subtitle.linkText}
      </Link>
    </p>
    {children}
  </main>
);

export const AuthAlert = ({ message, tone }: { message: string | null; tone: "success" | "error" }) => {
  if (!message) {
    return null;
  }

  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className={`mt-4 rounded-md border px-4 py-3 text-sm ${styles}`}>
      {message}
    </div>
  );
};

export const AuthField = ({
  label,
  type,
  name,
  value,
  onChange,
}: {
  label: string;
  type: "email" | "password";
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) => (
  <label className="block text-sm font-medium text-slate-700">
    {label}
    <input
      required
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
    />
  </label>
);
