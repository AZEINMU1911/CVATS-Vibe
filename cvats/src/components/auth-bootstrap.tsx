"use client";

import { useEffect } from "react";
import { AUTH_COOKIE_NAME, DEFAULT_USER_EMAIL } from "@/lib/auth-constants";

const persistEmail = (email: string) => {
  localStorage.setItem(AUTH_COOKIE_NAME, email);
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(email)}; path=/; SameSite=Lax`;
};

const resolveEmail = (): string => {
  const params = new URLSearchParams(window.location.search);
  const queryEmail = params.get("as");
  if (queryEmail && queryEmail.includes("@")) {
    return queryEmail.toLowerCase();
  }

  const stored = localStorage.getItem(AUTH_COOKIE_NAME);
  if (stored) {
    return stored;
  }

  return DEFAULT_USER_EMAIL;
};

let initialized = false;

export const AuthBootstrap = () => {
  if (typeof window !== "undefined" && !initialized) {
    initialized = true;
    const email = resolveEmail();
    persistEmail(email);
  }

  useEffect(() => {
    const email = resolveEmail();
    persistEmail(email);
  }, []);

  return null;
};
