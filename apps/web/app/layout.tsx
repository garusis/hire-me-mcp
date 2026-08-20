import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { SiteFooter } from "./design-system/layout/site-footer";
import { SiteHeader } from "./design-system/layout/site-header";
import { MAIN_CONTENT_ID, SkipLink } from "./design-system/layout/skip-link";
import { buildThemeScript } from "./design-system/theme/resolve-theme";
import { bodyFont, displayFont, monoFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hire-me MCP",
  description: "Portfolio as an API — under construction.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body className={bodyFont.className}>
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, build-authored script (buildThemeScript) with no user input — required for the beforeInteractive theme-flash guard.
          dangerouslySetInnerHTML={{ __html: buildThemeScript() }}
        />
        <SkipLink />
        <SiteHeader />
        <main id={MAIN_CONTENT_ID}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
