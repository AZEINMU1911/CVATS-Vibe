import { AUTH_COOKIE_NAME, DEFAULT_USER_EMAIL } from "@/lib/auth-constants";

const parseDocumentCookies = (): Record<string, string> => {
  if (typeof document === "undefined") {
    return {};
  }
  return document.cookie.split(";").reduce<Record<string, string>>((acc, part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) {
      return acc;
    }
    acc[name] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
};

export const getActiveUserEmail = (): string => {
  if (typeof window === "undefined") {
    return DEFAULT_USER_EMAIL;
  }
  const cookies = parseDocumentCookies();
  if (cookies[AUTH_COOKIE_NAME]) {
    return cookies[AUTH_COOKIE_NAME];
  }
  const stored = window.localStorage.getItem(AUTH_COOKIE_NAME);
  return stored ?? DEFAULT_USER_EMAIL;
};
