import type { Geist as GeistType, Geist_Mono as GeistMonoType } from "next/font/google";

interface FontDefinition {
  className: string;
  variable: string;
}

const fallbackFont = (): FontDefinition => ({ className: "", variable: "" });

const shouldDisableRemoteFonts = (): boolean => {
  const flag = process.env.DISABLE_REMOTE_FONTS ?? "";
  return flag === "1" || flag.toLowerCase() === "true";
};

const loadGoogleFonts = (): { geistSans: FontDefinition; geistMono: FontDefinition } => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("next/font/google") as {
    Geist: typeof GeistType;
    Geist_Mono: typeof GeistMonoType;
  };
  return {
    geistSans: mod.Geist({
      variable: "--font-geist-sans",
      subsets: ["latin"],
      display: "swap",
    }),
    geistMono: mod.Geist_Mono({
      variable: "--font-geist-mono",
      subsets: ["latin"],
      display: "swap",
    }),
  };
};

let cache: { geistSans: FontDefinition; geistMono: FontDefinition } | null = null;

export const resolveFonts = (): { geistSans: FontDefinition; geistMono: FontDefinition } => {
  if (cache) {
    return cache;
  }
  if (shouldDisableRemoteFonts()) {
    cache = { geistSans: fallbackFont(), geistMono: fallbackFont() };
    return cache;
  }
  try {
    cache = loadGoogleFonts();
    return cache;
  } catch (error) {
    console.warn("FONT_LOAD_FAILED", error);
    cache = { geistSans: fallbackFont(), geistMono: fallbackFont() };
    return cache;
  }
};
