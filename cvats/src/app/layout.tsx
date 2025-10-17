import type { Metadata } from "next";
import type { ReactNode } from "react";
import { resolveFonts } from "@/app/fonts";
import "./globals.css";
import { AppSessionProvider } from "@/components/session-provider";

const { geistSans, geistMono } = resolveFonts();

export const metadata: Metadata = {
  metadataBase: new URL("https://cvats.dev"),
  title: {
    default: "CVATS | CV Analyzer for Recruiters",
    template: "%s | CVATS",
  },
  description:
    "CVATS helps recruiting teams evaluate resumes in seconds with AI-powered analysis and Cloudinary-backed uploads.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}
