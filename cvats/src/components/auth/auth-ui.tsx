"use client";

import type { ChangeEvent, ReactNode } from "react";
import Link from "next/link";

const gradientBackground =
  "relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100";

export const AuthShell = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: { text: string; href: "/login" | "/register"; linkText: string };
  children: ReactNode;
}) => (
  <div className={gradientBackground}>
    <div
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_55%)]"
      aria-hidden
    />
    <main className="relative z-10 flex w-full max-w-xl flex-col items-center justify-center gap-8 px-6 py-16 text-center sm:px-10">
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-200">
        CVATS
      </span>
      <section className="w-full rounded-3xl border border-white/10 bg-white/10 p-8 shadow-xl backdrop-blur-lg">
        <header className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-slate-300">
            {subtitle.text}{" "}
            <Link href={subtitle.href} className="font-semibold text-blue-300 transition hover:text-blue-200">
              {subtitle.linkText}
            </Link>
          </p>
        </header>
        <div className="mt-6">{children}</div>
      </section>
    </main>
    <div
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(59,130,246,0.18),_transparent_55%)] opacity-70"
      aria-hidden
    />
  </div>
);

const alertStyles: Record<"success" | "error", string> = {
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  error: "border-red-400/30 bg-red-500/10 text-red-200",
};

export const AuthAlert = ({ message, tone }: { message: string | null; tone: "success" | "error" }) => {
  if (!message) {
    return null;
  }

  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${alertStyles[tone]}`}>
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
  <label className="block text-left text-sm font-medium text-slate-200">
    {label}
    <input
      required
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
    />
  </label>
);
